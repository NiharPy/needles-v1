import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import IORedis from 'ioredis';
import fs from 'fs';

// Get current file directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple .env file locations and names
const envPaths = [
  path.join(__dirname, '../.env.production'),     // backend/.env.production
  path.join(__dirname, '../.env'),                // backend/.env
  path.join(__dirname, '../../.env.production'),  // root/.env.production
  path.join(__dirname, '../../.env'),             // root/.env
];

let envLoaded = false;
let loadedPath = '';

for (const envPath of envPaths) {
  console.log(`🔍 Looking for .env at: ${envPath}`);
  console.log(`📁 File exists: ${fs.existsSync(envPath) ? 'Yes' : 'No'}`);
  
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      console.log(`✅ Successfully loaded .env from: ${envPath}`);
      envLoaded = true;
      loadedPath = envPath;
      break;
    } else {
      console.error(`❌ Error loading ${envPath}:`, result.error.message);
    }
  }
}

if (!envLoaded) {
  console.log("⚠️ No .env file found, trying default dotenv.config()");
  dotenv.config();
}

// Debug environment variables
console.log("📦 Current working directory:", process.cwd());
console.log("📦 Config file directory:", __dirname);
console.log("📦 REDIS URL:", process.env.UPSTASH_REDIS_IOREDIS_URL ? "✅ Found" : "❌ Missing");
console.log("📦 REDIS TOKEN:", process.env.UPSTASH_REDIS_TOKEN ? "✅ Found" : "❌ Missing");

if (!process.env.UPSTASH_REDIS_IOREDIS_URL || !process.env.UPSTASH_REDIS_TOKEN) {
  console.error('❌ Missing Upstash Redis env vars for ioredis');
  console.error('❌ Make sure your .env file contains:');
  console.error('   UPSTASH_REDIS_IOREDIS_URL=your_redis_url');
  console.error('   UPSTASH_REDIS_TOKEN=your_redis_token');
  console.error('❌ Current env paths checked:');
  envPaths.forEach(p => console.error(`   - ${p} (exists: ${fs.existsSync(p)})`));
  console.error('❌ Loaded from:', loadedPath || 'none');
  throw new Error('Missing ioredis config');
}

export const createRedisConnection = () => {
  console.log("🔗 Creating Redis connection...");
  return new IORedis(process.env.UPSTASH_REDIS_IOREDIS_URL, {
    password: process.env.UPSTASH_REDIS_TOKEN,
    tls: { rejectUnauthorized: false },
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
  });
};