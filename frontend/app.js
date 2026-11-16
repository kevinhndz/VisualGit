import { AgentClient } from "./client.js";
import { setupGuide } from "./guide.js";
import { renderHistory } from "./history.js";
import { renderGraph } from "./graph.js";
import { showLatency } from "./metrics.js";
import { addTimeline, clearTimeline } from "./timeline.js";
import { renderPullRequests } from "./github.js";
import { animateEvent, renderScene } from "./scene.js";
import { demoSteps, freshDemo } from "./simulator.js";
import { setupModules } from "./modules.js";
import { setupTeacher } from "./teacher.js";
import { setupLocalPr } from "./local-pr.js";

const byId = (id) => document.getElementById(id);
const savedSessionKey = "gitviz-session";
const modules = setupModules();
const teacher = setupTeacher();
const localConflicts = new Set();
function showLocalConflicts(prs = []) {
  const active = new Set();
  for (const pr of prs) {
    if (pr.mergeable !== false || ["fusionado", "cerrado"].includes(pr.state))
      continue;
    const id = `local-pr-${pr.id}`;
    active.add(id);
    if (localConflicts.has(id)) continue;
    localConflicts.add(id);
    teacher.show({
      id,
      title: `Conflicto con ${pr.base}`,
      what: `El PR local #${pr.id} no se puede unir todavía.`,
      why: "Las dos ramas tienen cambios incompatibles que necesitan tu decisión.",
      steps: [
        { text: "Cambia a tu rama.", command: `git switch ${pr.head}` },
        {
          text: "Trae la rama de destino y resuelve los archivos.",
          command: `git merge ${pr.base}`,
        },
        {
          text: "Prepara los archivos y termina el merge.",
          command: "git add .",
        },
      ],
      avoid: "Actualiza tu rama mientras el PR sigue abierto.",
      scene: "merge",
    });
  }
  for (const id of localConflicts) {
    if (!active.has(id)) {
      localConflicts.delete(id);
      teacher.resolved(id);
    }
  }
}
function updateNetworkStatus() {
  byId("network-status").textContent = navigator.onLine
    ? "Internet disponible. Git local también funciona sin internet."
    : "Sin internet. Puedes seguir usando Git local.";
}
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
updateNetworkStatus();
const queue = [];
let busy = false;
let demo = freshDemo();
let demoTimer = null;
let currentSnapshot = demo;
let generation = 0;

function renderSnapshot(snapshot) {
  byId("setup-repo").textContent = snapshot.repo || "Sin conexión";
  byId("latest-commit").textContent = snapshot.commits?.[0]
    ? `${snapshot.commits[0].hash.slice(0, 7)} · ${snapshot.commits[0].subject}`
    : "Todavía no hay commits.";
  const filter = byId("branch-filter");
  const selected = filter.value;
  filter.replaceChildren(new Option("Todas las ramas", ""));
  for (const branch of snapshot.branches || [])
    filter.add(new Option(branch.name, branch.name));
  filter.value = selected;
  renderScene(snapshot);
  renderHistory(snapshot);
  renderGraph(snapshot);
  renderPullRequests(snapshot);
  showLocalConflicts(snapshot.localPrs);
}

function setStatus(status) {
  if (status === "connected") {
    byId("connection-panel").open = false;
    byId("narration-title").textContent = "Repositorio conectado";
    byId("narration-text").textContent =
      "Ejecuta tus comandos en la terminal para seguir el recorrido de los cambios.";
    void refreshGithubIfVisible();
  }
  if (status === "disconnected") byId("connection-panel").open = true;
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
  modules.mark(1);
  if (["pr", "ci", "pr_updated", "pipeline_step"].includes(event.type))
    modules.mark(2);
  if (
    ["commit", "branch", "branch_created", "checkout", "switch"].includes(
      event.type,
    )
  )
    modules.mark(3);
  showLatency(event);
  queue.push({ event, snapshot, version: generation });
  if (!busy) void drainQueue();
}

async function drainQueue() {
  busy = true;
  while (queue.length) {
    const { event, snapshot, version } = queue.shift();
    if (version !== generation) continue;
    if (snapshot) {
      currentSnapshot = snapshot;
      renderSnapshot(snapshot);
    }
    addTimeline(event);
    await animateEvent(event);
  }
  busy = false;
}

const client = new AgentClient((message) => {
  if (message.kind === "snapshot") {
    currentSnapshot = message.snapshot;
    renderSnapshot(currentSnapshot);
    for (const problem of currentSnapshot.problems || []) teacher.show(problem);
  } else if (message.kind === "event") {
    if (message.replay) addTimeline(message.event);
    else enqueue(message.event, message.snapshot);
  } else if (message.kind === "github") {
    currentSnapshot.github = message.github;
    renderSnapshot(currentSnapshot);
  } else if (message.kind === "local-pr") {
    currentSnapshot.localPrs = message.prs;
    renderPullRequests(currentSnapshot);
    showLocalConflicts(message.prs);
  } else if (message.kind === "pipeline") {
    localPr.onPipeline(message);
  } else if (message.kind === "teacher") {
    if (message.action === "show") teacher.show(message.problem);
    if (message.action === "resolved") teacher.resolved(message.id);
  }
}, setStatus);
const localPr = setupLocalPr(() => client);

