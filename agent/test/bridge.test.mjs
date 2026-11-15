import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function command(root, trace, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_TRACE2_EVENT: trace },
  });
}

async function nextMessage(reader, wanted) {
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error("El agente cerro la conexion.");
    buffer += new TextDecoder().decode(value);
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const data = block.split("\n").find((line) => line.startsWith("data: "));
      if (!data) continue;
      const message = JSON.parse(data.slice(6));
      if (wanted(message)) return message;
    }
  }
}

test("hosted origin pairs and receives a real Git event quickly", async (t) => {
  const temp = mkdtempSync(join(tmpdir(), "gitviz-bridge-"));
  const root = join(temp, "repo");
  const state = join(temp, "state");
  mkdirSync(root);
  mkdirSync(join(state, "gitviz"), { recursive: true });
  process.env.XDG_STATE_HOME = state;
  const { tracePath } = await import("../config.mjs");
  const { startAgent } = await import("../server.mjs");
  command(root, "0", "init", "-q");
  command(root, "0", "config", "user.name", "Test");
  command(root, "0", "config", "user.email", "test@example.invalid");
  const port = await freePort();
  const origin = "https://example.test";
  const config = {
    port,
    token: "test-secret",
    allowedOrigins: [origin],
    github: false,
  };
  const stop = await startAgent(root, config);
  t.after(async () => {
    await stop();
    rmSync(temp, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Git Visual/);
  const denied = await fetch(`${base}/api/pair`, {
    method: "POST",
    headers: { Origin: "https://bad.test", "Content-Type": "application/json" },
    body: JSON.stringify({ token: config.token }),
  });
  assert.equal(denied.status, 403);
  const paired = await fetch(`${base}/api/pair`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token: config.token }),
  });
  assert.equal(paired.status, 200);
  assert.equal(paired.headers.get("access-control-allow-origin"), origin);
  assert.equal(
    paired.headers.get("access-control-allow-private-network"),
    "true",
  );
  const { session } = await paired.json();
  const controller = new AbortController();
  t.after(() => controller.abort());
  const stream = await fetch(`${base}/api/events?session=${session}`, {
    headers: { Origin: origin },
    signal: controller.signal,
  });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const initial = await nextMessage(
    reader,
    (message) => message.kind === "snapshot",
  );
  assert.equal(initial.snapshot.initialized, true);

  writeFileSync(join(root, "app.js"), "console.log(1);\n");
  const started = Date.now();
  command(root, `af_unix:stream:${tracePath}`, "add", "app.js");
  const event = await Promise.race([
    nextMessage(
      reader,
      (message) =>
        message.kind === "event" && message.event.command.includes("git add"),
    ),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("No llego git add en 2 segundos.")),
        2000,
      ),
    ),
  ]);
  assert.equal(event.event.type, "add");
  assert.equal(event.snapshot.files[0].index, "A");
  assert.ok(
    Date.now() - started < 1000,
    "git add debe aparecer en menos de 1 segundo",
  );

  async function expectCommand(args, expectedType) {
    const startedAt = Date.now();
    command(root, `af_unix:stream:${tracePath}`, ...args);
    const observed = await nextMessage(
      reader,
      (message) =>
        message.kind === "event" &&
        message.event.command.startsWith(`git ${args[0]}`),
    );
    assert.equal(observed.event.type, expectedType);
    assert.ok(Date.now() - startedAt < 1000);
    return observed;
  }

  await expectCommand(["commit", "-m", "primer cambio"], "commit");
  writeFileSync(join(root, "app.js"), "console.log(2);\n");
  await expectCommand(["add", "app.js"], "add");
  await expectCommand(["restore", "--staged", "app.js"], "unstage");
  await expectCommand(["branch", "tema"], "branch");
  await expectCommand(["branch", "-d", "tema"], "branch_delete");
  await expectCommand(["status", "--short"], "inspect");
});
