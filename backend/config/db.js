import mongoose from 'mongoose';
import { config } from './config.js'; // Imports env-specific config

/**
 * Connect to MongoDB using the URI from the selected environment
 */
export const connectDB = async () => {
  const DB_URI = config.DB_URI;

  if (!DB_URI) {
    console.error("❌ Missing DB URI. Check your .env and config.js setup.");
    process.exit(1);
  }

  try {
    await mongoose.connect(DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB connected [${process.env.NODE_ENV || 'development'}]`);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1); // Optional: terminate app on DB failure
  }
};

/**
 * Gracefully disconnect from MongoDB
 * Useful for tests or shutdown logic
 */
export const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log("🛑 MongoDB disconnected.");
  } catch (err) {
    console.error("❌ Error disconnecting MongoDB:", err.message);
  }
};
