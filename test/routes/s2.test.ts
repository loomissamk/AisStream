// Mock external dependencies
jest.mock("got", () => ({
  get: jest.fn(),
}));
jest.mock("../../src/services/S2Service", () => ({
  searchSentinel2: jest.fn(),
  searchSentinel2Stream: jest.fn(),
}));
jest.mock("zod", () => ({
  string: jest.fn(),
  coerce: {
    number: jest.fn(() => ({
      optional: jest.fn(),
    })),
  },
  object: jest.fn(() => ({
    safeParse: jest.fn(),
  })),
}));

describe("S2 Route", () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockReq = { query: {} };
    mockRes = {
      setHeader: jest.fn(),
      writeHead: jest.fn(),
      write: jest.fn(),
      status: jest.fn(() => mockRes),
      json: jest.fn(),
      end: jest.fn(),
      type: jest.fn(() => mockRes),
      send: jest.fn(),
    };
  });

  describe("/v1/s2", () => {
    it("should return data for valid query", async () => {
      const mockData = { count: 1, scenes: [] };
      const searchSentinel2 = require("../../src/services/S2Service").searchSentinel2;
      (searchSentinel2 as jest.Mock).mockResolvedValue(mockData);

      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { start: "2023-01-01", end: "2023-01-02", bbox: "0,0,10,10" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockData);
    });

    it("should return 400 for missing start", async () => {
      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { end: "2023-01-02", bbox: "0,0,10,10" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "pass start, end, bbox" });
    });

    it("should return 400 for bad bbox", async () => {
      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { start: "2023-01-01", end: "2023-01-02", bbox: "0,0" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "bad bbox" });
    });

    it("should return 400 for bad datetime", async () => {
      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { start: "invalid", end: "2023-01-02", bbox: "0,0,10,10" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "bad datetime" });
    });

    it("should return 502 on service error", async () => {
      const searchSentinel2 = require("../../src/services/S2Service").searchSentinel2;
      (searchSentinel2 as jest.Mock).mockRejectedValue(new Error("test error"));

      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { start: "2023-01-01", end: "2023-01-02", bbox: "0,0,10,10" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(502);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "satellite search failed", detail: "test error" });
    });
  });

  describe("/v1/s2.ndjson", () => {
    it("should stream data for valid query", async () => {
      const mockScene = { type: "scene", id: "test" };
      const mockSummary = { type: "summary", count: 1 };
      const searchSentinel2Stream = require("../../src/services/S2Service").searchSentinel2Stream;
      (searchSentinel2Stream as jest.Mock).mockImplementation(async function* () {
        yield mockScene;
        yield mockSummary;
      });

      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2.ndjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { start: "2023-01-01", end: "2023-01-02", bbox: "0,0,10,10" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "application/x-ndjson; charset=utf-8");
      expect(mockRes.write).toHaveBeenCalledWith(JSON.stringify(mockScene) + "\n");
      expect(mockRes.write).toHaveBeenCalledWith(JSON.stringify(mockSummary) + "\n");
      expect(mockRes.end).toHaveBeenCalled();
    });

    it("should return 400 for invalid query", async () => {
      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2.ndjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { end: "2023-01-02", bbox: "0,0,10,10" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "pass start, end, bbox" });
    });

    it("should return 502 on stream error", async () => {
      const searchSentinel2Stream = require("../../src/services/S2Service").searchSentinel2Stream;
      (searchSentinel2Stream as jest.Mock).mockImplementation(async function* () {
        throw new Error("stream error");
        yield {};  
      });

      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2.ndjson")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { start: "2023-01-01", end: "2023-01-02", bbox: "0,0,10,10" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(502);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "satellite search failed", detail: "stream error" });
    });
  });

  describe("/v1/s2/quicklook", () => {
    it("should proxy image for valid href", async () => {
      const got = require("got");
      (got.get as jest.Mock).mockResolvedValue({
        statusCode: 200,
        headers: { "content-type": "image/jpeg" },
        body: Buffer.from("fake image"),
      });

      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2/quicklook")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { href: "https://example.com/image.jpg" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
      expect(mockRes.end).toHaveBeenCalledWith(Buffer.from("fake image"));
    });

    it("should return 400 for invalid href", async () => {
      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2/quicklook")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { href: "invalid" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.type).toHaveBeenCalledWith("text/plain");
      expect(mockRes.send).toHaveBeenCalledWith("bad quicklook href");
    });

    it("should return 502 for upstream error", async () => {
      const got = require("got");
      (got.get as jest.Mock).mockResolvedValue({
        statusCode: 404,
        headers: { "content-type": "text/plain" },
        body: "not found",
      });

      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2/quicklook")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { href: "https://example.com/image.jpg" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(502);
      expect(mockRes.type).toHaveBeenCalledWith("text/plain");
      expect(mockRes.send).toHaveBeenCalledWith("upstream 404\ntext/plain\nnot found");
    });

    it("should return 502 for non-image content", async () => {
      const got = require("got");
      (got.get as jest.Mock).mockResolvedValue({
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: "<html></html>",
      });

      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2/quicklook")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { href: "https://example.com/image.jpg" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(502);
      expect(mockRes.type).toHaveBeenCalledWith("text/plain");
      expect(mockRes.send).toHaveBeenCalledWith("expected image/*, got text/html\n<html></html>");
    });

    it("should return 502 on got error", async () => {
      const got = require("got");
      (got.get as jest.Mock).mockRejectedValue(new Error("network error"));

      const { s2Router } = require("../../src/routes/s2");
      const routeHandler = s2Router.stack.find((layer: any) => layer.route?.path === "/v1/s2/quicklook")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
      mockReq.query = { href: "https://example.com/image.jpg" };
      await routeHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(502);
      expect(mockRes.type).toHaveBeenCalledWith("text/plain");
      expect(mockRes.send).toHaveBeenCalledWith("network error");
    });
  });
});
