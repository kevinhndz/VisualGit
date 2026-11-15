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
  screens[1].append(
    document.querySelector("#narration"),
    document.querySelector(".pipeline-wrap"),
    panels[0],
    document.querySelector(".terminal-panel"),
  );
  screens[2].append(panels[2]);
  screens[3].append(panels[1]);
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
  }
  menu.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-module]");
    if (button) show(Number(button.dataset.module));
  });
  show(0);
  return {
    mark(index) {
      if (index !== active)
        menu
          .querySelector(`button[data-module="${index}"]`)
          .classList.add("changed");
    },
    show,
  };
}
