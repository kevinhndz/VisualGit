import { runGh } from "./git.mjs";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stateDir } from "./config.mjs";

function cachePath(root) {
  const hash = createHash("sha256")
    .update(resolve(root))
    .digest("hex")
    .slice(0, 24);
  return join(stateDir, `github-pr-${hash}.json`);
}

export function cachedGithub(root) {
  const path = cachePath(root);
  if (!existsSync(path)) return { prs: [], offline: true };
  try {
    return { ...JSON.parse(readFileSync(path, "utf8")), offline: true };
  } catch {
    return { prs: [], offline: true };
  }
}

function normalizeCheck(item) {
  if (item.name) {
    return {
      name: item.name,
      status: item.status || "COMPLETED",
      conclusion: item.conclusion || null,
    };
  }
  return {
    name: item.context || "Check",
    status: item.state === "PENDING" ? "IN_PROGRESS" : "COMPLETED",
    conclusion:
      item.state === "SUCCESS"
        ? "SUCCESS"
        : item.state === "PENDING"
          ? null
          : "FAILURE",
  };
}

export async function fetchGithub(root) {
  const [result, runsResult] = await Promise.all([
    runGh(root, [
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      "10",
      "--json",
      "number,title,state,headRefName,baseRefName,reviewDecision,mergeStateStatus,statusCheckRollup,url",
    ]),
    runGh(root, [
      "run",
      "list",
      "--limit",
      "5",
      "--json",
      "databaseId,name,status,conclusion,headBranch,url,createdAt",
    ]),
  ]);
  if (!result.ok)
    return {
      ...cachedGithub(root),
      error:
        "GitHub no está disponible. Revisa la conexión, gh auth login y origin.",
    };
  try {
    const prs = JSON.parse(result.stdout).map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      reviewDecision: pr.reviewDecision,
      mergeStateStatus: pr.mergeStateStatus,
      url: pr.url,
      checks: (pr.statusCheckRollup || []).map(normalizeCheck),
    }));
    let runs = [];
    if (runsResult.ok) {
      try {
        runs = JSON.parse(runsResult.stdout);
      } catch {
        // Los PR siguen disponibles aunque la lista de runs no se pueda leer.
      }
    }
    const data = {
      prs,
      runs,
      cachedAt: new Date().toISOString(),
      offline: false,
    };
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    writeFileSync(cachePath(root), JSON.stringify(data, null, 2) + "\n", {
      mode: 0o600,
    });
    return data;
  } catch {
    return {
      ...cachedGithub(root),
      error: "No se pudo leer la respuesta de GitHub.",
    };
  }
}
