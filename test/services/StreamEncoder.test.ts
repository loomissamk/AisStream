import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { encodeToNdjsonGz, Row } from "../../src/services/StreamEncoder";

// Mock dependencies
jest.mock("node:fs", () => ({
  promises: {
    stat: jest.fn(),
    mkdtemp: jest.fn(),
  },
  createWriteStream: jest.fn(),
  createReadStream: jest.fn(),
}));
jest.mock("node:os");
jest.mock("node:path");
jest.mock("node:stream/promises");
jest.mock("node:zlib");

const mockFs = fs as jest.Mocked<typeof fs>;
const mockTmpdir = tmpdir as jest.MockedFunction<typeof tmpdir>;
const mockPath = path as jest.Mocked<typeof path>;
const mockPipeline = pipeline as jest.MockedFunction<typeof pipeline>;
const mockCreateGzip = createGzip as jest.MockedFunction<typeof createGzip>;

describe("encodeToNdjsonGz", () => {
  let mockWriteStream: any;
  let mockReadStream: any;
  let mockGzip: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTmpdir.mockReturnValue("/tmp");
    mockPath.join.mockImplementation((...args) => args.join("/"));
    mockWriteStream = {
      write: jest.fn().mockReturnValue(true),
      end: jest.fn(),
      once: jest.fn(),
      on: jest.fn(),
    };
    mockReadStream = {};
    mockGzip = {};
    mockFs.createWriteStream.mockReturnValue(mockWriteStream);
    mockFs.createReadStream.mockReturnValue(mockReadStream);
    mockCreateGzip.mockReturnValue(mockGzip);
    mockPipeline.mockResolvedValue(undefined);
    (mockFs.promises.stat as jest.MockedFunction<typeof mockFs.promises.stat>).mockResolvedValue({ size: 100 } as any);
    (mockFs.promises.mkdtemp as jest.MockedFunction<typeof mockFs.promises.mkdtemp>).mockResolvedValue("/tmp/testdir");
  });

  it("should encode basic rows", async () => {
    const rows: Row[] = [
      { time: "2023-01-01", lon: 1.12345, lat: 2.6789, prop: "value" },
    ];
    async function* gen() {
      for (const row of rows) yield row;
    }
    mockWriteStream.end.mockImplementation((cb) => cb && cb());
    const result = await encodeToNdjsonGz(gen());
    expect(result.gzPath).toBe("/tmp/testdir/out.ndjson.gz");
    expect(result.meta.written).toBe(1);
    expect(result.meta.bytes).toBe(100);
    expect(mockWriteStream.write).toHaveBeenCalled();
    expect(mockPipeline).toHaveBeenCalled();
  });

  it("should handle precision", async () => {
    const rows: Row[] = [
      { time: "2023-01-01", lon: 1.123456, lat: 2.678901 },
    ];
    async function* gen() {
      for (const row of rows) yield row;
    }
    mockWriteStream.end.mockImplementation((cb) => cb && cb());
    await encodeToNdjsonGz(gen(), { precision: 2 });
    expect(mockWriteStream.write).toHaveBeenCalledWith('{"time":"2023-01-01","lon":1.12,"lat":2.68}\n');
  });

  it("should handle sampling", async () => {
    const rows: Row[] = [
      { time: "2023-01-01", lon: 1, lat: 2 },
      { time: "2023-01-01", lon: 3, lat: 4 },
      { time: "2023-01-01", lon: 5, lat: 6 },
      { time: "2023-01-01", lon: 7, lat: 8 },
    ];
    async function* gen() {
      for (const row of rows) yield row;
    }
    mockWriteStream.end.mockImplementation((cb) => cb && cb());
    await encodeToNdjsonGz(gen(), { sample: 2 });
    expect(mockWriteStream.write).toHaveBeenCalledTimes(2); // sample=2: keep every 2nd, so 2nd and 4th
  });

  it("should handle filtering", async () => {
    const rows: Row[] = [
      { time: "2023-01-01", lon: 1, lat: 2 },
      { time: "2023-01-01", lon: 3, lat: 4 },
    ];
    const filter = (r: Row) => r.lon > 2;
    async function* gen() {
      for (const row of rows) yield row;
    }
    mockWriteStream.end.mockImplementation((cb) => cb && cb());
    await encodeToNdjsonGz(gen(), { filter });
    expect(mockWriteStream.write).toHaveBeenCalledTimes(1);
  });

  it("should skip invalid lon/lat", async () => {
    const rows: Row[] = [
      { time: "2023-01-01", lon: NaN, lat: 2 },
      { time: "2023-01-01", lon: 1, lat: NaN },
      { time: "2023-01-01", lon: 1, lat: 2 },
    ];
    async function* gen() {
      for (const row of rows) yield row;
    }
    mockWriteStream.end.mockImplementation((cb) => cb && cb());
    await encodeToNdjsonGz(gen());
    expect(mockWriteStream.write).toHaveBeenCalledTimes(1);
  });

  it("should handle backpressure", async () => {
    mockWriteStream.write.mockReturnValue(false); // Backpressure
    mockWriteStream.once.mockImplementation((event, cb) => {
      if (event === "drain") cb();
    });
    const rows: Row[] = [{ time: "2023-01-01", lon: 1, lat: 2 }];
    async function* gen() {
      for (const row of rows) yield row;
    }
    mockWriteStream.end.mockImplementation((cb) => cb && cb());
    await encodeToNdjsonGz(gen());
    expect(mockWriteStream.once).toHaveBeenCalledWith("drain", expect.any(Function));
  });

  it("should handle errors", async () => {
    mockFs.createWriteStream.mockImplementation(() => {
      throw new Error("Write error");
    });
    const rows: Row[] = [{ time: "2023-01-01", lon: 1, lat: 2 }];
    async function* gen() {
      for (const row of rows) yield row;
    }
    await expect(encodeToNdjsonGz(gen())).rejects.toThrow("Write error");
  });
});
