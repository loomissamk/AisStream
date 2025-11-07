import got from "got";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface S2Query {
  start: string;
  end: string;
  bbox: [number, number, number, number];
  productType?: "S2MSI2A" | "S2MSI1C" | "ANY";
  cloudLt?: number;
  limit?: number;
  frames?: number;
  save?: boolean;
}

export type S2Bands = { B02: string; B03: string; B04: string; SCL?: string } | null;

export interface S2Scene {
  type: "scene";
  id: string;
  datetime: string;
  cloud?: number;
  productType: string;
  footprint: any;
  mgrs: { zone: string; latBand: string; grid: string } | null;
  bands: S2Bands;
  tileTemplate: string | null;
  quicklook: string | null;
  whyNoBand?: string;
}

const TITILER_BASE = process.env.TITILER_BASE || ""; // e.g. http://localhost:8000

// ---------- helpers ----------
export function parseMgrs(id: string) {
  const m = id.match(/_T(\d{2})([A-Z])([A-Z]{2})_/);
  return m ? { zone: m[1], latBand: m[2], grid: m[3] } : null;
}
export function cloudFrom(p: any) {
  const keys = ["eo:cloud_cover", "s2:cloud_cover", "cloudcoverpercentage"];
  for (const k of keys) {
    const v = p?.[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() && !isNaN(+v)) return +v;
  }
  return undefined;
}
export function deriveProductType(it: any): string {
  const props = it?.properties ?? {};
  const pt =
    props["s2:product_type"] ||
    props["productType"] ||
    props["processing:level"] ||
    props["processing"];
  if (pt) return String(pt);
  const id: string = it?.id || "";
  const m = id.match(/MSI(L1C|L2A)/);
  return m?.[1] === "L2A" ? "S2MSI2A" : m?.[1] === "L1C" ? "S2MSI1C" : "";
}
export function s3toHttps(u: string) {
  const m = u.match(/^s3:\/\/([^/]+)\/(.+)$/i);
  return m ? `https://${m[1]}.s3.amazonaws.com/${m[2]}` : u;
}
export async function urlExists(u: string) {
  try {
    const r = await got.head(u, { throwHttpErrors: false, timeout: { request: 6000 } });
    return r.statusCode >= 200 && r.statusCode < 400;
  } catch { return false; }
}
export function buildCogUrls(mgrs: NonNullable<S2Scene["mgrs"]>, iso: string) {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const base = `https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/tiles/${mgrs.zone}/${mgrs.latBand}/${mgrs.grid}/${y}/${m}/${day}`;
  return { B02: `${base}/B02.tif`, B03: `${base}/B03.tif`, B04: `${base}/B04.tif`, SCL: `${base}/SCL.tif` };
}
export function rgbTileTemplate(r: string, g: string, b: string) {
  if (!TITILER_BASE) return null;
  const enc = (x: string) => encodeURIComponent(x);
  return `${TITILER_BASE}/cog/tiles/{z}/{x}/{y}.png?expression=rgb(${enc(r)},${enc(g)},${enc(b)})&rescale=0,3000`;
}
export function titilerPreview(u: string) {
  if (!TITILER_BASE) return null;
  return `/v1/s2/quicklook?href=${encodeURIComponent(`${TITILER_BASE}/cog/preview.png?url=${encodeURIComponent(u)}`)}`;
}

// ---------- STAC providers (EarthSearch then CDSE fallback) ----------
async function* stacItemsIterator(start: string, end: string, bbox: number[], perPage: number, pageLimit: number) {
  // EarthSearch v1 (Element84)
  yield* stacPagedPOST(
    "https://earth-search.aws.element84.com/v1/search",
    { bbox, datetime: `${start}/${end}`, collections: ["sentinel-2-l2a", "sentinel-2-l1c"], limit: perPage },
    pageLimit
  );
  // CDSE STAC (no fields ext; pagination via 'next' link body)
  yield* stacPagedPOST(
    "https://catalogue.dataspace.copernicus.eu/stac/search",
    { bbox, datetime: `${start}/${end}`, collections: ["SENTINEL-2"], limit: perPage },
    pageLimit
  );
}

