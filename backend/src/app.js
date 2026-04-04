import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app=express();

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static("public"));
app.use(cors({
    origin:process.env.CORS_ORIGIN,
    credentials: true,
}));

import userAuthRouter from "./routes/auth.route.js"
import userRouter from "./routes/user.route.js"

app.use("/api/auth",userAuthRouter)
app.use("/api/user",userRouter)

app.get("/",(req,res)=>{
  res.send("Hey ")
}
);


app.use((err,req,res,next)=>{
    console.error(err.stack);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Something went wrong",
  });


});


export {app};