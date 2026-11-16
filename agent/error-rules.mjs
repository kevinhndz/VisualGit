import { createRequire } from "node:module";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "./config.mjs";

const require = createRequire(import.meta.url);
export const rules = require("../rules/errores.es.json");
const compiled = rules.map((rule) => ({
  ...rule,
  expressions: rule.match.map((pattern) => new RegExp(pattern, "i")),
}));

export function redact(value = "") {
  return String(value)
    .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1***@")
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, "***")
    .replace(
      /((?:token|password|secret|authorization|extraheader|api[_-]?key)\s*[=:]\s*)[^\s]+/gi,
      "$1***",
    )
    .slice(0, 2000);
}

function fallback(stderr, exitCode) {
  const lines = stderr.split("\n");
  const prefix = lines
    .find((line) => /^(fatal|error|warning|hint):/i.test(line.trim()))
    ?.trim()
    .split(":")[0]
    ?.toLowerCase();
  const category =
    { fatal: "error grave", error: "error", warning: "aviso", hint: "pista" }[
      prefix
    ] || "problema";
  const hints = lines
    .filter((line) => /^hint:/i.test(line.trim()))
    .map((line) => line.trim())
    .slice(0, 3);
  return {
    id: "git-error",
    category,
    title: "Git encontró un problema",
    what: stderr || `El comando terminó con el código ${exitCode}.`,
    why: `Git lo indicó como ${category}. Código de salida: ${exitCode}. ${hints.join(" ")}`.trim(),
    steps: [
      { text: "Mira el estado de tu repositorio.", command: "git status" },
      {
        text: "Consulta los últimos commits.",
        command: "git log --oneline -5",
      },
      { text: "Mira las ramas disponibles.", command: "git branch -a" },
    ],
    avoid: "Lee el mensaje original antes de repetir el comando.",
    scene: "repo",
    original: stderr,
  };
}

export function explainError(
  stderr,
  exitCode = 1,
  command = "",
  { log = true } = {},
) {
  const safeError = redact(stderr);
  const context = `${safeError}\n${redact(command)}`;
  const rule = compiled.find((entry) =>
    entry.expressions.some((expression) => expression.test(context)),
  );
  if (rule)
    return {
      id: rule.id,
      category: rule.categoria,
      title: rule.titulo,
      what: rule.que_paso,
      why: rule.por_que,
      steps: rule.pasos.map((item) => ({
        text: item.texto,
        command: item.comando,
      })),
      avoid: rule.como_evitarlo,
      scene: rule.escena,
    };
  if (log) {
    try {
      mkdirSync(stateDir, { recursive: true, mode: 0o700 });
      appendFileSync(
        join(stateDir, "errores-sin-regla.jsonl"),
        JSON.stringify({
          at: new Date().toISOString(),
          exitCode,
          command: redact(command),
          stderr: safeError,
        }) + "\n",
        { mode: 0o600 },
      );
    } catch {
      // El profesor sigue funcionando aunque no se pueda guardar el ejemplo.
    }
  }
  return fallback(safeError, exitCode);
}
