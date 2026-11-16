import { explainError } from "./error-rules.mjs";

const step = (text, command = "") => ({ text, command });

function issue(id, title, what, why, steps, avoid, scene = "") {
  return { id, title, what, why, steps, avoid, scene };
}

export function commandProblem(event) {
  if (event.exitCode === 0) return null;
  return explainError(event.stderr || "", event.exitCode, event.command || "");
}

function conflictProblem() {
  return explainError(
    "Automatic merge failed; fix conflicts and then commit the result.",
    1,
    "git merge",
    { log: false },
  );
}

export function stateProblems(snapshot) {
  const problems = [];
  if (snapshot.files?.some((file) => file.index === "U" || file.work === "U"))
    problems.push(conflictProblem());
  if (snapshot.operation === "rebase" && !problems.length)
    problems.push(
      explainError("you are currently rebasing", 1, "", { log: false }),
    );
  if (snapshot.detached)
    problems.push(explainError("detached HEAD", 1, "", { log: false }));
  if (snapshot.behind > 0)
    problems.push(
      issue(
        "behind-remote",
        "Tu rama tiene cambios pendientes del remoto",
        `Hay ${snapshot.behind} commit(s) remotos que aún no tienes en esta rama.`,
        "Otra persona pudo subir cambios después de tu última actualización.",
        [
          step("Revisa el estado.", "git status"),
          step("Descarga las referencias recientes.", "git fetch origin"),
          step("Integra la rama remota que corresponda antes de hacer push."),
        ],
        "Actualiza tu rama con frecuencia cuando trabajas en equipo.",
        "push",
      ),
    );
  return problems;
}

export function pipelineProblem(pr, check) {
  const kind = /lint|style|format/i.test(check.name)
    ? "lint"
    : /test|pytest/i.test(check.name)
      ? "tests"
      : "build";
  const problem = explainError(`CI:${kind} failed`, 1, "", { log: false });
  return {
    ...problem,
    id: `ci-${pr.number}-${check.name}`,
    title: `Falló la revisión: ${check.name}`,
  };
}

export function pullRequestProblem(pr) {
  const problem = explainError("pull request is not mergeable", 1, "", {
    log: false,
  });
  return {
    ...problem,
    id: `pr-${pr.number}`,
    title: `El PR #${pr.number} tiene un conflicto`,
  };
}

export function githubProblems(github) {
  const problems = [];
  for (const pr of github?.prs || []) {
    if (pr.mergeStateStatus === "DIRTY") problems.push(pullRequestProblem(pr));
    for (const check of pr.checks || []) {
      if (
        ["FAILURE", "TIMED_OUT", "ACTION_REQUIRED"].includes(check.conclusion)
      )
        problems.push(pipelineProblem(pr, check));
    }
  }
  return problems;
}
