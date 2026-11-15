import { writeFileSync } from "node:fs";
import { loadConfig, pidPath } from "./config.mjs";
import { startAgent } from "./server.mjs";

const config = loadConfig();
if (!config)
  throw new Error("Git Visual no esta instalado. Ejecuta ./install.sh.");
const root = process.argv[2] || process.cwd();
const stop = await startAgent(root, config);
writeFileSync(pidPath, String(process.pid));
console.log(`Git Visual observa ${root} en http://127.0.0.1:${config.port}`);
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    await stop();
    process.exit(0);
  });
}
