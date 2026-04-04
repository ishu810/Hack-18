import path from "path";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";



const app=express();

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`);
  });
  next();
});


app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static("public"));
const allowedOrigins = new Set([
  process.env.CORS_ORIGIN || 'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174'
]);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // allow non-browser requests like curl/postman
    if (allowedOrigins.has(origin)) return callback(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return callback(null, true);
        return callback(new Error(`CORS Policy: origin ${origin} not allowed`), false);
    },
    credentials: true,
}));



import userAuthRouter from "./routes/auth.route.js"
import userRouter from "./routes/user.route.js"
import travelRouter from "./routes/travel.route.js"
// import history from "./routes/trip.route.js"





app.use("/api/auth",userAuthRouter)
app.use("/api/user",userRouter)
app.use("/api/travel", travelRouter)
// app.use("/api", history)







app.get("/",(req,res)=>{
  res.send("Hey ")
}
);




app.use((err,req,res,next)=>{
    console.error(err.stack);

  res.status(400).json({
    success: false,
    message: err.message || "Something went wrong",
  });


});


export {app};