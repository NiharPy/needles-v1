import express from "express"
import cors from "cors"
import { connectDB } from "./config/db.js"
import AdminRouter from "./APIroutes/AdminRouter.js"
import UsersRouter from "./APIroutes/UsersRouter.js"
import BoutiquesRouter from "./APIroutes/BoutiquesRouter.js"
import { config } from './config/config.js';
import http from 'http';  // Required for creating an HTTP server

//app config
const app = express()
const port = process.env.PORT || 14000



const server = http.createServer(app);


// middleware

app.use(express.json())
app.use(express.urlencoded({ extended: true}))
app.use(cors())

//db connection
connectDB();

//API endpoint
app.get("/",(req,res)=>{
    res.send("API working")
})

app.use("/admin",AdminRouter);
app.use("/Boutique",BoutiquesRouter);
app.use("/User",UsersRouter);



app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Log environment details
console.log(`Running in ${process.env.NODE_ENV} mode`);
console.log(`Database URI: ${config.DB_URI}`);
console.log(`Log Level: ${config.LOG_LEVEL}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log('Twilio Account SID:', process.env.TWILIO_ACCOUNT_SID);
console.log('Twilio Auth Token:', process.env.TWILIO_AUTH_TOKEN);
console.log('Twilio Messaging Service SID:', process.env.TWILIO_MESSAGING_SERVICE_SID);


