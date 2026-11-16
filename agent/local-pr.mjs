import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stateDir } from "./config.mjs";
import { runGit } from "./git.mjs";
import { explainError, redact } from "./error-rules.mjs";

const branchPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const states = new Set([
  "borrador",
  "abierto",
  "en revisión",
  "aprobado",
  "fusionado",
  "cerrado",
]);
const defaultPipeline = [
  { name: "checkout", command: ["git", "status", "--short"] },
  { name: "install dependencies", command: ["npm", "ci", "--offline"] },
  { name: "build", command: ["npm", "run", "build", "--if-present"] },
  { name: "tests", command: ["npm", "test"] },
  { name: "lint", command: ["npm", "run", "format:check", "--if-present"] },
  { name: "deploy", command: ["git", "status", "--short"] },
];

function stateFile(root) {
  const hash = createHash("sha256")
    .update(resolve(root))
    .digest("hex")
    .slice(0, 24);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  return join(stateDir, `local-pr-${hash}.json`);
}

function load(root) {
  try {
    return JSON.parse(readFileSync(stateFile(root), "utf8"));
  } catch {
    return { nextId: 1, prs: [] };
  }
}

function save(root, data) {
  writeFileSync(stateFile(root), JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
  });
}

async function branchExists(root, name) {
  if (
    !branchPattern.test(name) ||
    name.includes("..") ||
    name.endsWith(".lock")
  )
    return false;
  return (
    await runGit(root, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${name}`,
    ])
  ).ok;
}

async function mergeable(root, head, base) {
  const result = await runGit(
    root,
    ["merge-tree", "--write-tree", base, head],
    { timeout: 10000 },
  );
  return result.ok;
}

function pipeline(root) {
  const path = join(root, ".git-visual", "pipeline.json");
  const data = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : { steps: defaultPipeline };
  if (
    !Array.isArray(data.steps) ||
    !data.steps.length ||
    data.steps.length > 12
  )
    throw new Error("El pipeline necesita entre 1 y 12 pasos.");
  return data.steps.map((step) => {
    if (
      typeof step.name !== "string" ||
      !step.name ||
      step.name.length > 50 ||
      !Array.isArray(step.command) ||
      !step.command.length ||
      step.command.some(
        (part) => typeof part !== "string" || !part || part.length > 300,
      )
    )
      throw new Error(
        "Cada paso necesita nombre y comando como lista de palabras.",
      );
    return { name: step.name, command: step.command };
  });
}

function runStep(root, step, onOutput) {
  return new Promise((finish) => {
    const started = Date.now();
    const child = spawn(step.command[0], step.command.slice(1), {
      cwd: root,
      shell: false,
      env: { ...process.env, GIT_TRACE2_EVENT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let pending = "";
    const append = (chunk) => {
      pending += chunk.toString();
      const lastLine = pending.lastIndexOf("\n");
      if (lastLine < 0 && pending.length < 4096) return;
      const complete = lastLine >= 0 ? pending.slice(0, lastLine + 1) : pending;
      pending = lastLine >= 0 ? pending.slice(lastLine + 1) : "";
      const safe = redact(complete);
      output = (output + safe).slice(-100000);
      onOutput(safe);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => child.kill(), 300000);
    child.on("error", (error) => append(error.message));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (pending) {
        const safe = redact(pending);
        output = (output + safe).slice(-100000);
        onOutput(safe);
      }
      finish({
        ok: code === 0,
        code: code ?? 1,
        durationMs: Date.now() - started,
        log: output,
      });
    });
  });
}

export class LocalPrs {
  constructor(root, publish) {
    this.root = root;
    this.publish = publish;
    this.running = false;
  }

  async list() {
    const data = load(this.root);
    const prs = await Promise.all(
      data.prs.map(async (pr) => ({
        ...pr,
        mergeable:
          states.has(pr.state) && !["fusionado", "cerrado"].includes(pr.state)
            ? await mergeable(this.root, pr.head, pr.base)
            : null,
      })),
    );
    return prs;
  }

  async create({ head, base, title }) {
    if (
      !(await branchExists(this.root, head)) ||
      !(await branchExists(this.root, base)) ||
      head === base
    )
      throw new Error("Elige dos ramas locales diferentes que existan.");
    if (typeof title !== "string" || !title.trim() || title.length > 120)
      throw new Error("Escribe un título de hasta 120 caracteres.");
    const data = load(this.root);
    if (
      data.prs.some(
        (pr) =>
          pr.head === head &&
          pr.base === base &&
          !["fusionado", "cerrado"].includes(pr.state),
      )
    )
      throw new Error("Ya hay un PR abierto entre esas ramas.");
    const pr = {
      id: data.nextId++,
      head,
      base,
      title: title.trim(),
      state: "borrador",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.prs.unshift(pr);
    save(this.root, data);
    this.publish({ kind: "local-pr", prs: await this.list() });
    return pr;
  }

  async setState(id, state) {
    if (!states.has(state) || ["fusionado"].includes(state))
      throw new Error("Estado no permitido.");
    const data = load(this.root);
    const pr = data.prs.find((item) => item.id === id);
    if (!pr || ["fusionado", "cerrado"].includes(pr.state))
      throw new Error("El PR ya está cerrado.");
    pr.state = state;
    pr.updatedAt = new Date().toISOString();
    save(this.root, data);
    this.publish({ kind: "local-pr", prs: await this.list() });
    return pr;
  }

  async branchUpdated(branch) {
    const data = load(this.root);
    const affected = data.prs.filter(
      (pr) =>
        pr.head === branch && !["fusionado", "cerrado"].includes(pr.state),
    );
    if (!affected.length) return;
    for (const pr of affected) pr.updatedAt = new Date().toISOString();
    save(this.root, data);
    this.publish({ kind: "local-pr", prs: await this.list() });
    for (const pr of affected)
      this.publish({
        kind: "event",
        event: {
          type: "pr_updated",
          title: `PR local #${pr.id} actualizado`,
          explanation:
            "Tu PR sigue abierto y se actualizó con tu nuevo commit.",
          command: `${pr.head} → ${pr.base}`,
          ts: new Date().toISOString(),
        },
      });
  }

  async merge(id) {
    if (this.running) throw new Error("Ya hay un pipeline en curso.");
    const data = load(this.root);
    const pr = data.prs.find((item) => item.id === id);
    if (!pr || pr.state !== "aprobado")
      throw new Error("Primero abre y aprueba el PR local.");
    if (
      !(await branchExists(this.root, pr.head)) ||
      !(await branchExists(this.root, pr.base))
    )
      throw new Error("Una rama del PR ya no existe.");
    if (!(await mergeable(this.root, pr.head, pr.base))) {
      this.publish({
        kind: "teacher",
        action: "show",
        problem: explainError("pull request is not mergeable", 1, "", {
          log: false,
        }),
      });
      throw new Error(
        "Conflicto con la rama de destino. Resuélvelo antes del merge.",
      );
    }
    const branch = await runGit(this.root, ["branch", "--show-current"]);
    if (branch.stdout.trim() !== pr.base)
      throw new Error(
        `Cambia primero a la rama ${pr.base} para hacer el merge real.`,
      );
    const clean = await runGit(this.root, ["status", "--porcelain"]);
    if (clean.stdout.trim())
      throw new Error("Guarda o aparta tus cambios locales antes del merge.");
    const steps = pipeline(this.root);
    this.running = true;
    try {
      this.publish({
        kind: "pipeline",
        action: "start",
        prId: id,
        steps: steps.map((step) => step.name),
      });
      for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        this.publish({
          kind: "pipeline",
          action: "running",
          prId: id,
          index,
          name: step.name,
        });
        const result = await runStep(this.root, step, (text) =>
          this.publish({
            kind: "pipeline",
            action: "output",
            prId: id,
            index,
            text,
          }),
        );
        this.publish({
          kind: "pipeline",
          action: result.ok ? "passed" : "failed",
          prId: id,
          index,
          name: step.name,
          ...result,
        });
        if (!result.ok) {
          const kind = /lint|format/i.test(step.name)
            ? "lint"
            : /test/i.test(step.name)
              ? "tests"
              : "build";
          this.publish({
            kind: "teacher",
            action: "show",
            problem: explainError(`CI:${kind} failed`, result.code, "", {
              log: false,
            }),
          });
          return { ok: false, step: step.name, ...result };
        }
      }
      const result = await runGit(
        this.root,
        ["merge", "--no-ff", "--no-edit", pr.head],
        { timeout: 30000 },
      );
      if (!result.ok) {
        this.publish({
          kind: "teacher",
          action: "show",
          problem: explainError(result.stderr, result.code, "git merge", {
            log: false,
          }),
        });
        return {
          ok: false,
          step: "merge",
          log: redact(result.stderr),
          code: result.code,
        };
      }
      pr.state = "fusionado";
      pr.updatedAt = new Date().toISOString();
      save(this.root, data);
      this.publish({ kind: "pipeline", action: "complete", prId: id });
      this.publish({ kind: "local-pr", prs: await this.list() });
      return { ok: true };
    } finally {
      this.running = false;
    }
  }
}