async function* stacPagedPOST(url: string, bodyInit: any, pageLimit: number) {
  let body = { ...bodyInit };
  let pages = 0;
  while (pages < pageLimit) {
    const resp = await got.post(url, {
      json: body,
      responseType: "json",
      throwHttpErrors: false,
      headers: { Accept: "application/geo+json,application/json;q=0.9", "User-Agent": "AisStream/1.0" },
      timeout: { request: 25000 },
      retry: { limit: 1 },
    });
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      // Stop on provider error, but let outer iterator try next provider
      break;
    }
    const fc: any = resp.body;
    const feats = Array.isArray(fc?.features) ? fc.features : [];
    for (const f of feats) yield f;

    const next = (fc?.links || []).find((l: any) => l?.rel === "next" && (l?.href || l?.body));
    if (!next) break;
    if (next.body) body = next.body;
    else if (next.href) {
      // Some servers give a full URL; re-post with same body is often enough
      // but if they want GET, we just stop (keep it simple & robust).
      break;
    }
    pages++;
  }
}

// ---------- bands + quicklook ----------
function pickQuicklookAsset(it: any): string | null {
  const a = it?.assets || {};
  const img =
    a.quicklook?.href || a.thumbnail?.href || a["thumbnail-jpeg"]?.href ||
    a.preview?.href || a.overview?.href || null;
  if (img) {
    const u = String(img);
    const href = /^s3:\/\//i.test(u) ? s3toHttps(u) : u;
    if (/^https?:\/\//i.test(href)) return `/v1/s2/quicklook?href=${encodeURIComponent(href)}`;
  }
  // As a fallback, if we have "visual" COG, create a titiler preview
  const visual = a.visual?.href;
  if (visual && TITILER_BASE) {
    const href = /^s3:\/\//i.test(visual) ? s3toHttps(visual) : visual;
    return titilerPreview(href);
  }
  return null;
}

async function pickBands(it: any, mgrs: S2Scene["mgrs"], dt: string, pt: string): Promise<{ bands: S2Bands; tileTemplate: string | null; whyNoBand?: string }> {
  let bands: S2Bands = null;
  let tileTemplate: string | null = null;
  let whyNoBand: string | undefined;

  // 1) Try public L2A COG mirror (fast) if L2A and we have MGRS
  if (pt === "S2MSI2A" && mgrs) {
    const cogs = buildCogUrls(mgrs, dt);
    const ok = await Promise.all([urlExists(cogs.B02), urlExists(cogs.B03), urlExists(cogs.B04)]);
    if (ok.every(Boolean)) bands = cogs;
  }

  // 2) Fallback to item RGB assets
  if (!bands) {
    const a = it?.assets || {};
    const b02a = a.B02?.href || a.blue?.href;
    const b03a = a.B03?.href || a.green?.href;
    const b04a = a.B04?.href || a.red?.href;
    const b02 = b02a ? (String(b02a).startsWith("s3://") ? s3toHttps(String(b02a)) : String(b02a)) : null;
    const b03 = b03a ? (String(b03a).startsWith("s3://") ? s3toHttps(String(b03a)) : String(b03a)) : null;
    const b04 = b04a ? (String(b04a).startsWith("s3://") ? s3toHttps(String(b04a)) : String(b04a)) : null;
    if (b02 && b03 && b04) {
      const ok = await Promise.all([urlExists(b02), urlExists(b03), urlExists(b04)]);
      if (ok.some(Boolean)) bands = { B02: b02, B03: b03, B04: b04 };
    }
  }

  if (bands && TITILER_BASE) {
    tileTemplate = rgbTileTemplate(bands.B04, bands.B03, bands.B02);
  }
  if (!bands) whyNoBand = "no accessible RGB COGs";

  return { bands, tileTemplate, whyNoBand };
}

// ---------- public API ----------
export async function searchSentinel2(q: S2Query) {
  const start = q.start, end = q.end;
  const bboxArr = q.bbox.map(Number);
  const want = Math.max(1, Number(q.limit ?? 6));
  const frames = Number(q.frames ?? want);
  const cloudMax = q.cloudLt !== undefined ? Number(q.cloudLt) : undefined;
  const productType = (q.productType || "ANY").toUpperCase() as S2Query["productType"];

  const bucket: S2Scene[] = [];
  for await (const it of stacItemsIterator(start, end, bboxArr, Math.min(100, want * 5), 8)) {
    const props = it?.properties ?? {};
    const pt = deriveProductType(it);
    const cc = cloudFrom(props);
    if (cloudMax !== undefined && typeof cc === "number" && cc > cloudMax) continue;
    if (productType !== "ANY" && pt !== productType) continue;

    const id = String(it?.id || "");
    const dt = String(props?.datetime || props?.["date"] || "");
    if (!id || !dt) continue;

    const mgrs = parseMgrs(id);
    const quicklook = pickQuicklookAsset(it);
    const { bands, tileTemplate, whyNoBand } = await pickBands(it, mgrs, dt, pt);

    bucket.push({
      type: "scene",
      id,
      datetime: dt,
      cloud: cc,
      productType: pt,
      footprint: it?.geometry,
      mgrs,
      bands,
      tileTemplate,
      quicklook,
      ...(whyNoBand ? { whyNoBand } : {})
    });
    if (bucket.length >= want) break;
  }

  const scenes = bucket.slice(0, frames);
  if (q.save && scenes.length) await saveQuicklooks(scenes);

  return { count: scenes.length, bbox: bboxArr, start, end, productType, scenes };
}

export async function* searchSentinel2Stream(q: S2Query) {
  const start = q.start, end = q.end;
  const bboxArr = q.bbox.map(Number);
  const want = Math.max(1, Number(q.limit ?? 8));
  const frames = Number(q.frames ?? want);
  const cloudMax = q.cloudLt !== undefined ? Number(q.cloudLt) : undefined;
  const productType = (q.productType || "ANY").toUpperCase() as S2Query["productType"];

  const emitted: S2Scene[] = [];
  for await (const it of stacItemsIterator(start, end, bboxArr, Math.min(100, want * 5), 8)) {
    const props = it?.properties ?? {};
    const pt = deriveProductType(it);
    const cc = cloudFrom(props);
    if (cloudMax !== undefined && typeof cc === "number" && cc > cloudMax) continue;
    if (productType !== "ANY" && pt !== productType) continue;

    const id = String(it?.id || "");
    const dt = String(props?.datetime || "");
    if (!id || !dt) continue;

    const mgrs = parseMgrs(id);
    const quicklook = pickQuicklookAsset(it);
    const { bands, tileTemplate, whyNoBand } = await pickBands(it, mgrs, dt, pt);

    const scene: S2Scene = {
      type: "scene",
      id,
      datetime: dt,
      cloud: cc,
      productType: pt,
      footprint: it?.geometry,
      mgrs,
      bands,
      tileTemplate,
      quicklook,
      ...(whyNoBand ? { whyNoBand } : {})
    };
    emitted.push(scene);
    yield scene;
    if (emitted.length >= frames) break;
  }

  if (q.save && emitted.length) await saveQuicklooks(emitted);

  yield { type: "summary", count: emitted.length, bbox: bboxArr, start, end, productType };
}

async function saveQuicklooks(scenes: S2Scene[]) {
  const dir = path.join(process.cwd(), "data", "s2_quicklooks");
  await mkdir(dir, { recursive: true });
  for (const s of scenes) {
    if (!s.quicklook) continue;
    const name = `${s.datetime.slice(0, 10)}_${s.id.replaceAll("/", "_")}.jpg`;
    try {
      const r = await got.get(s.quicklook, { responseType: "buffer", throwHttpErrors: false, timeout: { request: 25000 } });
      if (r.statusCode >= 200 && r.statusCode < 300) await writeFile(path.join(dir, name), r.body as Buffer);
    } catch {
      // Ignore errors during quicklook saving
    }
  }
}
