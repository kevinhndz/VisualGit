import test from "node:test";
import assert from "node:assert/strict";
import { explainError, redact, rules } from "../error-rules.mjs";

// Fragmentos de stderr de Git y de los pasos CI que el agente puede recibir.
const samples = {
  "push-rejected": "! [rejected] main -> main (non-fast-forward)",
  "merge-conflict":
    "Automatic merge failed; fix conflicts and then commit the result.",
  "rebase-conflict": "error: could not apply abc123... rebase conflict",
  "cherry-pick-conflict":
    "error: could not apply abc123... cherry-pick conflict",
  "stash-conflict": "The stash entry is kept in case you need it again.",
  "nothing-to-commit": "nothing to commit, working tree clean",
  "untracked-files": "nothing added to commit but untracked files present",
  "detached-head": "You are in 'detached HEAD' state.",
  "not-repository":
    "fatal: not a git repository (or any of the parent directories): .git",
  pathspec:
    "error: pathspec 'archivo.py' did not match any file(s) known to git",
  "author-unknown": "Author identity unknown",
  "auth-failed":
    "fatal: Authentication failed for 'https://github.com/example/repo.git/'",
  publickey: "git@github.com: Permission denied (publickey).",
  "local-overwritten":
    "Your local changes to the following files would be overwritten by checkout:",
  "unrelated-histories": "fatal: refusing to merge unrelated histories",
  "branch-exists": "fatal: a branch named 'feature' already exists",
  "branch-unmerged": "error: the branch 'feature' is not fully merged",
  "branch-current":
    "error: cannot delete branch 'feature' checked out at '/tmp/repo'",
  "no-upstream": "fatal: The current branch feature has no upstream branch.",
  "remote-exists": "error: remote origin already exists.",
  "repo-not-found": "remote: Repository not found.",
  "large-file": "remote: error: File big.zip is larger than 100.00 MB",
  "ignored-file":
    "The following paths are ignored by one of your .gitignore files:",
  "index-lock":
    "fatal: Unable to create '/tmp/repo/.git/index.lock': File exists.",
  "corrupt-object": "error: object file .git/objects/aa/123 is empty",
  "rebase-in-progress":
    "fatal: It seems that there is already a rebase-merge directory",
  "revert-conflict": "error: could not revert abc123... change",
  "revert-merge-parent":
    "error: commit abc123 is a merge but no -m option was given.",
  "reset-hard-warning": "warning: reset --hard would overwrite local changes",
  "unknown-command": "git: 'comit' is not a git command. See 'git --help'.",
  "unknown-option": "error: unknown option 'foo'",
  "empty-message": "Aborting commit due to empty commit message.",
  "editor-failed": "error: There was a problem with the editor 'vim'.",
  "line-endings": "warning: LF will be replaced by CRLF in file.txt.",
  "shallow-clone": "fatal: shallow update not allowed",
  submodule: "fatal: No submodule mapping found in .gitmodules for path 'lib'",
  "http-403":
    "fatal: unable to access URL: The requested URL returned error: 403",
  "http-404":
    "fatal: unable to access URL: The requested URL returned error: 404",
  "http-500":
    "fatal: unable to access URL: The requested URL returned error: 500",
  "network-dns":
    "fatal: unable to access URL: Could not resolve host: github.com",
  "ci-build": "CI:build failed",
  "ci-tests": "CI:tests failed",
  "ci-lint": "CI:lint failed",
  "pr-not-mergeable": "pull request is not mergeable",
};

assert.equal(
  Object.keys(samples).length,
  rules.length,
  "Cada regla necesita una muestra",
);
for (const rule of rules) {
  test(`regla ${rule.id}`, () => {
    assert.equal(
      explainError(samples[rule.id], 1, "", { log: false }).id,
      rule.id,
    );
  });
}

test("un error desconocido conserva el mensaje y las pistas", () => {
  const problem = explainError(
    "fatal: mensaje nuevo\nhint: lee la ayuda",
    7,
    "",
    { log: false },
  );
  assert.equal(problem.id, "git-error");
  assert.match(problem.what, /mensaje nuevo/);
  assert.match(problem.why, /lee la ayuda/);
  assert.equal(problem.steps.length, 3);
  assert.equal(problem.original, "fatal: mensaje nuevo\nhint: lee la ayuda");
});

test("se ocultan credenciales del registro y la pizarra", () => {
  assert.doesNotMatch(
    redact("https://usuario:clave@github.com ghp_abcdefghijkl token=secreto"),
    /clave|abcdefghijkl|secreto/,
  );
});
