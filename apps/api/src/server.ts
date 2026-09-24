import { buildApp } from "./app.js";
import { config } from "./lib/config.js";
import { startWatchdog } from "./services/safety/watchdog.js";

async function main() {
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  startWatchdog();
  app.log.info(`Safety watchdog started (poll every ${config.watchdog.pollIntervalSeconds}s)`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
