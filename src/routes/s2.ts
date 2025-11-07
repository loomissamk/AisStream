import { Router } from "express";
import got from "got";
import { searchSentinel2, searchSentinel2Stream, S2Query } from "../services/S2Service";

export const s2Router = Router();

function parseBase(reqQuery: Record<string, any>) {
  const { start, end, bbox } = reqQuery;
  if (!start || !end || !bbox) return { error: "pass start, end, bbox" };
  const bboxArr = String(bbox).split(",").map(Number);
  if (bboxArr.length !== 4 || bboxArr.some(Number.isNaN)) return { error: "bad bbox" };
  if (Number.isNaN(Date.parse(String(start))) || Number.isNaN(Date.parse(String(end)))) return { error: "bad datetime" };
  return { start: String(start), end: String(end), bboxArr };
}

// JSON
s2Router.get("/v1/s2", async (req, res) => {
  try {
    const base = parseBase(req.query as any);
    if ("error" in base) return res.status(400).json(base);
    const productType = ((req.query.productType as string) ?? "ANY").toUpperCase() as S2Query["productType"];
    const cloudLt = req.query.cloudLt !== undefined ? Number(req.query.cloudLt) : undefined;
    const limit = Math.max(1, Number(req.query.limit ?? 6));
    const frames = Number(req.query.frames ?? limit);
    const save = req.query.save === "1" || req.query.save === "true";

    const data = await searchSentinel2({
      start: base.start, end: base.end,
      bbox: base.bboxArr as S2Query["bbox"],
      productType, cloudLt, limit, frames, save
    });
    res.json(data);
  } catch (e: any) {
    res.status(502).json({ error: "satellite search failed", detail: String(e?.message || e) });
  }
});

// NDJSON
s2Router.get("/v1/s2.ndjson", async (req, res) => {
  try {
    const base = parseBase(req.query as any);
    if ("error" in base) return res.status(400).json(base);
    const productType = ((req.query.productType as string) ?? "ANY").toUpperCase() as S2Query["productType"];
    const cloudLt = req.query.cloudLt !== undefined ? Number(req.query.cloudLt) : undefined;
    const limit = Math.max(1, Number(req.query.limit ?? 8));
    const frames = Number(req.query.frames ?? limit);
    const save = req.query.save === "1" || req.query.save === "true";

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    for await (const item of searchSentinel2Stream({
      start: base.start, end: base.end,
      bbox: base.bboxArr as S2Query["bbox"],
      productType, cloudLt, limit, frames, save
    })) res.write(JSON.stringify(item) + "\n");
    res.end();
  } catch (e: any) {
    res.status(502).json({ error: "satellite search failed", detail: String(e?.message || e) });
  }
});

// Quicklook proxy; returns image/* or a short text error
s2Router.get("/v1/s2/quicklook", async (req, res) => {
  const href = req.query.href;
  if (typeof href !== "string" || !/^https?:\/\//i.test(href)) {
    return res.status(400).type("text/plain").send("bad quicklook href");
  }
  try {
    const r = await got.get(href, { responseType: "buffer", throwHttpErrors: false, timeout: { request: 25000 } });
    const ct = String(r.headers["content-type"] || "");
    if (r.statusCode < 200 || r.statusCode >= 300) {
      return res.status(502).type("text/plain").send(`upstream ${r.statusCode}\n${ct}\n${String(r.body).slice(0,400)}`);
    }
    if (!ct.startsWith("image/")) {
      return res.status(502).type("text/plain").send(`expected image/*, got ${ct}\n${String(r.body).slice(0,400)}`);
    }
    res.setHeader("Content-Type", ct);
    res.end(r.body);
  } catch (e: any) {
    res.status(502).type("text/plain").send(String(e?.message || e));
  }
});
