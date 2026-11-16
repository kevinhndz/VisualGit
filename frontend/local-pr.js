export function setupLocalPr(getClient) {
  const screen = document.getElementById("module-2");
  const form = document.createElement("form");
  form.className = "panel local-pr-form";
  form.innerHTML = `<h2>Crear PR local</h2>
    <p>Un PR pide unir una rama con otra. Funciona sin internet y se guarda en tu computadora.</p>
    <label>Título <input name="title" required maxlength="120" placeholder="Agregar préstamo de libros"></label>
    <label>Rama con tus cambios <input name="head" required placeholder="feature/prestamos"></label>
    <label>Rama de destino <input name="base" required placeholder="main"></label>
    <button type="submit">Crear PR local</button>
    <p class="local-pr-result" role="status"></p>
    <p>Al pulsar Merge se ejecutan los pasos de <code>.git-visual/pipeline.json</code> y, si pasan, Git une las ramas de verdad. Debes estar en la rama de destino y tener el trabajo guardado.</p>`;
  screen.append(form);
  const result = form.querySelector(".local-pr-result");
  const popover = document.createElement("aside");
  popover.className = "robot-popover";
  popover.hidden = true;
  popover.innerHTML = `<div class="robot-header"><strong>Robot de CI local</strong><button type="button" data-robot="minimize" aria-label="Minimizar robot">−</button><button type="button" data-robot="close" aria-label="Cerrar robot">×</button></div>
    <div class="robot-content"><img class="robot-avatar" src="./robot/construyendo.svg" alt="Robot construyendo"><div><p class="robot-message" role="status">Preparando el pipeline</p><ol class="robot-stations"></ol></div></div>`;
  const bubble = document.createElement("button");
  bubble.className = "robot-bubble";
  bubble.type = "button";
  bubble.hidden = true;
  bubble.textContent = "Robot CI";
  document.body.append(popover, bubble);
  const stations = popover.querySelector(".robot-stations");
  const avatar = popover.querySelector(".robot-avatar");
  const message = popover.querySelector(".robot-message");
  let timer = null;
  let runningAt = null;
  const activeSteps = [];
  const place = () => {
    const terminal = document.querySelector(".terminal-panel");
    if (terminal && !terminal.closest("[hidden]")) {
      const rect = terminal.getBoundingClientRect();
      const own = popover.getBoundingClientRect();
      if (
        !popover.hidden &&
        own.bottom > rect.top &&
        own.left < rect.right &&
        own.right > rect.left
      )
        popover.style.top = `${Math.max(8, rect.top - own.height - 12)}px`;
      bubble.style.bottom = `${Math.max(16, innerHeight - rect.top + 12)}px`;
    } else bubble.style.bottom = "16px";
  };
  const pose = (name) => {
    avatar.src = `./robot/${name}.svg`;
    avatar.alt = `Robot ${name}`;
  };
  function renderStations() {
    stations.replaceChildren();
    activeSteps.forEach((step) => {
      const row = document.createElement("li");
      row.className = `robot-step ${step.state}`;
      const title = document.createElement("span");
      title.textContent = `${step.name} · ${step.state}${step.durationMs !== undefined ? ` · ${(step.durationMs / 1000).toFixed(1)} s` : ""}`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Ver log";
      button.hidden = !step.log;
      const log = document.createElement("pre");
      log.hidden = true;
      log.textContent = step.log;
      button.addEventListener("click", () => {
        log.hidden = !log.hidden;
      });
      row.append(title, button, log);
      stations.append(row);
    });
    place();
  }
  function onPipeline(data) {
    if (data.action === "start") {
      activeSteps.length = 0;
      activeSteps.push(
        ...data.steps.map((name) => ({ name, state: "esperando", log: "" })),
      );
      popover.hidden = false;
      bubble.hidden = true;
      message.textContent = `PR local #${data.prId}: comenzó la revisión.`;
      pose("construyendo");
    } else if (data.action === "running") {
      activeSteps[data.index].state = "ejecutando";
      runningAt = Date.now();
      clearInterval(timer);
      timer = setInterval(() => {
        message.textContent = `${data.name}: ${((Date.now() - runningAt) / 1000) | 0} s`;
      }, 1000);
    } else if (data.action === "output") {
      activeSteps[data.index].log = (
        activeSteps[data.index].log + data.text
      ).slice(-100000);
    } else if (data.action === "passed" || data.action === "failed") {
      clearInterval(timer);
      activeSteps[data.index].state =
        data.action === "passed" ? "aprobado" : "falló";
      activeSteps[data.index].durationMs = data.durationMs;
      activeSteps[data.index].log = data.log;
      message.textContent =
        data.action === "passed"
          ? `${data.name} terminó bien.`
          : `${data.name} falló. Abre el log y sigue la explicación del profesor.`;
      if (data.action === "failed") {
        pose("preocupado");
        popover.hidden = true;
        bubble.hidden = false;
      }
    } else if (data.action === "complete") {
      clearInterval(timer);
      message.textContent =
        "¡Todas las revisiones pasaron y el PR quedó fusionado!";
      pose("celebrando");
    }
    renderStations();
  }
  async function call(action, fields = {}) {
    const client = getClient();
    if (!client.session) throw new Error("Primero conecta el agente.");
    const response = await fetch(`${client.base}/api/local-pr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: client.session, action, ...fields }),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()).result;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    try {
      await call("create", {
        title: values.get("title"),
        head: values.get("head"),
        base: values.get("base"),
      });
      result.textContent =
        "PR local creado. Ahora puedes abrirlo y pedir revisión.";
      form.reset();
    } catch (error) {
      result.textContent = error.message;
    }
  });
  document
    .getElementById("pull-requests")
    .addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-pr-id]");
      if (!button) return;
      button.disabled = true;
      try {
        const id = Number(button.dataset.prId);
        if (button.dataset.prMerge) {
          result.textContent = "Ejecutando CI local y luego el merge...";
          const response = await call("merge", { id });
          result.textContent = response.ok
            ? "PR fusionado."
            : `Falló ${response.step}. Revisa el robot y el profesor.`;
        } else {
          await call("state", { id, state: button.dataset.prState });
          result.textContent = "Estado del PR actualizado.";
        }
      } catch (error) {
        result.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  popover.addEventListener("click", (event) => {
    const action = event.target.closest("[data-robot]")?.dataset.robot;
    if (action === "minimize") {
      popover.hidden = true;
      bubble.hidden = false;
    }
    if (action === "close") {
      popover.hidden = true;
      bubble.hidden = false;
    }
  });
  bubble.addEventListener("click", () => {
    popover.hidden = false;
    bubble.hidden = true;
    place();
  });
  let drag = null;
  const header = popover.querySelector(".robot-header");
  header.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    drag = {
      x: event.clientX - popover.offsetLeft,
      y: event.clientY - popover.offsetTop,
    };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener("pointermove", (event) => {
    if (!drag) return;
    popover.style.left = `${Math.max(8, Math.min(event.clientX - drag.x, innerWidth - popover.offsetWidth - 8))}px`;
    popover.style.top = `${Math.max(8, Math.min(event.clientY - drag.y, innerHeight - popover.offsetHeight - 8))}px`;
    place();
  });
  header.addEventListener("pointerup", () => {
    drag = null;
  });
  window.addEventListener("resize", place);
  return { onPipeline };
}
