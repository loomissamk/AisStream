import { Router } from "express";
import z from "zod";
import { dailyUrls } from "../lib/urls";
import { bboxPolygon, pointInPolygon } from "../lib/geometry";
import { streamDay } from "../lib/fetchDay";
import zlib from "zlib";

export const router = Router();

const querySchema = z.object({
  start: z.string(),
  end: z.string(),
  bbox: z.string(),
  head: z.coerce.number().optional(),
});

router.get("/v1/ais", async (req, res) => {
  const q = querySchema.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "bad query" });
  const { start, end, bbox, head } = q.data;
  const s = new Date(start), e = new Date(end);
  const urls = dailyUrls(s, e);
  const aoi = bboxPolygon(bbox);
  const limit = head || Infinity;

  res.setHeader("Content-Type", "application/geo+json; charset=utf-8");
  res.setHeader("Content-Encoding", "gzip");
  res.writeHead(200);
  const gz = zlib.createGzip();
  gz.pipe(res);
  gz.write('{"type":"FeatureCollection","features":[');
  let first = true;
  let count = 0;

  await Promise.all(urls.map(async (u) => {
    await streamDay(u, (row: Record<string, unknown>) => {
      if (count >= limit) return;
      const t = new Date(row.BaseDateTime as string);
      if (t < s || t > e) return;
      const lat = parseFloat(row.LAT as string), lon = parseFloat(row.LON as string);
      if (!pointInPolygon(lon, lat, aoi)) return;
      const feat = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: row
      };
      if (!first) gz.write(",");
      gz.write(JSON.stringify(feat));
      first = false;
      count++;
    });
  }));

  gz.write("]}");
  gz.end();
});
