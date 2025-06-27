import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 📦 Resolve current file directory (for ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🧠 Load the appropriate .env file based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
const envFile = path.resolve(__dirname, `../.env.${env}`);
dotenv.config({ path: envFile });

export const configMap = {
  development: {
    PORT: process.env.PORT || 3000,
    DB_URI: process.env.DB_URI,
    LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
    QDRANT_URL: process.env.QDRANT_URL,
    QDRANT_API_KEY: process.env.QDRANT_API_KEY || null,
  },
  production: {
    PORT: process.env.PORT || 8080,
    DB_URI: process.env.DB_URI,
    LOG_LEVEL: process.env.LOG_LEVEL || 'error',
    QDRANT_URL: process.env.QDRANT_URL,
    QDRANT_API_KEY: process.env.QDRANT_API_KEY,
  },
  test: {
    PORT: process.env.PORT || 3001,
    DB_URI: process.env.DB_URI,
    LOG_LEVEL: 'silent',
    QDRANT_URL: process.env.QDRANT_URL,
    QDRANT_API_KEY: process.env.QDRANT_API_KEY || null,
  },
};

export const config = configMap[env];
