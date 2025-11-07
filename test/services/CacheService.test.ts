
import fs from "node:fs/promises";
import fsc from "node:fs";
import path from "node:path";
import LRU from "lru-cache";
import { CacheService, makeEtagFromStats } from "../../src/services/CacheService";

// Mock dependencies
jest.mock("node:fs/promises");
jest.mock("node:fs");
jest.mock("node:path");
jest.mock("lru-cache");

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockLRU = LRU as jest.MockedClass<typeof LRU>;

describe("CacheService", () => {
  let cache: CacheService;
  let mockLruInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockLruInstance = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      size: 0,
      keys: jest.fn().mockReturnValue([]),
    };
    mockLRU.mockImplementation(() => mockLruInstance);
    mockPath.resolve.mockReturnValue("/mock/cache");
    mockPath.join.mockImplementation((...args) => args.join("/"));
    cache = new CacheService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should ensure dir", async () => {
    await cache.ensureDir();
    expect(mockFs.mkdir).toHaveBeenCalledWith("/mock/cache", { recursive: true });
  });

  it("should get from LRU hit", async () => {
    const entry = { key: "test", path: "/path", size: 100, etag: "etag", createdAt: 123 };
    mockLruInstance.get.mockReturnValue(entry);
    mockFs.access.mockResolvedValue(undefined);
    const result = await cache.get("test");
    expect(result).toBe(entry);
  });

  it("should get from file when LRU miss", async () => {
    mockLruInstance.get.mockReturnValue(null);
    mockFs.stat.mockResolvedValue({ size: 100, mtimeMs: 123 } as any);
    const result = await cache.get("test");
    expect(result).toEqual({
      key: "test",
      path: "/mock/cache/test.ndjson.gz",
      size: 100,
      etag: expect.stringContaining("W/"),
      createdAt: 123,
    });
    expect(mockLruInstance.set).toHaveBeenCalled();
  });

  it("should return null when file not exists", async () => {
    mockLruInstance.get.mockReturnValue(null);
    mockFs.stat.mockRejectedValue(new Error("Not found"));
    const result = await cache.get("test");
    expect(result).toBeNull();
  });

  it("should put entry", async () => {
    mockFs.copyFile.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ size: 100 } as any);
    const result = await cache.put("test", "/temp.gz");
    expect(mockFs.copyFile).toHaveBeenCalledWith("/temp.gz", "/mock/cache/test.ndjson.gz");
    expect(result).toEqual({
      key: "test",
      path: "/mock/cache/test.ndjson.gz",
      size: 100,
      etag: expect.stringContaining("W/"),
      createdAt: expect.any(Number),
    });
    expect(mockLruInstance.set).toHaveBeenCalled();
  });

  it("should close and clear timer", async () => {
    await cache.close();
    expect(jest.getTimerCount()).toBe(0); // Assuming timer is cleared
  });

  it("should enforce max bytes", async () => {
    (cache as any).totalBytes = 600;
    (cache as any).maxBytes = 500;
    mockLruInstance.size = 1;
    mockLruInstance.keys.mockReturnValue(["key1"]);
    mockLruInstance.get.mockReturnValue({ path: "/path", size: 100 });
    mockFs.unlink.mockResolvedValue(undefined);
    await (cache as any).enforceMaxBytes();
    expect(mockFs.unlink).toHaveBeenCalled();
    expect(mockLruInstance.delete).toHaveBeenCalledWith("key1");
  });

  it("should purge by TTL", async () => {
    mockFs.readdir.mockResolvedValue(["file.ndjson.gz"] as any);
    mockFs.stat.mockResolvedValue({ mtimeMs: Date.now() - 25 * 60 * 60 * 1000 } as any); // Old file
    mockFs.unlink.mockResolvedValue(undefined);
    await (cache as any).purgeByTtl();
    expect(mockFs.unlink).toHaveBeenCalled();
  });

  it("should compute bytes", async () => {
    mockFs.readdir.mockResolvedValue(["file1.ndjson.gz", "file2.ndjson.gz"] as any);
    mockFs.stat.mockResolvedValueOnce({ size: 50 } as any);
    mockFs.stat.mockResolvedValueOnce({ size: 50 } as any);
    const result = await (cache as any).computeBytes();
    expect(result).toBe(100);
  });

  it("should check exists", async () => {
    mockFs.access.mockResolvedValue(undefined);
    const result = await (cache as any).exists("/path");
    expect(result).toBe(true);
  });

  it("should make ETag from stats", () => {
    const stats = { size: 100, mtimeMs: 123 } as fsc.Stats;
    const etag = makeEtagFromStats(stats);
    expect(etag).toBe('W/"100-123"');
  });

  it("should handle LRU hit but file not exists", async () => {
    const entry = { key: "test", path: "/path", size: 100, etag: "etag", createdAt: 123 };
    mockLruInstance.get.mockReturnValue(entry);
    mockFs.access.mockRejectedValue(new Error("Not found"));
    mockFs.stat.mockRejectedValue(new Error("Not found"));
    const result = await cache.get("test");
    expect(result).toBeNull();
  });

  it("should handle enforce max bytes with unlink failure", async () => {
    (cache as any).totalBytes = 600;
    (cache as any).maxBytes = 500;
    mockLruInstance.size = 1;
    mockLruInstance.keys.mockReturnValue(["key1"]);
    mockLruInstance.get.mockReturnValue({ path: "/path", size: 100 });
    mockFs.unlink.mockRejectedValue(new Error("Unlink failed"));
    await (cache as any).enforceMaxBytes();
    expect(mockLruInstance.delete).toHaveBeenCalledWith("key1");
  });

  it("should handle purge by TTL with file not old", async () => {
    mockFs.readdir.mockResolvedValue(["file.ndjson.gz"] as any);
    mockFs.stat.mockResolvedValue({ mtimeMs: Date.now() - 1 * 60 * 60 * 1000 } as any); // Not old
    await (cache as any).purgeByTtl();
    expect(mockFs.unlink).not.toHaveBeenCalled();
  });

  it("should handle purge by TTL with unlink failure", async () => {
    mockFs.readdir.mockResolvedValue(["file.ndjson.gz"] as any);
    mockFs.stat.mockResolvedValue({ mtimeMs: Date.now() - 25 * 60 * 60 * 1000 } as any);
    mockFs.unlink.mockRejectedValue(new Error("Unlink failed"));
    await (cache as any).purgeByTtl();
    expect(mockFs.unlink).toHaveBeenCalled();
  });

  it("should handle compute bytes with stat failure", async () => {
    mockFs.readdir.mockResolvedValue(["file.ndjson.gz"] as any);
    mockFs.stat.mockRejectedValue(new Error("Stat failed"));
    const result = await (cache as any).computeBytes();
    expect(result).toBe(0);
  });


});
