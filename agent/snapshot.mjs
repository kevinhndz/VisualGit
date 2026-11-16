import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { runGit } from "./git.mjs";
import { parseNumstat, parseStatus } from "./porcelain.mjs";

function parseRefs(output) {
  const branches = [];
  const remotes = [];
  const tags = [];
  for (const line of output.split("\n")) {
    const [ref, hash] = line.split("\t");
    if (!ref || !hash) continue;
    if (ref.startsWith("refs/heads/"))
      branches.push({ name: ref.slice(11), hash });
    else if (ref.startsWith("refs/remotes/"))
      remotes.push({ name: ref.slice(13), hash });
    else if (ref.startsWith("refs/tags/"))
      tags.push({ name: ref.slice(10), hash });
  }
  return { branches, remotes, tags };
}

function parseLog(output, branches) {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const first = line.indexOf("\t");
      const second = line.indexOf("\t", first + 1);
      const hash = line.slice(0, first);
      return {
        hash,
        parents: line
          .slice(first + 1, second)
          .split(" ")
          .filter(Boolean),
        subject: line.slice(second + 1),
        branch: branches.find((branch) => branch.hash === hash)?.name || null,
      };
    });
}

function operationAt(root) {
  const gitDir = join(root, ".git");
  if (existsSync(join(gitDir, "MERGE_HEAD"))) return "merge";
  if (existsSync(join(gitDir, "CHERRY_PICK_HEAD"))) return "cherry-pick";
  if (existsSync(join(gitDir, "REVERT_HEAD"))) return "revert";
  if (
    existsSync(join(gitDir, "rebase-merge")) ||
    existsSync(join(gitDir, "rebase-apply"))
  )
    return "rebase";
  return null;
}

export async function takeSnapshot(root) {
  const [status, refs, log, workDiff, stageDiff, stash] = await Promise.all([
    runGit(root, [
      "status",
      "--porcelain=v2",
      "--branch",
      "-z",
      "--untracked-files=all",
    ]),
    runGit(root, [
      "for-each-ref",
      "--format=%(refname)%09%(objectname)",
      "refs/heads",
      "refs/remotes",
      "refs/tags",
    ]),
    runGit(root, ["log", "--all", "--format=%H%x09%P%x09%s", "-n", "40"]),
    runGit(root, ["diff", "--numstat", "-z"]),
    runGit(root, ["diff", "--cached", "--numstat", "-z"]),
    runGit(root, ["stash", "list", "--format=%gd"]),
  ]);
  const parsed = status.ok
    ? parseStatus(status.stdout)
    : { branch: null, head: null, files: [] };
  const refData = refs.ok
    ? parseRefs(refs.stdout)
    : { branches: [], remotes: [], tags: [] };
  const workCounts = parseNumstat(workDiff.stdout);
  const stageCounts = parseNumstat(stageDiff.stdout);
  for (const file of parsed.files) {
    const a = workCounts.get(file.path) || { added: 0, deleted: 0 };
    const b = stageCounts.get(file.path) || { added: 0, deleted: 0 };
    file.added = a.added + b.added;
    file.deleted = a.deleted + b.deleted;
  }
  return {
    repo: basename(root),
    initialized: status.ok,
    branch: parsed.branch,
    detached: parsed.branch === "(detached)",
    ahead: parsed.ahead || 0,
    behind: parsed.behind || 0,
    head: parsed.head,
    files: parsed.files,
    branches: refData.branches,
    remotes: refData.remotes,
    tags: refData.tags,
    commits: log.ok ? parseLog(log.stdout, refData.branches) : [],
    stashCount: stash.ok ? stash.stdout.split("\n").filter(Boolean).length : 0,
    operation: operationAt(root),
    github: { prs: [] },
  };
}

export function snapshotSignature(snapshot) {
  const { github, problems, ...local } = snapshot;
  return JSON.stringify(local);
}
