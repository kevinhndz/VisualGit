const byId = (id) => document.getElementById(id);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function replaceList(id, items, emptyText, limit = 6) {
  const host = byId(id);
  host.replaceChildren();
  if (!items.length) host.append(element("p", "empty", emptyText));
  for (const item of items.slice(0, limit)) host.append(item);
  if (items.length > limit)
    host.append(element("span", "more", `+${items.length - limit} mas`));
}

function filePill(file, staged = false) {
  const status = staged
    ? "staged"
    : file.work === "D"
      ? "deleted"
      : file.index === "?"
        ? "untracked"
        : "modified";
  const node = element("div", `file-pill ${status}`);
  node.title = file.path;
  node.append(element("span", "file-icon", status === "deleted" ? "✕" : "▤"));
  node.append(element("span", "file-name", file.path));
  const count =
    file.added || file.deleted
      ? `+${file.added || 0} −${file.deleted || 0}`
      : status === "untracked"
        ? "nuevo"
        : status === "deleted"
          ? "borrado"
          : "";
  node.append(element("span", "file-detail", count));
  return node;
}

function branchBook(branch, snapshot) {
  const node = element(
    "div",
    `notebook${branch.name === snapshot.branch ? " current" : ""}`,
  );
  const title = element("div", "book-name");
  title.append(element("span", "", branch.name));
  if (branch.name === snapshot.branch)
    title.append(element("span", "", "HEAD"));
  node.append(title);
  const commit = snapshot.commits?.find((item) => item.hash === branch.hash);
  node.append(
    element(
      "small",
      "",
      branch.hash
        ? `${branch.hash.slice(0, 7)} · ${commit?.subject || "commit"}`
        : "Sin commits todavia",
    ),
  );
  const pages = element("div", "book-pages");
  const byHash = new Map(
    (snapshot.commits || []).map((item) => [item.hash, item]),
  );
  let hash = branch.hash;
  let total = 0;
  while (hash && byHash.has(hash) && total < 8) {
    total++;
    hash = byHash.get(hash).parents?.[0];
  }
  for (let i = 0; i < Math.min(total, 8); i++) pages.append(element("i"));
  node.append(pages);
  return node;
}

function updateReview(snapshot) {
  const robot = byId("robot");
  const host = byId("host");
  robot.className = "actor robot";
  host.className = "actor host";
  const pr = snapshot.github?.prs?.find((item) => item.state === "OPEN");
  if (!pr) {
    byId("ci-status").textContent = "Esperando un Pull Request";
    byId("review-status").textContent = "Revisa checks y aprobaciones";
    return;
  }
  const checks = pr.checks || [];
  const failed = checks.some(
    (check) =>
      check.conclusion === "FAILURE" || check.conclusion === "CANCELLED",
  );
  const pending = checks.some((check) => check.status !== "COMPLETED");
  robot.classList.add(failed ? "failed" : pending ? "working" : "ready");
  byId("ci-status").textContent = failed
    ? "Pruebas fallidas"
    : pending
      ? `${checks.length} checks en marcha`
      : checks.length
        ? `${checks.length} checks terminados`
        : "Sin checks informados";
  const approved = pr.reviewDecision === "APPROVED";
  const mergeable = pr.mergeStateStatus === "CLEAN";
  host.classList.add(
    approved && mergeable && !failed && !pending ? "ready" : "working",
  );
  byId("review-status").textContent =
    approved && mergeable && !failed && !pending
      ? "Aprobado para fusionar"
      : pr.mergeStateStatus === "DIRTY"
        ? "Conflictos pendientes"
        : approved
          ? "Esperando checks"
          : "Esperando revision";
}

export function renderScene(snapshot) {
  if (!snapshot) return;
  byId("repo-title").textContent = snapshot.repo || "Repositorio";
  byId("branch-chip").textContent = `HEAD → ${snapshot.branch || "sin rama"}`;
  const files = snapshot.files || [];
  replaceList(
    "working-files",
    files
      .filter((file) => file.index === "?" || file.work !== ".")
      .map((file) => filePill(file)),
    "Sin cambios en la carpeta",
  );
  replaceList(
    "staged-files",
    files
      .filter((file) => file.index !== "." && file.index !== "?")
      .map((file) => filePill(file, true)),
    "La bandeja esta vacia",
  );
  const branches = snapshot.branches?.length
    ? snapshot.branches
    : [{ name: snapshot.branch || "main", hash: snapshot.head }];
  replaceList(
    "notebooks",
    branches.map((branch) => branchBook(branch, snapshot)),
    "Aun no hay ramas",
    7,
  );
  replaceList(
    "remote-branches",
    (snapshot.remotes || []).map((branch) => {
      const node = element(
        "div",
        "remote-pill",
        `⑂ ${branch.name} · ${branch.hash?.slice(0, 7) || "—"}`,
      );
      node.title = branch.name;
      return node;
    }),
    "Todavia no hay ramas en origin.",
  );
  updateReview(snapshot);
}

const zones = {
  init: ["working-zone", "repo-zone"],
  file: ["working-zone"],
  add: ["working-zone", "stage-zone"],
  unstage: ["stage-zone", "working-zone"],
  restore: ["working-zone"],
  commit: ["stage-zone", "repo-zone"],
  amend: ["repo-zone"],
  branch: ["repo-zone"],
  branch_delete: ["repo-zone"],
  switch: ["repo-zone", "working-zone"],
  merge: ["repo-zone"],
  conflict: ["working-zone", "repo-zone"],
  rebase: ["repo-zone"],
  push: ["repo-zone", "cloud-zone"],
  fetch: ["cloud-zone", "repo-zone"],
  pull: ["cloud-zone", "repo-zone", "working-zone"],
  remote: ["cloud-zone"],
  pr: ["robot", "host"],
  ci: ["robot"],
  inspect: ["repo-zone"],
  generic: ["repo-zone"],
  error: ["repo-zone"],
};
const paths = {
  add: "path-add",
  commit: "path-commit",
  push: "path-push",
  pull: "path-pull",
  fetch: "path-pull",
  unstage: "path-add",
};

export function animateEvent(event) {
  for (const id of zones[event.type] || zones.generic) {
    const zone = byId(id);
    zone.classList.remove("impact");
    void zone.offsetWidth;
    zone.classList.add("impact");
    setTimeout(() => zone.classList.remove("impact"), 700);
  }
  const path = byId(paths[event.type]);
  if (path) {
    path.classList.add("active");
    setTimeout(() => path.classList.remove("active"), 800);
  }
  const flight = {
    add: "add",
    commit: "commit",
    push: "push",
    pull: "pull",
    fetch: "pull",
  }[event.type];
  if (flight) {
    const symbol = element(
      "span",
      `flying-file ${flight}`,
      event.type === "push" || event.type === "fetch" || event.type === "pull"
        ? "📦"
        : "📄",
    );
    byId("motion-layer").append(symbol);
    setTimeout(() => symbol.remove(), 750);
  }
  byId("narration").classList.toggle("failed", event.type === "error");
  byId("narration-title").textContent = event.title || "Cambio el repositorio";
  byId("narration-text").textContent =
    event.explanation || "El agente actualizo el estado del repositorio.";
}
