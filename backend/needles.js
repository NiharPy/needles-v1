import express from "express";
import dotenv from 'dotenv';
import cors from "cors";
import { connectDB } from "./config/db.js";
import AdminRouter from "./APIroutes/AdminRouter.js";
import UsersRouter from "./APIroutes/UsersRouter.js";
import BoutiquesRouter from "./APIroutes/BoutiquesRouter.js";
import { config } from './config/config.js';
import http from 'http';
import './utils/orderCleanupJob.js'; // 🧠 This will start the cron job
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import { connectQdrant } from './config/qdrant.js';


dotenv.config();

const app = express();
const port = process.env.PORT || 14050;
const server = http.createServer(app);

// === Middleware ===
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(mongoSanitize());
app.use(xss());
app.disable('x-powered-by');

// --- FIXED CORS ---
app.use(cors({
  origin: [
    'http://localhost:3000', // ✅ local dev
    'https://boutique-app-needles.vercel.app',// ✅ production frontend on Vercel
    'http://localhost:5173', // local dev for Admin
    'https://needles-admin.vercel.app' // prod for Admin
  ], // or your deployed frontend domain
  credentials: true,               // allow httpOnly cookies
}));

app.use((req, res, next) => {
    console.log("CORS headers being set.");
    res.header("Access-Control-Allow-Credentials", "true");
    next();
  });

// === Initialize connections ===
const initializeServices = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log(`✅ Database connected successfully.`);
    
    // Connect to Qdrant (with error handling)
    try {
      await connectQdrant();
      console.log(`✅ Qdrant connected successfully.`);
    } catch (qdrantError) {
      console.warn(`⚠️ Qdrant connection failed: ${qdrantError.message}`);
      console.warn(`⚠️ Image embedding features will be disabled`);
    }
    
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    process.exit(1);
  }
};

// Initialize services
initializeServices();

// === Routes ===
app.get("/", (req, res) => {
  res.send("API working");
});

app.use("/admin", AdminRouter);
app.use("/Boutique", BoutiquesRouter);
app.use("/User", UsersRouter);

// === Server Start ===
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

export default app;
