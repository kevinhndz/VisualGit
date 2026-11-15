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
  const commits = (snapshot.commits || []).slice(0, 18).reverse();
  const width = Math.max(760, commits.length * 63 + 80);
  host.setAttribute("viewBox", `0 0 ${width} 138`);
  host.style.width = `${width}px`;
  if (!commits.length) {
    host.append(svg("text", { x: 30, y: 75 }, "Aun no hay commits"));
    return;
  }

  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const lane = new Map();
  const branches = [
    ...(snapshot.branches || []).filter(
      (branch) => branch.name === snapshot.branch,
    ),
    ...(snapshot.branches || []).filter(
      (branch) => branch.name !== snapshot.branch,
    ),
  ];
  for (let i = 0; i < Math.min(branches.length, 3); i++) {
    let hash = branches[i].hash;
    while (hash && byHash.has(hash)) {
      if (!lane.has(hash)) lane.set(hash, i);
      hash = byHash.get(hash).parents?.[0];
    }
  }
  const points = new Map(
    commits.map((commit, i) => [
      commit.hash,
      { x: 45 + i * 63, y: 45 + (lane.get(commit.hash) || 0) * 35 },
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
    host.append(
      svg("circle", {
        cx: point.x,
        cy: point.y,
        r: 7,
        class: commit.hash === snapshot.head ? "head" : "",
      }),
    );
    host.append(
      svg(
        "text",
        { x: point.x, y: point.y + 21, "text-anchor": "middle" },
        commit.hash.slice(0, 7),
      ),
    );
  }
  const labelsPerCommit = new Map();
  for (const branch of branches.slice(0, 3)) {
    const point = points.get(branch.hash);
    if (!point) continue;
    const offset = labelsPerCommit.get(branch.hash) || 0;
    labelsPerCommit.set(branch.hash, offset + 1);
    host.append(
      svg(
        "text",
        {
          x: point.x,
          y: point.y - 16 - offset * 12,
          class: "ref-label",
          "text-anchor": "middle",
        },
        branch.name.slice(0, 16),
      ),
    );
  }
  if ((snapshot.commits || []).length > commits.length) {
    host.append(
      svg(
        "text",
        { x: 12, y: 126 },
        `+${snapshot.commits.length - commits.length} commits anteriores`,
      ),
    );
  }
}
