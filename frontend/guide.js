const stages = [
  [
    "Directorio local",
    "Editas archivos en tu computadora. Git distingue los cambios que aun no preparaste.",
  ],
  [
    "Staging",
    "git add coloca una copia de tus cambios en la bandeja del siguiente commit.",
  ],
  [
    "Repositorio local",
    "git commit guarda los cambios preparados en el historial local, con un hash.",
  ],
  [
    "Remoto GitHub",
    "git push comparte commits. git fetch y git pull traen cambios del remoto.",
  ],
  [
    "PR y CI",
    "El Pull Request propone cambios. El robot ejecuta los checks y el equipo revisa.",
  ],
  [
    "Integracion",
    "El merge integra la rama. El despliegue depende del pipeline del repositorio.",
  ],
];

let active = 0;
let lastLive = 0;
let exploring = false;

export function eventStage(type) {
  return (
    {
      init: 0,
      file: 0,
      restore: 0,
      add: 1,
      unstage: 0,
      commit: 2,
      amend: 2,
      branch: 2,
      branch_delete: 2,
      switch: 2,
      merge: 2,
      rebase: 2,
      push: 3,
      fetch: 3,
      pull: 3,
      remote: 3,
      pr: 4,
      ci: 4,
    }[type] ?? 2
  );
}

export function selectStage(index, manual = true) {
  if (!manual) {
    lastLive = index;
    if (exploring) return;
  }
  active = Math.max(0, Math.min(stages.length - 1, index));
  if (manual) exploring = true;
  document.querySelectorAll(".scene .zone").forEach((card, i) => {
    card.classList.toggle("selected", i === active);
    card.setAttribute("aria-current", i === active ? "step" : "false");
  });
  document.getElementById("guide-label").textContent = exploring
    ? `Concepto ${active + 1} de 6`
    : "Vista en vivo";
  document.getElementById("live-button").hidden = !exploring;
  if (manual) {
    document.getElementById("narration-title").textContent = stages[active][0];
    document.getElementById("narration-text").textContent = stages[active][1];
  }
}

export function setupGuide() {
  document.querySelectorAll("[data-stage]").forEach((control) => {
    control.addEventListener("click", () =>
      selectStage(Number(control.dataset.stage)),
    );
    if (control.tagName !== "BUTTON")
      control.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          selectStage(Number(control.dataset.stage));
        }
      });
  });
  document.getElementById("guide-prev").onclick = () => selectStage(active - 1);
  document.getElementById("guide-next").onclick = () => selectStage(active + 1);
  document.getElementById("live-button").onclick = () => {
    exploring = false;
    selectStage(lastLive, false);
    document.getElementById("narration-title").textContent = "Vista en vivo";
    document.getElementById("narration-text").textContent =
      "Observando los eventos del agente local.";
  };
}
