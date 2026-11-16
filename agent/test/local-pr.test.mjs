import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temp = mkdtempSync(join(tmpdir(), "gitvisual-local-pr-"));
process.env.XDG_STATE_HOME = join(temp, "state");
const { LocalPrs } = await import("../local-pr.mjs");

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_TRACE2_EVENT: "0" },
  }).trim();
}

function repository(name, exit = 0) {
  const root = join(temp, name);
  mkdirSync(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Clase");
  git(root, "config", "user.email", "clase@example.test");
  mkdirSync(join(root, ".git-visual"));
  writeFileSync(
    join(root, ".git-visual", "pipeline.json"),
    JSON.stringify({
      steps: [
        {
          name: "tests",
          command: [process.execPath, "-e", `process.exit(${exit})`],
        },
      ],
    }),
  );
  writeFileSync(join(root, "base.txt"), "base\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "base");
  git(root, "switch", "-c", "feature");
  writeFileSync(join(root, "feature.txt"), "nuevo\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "feature");
  git(root, "switch", "main");
  return root;
}

test("PR local ejecuta CI y une ramas reales cuando pasa", async () => {
  const root = repository("good");
  const messages = [];
  const prs = new LocalPrs(root, (message) => messages.push(message));
  const created = await prs.create({
    head: "feature",
    base: "main",
    title: "Añadir archivo",
  });
  assert.equal(created.state, "borrador");
  await prs.setState(created.id, "abierto");
  await prs.setState(created.id, "en revisión");
  await prs.setState(created.id, "aprobado");
  await prs.branchUpdated("feature");
  assert.equal((await prs.list())[0].id, created.id);
  assert.ok(
    messages.some(
      (message) =>
        message.kind === "event" && message.event.type === "pr_updated",
    ),
  );
  const result = await prs.merge(created.id);
  assert.equal(result.ok, true);
  assert.equal((await prs.list())[0].state, "fusionado");
  assert.equal(readFileSync(join(root, "feature.txt"), "utf8"), "nuevo\n");
  assert.match(git(root, "log", "-1", "--pretty=%s"), /Merge branch/);
  assert.ok(
    messages.some(
      (message) => message.kind === "pipeline" && message.action === "passed",
    ),
  );
});

test("un paso CI fallido deja el PR y la rama sin fusionar", async () => {
  const root = repository("bad", 1);
  const messages = [];
  const prs = new LocalPrs(root, (message) => messages.push(message));
  const created = await prs.create({
    head: "feature",
    base: "main",
    title: "Añadir archivo",
  });
  await prs.setState(created.id, "aprobado");
  const before = git(root, "rev-parse", "HEAD");
  const result = await prs.merge(created.id);
  assert.equal(result.ok, false);
  assert.equal(git(root, "rev-parse", "HEAD"), before);
  assert.equal((await prs.list())[0].state, "aprobado");
  assert.ok(messages.some((message) => message.kind === "teacher"));
});

test.after(() => rmSync(temp, { recursive: true, force: true }));
