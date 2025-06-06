import express from "express";
import dotenv from 'dotenv';
import cors from "cors";
import { connectDB } from "./config/db.js";
import AdminRouter from "./APIroutes/AdminRouter.js";
import UsersRouter from "./APIroutes/UsersRouter.js";
import BoutiquesRouter from "./APIroutes/BoutiquesRouter.js";
import { config } from './config/config.js';
import http from 'http';

dotenv.config();

const app = express();
const port = process.env.PORT || 14050;
const server = http.createServer(app);

// === Middleware ===
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- FIXED CORS ---
app.use(cors({
  origin: "http://localhost:3000", // or your deployed frontend domain
  credentials: true,               // allow httpOnly cookies
}));

app.use((req, res, next) => {
    console.log("CORS headers being set.");
    res.header("Access-Control-Allow-Credentials", "true");
    next();
  });

// === Database Connection ===
connectDB();

// === Routes ===
app.get("/", (req, res) => {
  res.send("API working");
});

app.use("/admin", AdminRouter);
app.use("/Boutique", BoutiquesRouter);
app.use("/User", UsersRouter);

// === Server Start ===
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// === Log Environment Info ===
console.log(`Database URI: ${config.DB_URI}`);
console.log(`Log Level: ${config.LOG_LEVEL}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log('Twilio Account SID:', process.env.TWILIO_ACCOUNT_SID);
console.log('Twilio Auth Token:', process.env.TWILIO_AUTH_TOKEN);
console.log('Twilio Messaging Service SID:', process.env.TWILIO_MESSAGING_SERVICE_SID);
console.log("Loaded OpenAI Key:", process.env.OPENAI_API_KEY);


