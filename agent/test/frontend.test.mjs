import test from "node:test";
import assert from "node:assert/strict";
import { showLatency } from "../../frontend/metrics.js";

test("live latency updates without depending on the demo controller", () => {
  const previous = globalThis.document;
  const nodes = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { textContent: "" });
      return nodes.get(id);
    },
  };
  try {
    showLatency({ ts: new Date(Date.now() - 25).toISOString() });
    assert.match(nodes.get("latency-label").textContent, /^\d+ ms$/);
    assert.match(nodes.get("latency-p95").textContent, /^\d+ ms$/);
    const before = nodes.get("latency-label").textContent;
    showLatency({ ts: new Date(Date.now() - 5000).toISOString(), demo: true });
    showLatency({ ts: "invalid" });
    assert.equal(nodes.get("latency-label").textContent, before);
  } finally {
    globalThis.document = previous;
  }
});
