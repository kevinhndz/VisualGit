export class AgentClient {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.source = null;
    this.retry = null;
    this.session = null;
    this.base = "";
  }

  async connect(base, token) {
    this.disconnect();
    this.base = base.replace(/\/+$/, "");
    if (!token.trim()) throw new Error("Escribe el codigo de emparejamiento.");
    const response = await fetch(`${this.base}/api/pair`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    if (!response.ok) {
      if (response.status === 403)
        throw new Error(
          "Este origen no esta autorizado. Configura allowedOrigins en el agente.",
        );
      if (response.status === 401)
        throw new Error("El codigo de emparejamiento no coincide.");
      throw new Error(`No se pudo conectar: HTTP ${response.status}.`);
    }
    const data = await response.json();
    this.session = data.session;
    this.openEvents();
    return data;
  }

  async resume(base, session) {
    this.disconnect();
    this.base = base.replace(/\/+$/, "");
    const response = await fetch(`${this.base}/api/session`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
    });
    if (!response.ok) throw new Error("La sesion ya no esta disponible.");
    this.session = session;
    this.openEvents();
    return response.json();
  }

  openEvents() {
    if (!this.session) return;
    this.source = new WebSocket(
      `${this.base.replace(/^http/, "ws")}/api/ws?session=${encodeURIComponent(this.session)}`,
    );
    this.source.onopen = () => this.onStatus("connected");
    this.source.onmessage = (message) => {
      try {
        this.onMessage(JSON.parse(message.data));
      } catch (error) {
        console.error("Evento invalido del agente", error);
      }
    };
    this.source.onerror = () => this.onStatus("reconnecting");
    this.source.onclose = () => {
      if (this.session) {
        this.onStatus("reconnecting");
        this.retry = setTimeout(() => this.openEvents(), 1000);
      }
    };
  }

  disconnect() {
    clearTimeout(this.retry);
    this.source?.close();
    this.source = null;
    this.session = null;
    this.onStatus("disconnected");
  }
}
