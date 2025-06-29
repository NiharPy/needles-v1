// queues/dressSearchQueue.js
import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/IOredis.js';

const connection = createRedisConnection();

export const dressSearchQueue = new Queue('dressSearch', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: { age: 3600 }, // remove failed jobs after 1 hour
  },
  limiter: {
    max: 10000,      // max jobs per duration
    duration: 60000, // per minute
  },
});

/**
 * Cleans up failed jobs older than specified age in milliseconds
 * Should be called explicitly on startup or via a cron task
 */
export async function cleanDressSearchQueue() {
  try {
    const cleaned = await dressSearchQueue.clean(1000, 1000, 'failed');
    console.log(`🧹 Cleaned ${cleaned.length} failed jobs from dressSearchQueue`);
  } catch (err) {
    console.error('❌ Error while cleaning dressSearchQueue:', err.message);
  }
}