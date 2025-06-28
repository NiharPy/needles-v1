// redis.js
import dotenv from 'dotenv';
import { Redis } from '@upstash/redis';
dotenv.config();

if (!process.env.UPSTASH_REDIS_URL || !process.env.UPSTASH_REDIS_TOKEN) {
  console.log("🔍 Redis ENV", process.env.UPSTASH_REDIS_URL, process.env.UPSTASH_REDIS_TOKEN);

  console.error('❌ Missing Upstash Redis env vars for @upstash/redis');
  throw new Error('Missing Redis config');
}

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});