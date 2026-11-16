const step = (text, command = "") => ({ text, command });

function issue(id, title, what, why, steps, avoid, scene = "") {
  return { id, title, what, why, steps, avoid, scene };
}

function publicMessage(value = "") {
  return String(value)
    .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1***@")
    .replace(
      /((?:token|password|secret|authorization|extraheader)[=:])[^\s]+/gi,
      "$1***",
    )
    .slice(0, 500);
}

export function commandProblem(event, snapshot) {
  if (event.exitCode === 0) return null;
  const stderr = publicMessage(event.stderr);
  const command = publicMessage(event.command);
  const context = `${stderr} ${command}`.toLowerCase();

  if (/non-fast-forward|rejected|failed to push/.test(stderr.toLowerCase()))
    return issue(
      "push-rejected",
      "Git no pudo enviar tus cambios",
      "El servidor rechazó el envío de tu rama.",
      "La rama remota puede tener commits que todavía no están en tu computadora.",
      [
        step("Mira el estado de tu rama.", "git status"),
        step("Descarga la información nueva del remoto.", "git fetch origin"),
        step(
          "Integra la rama remota que corresponda y resuelve los conflictos si aparecen.",
        ),
        step("Cuando tu rama esté lista, vuelve a enviarla.", "git push"),
      ],
      "Trae los cambios del equipo antes de enviar una rama que quedó atrasada.",
      "push",
    );

  if (snapshot.operation === "merge" || /conflict|unmerged/.test(context))
    return conflictProblem();

  if (/not a git repository/.test(context))
    return issue(
      "not-repository",
      "Esta carpeta no es un repositorio Git",
      "Git no encontró la carpeta .git aquí ni en una carpeta superior.",
      "El comando se ejecutó fuera del proyecto.",
      [
        step("Ve a la carpeta del proyecto."),
        step("Comprueba la ubicación.", "pwd"),
      ],
      "Abre la terminal dentro del proyecto antes de usar Git.",
    );

  if (/nothing to commit|no changes added/.test(context))
    return issue(
      "nothing-to-commit",
      "Todavía no hay cambios para guardar",
      "Git no encontró archivos preparados para este commit.",
      "Los cambios pueden seguir en tu carpeta de trabajo o quizá no hubo cambios.",
      [
        step("Mira qué archivos cambiaron.", "git status"),
        step("Prepara los archivos que quieras guardar con git add."),
      ],
      "Revisa la bandeja de staging antes de hacer un commit.",
      "add",
    );

  return issue(
    "git-error",
    "Git encontró un problema",
    stderr || `El comando terminó con el código ${event.exitCode}.`,
    "El mensaje original de Git ayuda a encontrar la causa exacta.",
    [
      step("Revisa el estado del repositorio.", "git status"),
      step(
        "Consulta los últimos commits si necesitas contexto.",
        "git log --oneline -5",
      ),
      step("Lee el error completo en tu terminal antes de cambiar archivos."),
    ],
    "Comprueba el estado antes de repetir un comando que falló.",
  );
}

function conflictProblem() {
  return issue(
    "merge-conflict",
    "Hay archivos en conflicto",
    "Git no pudo unir automáticamente algunos cambios.",
    "Dos versiones modificaron una parte que necesita una decisión humana.",
    [
      step("Mira qué archivos necesitan atención.", "git status"),
      step(
        "Abre esos archivos, decide el contenido final y quita las marcas de conflicto.",
      ),
      step("Prepara los archivos resueltos con git add."),
      step(
        "Continúa la operación que estabas haciendo; git status te indicará cuál.",
      ),
    ],
    "Antes de unir ramas, trae los cambios recientes y revisa qué archivos tocaron tus compañeros.",
    "merge",
  );
}

export function stateProblems(snapshot) {
  const problems = [];
  if (snapshot.files?.some((file) => file.index === "U" || file.work === "U"))
    problems.push(conflictProblem());
  if (snapshot.operation === "rebase" && !problems.length)
    problems.push(
      issue(
        "rebase-in-progress",
        "Hay un rebase pendiente",
        "Git está a mitad de reorganizar commits.",
        "Debes terminar o cancelar esa operación antes de comenzar otra.",
        [
          step("Revisa qué falta.", "git status"),
          step(
            "Si ya resolviste los archivos, continúa.",
            "git rebase --continue",
          ),
          step(
            "Si quieres volver al estado anterior, cancela.",
            "git rebase --abort",
          ),
        ],
        "Comprueba que tu rama esté lista antes de iniciar un rebase.",
        "rebase",
      ),
    );
  if (snapshot.detached)
    problems.push(
      issue(
        "detached-head",
        "Estás fuera de una rama",
        "HEAD apunta a un commit concreto y no a una rama.",
        "Un commit nuevo aquí puede quedar difícil de encontrar si cambias de lugar.",
        [
          step("Mira dónde estás.", "git status"),
          step(
            "Si quieres conservar cambios nuevos, crea una rama.",
            "git switch -c mi-rama",
          ),
        ],
        "Antes de crear commits, comprueba el nombre de la rama.",
        "branch",
      ),
    );
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
  return issue(
    `ci-${pr.number}-${check.name}`,
    `Falló la revisión: ${check.name}`,
    `La prueba automática ${check.name} terminó con un error en el PR #${pr.number}.`,
    "Ese paso no pudo completar lo que debía comprobar.",
    [
      step("Abre el PR y lee el registro del paso que falló."),
      step("Corrige el problema en tu rama y vuelve a subirla.", "git push"),
    ],
    "Ejecuta las pruebas locales antes de subir cambios.",
    "ci",
  );
}

export function pullRequestProblem(pr) {
  return issue(
    `pr-${pr.number}`,
    `El PR #${pr.number} tiene un conflicto`,
    "GitHub no puede unir la rama del PR con su rama de destino.",
    "Las dos ramas tienen cambios que requieren una decisión humana.",
    [
      step("Trae las ramas recientes.", "git fetch origin"),
      step("Integra la rama de destino en tu rama y resuelve los conflictos."),
      step("Sube la rama corregida; el mismo PR se actualizará.", "git push"),
    ],
    "Mantén tu rama al día mientras el PR está abierto.",
    "merge",
  );
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
