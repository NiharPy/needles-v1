import mongoose from 'mongoose';
import { config } from './config.js';  // Importing named exports


export const connectDB = async()=>{ await mongoose
  .connect(process.env.DB_URI)
  .then(() => {
    console.log(`Database connected successfully (${process.env.NODE_ENV})`);
  })
  .catch((err) => {
    console.log("Error connecting to MongoDB:", err.message);
  })};