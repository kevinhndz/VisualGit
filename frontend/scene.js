import { selectStage, eventStage } from "./guide.js";
const byId = (id) => document.getElementById(id);

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function replaceList(id, items, emptyText, limit = 30) {
  const host = byId(id);
  host.replaceChildren();
  if (!items.length) host.append(element("p", "empty", emptyText));
  for (const item of items.slice(0, limit)) host.append(item);
  if (items.length > limit)
    host.append(element("span", "more", `+${items.length - limit} mas`));
}

function fileRow(file, staged = false) {
  const status = staged
    ? "staged"
    : file.work === "D"
      ? "deleted"
      : file.index === "?"
        ? "untracked"
        : "modified";
  const row = element("div", `file-pill ${status}`);
  row.title = file.path;
  const label = element("div", "file-label");
  const split = file.path.lastIndexOf("/");
  label.append(element("span", "file-name", file.path.slice(split + 1)));
  label.append(
    element(
      "span",
      "file-directory",
      split < 0 ? "./" : file.path.slice(0, split + 1),
    ),
  );
  row.append(
    label,
    element(
      "span",
      "file-detail",
      file.added || file.deleted
        ? `+${file.added || 0} -${file.deleted || 0}`
        : staged
          ? "STAGED"
          : status === "untracked"
            ? "NUEVO"
            : status === "deleted"
              ? "BORRADO"
              : "MODIFICADO",
    ),
  );
  return row;
}

function updateReview(snapshot) {
  const prs = snapshot.github?.prs || [];
  const pr = prs.find((item) => item.state === "OPEN");
  const checks = pr?.checks || [];
  const failed = checks.some((check) =>
    ["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "ERROR"].includes(
      check.conclusion,
    ),
  );
  const pending = checks.some((check) => check.status !== "COMPLETED");
  const passed = checks.filter(
    (check) => check.conclusion === "SUCCESS",
  ).length;
  const approved = pr?.reviewDecision === "APPROVED";
  byId("robot").className =
    `actor robot ${failed ? "failed" : pending ? "working" : checks.length ? "ready" : ""}`;
  byId("ci-status").textContent = !pr
    ? "Sin PR abierto"
    : failed
      ? "Hay checks fallidos"
      : pending
        ? "Checks en ejecucion"
        : checks.length
          ? `${passed}/${checks.length} checks aprobados`
          : "Sin checks informados";
  byId("checks-summary").textContent = pr
    ? byId("ci-status").textContent
    : "Sin checks activos";
  byId("host").className =
    `actor host ${pr?.mergeStateStatus === "DIRTY" ? "failed" : approved ? "ready" : ""}`;
  byId("review-status").textContent = !pr
    ? "Sin revision pendiente"
    : pr.mergeStateStatus === "DIRTY"
      ? "Conflictos pendientes"
      : approved
        ? "Revision aprobada"
        : "Esperando revision";
  const merged = prs.filter((item) => item.state === "MERGED").length;
  byId("delivery-summary").textContent = merged
    ? `${merged} PR integrados`
    : "Sin integraciones informadas";
  byId("delivery-detail").textContent =
    "Despliegue no verificado por el agente";
}

export function renderScene(snapshot) {
  if (!snapshot) return;
  byId("repo-title").textContent = snapshot.repo || "Sin repositorio conectado";
  byId("branch-chip").textContent = `HEAD → ${snapshot.branch || "sin rama"}`;
  const files = snapshot.files || [];
  const working = files.filter(
    (file) => file.index === "?" || file.work !== ".",
  );
  const staged = files.filter(
    (file) => file.index !== "." && file.index !== "?",
  );
  replaceList(
    "working-files",
    working.map((file) => fileRow(file)),
    "Sin cambios en la carpeta",
  );
  replaceList(
    "staged-files",
    staged.map((file) => fileRow(file, true)),
    "La bandeja esta vacia",
  );
  byId("working-count").textContent = working.length;
  byId("stage-count").textContent = staged.length;
  byId("working-summary").textContent =
    `${working.length} archivos sin preparar`;
  byId("stage-summary").textContent = `${staged.length} archivos preparados`;
  replaceList(
    "stage-plates",
    staged.map((file) =>
      element("span", "stage-plate", file.path.split("/").pop()),
    ),
    "",
    8,
  );
  replaceList(
    "repo-blocks",
    (snapshot.commits || [])
      .slice(0, 3)
      .map((commit) => element("span", "repo-block", commit.hash.slice(0, 7))),
    "",
    3,
  );
  byId("repo-summary").textContent =
    snapshot.head?.slice(0, 7) || "Sin commits todavia";
  byId("remote-summary").textContent = snapshot.remotes?.length
    ? `${snapshot.remotes.length} referencias remotas`
    : "Sin ramas remotas";
  replaceList(
    "notebooks",
    (snapshot.branches || []).map((branch) => {
      const chip = element(
        "span",
        `chip${branch.name === snapshot.branch ? " current" : ""}`,
        branch.name,
      );
      chip.title = branch.hash || "Sin commits";
      return chip;
    }),
    "Aun no hay ramas",
  );
  replaceList(
    "remote-branches",
    (snapshot.remotes || []).map((branch) =>
      element(
        "div",
        "remote-pill",
        `${branch.name} · ${branch.hash?.slice(0, 7) || ""}`,
      ),
    ),
    "Sin referencias remotas",
  );
  updateReview(snapshot);
}

const flights = {
  add: [0, 1],
  unstage: [1, 0],
  commit: [1, 2],
  revert: [2, 1],
  push: [2, 3],
  fetch: [3, 2],
  pull: [3, 0],
  pr: [3, 4],
  ci: [4, 5],
};

export function animateEvent(event) {
  const followsLive = selectStage(eventStage(event.type), false);
  const cards = [...document.querySelectorAll(".scene .zone")];
  const route = flights[event.type];
  let flightDone = Promise.resolve();
  if (route && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const layer = byId("motion-layer");
    const box = layer.getBoundingClientRect();
    const from = cards[route[0]].getBoundingClientRect();
    const to = cards[route[1]].getBoundingClientRect();
    const packet = element(
      "span",
      "flying-packet",
      event.type === "commit"
        ? event.hash?.slice(0, 7) || "commit"
        : event.type === "add"
          ? event.files?.[0]?.split("/").pop() || "archivo"
          : "cambios",
    );
    packet.style.left = `${from.left - box.left + from.width / 2}px`;
    packet.style.top = `${from.top - box.top + from.height / 2}px`;
    layer.append(packet);
    const animation = packet.animate(
      [
        { transform: "translate(-50%, -50%)", opacity: 0 },
        { transform: "translate(-50%, -50%)", opacity: 1, offset: 0.15 },
        {
          transform: `translate(${to.left - from.left - packet.offsetWidth / 2}px, ${to.top - from.top - packet.offsetHeight / 2}px)`,
          opacity: 1,
        },
      ],
      { duration: 650, easing: "ease-in-out" },
    );
    animation.onfinish = () => packet.remove();
    flightDone = animation.finished
      .catch(() => {})
      .finally(() => packet.remove());
  }
  if (!followsLive) return flightDone;
  byId("narration").classList.toggle("failed", event.type === "error");
  byId("narration-title").textContent =
    event.title || "Cambio en el repositorio";
  byId("narration-text").textContent =
    event.explanation || "Estado actualizado desde tu terminal.";
  return flightDone;
}
