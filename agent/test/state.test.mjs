import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseNumstat, parseStatus } from "../porcelain.mjs";
import { semanticEvent } from "../semantics.mjs";
import { takeSnapshot } from "../snapshot.mjs";

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_TRACE2_EVENT: "0" },
  });
}

test("porcelain v2 recognizes untracked, staged and modified files", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gitviz-state-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.invalid");
  writeFileSync(join(root, "app.js"), "one\n");
  let state = await takeSnapshot(root);
  assert.equal(state.files[0].index, "?");
  git(root, "add", "app.js");
  state = await takeSnapshot(root);
  assert.equal(state.files[0].index, "A");
  git(root, "commit", "-qm", "primer cambio");
  writeFileSync(join(root, "app.js"), "one\ntwo\n");
  state = await takeSnapshot(root);
  assert.equal(state.files[0].work, "M");
  assert.equal(state.files[0].added, 1);
  git(root, "add", "app.js");
  state = await takeSnapshot(root);
  assert.equal(state.files[0].index, "M");
  git(root, "restore", "--staged", "app.js");
  state = await takeSnapshot(root);
  assert.equal(state.files[0].index, ".");
  assert.equal(state.files[0].work, "M");
  git(root, "branch", "tema");
  assert.ok(
    (await takeSnapshot(root)).branches.some(
      (branch) => branch.name === "tema",
    ),
  );
  git(root, "branch", "-d", "tema");
  assert.ok(
    !(await takeSnapshot(root)).branches.some(
      (branch) => branch.name === "tema",
    ),
  );
});

test("porcelain handles rename records and numstat without contents", () => {
  const status =
    "# branch.oid (initial)\0# branch.head main\0? sin seguimiento.txt\0";
  assert.deepEqual(parseStatus(status).files[0].path, "sin seguimiento.txt");
  const counts = parseNumstat("3\t1\tarchivo.txt\0");
  assert.deepEqual(counts.get("archivo.txt"), { added: 3, deleted: 1 });
});

test("semantic events cover add, restore, commit, branch and fallback", () => {
  const before = {
    initialized: true,
    head: "abc",
    files: [],
    branches: [{ name: "main", hash: "abc" }],
    github: {},
  };
  const after = { ...before, head: "def" };
  assert.equal(
    semanticEvent(before, after, { argv: ["git", "add", "."] }).type,
    "add",
  );
  assert.equal(
    semanticEvent(before, after, { argv: ["git", "restore", "--staged", "a"] })
      .type,
    "unstage",
  );
  assert.equal(
    semanticEvent(before, after, { argv: ["git", "commit", "-m", "x"] }).type,
    "commit",
  );
  assert.equal(
    semanticEvent(before, after, { argv: ["git", "branch", "-d", "x"] }).type,
    "branch_delete",
  );
  assert.equal(
    semanticEvent(before, before, { argv: ["git", "future-command"] }).type,
    "inspect",
  );
  assert.equal(
    semanticEvent(before, before, { argv: ["git", "push"], exitCode: 1 }).type,
    "error",
  );
});
