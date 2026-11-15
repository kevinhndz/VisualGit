import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));

test("install and uninstall restore global Trace2 configuration and shell rc", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "gitviz-cli-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const env = {
    ...process.env,
    HOME: temp,
    XDG_CONFIG_HOME: join(temp, "config"),
    XDG_STATE_HOME: join(temp, "state"),
    GIT_CONFIG_GLOBAL: join(temp, "gitconfig"),
  };
  const run = (...args) =>
    execFileSync(process.execPath, [cli, ...args], { env, encoding: "utf8" });
  const git = (...args) =>
    execFileSync("git", ["config", "--global", ...args], {
      env,
      encoding: "utf8",
    }).trim();
  git("--replace-all", "trace2.eventTarget", join(temp, "previous.jsonl"));
  run("install");
  assert.equal(
    git("--get", "trace2.eventTarget"),
    `af_unix:stream:${join(temp, "state", "gitviz", "trace2.sock")}`,
  );
  assert.ok(existsSync(join(temp, "config", "gitviz", "config.json")));
  run("hook", "install", "zsh");
  assert.match(readFileSync(join(temp, ".zshrc"), "utf8"), /gitviz shell hook/);
  run("hook", "uninstall");
  assert.doesNotMatch(
    readFileSync(join(temp, ".zshrc"), "utf8"),
    /gitviz shell hook/,
  );
  run("uninstall");
  assert.equal(
    git("--get", "trace2.eventTarget"),
    join(temp, "previous.jsonl"),
  );
  assert.ok(!existsSync(join(temp, "config", "gitviz", "config.json")));
});
