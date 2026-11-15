import { randomInt } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const configDir = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "gitviz",
);
export const stateDir = join(
  process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
  "gitviz",
);
export const configPath = join(configDir, "config.json");
export const tracePath = join(stateDir, "trace2.sock");
export const pidPath = join(stateDir, "agent.pid");
export const logPath = join(stateDir, "agent.log");
export const socketPath = join(stateDir, "commands.sock");
export const pairPath = join(stateDir, "pair-code");

export function ensureDirectories() {
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
}

export function loadConfig() {
  if (!existsSync(configPath)) return null;
  return JSON.parse(readFileSync(configPath, "utf8"));
}

export function saveConfig(config) {
  ensureDirectories();
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}

function currentTraceTarget() {
  try {
    return execFileSync(
      "git",
      ["config", "--global", "--get", "trace2.eventTarget"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return null;
  }
}

export function installConfig() {
  ensureDirectories();
  let config = loadConfig();
  if (!config) {
    config = {
      token: String(randomInt(1000000)).padStart(6, "0"),
      port: 43721,
      allowedOrigins: [
        "http://127.0.0.1:43721",
        "http://localhost:43721",
        "https://kevinhndz.github.io",
      ],
      previousTraceTarget: currentTraceTarget(),
    };
  }
  const target = `af_unix:stream:${tracePath}`;
  if (currentTraceTarget() !== target) {
    if (!config.installedTraceTarget)
      config.previousTraceTarget = currentTraceTarget();
    else
      throw new Error(
        "Trace2 cambio despues de instalar Git Visual. Revisa la configuracion global antes de reinstalar.",
      );
    execFileSync("git", [
      "config",
      "--global",
      "--replace-all",
      "trace2.eventTarget",
      target,
    ]);
  }
  config.installedTraceTarget = target;
  saveConfig(config);
  return config;
}

export function restoreTraceConfig(config) {
  if (currentTraceTarget() !== config.installedTraceTarget) return false;
  if (config.previousTraceTarget) {
    execFileSync("git", [
      "config",
      "--global",
      "--replace-all",
      "trace2.eventTarget",
      config.previousTraceTarget,
    ]);
  } else {
    execFileSync("git", [
      "config",
      "--global",
      "--unset-all",
      "trace2.eventTarget",
    ]);
  }
  return true;
}
