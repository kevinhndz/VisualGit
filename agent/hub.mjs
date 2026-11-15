export class EventHub {
  constructor(getSnapshot) {
    this.getSnapshot = getSnapshot;
    this.clients = new Set();
    this.sockets = new Set();
    this.history = [];
    this.nextId = 1;
  }

  attachSocket(socket, lastId = 0) {
    socket.send(
      JSON.stringify({ kind: "snapshot", snapshot: this.getSnapshot() }),
    );
    for (const item of this.history) {
      if (item.id > lastId)
        socket.send(JSON.stringify({ ...item.data, replay: true }));
    }
    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));
  }

  attach(response, lastId = 0) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write(": connected\n\n");
    for (const item of this.history) {
      if (item.id > lastId)
        response.write(
          `id: ${item.id}\ndata: ${JSON.stringify(item.data)}\n\n`,
        );
    }
    response.write(
      `data: ${JSON.stringify({ kind: "snapshot", snapshot: this.getSnapshot() })}\n\n`,
    );
    this.clients.add(response);
    const heartbeat = setInterval(
      () => response.write(": heartbeat\n\n"),
      15000,
    );
    response.on("close", () => {
      clearInterval(heartbeat);
      this.clients.delete(response);
    });
  }

  publish(data) {
    const item = { id: this.nextId++, data };
    if (data.kind === "event") {
      this.history.push(item);
      if (this.history.length > 200) this.history.shift();
    }
    const message = `id: ${item.id}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const response of this.clients) response.write(message);
    for (const socket of this.sockets) socket.send(JSON.stringify(data));
  }

  close() {
    for (const response of this.clients) response.end();
    this.clients.clear();
    for (const socket of this.sockets) socket.close();
    this.sockets.clear();
  }
}
