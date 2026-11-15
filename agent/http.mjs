import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
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

export function createAgentHttp({ config, hub, frontendDir }) {
  const sessions = new Map();
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
        const expected = Buffer.from(config.token);
        if (
          provided.length !== expected.length ||
          !timingSafeEqual(provided, expected)
        ) {
          response.writeHead(401);
          response.end("Wrong token");
          return;
        }
        const session = randomBytes(24).toString("base64url");
        sessions.set(session, {
          expires: Date.now() + 60 * 60 * 1000,
          origin: callerOrigin,
        });
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ session }));
      } catch {
        response.writeHead(400);
        response.end("Invalid request");
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
    createReadStream(file).pipe(response);
  });
  return server;
}
