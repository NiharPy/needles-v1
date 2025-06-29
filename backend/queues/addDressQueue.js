// queues/dressSearchQueue.js
import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/IOredis.js';

export const connection = createRedisConnection({
  blockingConnection: true, // 💤 Prevent busy polling
});

export const addDressQueue = new Queue('addDressType', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100, // ✅ Keep last 100 jobs only
    removeOnFail: 50,      // ✅ Keep last 50 failed jobs
  },
  limiter: {
    max: 10000,             // ✅ Max jobs per interval (Upstash-friendly)
    duration: 60 * 1000,    // ✅ Per minute
  },
});

// 🧹 Clean up old failed jobs (older than 1ms, max 1000 at once)
(async () => {
  try {
    await addDressQueue.clean(0, 1000, 'failed');
    await addDressQueue.clean(0, 1000, 'completed');
    console.log('🧼 Cleaned up old BullMQ jobs');
  } catch (err) {
    console.warn('⚠️ Could not clean queue:', err.message);
  }
})();
