// queues/dressSearchQueue.js
// queues/addDressQueue.js
import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/IOredis.js';

export const connection = createRedisConnection({
  blockingConnection: true, // 💤 Prevent busy polling
});

export const addDressQueue = new Queue('addDressType', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,          // ✅ Keep last 100 successful jobs
    removeOnFail: { count: 50 },    // ✅ Keep last 50 failed jobs
  },
  limiter: {
    max: 10000,                     // ✅ Limit to avoid Upstash overuse
    duration: 60000,                // ✅ Per minute
  },
});

/**
 * Cleans up old failed and completed jobs from the addDressQueue.
 * Should be called manually or via cron for long-term hygiene.
 */
export async function cleanAddDressQueue() {
  try {
    const failed = await addDressQueue.clean(1000, 1000, 'failed');
    const completed = await addDressQueue.clean(1000, 1000, 'completed');
    console.log(`🧹 Cleaned ${failed.length} failed and ${completed.length} completed jobs from addDressQueue`);
  } catch (err) {
    console.warn('⚠️ Could not clean addDressQueue:', err.message);
  }
}

