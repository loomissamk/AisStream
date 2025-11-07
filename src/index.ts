import express from "express";
import dotenv from "dotenv";
import pino from "pino";
import { router as aisRouter } from "./routes/ais";
import { router as nsjsonRouter } from "./routes/nsjson";
import { s2Router } from "./routes/s2";

dotenv.config();
export const app = express();
const log = pino();
const PORT = Number(process.env.PORT || 8080);

app.use(aisRouter);
app.use(nsjsonRouter);
app.use(s2Router);

app.get("/healthz", (_req, res) => res.json({ ok: true }));

if (!process.env.JEST_WORKER_ID) {
  app.listen(PORT, () => log.info({ port: PORT }, "AisStream listening"));
}
