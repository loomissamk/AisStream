import { Request, Response } from "express";
import { router } from "../../src/routes/nsjson";

// Mock dependencies
jest.mock("node:zlib");
jest.mock("node:crypto");
jest.mock("../../src/lib/fetchDay", () => ({
  streamDay: jest.fn(),
}));
jest.mock("pino", () => {
  const mockLog = { debug: jest.fn(), error: jest.fn() };
  return jest.fn(() => mockLog);
});
const _mockLog = { debug: jest.fn(), error: jest.fn() };

import zlib from "node:zlib";
import crypto from "node:crypto";
import _pino from "pino";
import { streamDay } from "../../src/lib/fetchDay";

const mockZlib = zlib as jest.Mocked<typeof zlib>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;
const mockStreamDay = streamDay as jest.MockedFunction<typeof streamDay>;

describe("nsjson route", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockGzip: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      query: {},
      headers: {},
      on: jest.fn(),
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };
    mockGzip = {
      pipe: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };
    mockZlib.createGzip.mockReturnValue(mockGzip);
    mockCrypto.createHash.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue("mockhash"),
    } as any);
    // pino is mocked to return mockLog
    mockStreamDay.mockResolvedValue(undefined);
  });

  it("should parse string query param", () => {
    const parseQueryParam = (param: unknown): string => {
      if (typeof param === 'string') return param;
      if (Array.isArray(param) && param.length > 0) return String(param[0]);
      return '';
    };
    expect(parseQueryParam("test")).toBe("test");
  });

  it("should parse array query param", () => {
    const parseQueryParam = (param: unknown): string => {
      if (typeof param === 'string') return param;
      if (Array.isArray(param) && param.length > 0) return String(param[0]);
      return '';
    };
    expect(parseQueryParam(["test"])).toBe("test");
  });

  it("should parse empty query param", () => {
    const parseQueryParam = (param: unknown): string => {
      if (typeof param === 'string') return param;
      if (Array.isArray(param) && param.length > 0) return String(param[0]);
      return '';
    };
    expect(parseQueryParam(undefined)).toBe("");
  });

  it("should return 400 for missing start", async () => {
    mockReq.query = { bbox: "1,2,3,4" };
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.send).toHaveBeenCalledWith("start=YYYY-MM-DD is required");
  });

  it("should return 400 for missing bbox", async () => {
    mockReq.query = { start: "2023-01-01" };
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.send).toHaveBeenCalledWith("bbox=minLng,minLat,maxLng,maxLat is required");
  });

  it("should return 400 for invalid bbox", async () => {
    mockReq.query = { start: "2023-01-01", bbox: "1,2,3" };
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.send).toHaveBeenCalledWith("bbox must be four comma-separated numbers");
  });

  it("should return 304 for ETag match", async () => {
    mockReq.query = { start: "2023-01-01", bbox: "1,2,3,4" };
    mockReq.headers = { "if-none-match": 'W/"mockhash"' };
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(304);
    expect(mockRes.end).toHaveBeenCalled();
  });

  it("should stream data successfully", async () => {
    mockReq.query = { start: "2023-01-01", bbox: "1,2,3,4" };
    mockStreamDay.mockImplementation(async (day, onRow) => {
      onRow({ LON: 2, LAT: 3, prop: "value" });
    });
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "application/x-ndjson");
    expect(mockGzip.write).toHaveBeenCalled();
    expect(mockGzip.end).toHaveBeenCalled();
  });

  it("should handle streamDay error", async () => {
    mockReq.query = { start: "2023-01-01", bbox: "1,2,3,4" };
    mockStreamDay.mockRejectedValue(new Error("Stream error"));
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockGzip.write).toHaveBeenCalledWith(expect.stringContaining("Error"));
    expect(mockGzip.end).toHaveBeenCalled();
  }, 10000);

  it("should handle gzip error", async () => {
    mockReq.query = { start: "2023-01-01", bbox: "1,2,3,4" };
    mockGzip.on.mockImplementation((event, cb) => {
      if (event === "error") cb(new Error("Gzip error"));
    });
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockGzip.end).toHaveBeenCalled();
  }, 10000);

  it("should handle client disconnect", async () => {
    mockReq.query = { start: "2023-01-01", bbox: "1,2,3,4" };
    const mockOn = jest.fn((event, cb) => {
      if (event === "close") cb();
      return mockReq as Request;
    });
    mockReq.on = mockOn;
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockGzip.end).toHaveBeenCalled();
  });

  it("should skip row with invalid lon/lat", async () => {
    mockReq.query = { start: "2023-01-01", bbox: "1,2,3,4" };
    mockStreamDay.mockImplementation(async (day, onRow) => {
      onRow({ LON: "invalid", LAT: 3, prop: "value" }); // invalid lon
      onRow({ LON: 2, LAT: "invalid", prop: "value" }); // invalid lat
      onRow({ LON: 2, LAT: 3, prop: "value" }); // valid
    });
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockGzip.write).toHaveBeenCalledTimes(1); // only the valid row
  });

  it("should skip row outside bbox", async () => {
    mockReq.query = { start: "2023-01-01", bbox: "1,2,3,4" };
    mockStreamDay.mockImplementation(async (day, onRow) => {
      onRow({ LON: 0, LAT: 3, prop: "value" }); // lon < minLng
      onRow({ LON: 2, LAT: 1, prop: "value" }); // lat < minLat
      onRow({ LON: 4, LAT: 3, prop: "value" }); // lon > maxLng
      onRow({ LON: 2, LAT: 5, prop: "value" }); // lat > maxLat
      onRow({ LON: 2, LAT: 3, prop: "value" }); // inside
    });
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockGzip.write).toHaveBeenCalledTimes(1); // only the inside row
  });

  it("should handle sampling with sample > 1", async () => {
    mockReq.query = { start: "2023-01-01", bbox: "1,2,3,4", sample: "2" };
    mockStreamDay.mockImplementation(async (day, onRow) => {
      onRow({ LON: 2, LAT: 3, prop: "value1" });
      onRow({ LON: 2, LAT: 3, prop: "value2" });
      onRow({ LON: 2, LAT: 3, prop: "value3" });
    });
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockGzip.write).toHaveBeenCalledTimes(2); // every other row due to sample=2
  });

  it("should handle non-Error error in catch", async () => {
    mockReq.query = { start: "2023-01-01", bbox: "1,2,3,4" };
    mockStreamDay.mockRejectedValue("string error"); // non-Error
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockGzip.write).toHaveBeenCalledWith(expect.stringContaining("string error"));
  });

  it("should handle gzip.write error in catch", async () => {
    mockReq.query = { start: "2023-01-01", bbox: "1,2,3,4" };
    mockStreamDay.mockRejectedValue(new Error("Stream error"));
    mockGzip.write.mockImplementation(() => { throw new Error("Write error"); });
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v2/nsjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);
    expect(mockGzip.write).toHaveBeenCalledWith(expect.stringContaining("Error"));
    expect(mockGzip.end).toHaveBeenCalled();
  });
});
