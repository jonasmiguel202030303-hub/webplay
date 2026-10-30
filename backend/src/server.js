import { config, assertProductionConfig } from './config/env.js';
import { logger } from './config/logger.js';
import { closePool } from './config/db.js';
import { createApp } from './app.js';
import { startJobs, stopJobs } from './jobs/scheduler.js';

assertProductionConfig(config);

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(`WebPlay Brasil API em http://localhost:${config.port} (${config.nodeEnv})`);
});
startJobs();

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info(`Recebido ${signal}; encerrando...`);
  stopJobs();
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error('Promessa rejeitada sem tratamento', { error: err }));
