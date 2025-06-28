// queues/dressSearchQueue.js
import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/IOredis.js';

const connection = createRedisConnection();

export const dressSearchQueue = new Queue('dressSearch', {
  connection,
});

await dressSearchQueue.clean(0, 1000, 'failed');