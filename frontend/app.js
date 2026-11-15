import { AgentClient } from "./client.js";
import { showLatency } from "./metrics.js";
import { addTimeline } from "./timeline.js";
import { renderPullRequests } from "./github.js";
import { animateEvent, renderScene } from "./scene.js";
import { demoSteps, freshDemo } from "./simulator.js";

const byId = (id) => document.getElementById(id);
const queue = [];
let busy = false;
let demo = freshDemo();
let demoTimer = null;
let currentSnapshot = demo;

function setStatus(status) {
  const dot = byId("connection-dot");
  dot.className = `status-dot ${status === "connected" ? "connected" : status === "demo" ? "" : "disconnected"}`;
  byId("connection-label").textContent =
    {
      connected: "Conectado al repositorio real",
      reconnecting: "Reconectando...",
      disconnected: "Sin conexion",
      demo: "Modo demostracion",
    }[status] || "Sin conexion";
}

function enqueue(event, snapshot) {
  showLatency(event);
  queue.push({ event, snapshot });
  if (!busy) void drainQueue();
}

async function drainQueue() {
  busy = true;
  while (queue.length) {
    const { event, snapshot } = queue.shift();
    if (snapshot) {
      currentSnapshot = snapshot;
      renderScene(snapshot);
      renderPullRequests(snapshot);
    }
    addTimeline(event);
    animateEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 420));
  }
  busy = false;
}

const client = new AgentClient((message) => {
  if (message.kind === "snapshot") {
    currentSnapshot = message.snapshot;
    renderScene(currentSnapshot);
    renderPullRequests(currentSnapshot);
  } else if (message.kind === "event") {
    enqueue(message.event, message.snapshot);
  } else if (message.kind === "github") {
    currentSnapshot.github = message.github;
    renderScene(currentSnapshot);
    renderPullRequests(currentSnapshot);
  }
}, setStatus);

async function connect() {
  clearInterval(demoTimer);
  demoTimer = null;
  const button = byId("connect-button");
  const base = byId("agent-url").value.trim();
  const token = byId("pair-token").value.trim();
  byId("connect-error").textContent = "";
  button.disabled = true;
  button.textContent = "Conectando...";
  try {
    await client.connect(base, token);
    sessionStorage.setItem("gitviz-token", token);
    localStorage.setItem("gitviz-agent", base);
  } catch (error) {
    setStatus("disconnected");
    byId("connect-error").textContent =
      error instanceof TypeError
        ? "No se pudo llegar al agente. Revisa que este iniciado y que el navegador permita acceso local."
        : error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Conectar";
  }
}

function startDemo() {
  client.disconnect();
  clearInterval(demoTimer);
  setStatus("demo");
  demo = freshDemo();
  currentSnapshot = demo;
  renderScene(demo);
  renderPullRequests(demo);
  let step = 0;
  const next = () => {
    if (step >= demoSteps.length) {
      clearInterval(demoTimer);
      demoTimer = null;
      return;
    }
    const item = demoSteps[step++];
    item.change(demo);
    enqueue(
      {
        type: item.type,
        title: item.title,
        explanation: item.explanation,
        command: item.command,
        ts: new Date().toISOString(),
      },
      structuredClone(demo),
    );
  };
  next();
  demoTimer = setInterval(next, 1500);
}

byId("connect-button").addEventListener("click", connect);
byId("pair-token").addEventListener("keydown", (event) => {
  if (event.key === "Enter") void connect();
});
byId("demo-button").addEventListener("click", startDemo);
byId("presentation-button").addEventListener("click", () =>
  document.body.classList.toggle("presentation"),
);
byId("debug-button").addEventListener("click", () => {
  byId("debug-panel").hidden = !byId("debug-panel").hidden;
});
byId("agent-url").value =
  localStorage.getItem("gitviz-agent") || byId("agent-url").value;
byId("pair-token").value = sessionStorage.getItem("gitviz-token") || "";
renderScene(demo);
renderPullRequests(demo);
setStatus("demo");
if (byId("pair-token").value) void connect();
