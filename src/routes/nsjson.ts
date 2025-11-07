// src/routes/nsjson.ts
import { Router, Request, Response } from "express";
import zlib from "node:zlib";
import crypto from "node:crypto";
import pino from "pino";
import { streamDay } from "../lib/fetchDay";



function parseQueryParam(param: unknown): string {
  if (typeof param === 'string') return param;
  if (Array.isArray(param) && param.length > 0) return String(param[0]);
  return '';
}

export const router = Router();
const log = pino();

router.get("/v2/nsjson", async (req: Request, res: Response) => {
  const start = parseQueryParam(req.query.start).trim();           // YYYY-MM-DD (required)
  const bboxStr = parseQueryParam(req.query.bbox).trim();          // minLng,minLat,maxLng,maxLat (required)
  const sample = Math.max(1, (Number(req.query.sample) | 0) || 1);
  const precision = Math.max(0, (Number(req.query.precision) | 0) || 6);

  if (!start) return res.status(400).send("start=YYYY-MM-DD is required");
  if (!bboxStr) return res.status(400).send("bbox=minLng,minLat,maxLng,maxLat is required");

  const parts = bboxStr.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return res.status(400).send("bbox must be four comma-separated numbers");
  }
  const [minLng, minLat, maxLng, maxLat] = parts;
  const q = (n: number) => Number(n.toFixed(precision));

  // ETag
  const key = `v2:ndjson:${start}:${minLng},${minLat},${maxLng},${maxLat}:p${precision}:s${sample}`;
  const etag = `W/"${crypto.createHash("sha1").update(key).digest("hex")}"`;
  if (req.headers["if-none-match"] === etag) return res.status(304).end();

  // Single gzip writer
  const gzip = zlib.createGzip({ level: 1 });

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("ETag", etag);
  res.setHeader("x-cache", "MISS");
  // Type assertion needed for Express Response type that may have flushHeaders
  (res as { flushHeaders?: () => void }).flushHeaders?.();

  let written = 0;
  let bytes = 0;
  let sampleCtr = 0;
  const keep = () => {
    const result = sample === 1 || sampleCtr % sample === 0;
    sampleCtr++;
    return result;
  };

  // Abort upstream if client disconnects
  req.on("close", () => {
    try { 
      gzip.end(); 
    } catch (err) {
        log.debug({ err }, "Ignoring error on cleanup - connection already closed");
    }
  });

  gzip.on("error", (e) => {
    log.error({ err: e }, "gzip error");
    try { 
      gzip.end(); 
    } catch (err) {
        log.debug({ err }, "Ignoring error on cleanup after gzip error");
    }
  });

  gzip.pipe(res);

  try {
    await streamDay(start, (row) => {
      const lon = Number(
        row.LON ?? row.lon ?? row.Longitude ?? row.longitude ?? row.long ?? row.x
      );
      const lat = Number(
        row.LAT ?? row.lat ?? row.Latitude ?? row.latitude ?? row.y
      );
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      if (lon < minLng || lon > maxLng || lat < minLat || lat > maxLat) return;
      if (!keep()) return;

      const feature = {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [q(lon), q(lat)] },
        properties: row,
      };
      const line = JSON.stringify(feature) + "\n";
      const _ok = gzip.write(line); // Ignoring backpressure - see comment below
      written++;
      bytes += Buffer.byteLength(line);
      // If backpressure ever matters, await 'drain' when !ok and your source is async.
    });

    res.setHeader("x-stats", JSON.stringify({ written, bytes }));
    gzip.end();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const msg = JSON.stringify({ type: "Error", message: errMsg || "Internal" }) + "\n";
    try { 
      gzip.write(msg); 
    } catch (err) {
      log.error({ err }, "Failed to write error message");
    }
    try { 
      gzip.end(); 
    } catch (err) {
      log.debug({ err }, "Ignoring error on cleanup after write failure");
    }
    log.error({ err }, "nsjson failed");
  }
});
