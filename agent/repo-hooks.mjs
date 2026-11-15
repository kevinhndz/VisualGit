import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stateDir } from "./config.mjs";

const names = [
  "post-commit",
  "pre-push",
  "post-merge",
  "post-checkout",
  "post-rewrite",
];
const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function info(root) {
  const key = createHash("sha256")
    .update(resolve(root))
    .digest("hex")
    .slice(0, 16);
  const dir = join(stateDir, "hooks", key);
  return { dir, meta: join(dir, "previous.json") };
}

function quote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function installRepoHooks(root) {
  root = resolve(root);
  const { dir, meta } = info(root);
  if (existsSync(meta)) return false;
  let previous = null;
  try {
    previous = git(root, ["config", "--local", "--get", "core.hooksPath"]);
  } catch {
    // Git's default hooks directory remains the previous location.
  }
  const oldDir = previous || git(root, ["rev-parse", "--git-path", "hooks"]);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const name of names) {
    const script = [
      "#!/bin/sh",
      `if [ -x ${quote(join(oldDir, name))} ]; then ${quote(join(oldDir, name))} "$@" || exit $?; fi`,
      `${quote(process.execPath)} ${quote(cli)} hook-event ${quote(name)} >/dev/null 2>&1 &`,
      "exit 0",
      "",
    ].join("\n");
    writeFileSync(join(dir, name), script, { mode: 0o700 });
  }
  writeFileSync(meta, JSON.stringify({ root, previous }), { mode: 0o600 });
  git(root, ["config", "--local", "core.hooksPath", dir]);
  return true;
}

export function uninstallRepoHooks(root) {
  root = resolve(root);
  const { dir, meta } = info(root);
  if (!existsSync(meta)) return false;
  const { previous } = JSON.parse(readFileSync(meta, "utf8"));
  let current = null;
  try {
    current = git(root, ["config", "--local", "--get", "core.hooksPath"]);
  } catch {
    // No configured hooks path.
  }
  if (current !== dir) return false;
  if (previous) git(root, ["config", "--local", "core.hooksPath", previous]);
  else git(root, ["config", "--local", "--unset", "core.hooksPath"]);
  rmSync(dir, { recursive: true, force: true });
  return true;
}
