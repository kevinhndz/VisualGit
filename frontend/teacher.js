const stages = ["Qué pasó", "Por qué pasó", "Cómo arreglarlo", "Cómo evitarlo"];
const positionKey = "gitvisual-teacher-position";

export function setupTeacher() {
  const panel = document.createElement("aside");
  panel.className = "teacher-popover";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "teacher-title");
  panel.hidden = true;
  panel.innerHTML = `
    <div class="teacher-header">
      <strong>Tu profesor de Git</strong>
      <span id="teacher-count" aria-live="polite"></span>
      <button type="button" data-teacher="minimize" aria-label="Minimizar profesor">−</button>
      <button type="button" data-teacher="close" aria-label="Cerrar explicación">×</button>
    </div>
    <div class="teacher-content">
      <img class="teacher-avatar" alt="Profesor explicando" src="./teacher/pensando.svg" />
      <div class="teacher-board">
        <div class="teacher-board-top"><span></span><span></span><span></span></div>
        <h2 id="teacher-title" aria-live="assertive"></h2>
        <div id="teacher-writing"></div>
        <div class="teacher-tray" aria-hidden="true"><i></i><i></i></div>
      </div>
    </div>
    <div class="teacher-actions">
      <button type="button" data-teacher="repeat">Repetir</button>
      <button type="button" data-teacher="next">Siguiente</button>
      <button type="button" data-teacher="close">Cerrar</button>
    </div>`;
  const bubble = document.createElement("button");
  bubble.className = "teacher-bubble";
  bubble.type = "button";
  bubble.hidden = true;
  bubble.textContent = "Profesor";
  bubble.setAttribute("aria-label", "Abrir explicación del profesor");
  document.body.append(panel, bubble);

  const avatar = panel.querySelector(".teacher-avatar");
  const writing = panel.querySelector("#teacher-writing");
  const count = panel.querySelector("#teacher-count");
  const title = panel.querySelector("#teacher-title");
  const pending = [];
  let current = null;
  let stage = 0;
  let closingTimer = null;
  let poses = {
    pensando: "./teacher/pensando.svg",
    explicando: "./teacher/explicando.svg",
    senalando: "./teacher/senalando.svg",
    animando: "./teacher/animando.svg",
  };
  fetch("./teacher/poses.json")
    .then((response) => response.json())
    .then((config) => {
      poses = config;
    })
    .catch(() => {});

  function pose(name) {
    avatar.src = poses[name];
    avatar.alt = {
      pensando: "Profesor pensando",
      explicando: "Profesor explicando",
      senalando: "Profesor señalando la pizarra",
      animando: "Profesor celebrando",
    }[name];
  }

  function addSection(heading, text) {
    const section = document.createElement("section");
    section.className = "teacher-section";
    const label = document.createElement("h3");
    label.textContent = heading;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    section.append(label, paragraph);
    writing.append(section);
    return section;
  }

  function drawCause(scene) {
    const picture = document.createElement("div");
    picture.className = "teacher-cause";
    picture.setAttribute("aria-hidden", "true");
    if (scene === "push") {
      picture.innerHTML =
        "<span>Tu equipo<br>▣</span><b>↛</b><span>☁<br>▣ ▣</span>";
    } else if (scene === "merge") {
      picture.innerHTML =
        "<span>Rama A<br>▣</span><b>⇄</b><span>Rama B<br>▣</span>";
    } else {
      picture.innerHTML =
        "<span>Tu comando<br>⌨</span><b>→</b><span>Git pide revisar<br>!</span>";
    }
    return picture;
  }

  function render() {
    if (!current) return;
    title.textContent = current.title;
    count.textContent = pending.length ? `${pending.length} más en espera` : "";
    bubble.textContent = pending.length
      ? `Profesor · ${pending.length + 1}`
      : "Profesor";
    writing.replaceChildren();
    addSection(stages[0], current.what);
    if (current.original) {
      const copyError = document.createElement("button");
      copyError.type = "button";
      copyError.textContent = "Copiar error";
      copyError.addEventListener("click", async () => {
        await navigator.clipboard.writeText(current.original);
        copyError.textContent = "Error copiado";
      });
      writing.append(copyError);
    }
    if (stage >= 1) {
      const section = addSection(stages[1], current.why);
      section.append(drawCause(current.scene));
    }
    if (stage >= 2) {
      const section = document.createElement("section");
      section.className = "teacher-section";
      const heading = document.createElement("h3");
      heading.textContent = stages[2];
      const list = document.createElement("ol");
      for (const item of current.steps || []) {
        const row = document.createElement("li");
        const explanation = document.createElement("span");
        explanation.textContent = item.text;
        row.append(explanation);
        if (item.command) {
          const code = document.createElement("code");
          code.textContent = item.command;
          const copy = document.createElement("button");
          copy.type = "button";
          copy.textContent = "Copiar";
          copy.addEventListener("click", async () => {
            await navigator.clipboard.writeText(item.command);
            copy.textContent = "Copiado";
          });
          row.append(code, copy);
        }
        list.append(row);
      }
      section.append(heading, list);
      writing.append(section);
    }
    if (stage >= 3) addSection(stages[3], current.avoid);
    pose(stage === 0 ? "pensando" : stage >= 2 ? "senalando" : "explicando");
    panel.querySelector('[data-teacher="next"]').disabled = stage === 3;
    requestAnimationFrame(keepClearOfTerminal);
  }

  function keepClearOfTerminal() {
    const terminal = document.querySelector(".terminal-panel");
    if (!terminal || terminal.closest("[hidden]")) {
      bubble.style.bottom = "16px";
      return;
    }
    const t = terminal.getBoundingClientRect();
    bubble.style.bottom = `${Math.max(16, innerHeight - t.top + 12)}px`;
    if (panel.hidden) return;
    const p = panel.getBoundingClientRect();
    const overlaps =
      p.left < t.right &&
      p.right > t.left &&
      p.top < t.bottom &&
      p.bottom > t.top;
    if (overlaps) panel.style.top = `${Math.max(8, t.top - p.height - 12)}px`;
  }

  function place() {
    const saved = sessionStorage.getItem(positionKey);
    if (saved) {
      try {
        const { x, y } = JSON.parse(saved);
        panel.style.left = `${Math.max(8, Math.min(x, innerWidth - panel.offsetWidth - 8))}px`;
        panel.style.top = `${Math.max(8, Math.min(y, innerHeight - panel.offsetHeight - 8))}px`;
      } catch {
        sessionStorage.removeItem(positionKey);
      }
    } else if (!localStorage.getItem("gitvisual-teacher-seen")) {
      panel.style.left = `${Math.max(8, (innerWidth - panel.offsetWidth) / 2)}px`;
      panel.style.top = `${Math.max(8, (innerHeight - panel.offsetHeight) / 2)}px`;
      localStorage.setItem("gitvisual-teacher-seen", "1");
    } else {
      panel.style.left = `${Math.max(8, innerWidth - panel.offsetWidth - 20)}px`;
      panel.style.top = `${Math.max(8, innerHeight - panel.offsetHeight - 20)}px`;
    }
    keepClearOfTerminal();
  }

  function nextProblem() {
    clearTimeout(closingTimer);
    current = pending.shift() || null;
    if (!current) {
      panel.hidden = true;
      bubble.hidden = true;
      return;
    }
    stage = 0;
    panel.hidden = false;
    bubble.hidden = true;
    render();
    place();
  }

  function show(problem) {
    if (!problem || !problem.id || !problem.title) return;
    if (
      current?.id === problem.id ||
      pending.some((item) => item.id === problem.id)
    )
      return;
    pending.push(problem);
    if (!current) nextProblem();
    else render();
  }

  function resolved(id) {
    const queued = pending.findIndex((item) => item.id === id);
    if (queued >= 0) pending.splice(queued, 1);
    if (current?.id !== id) return;
    clearTimeout(closingTimer);
    title.textContent = "¡Listo! Lo resolviste";
    writing.replaceChildren();
    addSection("Buen trabajo", "Git ya no muestra este problema.");
    pose("animando");
    panel.hidden = false;
    bubble.hidden = true;
    closingTimer = setTimeout(nextProblem, 3500);
  }

  panel.addEventListener("click", (event) => {
    const action = event.target.closest("[data-teacher]")?.dataset.teacher;
    if (action === "next") {
      stage = Math.min(stage + 1, 3);
      render();
    }
    if (action === "repeat") {
      stage = 0;
      render();
    }
    if (action === "close") nextProblem();
    if (action === "minimize") {
      panel.hidden = true;
      bubble.hidden = false;
      keepClearOfTerminal();
    }
  });
  bubble.addEventListener("click", () => {
    panel.hidden = false;
    bubble.hidden = true;
    keepClearOfTerminal();
  });

  let dragging = null;
  panel
    .querySelector(".teacher-header")
    .addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      dragging = {
        x: event.clientX - panel.offsetLeft,
        y: event.clientY - panel.offsetTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    });
  panel
    .querySelector(".teacher-header")
    .addEventListener("pointermove", (event) => {
      if (!dragging) return;
      panel.style.left = `${Math.max(8, Math.min(event.clientX - dragging.x, innerWidth - panel.offsetWidth - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(event.clientY - dragging.y, innerHeight - panel.offsetHeight - 8))}px`;
      keepClearOfTerminal();
    });
  panel.querySelector(".teacher-header").addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = null;
    sessionStorage.setItem(
      positionKey,
      JSON.stringify({ x: panel.offsetLeft, y: panel.offsetTop }),
    );
  });
  new ResizeObserver(keepClearOfTerminal).observe(panel);
  window.addEventListener("resize", keepClearOfTerminal);
  window.addEventListener("scroll", keepClearOfTerminal, true);
  return { show, resolved };
}
