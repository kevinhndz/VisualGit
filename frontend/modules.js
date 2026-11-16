const names = ["Setup", "Flujo", "PR/CI", "Commits y ramas"];

export function setupModules() {
  const main = document.querySelector("main.workspace");
  const topbar = document.querySelector(".topbar");
  const menu = document.createElement("nav");
  menu.className = "module-menu";
  menu.setAttribute("aria-label", "Pantallas de Git Visual");
  const screens = names.map((name, index) => {
    const screen = document.createElement("section");
    screen.className = "module-screen";
    screen.id = `module-${index}`;
    screen.setAttribute("aria-label", name);
    screen.hidden = index !== 0;
    main.append(screen);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.dataset.module = String(index);
    button.setAttribute("aria-current", index === 0 ? "page" : "false");
    const dot = document.createElement("span");
    dot.className = "module-dot";
    dot.setAttribute("aria-hidden", "true");
    button.append(dot);
    menu.append(button);
    return screen;
  });
  topbar.after(menu);

  const dashboard = document.querySelector(".dashboard");
  const panels = [...dashboard.children];
  screens[0].append(document.querySelector("#connection-panel"));
  const setupTools = document.createElement("div");
  setupTools.className = "panel setup-tools";
  setupTools.innerHTML = `<h2>Preparar Git Visual</h2>
    <p>Repositorio observado: <strong id="setup-repo">Sin conexión</strong></p>
    <p id="network-status" role="status"></p>
    <label for="repository-folder">Carpeta del repositorio <input id="repository-folder" type="text" placeholder="/ruta/a/tu/proyecto" /></label>
    <button type="button" id="choose-repository">Elegir esta carpeta</button>
    <p>La integración de terminal añade un bloque a tu archivo de inicio de bash o zsh. Los hooks añaden avisos a este repositorio y conservan tus hooks actuales.</p>
    <div class="setup-buttons">
      <button type="button" data-integration="install-shell">Instalar integración de terminal</button>
      <button type="button" data-integration="uninstall-shell">Quitar integración de terminal</button>
      <button type="button" data-integration="install-hooks">Instalar hooks</button>
      <button type="button" data-integration="uninstall-hooks">Quitar hooks</button>
      <button type="button" id="test-connection">Probar conexión</button>
    </div>
    <p id="setup-result" role="status"></p>`;
  screens[0].append(setupTools);
  screens[1].append(
    document.querySelector("#narration"),
    document.querySelector(".pipeline-wrap"),
    panels[0],
    document.querySelector(".terminal-panel"),
  );
  const commitBox = document.createElement("section");
  commitBox.className = "panel latest-commit";
  commitBox.innerHTML =
    '<h2>Último commit</h2><p id="latest-commit">Todavía no hay commits.</p>';
  screens[1].insertBefore(
    commitBox,
    screens[1].querySelector(".terminal-panel"),
  );
  screens[2].append(panels[2]);
  screens[3].append(panels[1]);
  const filter = document.createElement("label");
  filter.innerHTML =
    'Filtrar rama <select id="branch-filter"><option value="">Todas las ramas</option></select>';
  screens[3].prepend(filter);
  const details = document.createElement("section");
  details.id = "commit-details";
  details.className = "panel";
  details.setAttribute("aria-live", "polite");
  details.textContent = "Selecciona un commit para ver sus datos y archivos.";
  screens[3].append(details);
  dashboard.remove();

  let active = 0;
  function show(index) {
    active = index;
    screens.forEach((screen, i) => (screen.hidden = i !== index));
    menu.querySelectorAll("button").forEach((button, i) => {
      button.setAttribute("aria-current", i === index ? "page" : "false");
      if (i === index) button.classList.remove("changed");
    });
    document.querySelector(".guide-controls").hidden = index !== 1;
    window.dispatchEvent(
      new CustomEvent("gitvisual:module", { detail: index }),
    );
  }
  menu.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-module]");
    if (button) show(Number(button.dataset.module));
  });
  show(0);
  return {
    active: () => active,
    mark(index) {
      if (index !== active)
        menu
          .querySelector(`button[data-module="${index}"]`)
          .classList.add("changed");
    },
    show,
  };
}
