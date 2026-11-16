#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  configPath,
  ensureDirectories,
  installConfig,
  loadConfig,
  logPath,
  pidPath,
  pairPath,
  restoreTraceConfig,
  saveConfig,
  socketPath,
  tracePath,
} from "./config.mjs";
import { installHook, uninstallHooks } from "./hooks.mjs";
import { installRepoHooks, uninstallRepoHooks } from "./repo-hooks.mjs";

const command = process.argv[2] || "help";
const wrapper = resolve(fileURLToPath(new URL("../gitviz", import.meta.url)));
const userBin = join(homedir(), ".local", "bin", "gitviz");

function runningPid() {
  if (!existsSync(pidPath)) return null;
  const pid = Number(readFileSync(pidPath, "utf8"));
  if (!Number.isInteger(pid) || pid < 1) return null;
  try {
    process.kill(pid, 0);
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    return cmdline.includes("/agent/daemon.mjs") ? pid : null;
  } catch {
    return null;
  }
}

function currentPairCode(config) {
  return existsSync(pairPath)
    ? readFileSync(pairPath, "utf8").trim()
    : config.token;
}

function stop() {
  const pid = runningPid();
  if (!pid) {
    console.log("El agente no esta iniciado.");
    return;
  }
  process.kill(pid, "SIGTERM");
  console.log(`Agente detenido (PID ${pid}).`);
}

switch (command) {
  case "install": {
    console.log(
      "Git Visual guardara un codigo local y configurara trace2.eventTarget en Git global. ./gitviz uninstall revierte estos cambios.",
    );
    const config = installConfig();
    mkdirSync(join(homedir(), ".local", "bin"), { recursive: true });
    if (!existsSync(userBin)) symlinkSync(wrapper, userBin);
    console.log(`Instalado. Codigo de emparejamiento: ${config.token}`);
    break;
  }
  case "start": {
    const config = loadConfig();
    if (!config)
      throw new Error("Primero ejecuta ./install.sh o ./gitviz install.");
    const pid = runningPid();
    if (pid) {
      console.log(`El agente ya esta iniciado (PID ${pid}).`);
      console.log(
        `Abre http://127.0.0.1:${config.port} y pega el codigo: ${currentPairCode(config)}`,
      );
      break;
    }
    ensureDirectories();
    const log = openSync(logPath, "a", 0o600);
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("./daemon.mjs", import.meta.url)), process.cwd()],
      {
        detached: true,
        stdio: ["ignore", log, log],
      },
    );
    child.unref();
    closeSync(log);
    writeFileSync(pidPath, String(child.pid));
    console.log(
      `Abre http://127.0.0.1:${config.port} y pega el codigo: ${config.token}`,
    );
    break;
  }
  case "stop":
    stop();
    break;
  case "status": {
    const pid = runningPid();
    console.log(pid ? `Agente activo (PID ${pid}).` : "Agente detenido.");
    break;
  }
  case "token": {
    const config = loadConfig();
    if (!config) throw new Error("Git Visual no esta instalado.");
    console.log(currentPairCode(config));
    break;
  }
  case "allow-origin": {
    const config = loadConfig();
    if (!config) throw new Error("Git Visual no esta instalado.");
    const value = new URL(process.argv[3]);
    if (
      value.origin !== process.argv[3] ||
      (value.protocol !== "https:" &&
        !["127.0.0.1", "localhost"].includes(value.hostname))
    ) {
      throw new Error("Usa un origen HTTPS exacto o localhost.");
    }
    if (!config.allowedOrigins.includes(value.origin))
      config.allowedOrigins.push(value.origin);
    saveConfig(config);
    console.log(`Origen autorizado: ${value.origin}. Reinicia el agente.`);
    break;
  }
  case "emit": {
    if (!/^\s*git(?:\s|$)/.test(process.argv.slice(3).join(" "))) break;
    if (!existsSync(socketPath)) break;
    const socket = createConnection(socketPath);
    socket.on("error", () => {});
    socket.end(
      JSON.stringify({
        cwd: process.cwd(),
        command: process.argv.slice(3).join(" "),
      }),
    );
    break;
  }
  case "emit-result": {
    const exitCode = Number(process.argv[3]);
    const command = process.argv.slice(4).join(" ");
    if (!Number.isInteger(exitCode) || !/^\s*git(?:\s|$)/.test(command)) break;
    if (!existsSync(socketPath)) break;
    const socket = createConnection(socketPath);
    socket.on("error", () => {});
    socket.end(JSON.stringify({ cwd: process.cwd(), command, exitCode }));
    break;
  }
  case "hook-event": {
    if (!existsSync(socketPath)) break;
    const socket = createConnection(socketPath);
    socket.on("error", () => {});
    socket.end(JSON.stringify({ cwd: process.cwd(), hook: process.argv[3] }));
    break;
  }
  case "instalar-hooks":
    console.log(
      installRepoHooks(process.cwd())
        ? "Hooks instalados en este repositorio."
        : "Los hooks ya estaban instalados.",
    );
    break;
  case "quitar-hooks":
    console.log(
      uninstallRepoHooks(process.cwd())
        ? "Hooks retirados de este repositorio."
        : "No hay hooks de Git Visual que retirar.",
    );
    break;
  case "hook": {
    const action = process.argv[3];
    if (action === "install") {
      const shell =
        process.argv[4] ||
        (process.env.SHELL?.endsWith("zsh") ? "zsh" : "bash");
      console.log(`Se agregara un bloque reversible a ~/.${shell}rc.`);
      console.log(
        installHook(shell)
          ? `Hook ${shell} instalado. Abre una terminal nueva.`
          : `Hook ${shell} ya instalado.`,
      );
    } else if (action === "uninstall") {
      uninstallHooks();
      console.log("Hooks retirados. Abre una terminal nueva.");
    } else {
      console.log(
        "Uso: ./gitviz hook install [zsh|bash] o ./gitviz hook uninstall",
      );
    }
    break;
  }
  case "uninstall": {
    stop();
    try {
      uninstallRepoHooks(process.cwd());
    } catch {
      /* The current folder may not be a repository. */
    }
    uninstallHooks();
    const config = loadConfig();
    if (config && !restoreTraceConfig(config))
      console.log(
        "La configuracion Trace2 cambio desde la instalacion; se dejo intacta.",
      );
    if (
      existsSync(userBin) &&
      lstatSync(userBin).isSymbolicLink() &&
      readlinkSync(userBin) === wrapper
    )
      rmSync(userBin);
    for (const path of [
      configPath,
      tracePath,
      logPath,
      pidPath,
      socketPath,
      pairPath,
    ])
      if (existsSync(path)) rmSync(path);
    console.log("Git Visual desinstalado.");
    break;
  }
  default:
    console.log(
      "Uso: ./gitviz install | start | stop | status | token | allow-origin URL | hook install/uninstall | uninstall",
    );
}
