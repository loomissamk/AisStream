// Mock external dependencies
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
jest.mock("../../src/lib/urls", () => ({
  dailyUrls: jest.fn(),
}));
jest.mock("../../src/lib/geometry", () => ({
  bboxPolygon: jest.fn(),
  pointInPolygon: jest.fn(),
}));
jest.mock("../../src/lib/fetchDay", () => ({
  streamDay: jest.fn(),
}));
jest.mock("zlib", () => ({
  createGzip: jest.fn(() => ({
    pipe: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  })),
}));

describe("AIS Route", () => {
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
    };
  });

  it("should process valid query and stream data", async () => {
    const z = require("zod");
    const mockUrls = ["url1", "url2"];
    const mockAoi = { type: "Polygon" };
    (z.object as jest.Mock).mockReturnValue({
      safeParse: jest.fn(() => ({ success: true, data: { start: "2023-01-01", end: "2023-01-01", bbox: "0,0,10,10" } })),
    });
    const dailyUrls = require("../../src/lib/urls").dailyUrls;
    (dailyUrls as jest.Mock).mockReturnValue(mockUrls);
    const bboxPolygon = require("../../src/lib/geometry").bboxPolygon;
    (bboxPolygon as jest.Mock).mockReturnValue(mockAoi);
    const pointInPolygon = require("../../src/lib/geometry").pointInPolygon;
    (pointInPolygon as jest.Mock).mockReturnValue(true);
    const streamDay = require("../../src/lib/fetchDay").streamDay;
    (streamDay as jest.Mock).mockImplementation(async (url: string, onRow: (row: Record<string, unknown>) => void) => {
      onRow({ BaseDateTime: "2023-01-01T00:00:00Z", LAT: "5", LON: "5" });
    });

    // Import the module to trigger router setup
    const { router } = require("../../src/routes/ais");

    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v1/ais")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);

    expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "application/geo+json; charset=utf-8");
  });

  it("should return 400 for invalid query", async () => {
    const z = require("zod");
    (z.object as jest.Mock).mockReturnValue({
      safeParse: jest.fn(() => ({ success: false })),
    });

    const { router } = require("../../src/routes/ais");
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v1/ais")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "bad query" });
  });

  it("should handle gzipping correctly", async () => {
    const z = require("zod");
    const mockUrls = ["url1"];
    const mockAoi = { type: "Polygon" };
    (z.object as jest.Mock).mockReturnValue({
      safeParse: jest.fn(() => ({ success: true, data: { start: "2023-01-01", end: "2023-01-01", bbox: "0,0,10,10" } })),
    });
    const dailyUrls = require("../../src/lib/urls").dailyUrls;
    (dailyUrls as jest.Mock).mockReturnValue(mockUrls);
    const bboxPolygon = require("../../src/lib/geometry").bboxPolygon;
    (bboxPolygon as jest.Mock).mockReturnValue(mockAoi);
    const pointInPolygon = require("../../src/lib/geometry").pointInPolygon;
    (pointInPolygon as jest.Mock).mockReturnValue(true);
    const streamDay = require("../../src/lib/fetchDay").streamDay;
    (streamDay as jest.Mock).mockImplementation(async (url: string, onRow: (row: Record<string, unknown>) => void) => {
      onRow({ BaseDateTime: "2023-01-01T00:00:00Z", LAT: "5", LON: "5" });
    });
    const createGzip = require("zlib").createGzip;
    const mockGz = {
      pipe: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
    (createGzip as jest.Mock).mockReturnValue(mockGz);

    const { router } = require("../../src/routes/ais");
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v1/ais")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);

    expect(createGzip).toHaveBeenCalled();
    expect(mockGz.pipe).toHaveBeenCalledWith(mockRes);
    expect(mockGz.write).toHaveBeenCalledWith('{"type":"FeatureCollection","features":[');
    expect(mockGz.write).toHaveBeenCalledWith('{"type":"Feature","geometry":{"type":"Point","coordinates":[5,5]},"properties":{"BaseDateTime":"2023-01-01T00:00:00Z","LAT":"5","LON":"5"}}');
    expect(mockGz.write).toHaveBeenCalledWith("]}");
    expect(mockGz.end).toHaveBeenCalled();
  });

  it("should filter data by time and bbox", async () => {
    const z = require("zod");
    const mockUrls = ["url1"];
    const mockAoi = { type: "Polygon" };
    (z.object as jest.Mock).mockReturnValue({
      safeParse: jest.fn(() => ({ success: true, data: { start: "2023-01-01", end: "2023-01-01", bbox: "0,0,10,10" } })),
    });
    const dailyUrls = require("../../src/lib/urls").dailyUrls;
    (dailyUrls as jest.Mock).mockReturnValue(mockUrls);
    const bboxPolygon = require("../../src/lib/geometry").bboxPolygon;
    (bboxPolygon as jest.Mock).mockReturnValue(mockAoi);
    const pointInPolygon = require("../../src/lib/geometry").pointInPolygon;
    (pointInPolygon as jest.Mock).mockReturnValue(true); // Inside bbox
    const streamDay = require("../../src/lib/fetchDay").streamDay;
    (streamDay as jest.Mock).mockImplementation(async (url: string, onRow: (row: Record<string, unknown>) => void) => {
      onRow({ BaseDateTime: "2023-01-01T00:00:00Z", LAT: "5", LON: "5" });
    });
    const createGzip = require("zlib").createGzip;
    const mockGz = {
      pipe: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
    (createGzip as jest.Mock).mockReturnValue(mockGz);

    const { router } = require("../../src/routes/ais");
    const routeHandler = router.stack.find((layer: any) => layer.route?.path === "/v1/ais")?.route?.stack[0]?.handle as (req: any, res: any) => Promise<void>;
    await routeHandler(mockReq, mockRes);

    expect(mockGz.write).toHaveBeenCalledWith('{"type":"FeatureCollection","features":[');
    expect(mockGz.write).toHaveBeenCalledWith('{"type":"Feature","geometry":{"type":"Point","coordinates":[5,5]},"properties":{"BaseDateTime":"2023-01-01T00:00:00Z","LAT":"5","LON":"5"}}');
  });


});
