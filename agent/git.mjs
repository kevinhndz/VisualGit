import { execFile } from "node:child_process";

export function runGit(root, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: options.timeout || 3000,
        env: { ...process.env, GIT_TRACE2_EVENT: "0" },
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stdout || "",
          stderr: stderr || "",
          code: error?.code ?? 0,
        });
      },
    );
  });
}

export function runGh(root, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(
      "gh",
      args,
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        timeout,
        env: { ...process.env, GIT_TRACE2_EVENT: "0" },
      },
      (error, stdout) => {
        resolve({ ok: !error, stdout: stdout || "", code: error?.code ?? 0 });
      },
    );
  });
}
