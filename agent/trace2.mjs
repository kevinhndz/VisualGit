import { openSync, readSync, statSync, closeSync } from "node:fs";
import { resolve } from "node:path";

export class TraceReader {
  constructor(file, root, onCommand) {
    this.file = file;
    this.root = resolve(root);
    this.onCommand = onCommand;
    this.position = 0;
    this.partial = "";
    this.sessions = new Map();
    this.timer = null;
  }

  start() {
    try {
      this.position = statSync(this.file).size;
    } catch {
      this.position = 0;
    }
    this.timer = setInterval(() => this.read(), 60);
  }

  stop() {
    clearInterval(this.timer);
  }

  read() {
    let size;
    try {
      size = statSync(this.file).size;
    } catch {
      return;
    }
    if (size < this.position) {
      this.position = 0;
      this.partial = "";
    }
    if (size === this.position) return;
    const fd = openSync(this.file, "r");
    try {
      while (this.position < size) {
        const chunk = Buffer.alloc(Math.min(65536, size - this.position));
        const count = readSync(fd, chunk, 0, chunk.length, this.position);
        if (!count) break;
        this.position += count;
        const lines = (this.partial + chunk.toString("utf8", 0, count)).split(
          "\n",
        );
        this.partial = lines.pop() || "";
        for (const line of lines) {
          try {
            this.accept(JSON.parse(line));
          } catch {
            /* Incomplete or unrelated trace line. */
          }
        }
      }
    } finally {
      closeSync(fd);
    }
  }

  accept(record) {
    if (!record.sid) return;
    const session = this.sessions.get(record.sid) || { argv: null, root: null };
    if (record.event === "start") session.argv = record.argv;
    if (record.event === "def_repo")
      session.root = record.worktree ? resolve(record.worktree) : null;
    if (record.event === "exit") {
      if (session.root === this.root && Array.isArray(session.argv)) {
        this.onCommand({
          argv: session.argv,
          exitCode: record.code,
          ts: record.time,
          source: "trace2",
        });
      }
      this.sessions.delete(record.sid);
    } else {
      this.sessions.set(record.sid, session);
    }
  }
}
