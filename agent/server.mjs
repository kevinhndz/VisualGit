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
import { commandProblem, githubProblems, stateProblems } from "./teacher.mjs";

export async function startAgent(root, config) {
  root = resolve(root);
  let snapshot = await takeSnapshot(root);
  snapshot.problems = stateProblems(snapshot);
  const hub = new EventHub(() => snapshot);
  const frontendDir =
    config.frontendDir ||
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "frontend");
  const http = createAgentHttp({
    config: { ...config, refreshGithub: () => updateGithub() },
    hub,
    frontendDir,
    root,
  });
  const trace =
    config.useTrace2 === false
      ? null
      : new TraceReader(
          config.tracePath || tracePath,
          root,
          (input) => void refresh(input),
        );
  const watcher = new RepoWatcher(root, () => scheduleWatch());
  let watchTimer = null;
  let pending = Promise.resolve();
  let lastCommand = null;

  function refresh(input = null) {
    pending = pending
      .then(async () => {
        const next = await takeSnapshot(root);
        next.problems = [
          ...stateProblems(next),
          ...githubProblems(snapshot.github),
        ];
        const changed = snapshotSignature(snapshot) !== snapshotSignature(next);
        if (input?.source === "hook" && !changed) return;
        if (!input && !changed) return;
        if (input?.source === "trace2") {
          const key = input.argv.join(" ");
          if (lastCommand?.key === key && Date.now() - lastCommand.at < 100)
            return;
          lastCommand = { key, at: Date.now() };
        }
        const event = semanticEvent(snapshot, next, input || {});
        const beforeProblems = snapshot.problems;
        snapshot = { ...next, github: snapshot.github };
        hub.publish({ kind: "event", event, snapshot });
        if (event.type === "push" && event.exitCode === 0)
          hub.publish({
            kind: "teacher",
            action: "resolved",
            id: "push-rejected",
          });
        if (input?.exitCode && input.exitCode !== 0) {
          const problem = commandProblem(
            { ...event, stderr: input.stderr },
            next,
          );
          if (problem)
            hub.publish({ kind: "teacher", action: "show", problem });
        }
        const previous = new Set((beforeProblems || []).map((item) => item.id));
        const current = new Set(next.problems.map((item) => item.id));
        for (const problem of next.problems) {
          if (!previous.has(problem.id))
            hub.publish({ kind: "teacher", action: "show", problem });
        }
        for (const id of previous) {
          if (!current.has(id))
            hub.publish({ kind: "teacher", action: "resolved", id });
        }
        if (event.type === "push" && config.github !== false)
          void updateGithub();
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
    snapshot = {
      ...snapshot,
      github: next,
      problems: [...stateProblems(snapshot), ...githubProblems(next)],
    };
    hub.publish({ kind: "github", github: next });
    const oldProblems = new Map(
      githubProblems(old).map((item) => [item.id, item]),
    );
    const newProblems = new Map(
      githubProblems(next).map((item) => [item.id, item]),
    );
    for (const [id, problem] of newProblems) {
      if (!oldProblems.has(id))
        hub.publish({ kind: "teacher", action: "show", problem });
    }
    for (const id of oldProblems.keys()) {
      if (!newProblems.has(id))
        hub.publish({ kind: "teacher", action: "resolved", id });
    }
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
        if (typeof input.hook === "string") {
          void refresh({ source: "hook", hook: input.hook });
          return;
        }
        if (typeof input.command !== "string" || input.command.length > 300)
          return;
        if (
          !/^\s*git(?:\s|$)/.test(input.command) ||
          config.useTrace2 !== false
        )
          return;
        if (Number.isInteger(input.exitCode) && input.exitCode !== 0) {
          void refresh({
            command: input.command,
            exitCode: input.exitCode,
            source: "shell",
          });
          return;
        }
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
  const commandSocket = config.socketPath || socketPath;
  if (process.platform !== "win32" && existsSync(commandSocket))
    unlinkSync(commandSocket);
  await new Promise((resolveListen) =>
    socket.listen(commandSocket, resolveListen),
  );
  if (process.platform !== "win32") chmodSync(commandSocket, 0o600);
  if (trace) await trace.start();
  if (!config.noRepo) watcher.start();
  if (config.github !== false) {
    void updateGithub();
  }

  return async () => {
    clearTimeout(watchTimer);
    trace?.stop();
    watcher.stop();
    hub.close();
    socket.close();
    http.close();
    if (process.platform !== "win32" && existsSync(commandSocket))
      unlinkSync(commandSocket);
  };
}
