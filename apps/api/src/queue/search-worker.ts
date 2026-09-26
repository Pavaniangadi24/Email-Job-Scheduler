import { Worker } from 'bullmq';
import { redis } from '../infra/redis';
import { SEARCH_QUEUE, writeEmailIndex } from '../infra/search';

export const searchWorker = new Worker(SEARCH_QUEUE, async job => {
  await writeEmailIndex(job.data as Record<string, unknown>);
}, { connection: redis, concurrency: 4 });

searchWorker.on('failed', (job, error) => console.error(`Search indexing job ${job?.id} failed`, error));