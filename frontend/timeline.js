const byId = (id) => document.getElementById(id);
let eventCount = 0;

export function clearTimeline() {
  eventCount = 0;
  byId("timeline").replaceChildren();
  byId("event-count").textContent = "0";
  byId("activity-count").textContent = "0";
  byId("timeline-empty").hidden = false;
}

export function addTimeline(event) {
  document.getElementById("timeline-empty").hidden = true;
  const row = document.createElement("li");
  row.className =
    event.type === "error" ? "error" : event.pending ? "working" : "";
  const time = document.createElement("span");
  time.className = "when";
  time.textContent = new Date(event.ts || Date.now()).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const command = document.createElement("strong");
  command.className = "command";
  command.textContent = event.command || event.title || "Cambio detectado";
  const explanation = document.createElement("p");
  explanation.className = "explanation";
  explanation.textContent = event.explanation || "";
  row.append(time, command, explanation);
  byId("timeline").prepend(row);
  while (byId("timeline").children.length > 100)
    byId("timeline").lastElementChild.remove();
  eventCount += 1;
  byId("event-count").textContent = String(eventCount);
  byId("activity-count").textContent = String(eventCount);
}
