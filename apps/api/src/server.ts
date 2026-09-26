import { app, sessionPool } from './app';
import { config } from './config';
import { prisma } from './infra/prisma';
import { redis } from './infra/redis';
import { emailWorker } from './queue/email-worker';
import { searchWorker } from './queue/search-worker';
import { recoverScheduledJobs } from './services/scheduler';

async function start() {
  await prisma.$connect();
  await redis.ping();
  await recoverScheduledJobs();
  const server = app.listen(config.API_PORT, () => console.info(`API listening on http://localhost:${config.API_PORT}`));
  const shutdown = async () => {
    server.close();
    await emailWorker.close();
    await searchWorker.close();
    await prisma.$disconnect();
    await redis.quit();
    await sessionPool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch(error => { console.error('API startup failed', error); process.exit(1); });