const byId = (id) => document.getElementById(id);

export function renderPullRequests(snapshot) {
  const host = byId("pull-requests");
  host.replaceChildren();
  const prs = snapshot.github?.prs || [];
  byId("pr-count").textContent = prs.length;
  if (!prs.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      snapshot.github?.error ||
      "Los PR reales apareceran aqui cuando el agente consulte GitHub.";
    host.append(empty);
    return;
  }
  for (const pr of prs.slice(0, 5)) {
    const card = document.createElement("div");
    card.className = "pr-card";
    const head = document.createElement("div");
    head.className = "pr-head";
    const title = document.createElement("strong");
    title.textContent = `#${pr.number} ${pr.title}`;
    const state = document.createElement("small");
    state.textContent = pr.state;
    const status = document.createElement("p");
    status.className = "pr-state";
    const checks = pr.checks || [];
    const passed = checks.filter(
      (check) => check.conclusion === "SUCCESS",
    ).length;
    status.textContent = `${pr.headRefName || "?"} → ${pr.baseRefName || "?"} · Checks ${passed}/${checks.length} · ${pr.reviewDecision || "Sin revision"}`;
    head.append(title, state);
    card.append(head, status);
    host.append(card);
  }
}
