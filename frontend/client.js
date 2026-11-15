export class AgentClient {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.source = null;
    this.retry = null;
    this.session = null;
    this.base = '';
    this.token = '';
  }

  async connect(base, token) {
    this.disconnect();
    this.base = base.replace(/\/+$/, '');
    this.token = token.trim();
    if (!this.token) throw new Error('Escribe el codigo de emparejamiento.');
    const response = await fetch(`${this.base}/api/pair`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: this.token })
    });
    if (!response.ok) {
      if (response.status === 403) throw new Error('Este origen no esta autorizado. Configura allowedOrigins en el agente.');
      if (response.status === 401) throw new Error('El codigo de emparejamiento no coincide.');
      throw new Error(`No se pudo conectar: HTTP ${response.status}.`);
    }
    const data = await response.json();
    this.session = data.session;
    this.openEvents();
    return data;
  }

  openEvents() {
    if (!this.session) return;
    this.source = new EventSource(`${this.base}/api/events?session=${encodeURIComponent(this.session)}`);
    this.source.onopen = () => this.onStatus('connected');
    this.source.onmessage = (message) => {
      try {
        this.onMessage(JSON.parse(message.data));
      } catch (error) {
        console.error('Evento invalido del agente', error);
      }
    };
    this.source.onerror = () => this.onStatus('reconnecting');
  }

  disconnect() {
    clearTimeout(this.retry);
    this.source?.close();
    this.source = null;
    this.session = null;
    this.onStatus('disconnected');
  }
}
