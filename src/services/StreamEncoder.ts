// src/services/StreamEncoder.ts
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

export type Row = {
  time: string;
  lon: number;
  lat: number;
  [k: string]: unknown;
};

export type EncodeOptions = {
  precision?: number;   // digits after decimal (0..8)
  sample?: number;      // keep every Nth row (1 = all)
  filter?: (r: Row) => boolean;  // e.g., pointInBBox
};

export type EncodeResult = {
  gzPath: string;                   // path to gzipped NDJSON
  meta: { written: number; bytes: number };
};

/**
 * Streams rows -> NDJSON -> GZIP into a temp file, honoring backpressure.
 * Returns the gz path + meta. Caller is responsible for removing temp files.
 */
export async function encodeToNdjsonGz(
  rows: AsyncIterable<Row>,
  opts: EncodeOptions = {}
): Promise<EncodeResult> {
  const precision = clampInt(opts.precision ?? 5, 0, 8);
  const sample = Math.max(1, Math.floor(opts.sample ?? 1));

  const tmpBase = await fs.promises.mkdtemp(path.join(tmpdir(), 'nsjson-'));
  const ndjsonPath = path.join(tmpBase, 'out.ndjson');

  const ws = fs.createWriteStream(ndjsonPath, { flags: 'w' });
  let i = 0;
  let written = 0;

  for await (const r of rows) {
    i++;
    if (sample > 1 && (i % sample) !== 0) continue;
    if (opts.filter && !opts.filter(r)) continue;

    const lon = +Number(r.lon).toFixed(precision);
    const lat = +Number(r.lat).toFixed(precision);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const out = JSON.stringify({ ...r, lon, lat }) + '\n';
    if (!ws.write(out)) {
      await onceDrain(ws);
    }
    written++;
  }
  await finished(ws);

  const gzPath = ndjsonPath + '.gz';
  const gzip = createGzip({ level: 1 }); // fast compression for big streams
  await pipeline(fs.createReadStream(ndjsonPath), gzip, fs.createWriteStream(gzPath));

  const st = await fs.promises.stat(gzPath);
  return { gzPath, meta: { written, bytes: st.size } };
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function onceDrain(stream: fs.WriteStream) {
  return new Promise<void>(res => stream.once('drain', () => res()));
}

function finished(stream: fs.WriteStream) {
  return new Promise<void>(res => stream.end(() => res()));
}
