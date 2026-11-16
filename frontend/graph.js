const ns = "http://www.w3.org/2000/svg";

function svg(tag, attributes = {}, label = null) {
  const element = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes))
    element.setAttribute(key, value);
  if (label !== null) element.textContent = label;
  return element;
}

export function renderGraph(snapshot) {
  const host = document.getElementById("commit-graph");
  host.replaceChildren();
  const all = snapshot.commits || [];
  const byHash = new Map(all.map((commit) => [commit.hash, commit]));
  const selected = document.getElementById("branch-filter")?.value || "";
  const tip = snapshot.branches?.find(
    (branch) => branch.name === selected,
  )?.hash;
  const reachable = new Set();
  if (tip) {
    const stack = [tip];
    while (stack.length) {
      const hash = stack.pop();
      if (reachable.has(hash)) continue;
      reachable.add(hash);
      stack.push(...(byHash.get(hash)?.parents || []));
    }
  }
  const commits = tip
    ? all.filter((commit) => reachable.has(commit.hash))
    : all;
  const branches = snapshot.branches || [];
  const lane = new Map();
  branches.forEach((branch, index) => {
    let hash = branch.hash;
    while (byHash.has(hash) && !lane.has(hash)) {
      lane.set(hash, Math.min(index, 7));
      hash = byHash.get(hash).parents?.[0];
    }
  });
  const width = Math.max(760, Math.min(branches.length, 8) * 110 + 390);
  const height = Math.max(120, commits.length * 65 + 60);
  host.setAttribute("viewBox", `0 0 ${width} ${height}`);
  host.style.height = `${height}px`;
  if (!commits.length) {
    host.append(
      svg("text", { x: 30, y: 75 }, "Aún no hay commits en esta rama"),
    );
    return;
  }
  const points = new Map(
    commits.map((commit, index) => [
      commit.hash,
      { x: 44 + (lane.get(commit.hash) || 0) * 110, y: 34 + index * 65 },
    ]),
  );
  for (const commit of commits) {
    const from = points.get(commit.hash);
    for (const parent of commit.parents || []) {
      const to = points.get(parent);
      if (to)
        host.append(
          svg("line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y }),
        );
    }
  }
  for (const commit of commits) {
    const point = points.get(commit.hash);
    const group = svg("g", {
      "data-hash": commit.hash,
      tabindex: "0",
      role: "button",
      "aria-label": `Commit ${commit.hash.slice(0, 7)}: ${commit.subject}`,
    });
    group.append(
      svg("circle", {
        cx: point.x,
        cy: point.y,
        r: 9,
        class: commit.hash === snapshot.head ? "head" : "",
      }),
    );
    group.append(
      svg(
        "text",
        { x: point.x + 22, y: point.y + 5 },
        `${commit.hash.slice(0, 7)} · ${commit.subject.slice(0, 64)}`,
      ),
    );
    host.append(group);
  }
  for (const branch of branches) {
    const point = points.get(branch.hash);
    if (point)
      host.append(
        svg(
          "text",
          { x: point.x + 22, y: point.y - 14, class: "ref-label" },
          branch.name,
        ),
      );
  }
}
