#!/usr/bin/env bun
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { createConnection } from "node:net";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDirectories, stateDir } from "./config.mjs";
import { startAgent } from "./server.mjs";
import { uninstallAllRepoHooks } from "./repo-hooks.mjs";
import { uninstallHooks } from "./hooks.mjs";
import { homedir } from "node:os";

function repoRoot(start) {
  let path = resolve(start);
  while (true) {
    if (existsSync(join(path, ".git"))) return path;
    const parent = dirname(path);
    if (parent === path) return resolve(start);
    path = parent;
  }
}

function paths(root) {
  const id = createHash("sha256").update(root).digest("hex").slice(0, 16);
  return {
    state: join(stateDir, `${id}.json`),
    pairPath: join(stateDir, `${id}.code`),
    socketPath:
      process.platform === "win32"
        ? `\\\\.\\pipe\\gitvisual-${id}`
        : join(stateDir, `${id}.sock`),
  };
}

function running(state) {
  if (!existsSync(state)) return null;
  try {
    const info = JSON.parse(readFileSync(state, "utf8"));
    process.kill(info.pid, 0);
    return info;
  } catch {
    rmSync(state, { force: true });
    return null;
  }
}

async function freePort(requested) {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(requested || 0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolvePort(port));
    });
  });
}

function openBrowser(url) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

const args = process.argv.slice(2);
const command = args[0] || "iniciar";
const repoOption = args.indexOf("--repo");
const root = repoRoot(repoOption >= 0 ? args[repoOption + 1] : process.cwd());
const files = paths(root);
ensureDirectories();

if (command === "hook-event") {
  if (process.platform === "win32" || existsSync(files.socketPath)) {
    const socket = createConnection(files.socketPath);
    socket.on("error", () => {});
    socket.end(JSON.stringify({ cwd: root, hook: args[1] }));
  }
} else if (command === "emit") {
  const line = args.slice(1).join(" ");
  if (
    /^\s*git(?:\s|$)/.test(line) &&
    (process.platform === "win32" || existsSync(files.socketPath))
  ) {
    const socket = createConnection(files.socketPath);
    socket.on("error", () => {});
    socket.end(JSON.stringify({ cwd: process.cwd(), command: line }));
  }
} else if (command === "desinstalar") {
  for (const name of readdirSync(stateDir)) {
    if (!/^[0-9a-f]{16}\.json$/.test(name)) continue;
    const info = running(join(stateDir, name));
    if (info) process.kill(info.pid, "SIGTERM");
  }
  uninstallAllRepoHooks();
  uninstallHooks();
  if (process.platform === "win32") {
    const binDir = join(process.env.LOCALAPPDATA, "Git Visual", "bin");
    const exe = join(binDir, "git-visual.exe");
    const shortcut = join(
      process.env.APPDATA,
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Git Visual.lnk",
    );
    const psQuote = (value) => `'${value.replaceAll("'", "''")}'`;
    const script = `[Environment]::SetEnvironmentVariable('Path',(([Environment]::GetEnvironmentVariable('Path','User') -split ';' | Where-Object { $_ -ne ${psQuote(binDir)} }) -join ';'),'User'); Start-Sleep -Seconds 2; Remove-Item -LiteralPath ${psQuote(shortcut)} -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath ${psQuote(exe)} -Force -ErrorAction SilentlyContinue`;
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", script], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    console.log("Git Visual se quitará cuando termine este proceso.");
    process.exit(0);
  }
  const home = homedir();
  const appDir = join(home, ".local", "share", "git-visual");
  const link = join(home, ".local", "bin", "git-visual");
  if (
    existsSync(link) &&
    lstatSync(link).isSymbolicLink() &&
    readlinkSync(link) === join(appDir, "git-visual")
  )
    rmSync(link);
  rmSync(join(home, ".local", "share", "applications", "git-visual.desktop"), {
    force: true,
  });
  rmSync(join(home, "Applications", "Git Visual.app"), {
    recursive: true,
    force: true,
  });
  rmSync(appDir, { recursive: true, force: true });
  const profile = join(home, ".profile");
  if (existsSync(profile)) {
    const line = `\n# Git Visual PATH\nexport PATH="${join(home, ".local", "bin")}:$PATH"\n`;
    writeFileSync(profile, readFileSync(profile, "utf8").replace(line, ""));
  }
  console.log("Git Visual desinstalado de este usuario.");
} else if (command === "codigo") {
  console.log(
    existsSync(files.pairPath)
      ? readFileSync(files.pairPath, "utf8").trim()
      : "No hay un agente activo en esta carpeta.",
  );
} else if (["estado", "status"].includes(command)) {
  const info = running(files.state);
  console.log(
    info
      ? `Git Visual activo: ${info.url}`
      : "Git Visual detenido para esta carpeta.",
  );
} else if (["detener", "stop"].includes(command)) {
  const info = running(files.state);
  if (info) process.kill(info.pid, "SIGTERM");
  console.log(
    info ? "Agente detenido." : "No hay agente activo para esta carpeta.",
  );
} else if (command === "--serve") {
  const port = Number(args[1]);
  const code = readFileSync(files.pairPath, "utf8").trim();
  const config = {
    token: code,
    port,
    allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
    github: false,
    useTrace2: false,
    noRepo: !existsSync(join(root, ".git")),
    frontendDir: resolve(
      dirname(fileURLToPath(import.meta.url)),
      Bun.isStandaloneExecutable ? "frontend" : "../frontend",
    ),
    selectRepository(folder) {
      if (typeof folder !== "string" || !existsSync(folder))
        throw new Error("La carpeta no existe.");
      const selected = repoRoot(folder);
      if (!existsSync(join(selected, ".git")))
        throw new Error("Esa carpeta no es un repositorio Git.");
      const output = execFileSync(
        process.execPath,
        ["iniciar", "--repo", selected, "--no-abrir"],
        { cwd: selected, encoding: "utf8" },
      );
      const selectedFiles = paths(selected);
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (!url) throw new Error("No se pudo abrir ese repositorio.");
      return { url, code: readFileSync(selectedFiles.pairPath, "utf8").trim() };
    },
    ...files,
  };
  const stop = await startAgent(root, config);
  writeFileSync(
    files.state,
    JSON.stringify({ pid: process.pid, url: `http://127.0.0.1:${port}`, root }),
    { mode: 0o600 },
  );
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, async () => {
      await stop();
      rmSync(files.state, { force: true });
      rmSync(files.pairPath, { force: true });
      process.exit(0);
    });
  }
} else if (["iniciar", "start"].includes(command)) {
  const existing = running(files.state);
  if (existing) {
    console.log(existing.url);
  } else {
    const position = args.indexOf("--port");
    const port = await freePort(position >= 0 ? Number(args[position + 1]) : 0);
    const noOpen = args.includes("--no-abrir");
    const code = String(randomInt(1000000)).padStart(6, "0");
    writeFileSync(files.pairPath, code, { mode: 0o600 });
    const child = spawn(process.execPath, ["--serve", String(port)], {
      cwd: root,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    const url = `http://127.0.0.1:${port}`;
    writeFileSync(files.state, JSON.stringify({ pid: child.pid, url, root }), {
      mode: 0o600,
    });
    console.log(`Git Visual: ${url}`);
    console.log(`Código de seis dígitos: ${code}`);
    if (!noOpen) setTimeout(() => openBrowser(url), 350);
  }
} else {
  console.log(
    "Uso: git visual [iniciar|estado|detener] [--port N] [--no-abrir]",
  );
}
