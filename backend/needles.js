import express from "express"
import cors from "cors"
import { connectDB } from "./config/db.js"
import mongoose from "mongoose"
import AdminRouter from "./APIroutes/AdminRouter.js"
import UsersRouter from "./APIroutes/UsersRouter.js"
//import BoutiquesRouter from "./APIroutes/BoutiquesRouter.js"
import { config } from './config/config.js';

//app config
const app = express()
const port = 3000

// middleware

app.use(express.json())
app.use(cors())

//db connection
connectDB();

//API endpoint
app.get("/",(req,res)=>{
    res.send("API working")
})

app.use("/admin",AdminRouter);
app.use("/user",UsersRouter);
// app.use("/boutique",BoutiquesRouter);



app.listen(port,()=>{
    console.log("server started on http://localhost:3000")
})

// Log environment details
console.log(`Running in ${process.env.NODE_ENV} mode`);
console.log(`Database URI: ${config.DB_URI}`);
console.log(`Log Level: ${config.LOG_LEVEL}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);


