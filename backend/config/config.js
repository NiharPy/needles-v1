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
  },
  production: {
    PORT: process.env.PORT || 8080,
    DB_URI: process.env.DB_URI,
    LOG_LEVEL: process.env.LOG_LEVEL || 'error',
  },
  test: {
    PORT: process.env.PORT || 3001,
    DB_URI: process.env.DB_URI,
    LOG_LEVEL: 'silent',
  },
};

export const config = configMap[env];