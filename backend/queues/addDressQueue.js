// queues/dressSearchQueue.js
import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/IOredis.js';

export const connection = createRedisConnection();

export const addDressQueue = new Queue('addDressType', {
  connection,
});

await addDressQueue.clean(0, 1000, 'failed');
