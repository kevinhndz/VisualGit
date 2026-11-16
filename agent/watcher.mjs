import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, watch } from "node:fs";
import { join, relative } from "node:path";

const skipped = new Set(["node_modules", ".venv", "venv", ".gitviz", ".cache"]);

export class RepoWatcher {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.watches = new Map();
    this.refreshTimer = null;
  }

  ignored(dir) {
    const path = relative(this.root, dir);
    if (!path || path.startsWith(".git")) return false;
    try {
      execFileSync("git", ["check-ignore", "-q", "--", path], {
        cwd: this.root,
        stdio: "ignore",
        env: { ...process.env, GIT_TRACE2_EVENT: "0" },
      });
      return true;
    } catch {
      return false;
    }
  }

  scan() {
    const visit = (dir) => {
      if (this.ignored(dir)) return;
      if (!this.watches.has(dir)) {
        try {
          const handle = watch(dir, () => {
            this.onChange();
            clearTimeout(this.refreshTimer);
            this.refreshTimer = setTimeout(() => this.scan(), 80);
          });
          handle.on("error", () => this.watches.delete(dir));
          this.watches.set(dir, handle);
        } catch {
          return;
        }
      }
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (
          !entry.isDirectory() ||
          entry.isSymbolicLink() ||
          skipped.has(entry.name)
        )
          continue;
        if (
          dir.endsWith("/.git") &&
          ["objects", "modules", "lfs"].includes(entry.name)
        )
          continue;
        visit(join(dir, entry.name));
      }
    };
    if (existsSync(this.root) && statSync(this.root).isDirectory())
      visit(this.root);
  }

  start() {
    this.scan();
  }

  stop() {
    clearTimeout(this.refreshTimer);
    for (const handle of this.watches.values()) handle.close();
    this.watches.clear();
  }
}
