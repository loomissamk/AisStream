// src/services/QueryKey.ts
export type KeyParams = {
  bbox: [number, number, number, number] | string;
  start: string;
  end?: string;
  precision?: number;
  sample?: number;
  format?: string;
  grid?: string; // optional grid key if you add tiling later
};

export function makeQueryKey(p: KeyParams) {
  const bboxStr = Array.isArray(p.bbox) ? p.bbox.join(',') : String(p.bbox);
  const precision = p.precision ?? 5;
  const sample = p.sample ?? 1;
  const format = (p.format ?? 'ndjson').toLowerCase();
  const grid = p.grid ?? 'none';
  const end = p.end ?? '';
  return `v2:${bboxStr}:${p.start}:${end}:p${precision}:s${sample}:f${format}:g${grid}`;
}
