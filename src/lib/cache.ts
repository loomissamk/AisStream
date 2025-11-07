import fs from "fs";
import path from "path";

const CACHE_DIR = "/tmp/aiscache";
// const MAX_CACHE_BYTES = Number(process.env.MAX_CACHE_BYTES || 50_000_000_000);

export function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function cachePath(file: string) {
  ensureCacheDir();
  return path.join(CACHE_DIR, path.basename(file));
}

export function hasCache(file: string) {
  return fs.existsSync(cachePath(file));
}

export function getCacheStream(file: string) {
  return fs.createReadStream(cachePath(file));
}

export function saveCache(file: string, stream: NodeJS.ReadableStream) {
  return new Promise<void>((resolve, reject) => {
    ensureCacheDir();
    const ws = fs.createWriteStream(cachePath(file));
    stream.pipe(ws);
    ws.on("finish", resolve);
    ws.on("error", reject);
    stream.on("error", reject);
  });
}



export function getCacheStats() {
  if (!fs.existsSync(CACHE_DIR)) return { totalSize: 0, fileCount: 0 };
  const files = fs.readdirSync(CACHE_DIR);
  let totalSize = 0;
  for (const f of files) {
    const st = fs.statSync(path.join(CACHE_DIR, f));
    totalSize += st.size;
  }
  return { totalSize, fileCount: files.length };
}
