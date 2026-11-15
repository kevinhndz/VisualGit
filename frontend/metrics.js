const byId = (id) => document.getElementById(id);
const latencies = [];

function quantile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
}

export function showLatency(event) {
  if (!event.ts || event.demo) return;
  const delay = Math.max(0, Date.now() - Date.parse(event.ts));
  if (!Number.isFinite(delay)) return;
  latencies.push(delay);
  if (latencies.length > 300) latencies.shift();
  byId("latency-label").textContent = `${delay} ms`;
  byId("latency-p50").textContent = `${quantile(latencies, 0.5)} ms`;
  byId("latency-p95").textContent = `${quantile(latencies, 0.95)} ms`;
}
