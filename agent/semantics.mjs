function gitAction(argv) {
  if (argv[0] !== "git") return null;
  let i = 1;
  while (argv[i] === "-C" || argv[i] === "-c") i += 2;
  while (
    argv[i]?.startsWith("--git-dir=") ||
    argv[i]?.startsWith("--work-tree=")
  )
    i++;
  return { name: argv[i] || "", args: argv.slice(i + 1) };
}

function safeCommand(argv) {
  const line = argv.join(" ");
  if (/(?:^|[\s/])\.env(?:\.[^\s/]+)?(?:\s|$)/i.test(line))
    return "[comando sobre archivo privado]";
  return line
    .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1***@")
    .replace(
      /((?:token|password|secret|authorization|extraheader)[=:])[^\s]+/gi,
      "$1***",
    )
    .slice(0, 300);
}

function changed(before, after) {
  return (
    JSON.stringify({ ...before, github: null }) !==
    JSON.stringify({ ...after, github: null })
  );
}

export function semanticEvent(before, after, input = {}) {
  const argv = input.argv || [];
  const action = gitAction(argv);
  const command =
    safeCommand(input.command ? [input.command] : argv) || "Cambio detectado";
  const exitCode = input.exitCode ?? 0;
  const didChange = changed(before, after);
  let type = didChange ? "generic" : "inspect";
  let title = didChange
    ? "Cambio en el repositorio"
    : "Inspeccion del repositorio";
  let explanation = didChange
    ? "El estado de Git cambio. La escena muestra el resultado real."
    : "El comando consulto el estado; no movio archivos ni commits.";

  if (exitCode !== 0) {
    type = "error";
    title = "El comando fallo";
    explanation = `Git devolvio el codigo ${exitCode}. Revisa la terminal para ver el error completo.`;
  } else if (action) {
    const { name, args } = action;
    const staged = args.includes("--staged") || args.includes("--cached");
    const map = {
      init: [
        "init",
        "Repositorio inicializado",
        before.initialized
          ? "Git reinicializo el repositorio de esta carpeta."
          : "Se creo un repositorio Git nuevo en esta carpeta.",
      ],
      add: [
        "add",
        "Cambios en la bandeja",
        "Git preparo los archivos elegidos para el siguiente commit.",
      ],
      commit: [
        args.includes("--amend") ? "amend" : "commit",
        args.includes("--amend") ? "Commit reemplazado" : "Commit guardado",
        "La bandeja se guardo como una hoja del cuaderno de la rama actual.",
      ],
      push: [
        "push",
        "Cambios enviados",
        "Git envio commits o ramas al remoto. La nube muestra las referencias observadas.",
      ],
      pull: [
        "pull",
        "Cambios traidos",
        "Git descargo cambios y actualizo la rama local cuando fue posible.",
      ],
      fetch: [
        "fetch",
        "Referencias descargadas",
        "Git actualizo las ramas remotas sin tocar tus archivos de trabajo.",
      ],
      merge: [
        after.operation === "merge" ? "conflict" : "merge",
        after.operation === "merge" ? "Conflicto de merge" : "Ramas unidas",
        after.operation === "merge"
          ? "Hay conflictos que debes resolver antes de continuar."
          : "Git integro la historia de otra rama.",
      ],
      rebase: [
        "rebase",
        "Historia reordenada",
        "Git reapilo commits sobre otra base y pudo crear hashes nuevos.",
      ],
      "cherry-pick": [
        "commit",
        "Commit copiado",
        "Git aplico un commit de otra rama en este cuaderno.",
      ],
      revert: [
        "commit",
        "Cambio revertido",
        "Git creo un commit que deshace otro cambio.",
      ],
      stash: [
        "generic",
        "Cambios en el cajon",
        "Git guardo o recupero cambios temporales del stash.",
      ],
      tag: [
        "generic",
        "Etiqueta actualizada",
        "Una etiqueta marca un commit del historial.",
      ],
      remote: [
        "remote",
        "Conexion remota actualizada",
        "La configuracion del remoto cambio.",
      ],
      clean: [
        "restore",
        "Archivos limpiados",
        "Git elimino archivos sin seguimiento segun el comando.",
      ],
      clone: [
        "pull",
        "Repositorio clonado",
        "Git copio un repositorio remoto a una carpeta nueva.",
      ],
    };
    if (name === "restore" || name === "reset") {
      [type, title, explanation] =
        staged || name === "reset"
          ? [
              "unstage",
              "Cambios fuera de la bandeja",
              "Los cambios volvieron a la carpeta de trabajo.",
            ]
          : [
              "restore",
              "Archivo restaurado",
              "Git recupero la version elegida del archivo.",
            ];
    } else if (name === "branch") {
      [type, title, explanation] = args.some(
        (arg) => arg === "-d" || arg === "-D" || arg === "--delete",
      )
        ? [
            "branch_delete",
            "Cuaderno eliminado",
            "La rama local desaparecio; sus commits pueden seguir en otras referencias.",
          ]
        : [
            "branch",
            "Cuaderno actualizado",
            "Git creo, renombro o mostro una rama.",
          ];
    } else if (name === "switch" || name === "checkout") {
      [type, title, explanation] =
        args.includes("-c") || args.includes("-b")
          ? [
              "branch",
              "Cuaderno nuevo",
              "Git creo una rama nueva y movio HEAD a ella.",
            ]
          : [
              "switch",
              "Cuaderno cambiado",
              "HEAD paso a otra rama y los archivos reflejan su version.",
            ];
    } else if (map[name]) {
      [type, title, explanation] = map[name];
    }
    if (
      !didChange &&
      !["init", "push", "pull", "clone"].includes(name) &&
      !["status", "diff", "log"].includes(name)
    ) {
      explanation += " El estado observado no cambio.";
    }
  } else if (didChange) {
    type = "file";
    title = "Archivo actualizado";
    explanation =
      "Una edicion fuera de Git cambio el estado de tu carpeta de trabajo.";
  }

  const oldFiles = new Set((before.files || []).map((file) => file.path));
  const files = (after.files || [])
    .filter(
      (file) =>
        !oldFiles.has(file.path) ||
        (before.files || []).find((old) => old.path === file.path)?.index !==
          file.index ||
        (before.files || []).find((old) => old.path === file.path)?.work !==
          file.work,
    )
    .map((file) => file.path);
  return {
    type,
    title,
    explanation,
    command,
    args: argv.slice(1).map((arg) => safeCommand([arg])),
    files,
    refs: after.branches.map((branch) => branch.name),
    from: before.head,
    to: after.head,
    exitCode,
    ts: input.ts || new Date().toISOString(),
  };
}
