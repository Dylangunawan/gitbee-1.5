import express from "express";
import dotenv from "dotenv";
import routes from "./routes/Routes.js";
import cors from "cors";
import cookieParser from "cookie-parser";
import qs from "qs";
dotenv.config();

if (process.env.NODE_ENV === "development") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log(process.env.NODE_ENV, `RejectUnauthorized is disabled.`)
}

const app = express();
const corsOptions = {
  origin: process.env.WEB_URL,
  method: ["GET", "POST", "PUT", "PATCH"],
  credentials: true,
  optionsSuccessStatus: 200
}

app.use(cors(corsOptions));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());

const port = process.env.PORT || 5000;
app.set('query parser', function (str: string) {
  return qs.parse(str)
})

app.use("/api", routes)

app.listen(port, () => {
  console.log(`Application is running on port ${port}.`);
});