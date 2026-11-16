import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const start = "# >>> gitviz shell hook >>>";
const end = "# <<< gitviz shell hook <<<";
const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));

function quote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function block(shell) {
  const emit = `${quote(process.execPath)} ${globalThis.Bun?.isStandaloneExecutable ? "" : `${quote(cli)} `}emit`;
  const report = `${quote(process.execPath)} ${globalThis.Bun?.isStandaloneExecutable ? "" : `${quote(cli)} `}emit-result`;
  if (shell === "zsh") {
    return [
      start,
      "autoload -Uz add-zsh-hook",
      "_gitviz_last_command=''",
      `_gitviz_preexec() { _gitviz_last_command="$1"; ${emit} "$1" >/dev/null 2>&1; }`,
      "_gitviz_precmd() {",
      "  local result=$?",
      '  if [[ "$_gitviz_last_command" == git\\ push* || "$result" -ne 0 && "$_gitviz_last_command" == git\\ * ]]; then',
      `    ${report} "$result" "$_gitviz_last_command" >/dev/null 2>&1`,
      "  fi",
      "  _gitviz_last_command=''",
      "}",
      "add-zsh-hook preexec _gitviz_preexec",
      "add-zsh-hook precmd _gitviz_precmd",
      end,
      "",
    ].join("\n");
  }
  return [
    start,
    "_gitviz_last_command=''",
    "_gitviz_prompt() {",
    "  local result=$?",
    '  if [[ "$_gitviz_last_command" == git\\ push* || "$result" -ne 0 && "$_gitviz_last_command" == git\\ * ]]; then',
    `    ${report} "$result" "$_gitviz_last_command" >/dev/null 2>&1`,
    "  fi",
    "  _gitviz_last_command=''",
    "}",
    "_gitviz_debug() {",
    "  local line",
    '  [[ "$BASH_COMMAND" == _gitviz_prompt* ]] && return',
    '  line="$(history 1)"',
    '  line="${line#*[0-9]  }"',
    '  if [[ -n "$line" && "$line" != "$_gitviz_last_command" ]]; then',
    '    _gitviz_last_command="$line"',
    `    ${emit} "$line" >/dev/null 2>&1`,
    "  fi",
    "}",
    "trap '_gitviz_debug' DEBUG",
    'PROMPT_COMMAND="_gitviz_prompt;${PROMPT_COMMAND:-}"',
    end,
    "",
  ].join("\n");
}

export function installHook(shell) {
  if (!["zsh", "bash"].includes(shell)) throw new Error("Elige zsh o bash.");
  const file = join(homedir(), shell === "zsh" ? ".zshrc" : ".bashrc");
  const original = existsSync(file) ? readFileSync(file, "utf8") : "";
  const first = original.indexOf(start);
  if (first >= 0) {
    const last = original.indexOf(end, first);
    if (last < 0) throw new Error("El bloque de Git Visual está incompleto.");
    const updated =
      original.slice(0, first) +
      block(shell).trimEnd() +
      original.slice(last + end.length);
    if (updated === original) return false;
    writeFileSync(file, updated);
    return true;
  }
  writeFileSync(
    file,
    `${original}${original.endsWith("\n") || !original ? "" : "\n"}\n${block(shell)}`,
  );
  return true;
}

export function uninstallHooks() {
  for (const shell of ["zsh", "bash"]) {
    const file = join(homedir(), shell === "zsh" ? ".zshrc" : ".bashrc");
    if (!existsSync(file)) continue;
    const original = readFileSync(file, "utf8");
    const first = original.indexOf(start);
    const last = original.indexOf(end, first);
    if (first < 0 || last < 0) continue;
    const after = last + end.length;
    writeFileSync(
      file,
      original.slice(0, first) + original.slice(after).replace(/^\n/, ""),
    );
  }
}
