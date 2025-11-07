import fs from "fs";
import path from "path";
import { ensureCacheDir, cachePath, hasCache, getCacheStream, saveCache, getCacheStats } from "../../src/lib/cache";

// Mock fs
jest.mock("fs", () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  statSync: jest.fn(() => ({ size: 13, atime: new Date(), atimeMs: Date.now() })),
  readdirSync: jest.fn(() => []),
  rmSync: jest.fn(),
  utimesSync: jest.fn(),
  createReadStream: jest.fn(() => ({
    pipe: jest.fn(),
    on: jest.fn(),
  })),
  createWriteStream: jest.fn(() => ({
    on: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
  })),
}));
import stream from "stream";

const mockFs = fs as jest.Mocked<typeof fs>;

const CACHE_DIR = "/tmp/aiscache";

describe("Cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.statSync.mockReturnValue({ size: 13, atime: new Date(), atimeMs: Date.now() } as fs.Stats);
    mockFs.readdirSync.mockReturnValue([]);
  });

  it("should create cache directory", () => {
    ensureCacheDir();
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(CACHE_DIR, { recursive: true });
  });

  it("should return correct cache path", () => {
    const file = "test.zip";
    const expected = path.join(CACHE_DIR, file);
    expect(cachePath(file)).toBe(expected);
  });

  it("should check if cache exists", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(hasCache("test.zip")).toBe(false);
    mockFs.existsSync.mockReturnValue(true);
    expect(hasCache("test.zip")).toBe(true);
  });

  it("should save and get cache stream", async () => {
    const file = "test.zip";
    const data = "test data";
    const buffer = Buffer.from(data);
    const readableStream = stream.Readable.from(buffer);
    const mockWriteStream = { on: jest.fn(), write: jest.fn(), end: jest.fn(), once: jest.fn(), emit: jest.fn() };
    mockFs.createWriteStream.mockReturnValue(mockWriteStream as unknown as fs.WriteStream);
    mockWriteStream.on.mockImplementation((event, cb) => {
      if (event === 'finish') cb();
    });
    mockFs.existsSync.mockReturnValue(true);
    await saveCache(file, readableStream);
    expect(hasCache(file)).toBe(true);
    const _readStream = getCacheStream(file);
    expect(mockFs.createReadStream).toHaveBeenCalledWith(cachePath(file));
  });

  it("should handle save cache errors", async () => {
    const file = "test.zip";
    const readableStream = stream.Readable.from(Buffer.from("test"));
    const mockWriteStream = { on: jest.fn(), write: jest.fn(), end: jest.fn(), once: jest.fn(), emit: jest.fn(), removeListener: jest.fn(), listenerCount: jest.fn() };
    mockFs.createWriteStream.mockReturnValue(mockWriteStream as unknown as fs.WriteStream);
    mockWriteStream.on.mockImplementation((event, cb) => {
      if (event === 'error') cb(new Error('Write error'));
    });
    await expect(saveCache(file, readableStream)).rejects.toThrow('Write error');
  });

  it("should handle stream errors in saveCache", async () => {
    const file = "test.zip";
    const readableStream = stream.Readable.from(Buffer.from("test"));
    const mockWriteStream = { on: jest.fn(), write: jest.fn(), end: jest.fn(), once: jest.fn(), emit: jest.fn() };
    mockFs.createWriteStream.mockReturnValue(mockWriteStream as unknown as fs.WriteStream);
    jest.spyOn(readableStream, 'on').mockImplementation((event, cb) => {
      if (event === 'error') cb(new Error('Stream error'));
      return readableStream;
    });
    await expect(saveCache(file, readableStream)).rejects.toThrow('Stream error');
  });



  it("should return cache stats", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue(["file1.zip", "file2.zip"] as any);
    mockFs.statSync.mockReturnValue({ size: 10 } as any);
    const stats = getCacheStats();
    expect(stats).toEqual({ totalSize: 20, fileCount: 2 });
  });

  it("should return zero stats when cache dir does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    const stats = getCacheStats();
    expect(stats).toEqual({ totalSize: 0, fileCount: 0 });
  });
});
