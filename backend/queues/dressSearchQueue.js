// queues/dressSearchQueue.js
import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/IOredis.js';

// ✅ Use blocking connection to avoid busy polling
export const connection = createRedisConnection({
  blockingConnection: true,
});

export const dressSearchQueue = new Queue('dressSearch', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,               // ✅ Keep last 100 completed jobs
    removeOnFail: { count: 50 },         // ✅ Keep last 50 failed jobs (instead of time-based)
  },
  limiter: {
    max: 10000,                          // ✅ Max jobs per minute
    duration: 60 * 1000,                 // ⏱ 60s duration
  },
});

/**
 * ✅ Cleans up old failed and completed jobs (optional on startup or cron)
 */
export async function cleanDressSearchQueue() {
  try {
    const failed = await dressSearchQueue.clean(1000, 1000, 'failed');
    const completed = await dressSearchQueue.clean(1000, 1000, 'completed');
    console.log(`🧹 Cleaned ${failed.length} failed and ${completed.length} completed jobs from dressSearchQueue`);
  } catch (err) {
    console.error('❌ Error while cleaning dressSearchQueue:', err.message);
  }
}