async function refreshGithubIfVisible() {
  if (modules.active() !== 2 || !navigator.onLine || !client.session) return;
  try {
    await fetch(`${client.base}/api/github/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: client.session }),
    });
  } catch {
    // El estado local de Git sigue disponible sin Internet.
  }
}
window.addEventListener(
  "gitvisual:module",
  () => void refreshGithubIfVisible(),
);
window.addEventListener("online", () => void refreshGithubIfVisible());
setInterval(refreshGithubIfVisible, 45000);

async function connect() {
  generation++;
  queue.length = 0;
  clearInterval(demoTimer);
  demoTimer = null;
  const button = byId("connect-button");
  const base = byId("agent-url").value.trim();
  const token = byId("pair-token").value.trim();
  byId("connect-error").textContent = "";
  button.disabled = true;
  button.textContent = "Conectando...";
  try {
    const { session, expires } = await client.connect(base, token);
    clearTimeline();
    localStorage.setItem("gitviz-agent", base);
    sessionStorage.setItem(
      savedSessionKey,
      JSON.stringify({ base: client.base, session, expires }),
    );
    byId("pair-token").value = "";
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

async function resumeSession() {
  const saved = sessionStorage.getItem(savedSessionKey);
  if (!saved) return;
  try {
    const { base, session, expires } = JSON.parse(saved);
    if (!base || !session || expires <= Date.now()) throw new Error();
    byId("agent-url").value = base;
    await client.resume(base, session);
  } catch {
    sessionStorage.removeItem(savedSessionKey);
    setStatus("disconnected");
  }
}

function startDemo() {
  clearTimeline();
  generation++;
  queue.length = 0;
  client.disconnect();
  sessionStorage.removeItem(savedSessionKey);
  clearInterval(demoTimer);
  setStatus("demo");
  demo = freshDemo();
  currentSnapshot = demo;
  renderSnapshot(demo);
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
        demo: true,
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
document
  .querySelector(".setup-buttons")
  .addEventListener("click", async (event) => {
    const action = event.target.dataset.integration;
    if (!action) return;
    const result = byId("setup-result");
    if (!client.session) {
      result.textContent = "Primero conecta el agente.";
      return;
    }
    try {
      const response = await fetch(`${client.base}/api/integration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: client.session, action }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      result.textContent =
        "Cambio guardado. Abre una terminal nueva si cambiaste la integración.";
    } catch {
      result.textContent = "No se pudo guardar el cambio. Revisa el agente.";
    }
  });
byId("test-connection").addEventListener("click", async () => {
  const result = byId("setup-result");
  try {
    const response = await fetch(`${client.base}/api/health`);
    result.textContent =
      response.ok && client.session
        ? "Conexión activa con el agente."
        : "El agente responde, pero falta conectar el código.";
  } catch {
    result.textContent = "No se pudo contactar al agente.";
  }
});
byId("choose-repository").addEventListener("click", async () => {
  const result = byId("setup-result");
  if (!client.session) {
    result.textContent = "Primero conecta el agente.";
    return;
  }
  try {
    const response = await fetch(`${client.base}/api/repository`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session: client.session,
        folder: byId("repository-folder").value.trim(),
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const selected = await response.json();
    byId("agent-url").value = selected.url;
    byId("pair-token").value = selected.code;
    await connect();
    modules.show(1);
  } catch (error) {
    result.textContent = error.message;
  }
});
byId("branch-filter").addEventListener("change", () =>
  renderGraph(currentSnapshot),
);
async function showCommit(hash) {
  const details = byId("commit-details");
  if (!client.session) {
    details.textContent = "Conecta el agente para ver este commit.";
    return;
  }
  try {
    const response = await fetch(
      `${client.base}/api/commit/${hash}?session=${encodeURIComponent(client.session)}`,
    );
    if (!response.ok) throw new Error("No se pudo leer el commit.");
    const commit = await response.json();
    details.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = commit.message;
    details.append(heading);
    for (const line of [
      `Hash: ${commit.hash}`,
      `Padres: ${commit.parents.join(", ") || "ninguno"}`,
      `Autor: ${commit.author}`,
      `Archivos: ${commit.files.join(", ") || "ninguno"}`,
    ]) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      details.append(paragraph);
    }
  } catch (error) {
    details.textContent = error.message;
  }
}
byId("commit-graph").addEventListener("click", (event) => {
  const hash = event.target.closest("[data-hash]")?.dataset.hash;
  if (hash) void showCommit(hash);
});
byId("commit-graph").addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const hash = event.target.closest("[data-hash]")?.dataset.hash;
  if (hash) {
    event.preventDefault();
    void showCommit(hash);
  }
});
byId("presentation-button").addEventListener("click", () =>
  document.body.classList.toggle("presentation"),
);
byId("debug-button").addEventListener("click", () => {
  byId("debug-panel").hidden = !byId("debug-panel").hidden;
});
byId("agent-url").value = ["127.0.0.1", "localhost"].includes(location.hostname)
  ? location.origin
  : localStorage.getItem("gitviz-agent") || byId("agent-url").value;
setupGuide();
currentSnapshot = {
  files: [],
  branches: [],
  commits: [],
  remotes: [],
  github: { prs: [] },
};
renderSnapshot(currentSnapshot);
setStatus("disconnected");
void resumeSession();
