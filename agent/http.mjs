import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { WebSocketServer } from "ws";
import { pairPath } from "./config.mjs";
import { installHook, uninstallHooks } from "./hooks.mjs";
import { installRepoHooks, uninstallRepoHooks } from "./repo-hooks.mjs";
import { runGit } from "./git.mjs";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) reject(new Error("Body too large"));
    });
    request.on("end", () => resolveBody(body));
    request.on("error", reject);
  });
}

export function createAgentHttp({ config, hub, frontendDir, root }) {
  const pairingDuration = 60 * 60 * 1000;
  const websockets = new WebSocketServer({ noServer: true });
  const sessions = new Map();
  let pairCode = config.token;
  let pairExpires = Date.now() + pairingDuration;
  let wrongAttempts = 0;
  let expiryTimer;
  const renewCode = () => {
    pairCode = String(randomInt(1000000)).padStart(6, "0");
    pairExpires = Date.now() + pairingDuration;
    wrongAttempts = 0;
    writeFileSync(config.pairPath || pairPath, pairCode, { mode: 0o600 });
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(renewCode, pairingDuration);
    expiryTimer.unref();
  };
  writeFileSync(config.pairPath || pairPath, pairCode, { mode: 0o600 });
  expiryTimer = setTimeout(renewCode, pairingDuration);
  expiryTimer.unref();
  const allowed = new Set(config.allowedOrigins);
  const localHosts = new Set([
    `127.0.0.1:${config.port}`,
    `localhost:${config.port}`,
  ]);

  const server = createServer(async (request, response) => {
    const host = request.headers.host || "";
    if (!localHosts.has(host)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const origin = request.headers.origin;
    const callerOrigin = origin || `http://${host}`;
    if (origin && !allowed.has(origin)) {
      response.writeHead(403);
      response.end("Origin denied");
      return;
    }
    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
    }
    response.setHeader("Access-Control-Allow-Private-Network", "true");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${host}`);
    if (url.pathname === "/api/health") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === "/api/pair" && request.method === "POST") {
      try {
        const body = JSON.parse(await readBody(request));
        const provided = Buffer.from(String(body.token || ""));
        const expected = Buffer.from(pairCode);
        if (
          Date.now() > pairExpires ||
          provided.length !== expected.length ||
          !timingSafeEqual(provided, expected)
        ) {
          wrongAttempts++;
          if (wrongAttempts >= 5 || Date.now() > pairExpires) {
            renewCode();
          }
          response.writeHead(401);
          response.end("Wrong token");
          return;
        }
        const session = randomBytes(24).toString("base64url");
        renewCode();
        const expires = Date.now() + 60 * 60 * 1000;
        sessions.set(session, {
          expires,
          origin: callerOrigin,
        });
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ session, expires }));
      } catch {
        response.writeHead(400);
        response.end("Invalid request");
      }
      return;
    }
    if (url.pathname === "/api/session" && request.method === "POST") {
      try {
        const body = JSON.parse(await readBody(request));
        const session = sessions.get(body.session);
        if (
          !session ||
          session.expires < Date.now() ||
          session.origin !== callerOrigin
        ) {
          response.writeHead(401);
          response.end("Sesion vencida");
          return;
        }
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ expires: session.expires }));
      } catch {
        response.writeHead(400);
        response.end("Solicitud invalida");
      }
      return;
    }
    if (url.pathname === "/api/github/refresh" && request.method === "POST") {
      try {
        const body = JSON.parse(await readBody(request));
        const session = sessions.get(body.session);
        if (
          !session ||
          session.expires < Date.now() ||
          session.origin !== callerOrigin
        ) {
          response.writeHead(401);
          response.end("Sesion vencida");
          return;
        }
        if (config.github === false) {
          response.writeHead(404);
          response.end();
          return;
        }
        await config.refreshGithub();
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ ok: true }));
      } catch {
        response.writeHead(400);
        response.end("No se pudo actualizar GitHub");
      }
      return;
    }
    if (url.pathname === "/api/local-pr" && request.method === "POST") {
      try {
        const body = JSON.parse(await readBody(request));
        const session = sessions.get(body.session);
        if (
          !session ||
          session.expires < Date.now() ||
          session.origin !== callerOrigin
        ) {
          response.writeHead(401);
          response.end("Primero conecta el agente.");
          return;
        }
        if (
          body.id !== undefined &&
          (!Number.isSafeInteger(body.id) || body.id < 1)
        )
          throw new Error("Número de PR inválido.");
        const result = await config.localPrAction(body);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ ok: true, result }));
      } catch (error) {
        response.writeHead(400);
        response.end(error.message);
      }
      return;
    }
    if (url.pathname === "/api/events" && request.method === "GET") {
      const session = sessions.get(url.searchParams.get("session"));
      if (
        !session ||
        session.expires < Date.now() ||
        session.origin !== callerOrigin
      ) {
        response.writeHead(401);
        response.end("Pair first");
        return;
      }
      hub.attach(response, Number(request.headers["last-event-id"]) || 0);
      return;
    }
    if (url.pathname === "/api/integration" && request.method === "POST") {
      try {
        const body = JSON.parse(await readBody(request));
        const session = sessions.get(body.session);
        if (
          !session ||
          session.expires < Date.now() ||
          session.origin !== callerOrigin
        ) {
          response.writeHead(401);
          response.end("Primero conecta el agente.");
          return;
        }
        const actions = {
          "install-shell": () =>
            installHook(process.env.SHELL?.endsWith("zsh") ? "zsh" : "bash"),
          "uninstall-shell": () => uninstallHooks(),
          "install-hooks": () => installRepoHooks(root),
          "uninstall-hooks": () => uninstallRepoHooks(root),
        };
        if (!Object.hasOwn(actions, body.action)) {
          response.writeHead(400);
          response.end("Accion desconocida.");
          return;
        }
        actions[body.action]();
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ ok: true }));
      } catch (error) {
        response.writeHead(500);
        response.end(error.message);
      }
      return;
    }
    if (url.pathname === "/api/repository" && request.method === "POST") {
      try {
        const body = JSON.parse(await readBody(request));
        const session = sessions.get(body.session);
        if (
          !session ||
          session.expires < Date.now() ||
          session.origin !== callerOrigin
        ) {
          response.writeHead(401);
          response.end("Primero conecta el agente.");
          return;
        }
        if (typeof config.selectRepository !== "function")
          throw new Error("Abre Git Visual desde un repositorio.");
        const selected = config.selectRepository(body.folder);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(selected));
      } catch (error) {
        response.writeHead(400);
        response.end(error.message);
      }
      return;
    }
    if (url.pathname.startsWith("/api/commit/") && request.method === "GET") {
      const session = sessions.get(url.searchParams.get("session"));
      if (
        !session ||
        session.expires < Date.now() ||
        session.origin !== callerOrigin
      ) {
        response.writeHead(401);
        response.end("Primero conecta el agente.");
        return;
      }
      const hash = url.pathname.slice("/api/commit/".length);
      if (!/^[0-9a-f]{7,40}$/.test(hash)) {
        response.writeHead(400);
        response.end("Hash inválido.");
        return;
      }
      const [info, files] = await Promise.all([
        runGit(root, ["show", "-s", "--format=%H%n%P%n%an%n%s", hash]),
        runGit(root, [
          "diff-tree",
          "--root",
          "--no-commit-id",
          "--name-only",
          "-r",
          hash,
        ]),
      ]);
      if (!info.ok) {
        response.writeHead(404);
        response.end("Commit no encontrado.");
        return;
      }
      const [fullHash, parents, author, message] = info.stdout.split("\n");
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          hash: fullHash,
          parents: parents.split(" ").filter(Boolean),
          author,
          message,
          files: files.stdout.split("\n").filter(Boolean),
        }),
      );
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(405);
      response.end();
      return;
    }
    const name = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = resolve(frontendDir, `.${name}`);
    if (
      !file.startsWith(frontendDir + sep) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    response.end(readFileSync(file));
  });
  server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host || "";
    const origin = request.headers.origin || "";
    if (!localHosts.has(host) || !allowed.has(origin)) {
      socket.destroy();
      return;
    }
    const url = new URL(request.url, `http://${host}`);
    const session = sessions.get(url.searchParams.get("session"));
    if (
      url.pathname !== "/api/ws" ||
      !session ||
      session.expires < Date.now() ||
      session.origin !== origin
    ) {
      socket.destroy();
      return;
    }
    websockets.handleUpgrade(request, socket, head, (websocket) => {
      hub.attachSocket(websocket);
    });
  });
  server.on("close", () => clearTimeout(expiryTimer));
  return server;
}
