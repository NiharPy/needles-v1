import dotenv from 'dotenv';

// Load the appropriate .env file based on the current NODE_ENV
const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
dotenv.config({ path: envFile });

export const config = {
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
};

// Export the configuration for the current environment