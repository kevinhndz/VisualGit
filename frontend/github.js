const byId = (id) => document.getElementById(id);

export function renderPullRequests(snapshot) {
  const host = byId("pull-requests");
  host.replaceChildren();
  const github = snapshot.github?.prs || [];
  const local = snapshot.localPrs || [];
  byId("pr-count").textContent = github.length + local.length;
  const age = snapshot.github?.cachedAt
    ? Math.max(
        0,
        Math.floor((Date.now() - Date.parse(snapshot.github.cachedAt)) / 60000),
      )
    : null;
  const notice = document.createElement("p");
  notice.className = "empty";
  notice.textContent = snapshot.github?.offline
    ? `Sin conexión · datos de hace ${age ?? "?"} min. Los PR locales siguen disponibles.`
    : "PR de GitHub actualizados.";
  host.append(notice);
  if (!github.length && !local.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Todavía no hay PR. Puedes crear uno local abajo.";
    host.append(empty);
  }
  for (const pr of github) {
    const card = document.createElement("article");
    card.className = "pr-card";
    const title = document.createElement("strong");
    title.textContent = `PR #${pr.number} · vive en GitHub · ${pr.headRefName} → ${pr.baseRefName}`;
    const status = document.createElement("p");
    status.className = "pr-state";
    const checks = pr.checks || [];
    status.textContent = `${pr.title} · ${pr.state} · ${checks.filter((check) => check.conclusion === "SUCCESS").length}/${checks.length} revisiones correctas${pr.mergeStateStatus === "DIRTY" ? " · Conflicto con main" : ""}`;
    card.append(title, status);
    host.append(card);
  }
  for (const pr of local) {
    const card = document.createElement("article");
    card.className = "pr-card";
    const title = document.createElement("strong");
    title.textContent = `PR local #${pr.id} · vive en tu computadora · ${pr.head} → ${pr.base}`;
    const status = document.createElement("p");
    status.className = "pr-state";
    status.textContent = `${pr.title} · ${pr.state}${pr.mergeable === false ? ` · Conflicto con ${pr.base}` : ""}`;
    card.append(title, status);
    if (!["fusionado", "cerrado"].includes(pr.state)) {
      const actions = document.createElement("div");
      actions.className = "pr-actions";
      const allowed =
        pr.state === "borrador"
          ? [["Abrir", "abierto"]]
          : pr.state === "abierto"
            ? [["Pedir revisión", "en revisión"]]
            : pr.state === "en revisión"
              ? [["Aprobar (simulación)", "aprobado"]]
              : [];
      for (const [label, state] of allowed) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.dataset.prId = pr.id;
        button.dataset.prState = state;
        actions.append(button);
      }
      if (pr.state === "aprobado") {
        const merge = document.createElement("button");
        merge.type = "button";
        merge.textContent = "Merge con CI local";
        merge.dataset.prId = pr.id;
        merge.dataset.prMerge = "1";
        merge.disabled = !pr.mergeable;
        actions.append(merge);
      }
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Cerrar PR";
      close.dataset.prId = pr.id;
      close.dataset.prState = "cerrado";
      actions.append(close);
      card.append(actions);
    }
    host.append(card);
  }
  const runs = snapshot.github?.runs || [];
  const ciStatus = byId("ci-status");
  ciStatus.textContent = runs.length
    ? `GitHub Actions: ${runs[0].name} · ${runs[0].conclusion || runs[0].status}`
    : "Sin ejecuciones recientes de GitHub Actions.";
  for (const run of runs) {
    const card = document.createElement("article");
    card.className = "pr-card";
    const title = document.createElement("strong");
    title.textContent = `CI de GitHub · ${run.name} · ${run.headBranch}`;
    const status = document.createElement("p");
    status.className = "pr-state";
    status.textContent = `${run.conclusion || run.status} · ${new Date(run.createdAt).toLocaleString("es")}`;
    card.append(title, status);
    host.append(card);
  }
}
