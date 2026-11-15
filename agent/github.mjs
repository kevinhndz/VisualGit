import { runGh } from "./git.mjs";

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
  const result = await runGh(root, [
    "pr",
    "list",
    "--state",
    "all",
    "--limit",
    "10",
    "--json",
    "number,title,state,headRefName,baseRefName,reviewDecision,mergeStateStatus,statusCheckRollup,url",
  ]);
  if (!result.ok)
    return {
      prs: [],
      error:
        "GitHub no esta disponible. Revisa gh auth login y el remoto origin.",
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
    return { prs };
  } catch {
    return { prs: [], error: "No se pudo leer la respuesta de GitHub." };
  }
}
