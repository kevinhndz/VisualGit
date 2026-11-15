export function renderHistory(snapshot) {
  const host = document.getElementById("commit-history");
  host.replaceChildren();
  const commits = snapshot.commits || [];
  document.getElementById("commit-count").textContent = commits.length;
  document.getElementById("history-branch").textContent =
    snapshot.branch || "sin rama";
  if (!commits.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Aun no hay commits en el historial.";
    host.append(empty);
  }
  for (const commit of commits) {
    const row = document.createElement("div");
    row.className = `history-row${commit.hash === snapshot.head ? " is-head" : ""}`;
    const line = document.createElement("span");
    line.className = "history-line";
    line.setAttribute("aria-hidden", "true");
    const hash = document.createElement("span");
    hash.className = "commit-hash";
    hash.textContent = commit.hash.slice(0, 7);
    hash.title = commit.hash;
    const subject = document.createElement("span");
    subject.className = "commit-subject";
    subject.textContent = commit.subject;
    subject.title = commit.subject;
    const refs = document.createElement("span");
    refs.className = "commit-refs";
    const names = (snapshot.branches || [])
      .filter((branch) => branch.hash === commit.hash)
      .map((branch) => branch.name);
    if (commit.hash === snapshot.head) names.push("HEAD");
    for (const name of names) {
      const label = document.createElement("span");
      label.textContent = name;
      refs.append(label);
    }
    row.append(line, hash, subject, refs);
    host.append(row);
  }
}
