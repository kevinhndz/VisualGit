import { chmodSync, existsSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

export class TraceReader {
  constructor(path, root, onCommand) {
    this.path = path;
    this.root = resolve(root);
    this.onCommand = onCommand;
    this.sessions = new Map();
    this.server = null;
  }

  async start() {
    if (existsSync(this.path)) unlinkSync(this.path);
    this.server = createServer((connection) => {
      let partial = "";
      connection.on("data", (chunk) => {
        const lines = (partial + chunk.toString("utf8")).split("\n");
        partial = lines.pop() || "";
        for (const line of lines) {
          try {
            this.accept(JSON.parse(line));
          } catch {
            /* Ignore malformed trace lines. */
          }
        }
      });
    });
    await new Promise((resolveListen) =>
      this.server.listen(this.path, resolveListen),
    );
    chmodSync(this.path, 0o600);
  }

  stop() {
    this.server?.close();
    if (existsSync(this.path)) unlinkSync(this.path);
  }

  accept(record) {
    if (!record.sid) return;
    const session = this.sessions.get(record.sid) || { argv: null, root: null };
    if (record.event === "start") {
      session.argv = record.argv;
      session.startTime = record.time;
    }
    if (record.event === "def_repo")
      session.root = record.worktree ? resolve(record.worktree) : null;
    if (record.event === "exit") {
      if (session.root === this.root && Array.isArray(session.argv)) {
        this.onCommand({
          argv: session.argv,
          exitCode: record.code,
          ts: session.startTime || record.time,
          source: "trace2",
        });
      }
      this.sessions.delete(record.sid);
    } else {
      this.sessions.set(record.sid, session);
    }
  }
}
