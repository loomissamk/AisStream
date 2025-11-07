// src/services/CacheService.ts
import fs from 'node:fs/promises';
import fsc from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import LRU from 'lru-cache';

export type CacheEntry = {
  key: string;
  path: string;   // gz file path
  size: number;
  etag: string;
  createdAt: number;
};

export type CacheConfig = {
  dir?: string;           // default: data/cache
  maxItems?: number;      // default: 300
  maxBytes?: number;      // default: 512MB
  ttlMs?: number;         // default: 24h
  purgeIntervalMs?: number; // default: 1h
};

export class CacheService {
  private dir: string;
  private lru: LRU<string, CacheEntry>;
  private maxBytes: number;
  private ttlMs: number;
  private totalBytes = 0;
  private purgeTimer: NodeJS.Timeout;
  constructor(cfg: CacheConfig = {}) {
    this.dir = path.resolve(cfg.dir || 'data/cache');
    this.lru = new LRU<string, CacheEntry>({ max: cfg.maxItems ?? 300 });
    this.maxBytes = cfg.maxBytes ?? 512 * 1024 * 1024;
    this.ttlMs = cfg.ttlMs ?? 24 * 60 * 60 * 1000;

    const purgeIntervalMs = cfg.purgeIntervalMs ?? 60 * 60 * 1000;
    this.purgeTimer = setInterval(() => {
      void this.purgeByTtl().catch((err) => {
        // Log purge errors but continue running - will retry next interval
        console.error('TTL purge failed:', err instanceof Error ? err.message : String(err));
      });
    }, purgeIntervalMs);
  }

  async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.dir, { recursive: true });
    } catch (err) {
      // If mkdir fails, try sync version as fallback
      try {
        mkdirSync(this.dir, { recursive: true });
      } catch (syncErr) {
        throw err; // Throw original error
      }
    }
  }

  private keyPath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9_:,.]/g, '_');
    return path.join(this.dir, `${safe}.ndjson.gz`);
  }

  async get(key: string): Promise<CacheEntry | null> {
    const cached = this.lru.get(key);
    if (cached && await this.exists(cached.path)) return cached;

    const p = this.keyPath(key);
    try {
      const st = await fs.stat(p);
      const entry: CacheEntry = {
        key,
        path: p,
        size: st.size,
        etag: makeEtagFromStats(st),
        createdAt: st.mtimeMs,
      };
      this.lru.set(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  async put(key: string, gzTempPath: string): Promise<CacheEntry> {
    await this.ensureDir();
    const dest = this.keyPath(key);
    // Copy into place
    await fs.copyFile(gzTempPath, dest);
    const st = await fs.stat(dest);
    const entry: CacheEntry = {
      key,
      path: dest,
      size: st.size,
      etag: makeEtagFromStats(st),
      createdAt: Date.now(),
    };
    this.lru.set(key, entry);
    this.totalBytes += st.size;
    await this.enforceMaxBytes();
    return entry;
  }

  async close(): Promise<void> {
    clearInterval(this.purgeTimer);
  }

  // --- internals ---
  private async enforceMaxBytes() {
    if (this.totalBytes === 0) this.totalBytes = await this.computeBytes();
    while (this.totalBytes > this.maxBytes && this.lru.size > 0) {
        const oldestKey = Array.from(this.lru.keys())[0];
      const entry = this.lru.get(oldestKey);
      if (!entry) break;
      try { 
        await fs.unlink(entry.path); 
      } catch (err) {
        // Skip files that were already deleted
        console.debug(`Failed to delete cache entry ${entry.key}:`, err);
      }
      this.totalBytes -= entry.size;
      this.lru.delete(oldestKey);
    }
  }

  private async purgeByTtl() {
    await this.ensureDir();
    const now = Date.now();
    const files = await fs.readdir(this.dir);
    for (const f of files) {
      const p = path.join(this.dir, f);
      try {
        const st = await fs.stat(p);
        if (now - st.mtimeMs > this.ttlMs) {
          await fs.unlink(p);
        }
      } catch (err) {
        // Skip files we can't access or that were already deleted
        console.debug(`Skipping inaccessible cache file ${f}:`, err);
      }
    }
    // reset bytes count lazily
    this.totalBytes = 0;
  }

  private async computeBytes() {
    let sum = 0;
    try {
      const files = await fs.readdir(this.dir);
      for (const f of files) {
        try {
          const st = await fs.stat(path.join(this.dir, f));
          sum += st.size;
        } catch (err) {
          // Skip files we can't stat - they may have been deleted
          console.debug(`Failed to stat cache file ${f}:`, err);
        }
      }
    } catch (err) {
      // Return 0 if we can't read the directory
      console.debug('Failed to read cache directory:', err);
    }
    this.totalBytes = sum;
    return sum;
  }

  private async exists(p: string) {
    return await fs.access(p).then(() => true).catch(() => false);
  }
}

export function makeEtagFromStats(st: fsc.Stats) {
  // strong but simple: size + mtime
  return `W/"${st.size}-${st.mtimeMs}"`;
}
