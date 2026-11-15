import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));

test("repository hooks keep the user's existing hook and restore it", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gitviz-hooks-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    HOME: root,
    XDG_STATE_HOME: join(root, "state"),
    GIT_CONFIG_GLOBAL: join(root, "global.gitconfig"),
  };
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, env, encoding: "utf8" }).trim();
  const run = (...args) =>
    execFileSync(process.execPath, [cli, ...args], {
      cwd: root,
      env,
      encoding: "utf8",
    });
  git("init", "-q");
  git("config", "user.name", "Prueba");
  git("config", "user.email", "prueba@example.test");
  const oldDir = join(root, "mis-hooks");
  mkdirSync(oldDir);
  writeFileSync(
    join(oldDir, "post-commit"),
    `#!/bin/sh\nprintf original > '${join(root, "called")}'\n`,
    { mode: 0o700 },
  );
  git("config", "core.hooksPath", oldDir);
  run("instalar-hooks");
  assert.notEqual(git("config", "--get", "core.hooksPath"), oldDir);
  writeFileSync(join(root, "archivo.txt"), "Hola\n");
  git("add", "archivo.txt");
  git("commit", "-qm", "primero");
  assert.equal(readFileSync(join(root, "called"), "utf8"), "original");
  run("quitar-hooks");
  assert.equal(git("config", "--get", "core.hooksPath"), oldDir);
  assert.ok(existsSync(join(oldDir, "post-commit")));
});
