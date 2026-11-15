import { createServer as createSocketServer } from "node:net";
import { chmodSync, existsSync, unlinkSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { EventHub } from "./hub.mjs";
import { createAgentHttp } from "./http.mjs";
import { takeSnapshot, snapshotSignature } from "./snapshot.mjs";
import { semanticEvent } from "./semantics.mjs";
import { TraceReader } from "./trace2.mjs";
import { RepoWatcher } from "./watcher.mjs";
import { fetchGithub } from "./github.mjs";
import { socketPath, tracePath } from "./config.mjs";

export async function startAgent(root, config) {
  root = resolve(root);
  let snapshot = await takeSnapshot(root);
  const hub = new EventHub(() => snapshot);
  const frontendDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "frontend",
  );
  const http = createAgentHttp({ config, hub, frontendDir });
  const trace = new TraceReader(
    tracePath,
    root,
    (input) => void refresh(input),
  );
  const watcher = new RepoWatcher(root, () => scheduleWatch());
  let watchTimer = null;
  let pending = Promise.resolve();
  let githubTimer = null;
  let lastCommand = null;

  function refresh(input = null) {
    pending = pending
      .then(async () => {
        const next = await takeSnapshot(root);
        const changed = snapshotSignature(snapshot) !== snapshotSignature(next);
        if (!input && !changed) return;
        if (input?.source === "trace2") {
          const key = input.argv.join(" ");
          if (lastCommand?.key === key && Date.now() - lastCommand.at < 100)
            return;
          lastCommand = { key, at: Date.now() };
        }
        const event = semanticEvent(snapshot, next, input || {});
        snapshot = { ...next, github: snapshot.github };
        hub.publish({ kind: "event", event, snapshot });
      })
      .catch((error) => console.error("Snapshot:", error.message));
    return pending;
  }

  function scheduleWatch() {
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => void refresh(), 120);
  }

  async function updateGithub() {
    const next = await fetchGithub(root);
    if (JSON.stringify(next) === JSON.stringify(snapshot.github)) return;
    const old = snapshot.github;
    snapshot = { ...snapshot, github: next };
    hub.publish({ kind: "github", github: next });
    if (
      JSON.stringify(old?.prs) !== JSON.stringify(next.prs) &&
      next.prs.length
    ) {
      const pr = next.prs[0];
      const event = {
        type: pr.checks.some(
          (check) =>
            check.status === "IN_PROGRESS" || check.conclusion === "FAILURE",
        )
          ? "pipeline_step"
          : "pr_updated",
        title: "GitHub actualizo el Pull Request",
        explanation: `PR #${pr.number}: ${pr.title}. ${pr.checks.length} checks observados.`,
        command: `GitHub PR #${pr.number}`,
        ts: new Date().toISOString(),
      };
      hub.publish({ kind: "event", event, snapshot });
    }
  }

  const socket = createSocketServer((connection) => {
    let data = "";
    connection.on("data", (chunk) => {
      data += chunk;
      if (data.length > 4096) connection.destroy();
    });
    connection.on("end", () => {
      try {
        const input = JSON.parse(data);
        const cwd = resolve(input.cwd);
        if (cwd !== root && !cwd.startsWith(root + sep)) return;
        if (typeof input.command !== "string" || input.command.length > 300)
          return;
        if (/^\s*git(?:\s|$)/.test(input.command)) return;
        const event = semanticEvent(snapshot, snapshot, {
          command: input.command,
          ts: new Date().toISOString(),
        });
        event.pending = true;
        event.title = "Comando en la terminal";
        event.explanation =
          "El agente observa los cambios que produzca este comando.";
        hub.publish({ kind: "event", event, snapshot });
      } catch {
        /* Ignore invalid shell messages. */
      }
    });
  });

  await new Promise((resolveListen, reject) => {
    http.once("error", reject);
    http.listen(config.port, "127.0.0.1", resolveListen);
  });
  if (existsSync(socketPath)) unlinkSync(socketPath);
  await new Promise((resolveListen) =>
    socket.listen(socketPath, resolveListen),
  );
  chmodSync(socketPath, 0o600);
  await trace.start();
  watcher.start();
  if (config.github !== false) {
    void updateGithub();
    githubTimer = setInterval(() => void updateGithub(), 5000);
  }

  return async () => {
    clearTimeout(watchTimer);
    clearInterval(githubTimer);
    trace.stop();
    watcher.stop();
    hub.close();
    socket.close();
    http.close();
    if (existsSync(socketPath)) unlinkSync(socketPath);
  };
}
