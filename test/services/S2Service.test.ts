// Mock external dependencies
jest.mock("got", () => ({
  post: jest.fn(),
  head: jest.fn(),
  get: jest.fn(),
}));
jest.mock("node:fs/promises", () => ({
  writeFile: jest.fn(),
  mkdir: jest.fn(),
}));
jest.mock("node:path", () => ({
  join: jest.fn(() => "/mock/path"),
}));

describe("S2Service", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.TITILER_BASE = "http://localhost:8000";
  });

  describe("searchSentinel2", () => {
    it("should return scenes for valid query", async () => {
      const got = require("got");
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          features: [
            {
              id: "S2A_MSIL2A_20230101T000000_T01ABC",
              properties: { datetime: "2023-01-01T00:00:00Z", "eo:cloud_cover": 10, "s2:product_type": "S2MSI2A" },
              geometry: { type: "Polygon" },
              assets: { B02: { href: "s3://bucket/B02.tif" }, B03: { href: "s3://bucket/B03.tif" }, B04: { href: "s3://bucket/B04.tif" } },
            },
          ],
        },
      });
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: { features: [] },
      });
      (got.head as jest.Mock).mockResolvedValue({ statusCode: 200 });

      const { searchSentinel2 } = require("../../src/services/S2Service");
      const result = await searchSentinel2({
        start: "2023-01-01",
        end: "2023-01-02",
        bbox: [0, 0, 10, 10],
        limit: 1,
      });

      expect(result.count).toBe(1);
      expect(result.scenes).toHaveLength(1);
      expect(result.scenes[0].id).toBe("S2A_MSIL2A_20230101T000000_T01ABC");
    });

    it("should filter by cloud cover", async () => {
      const got = require("got");
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          features: [
            {
              id: "S2A_MSIL2A_20230101T000000_T01ABC",
              properties: { datetime: "2023-01-01T00:00:00Z", "eo:cloud_cover": 50 },
              geometry: { type: "Polygon" },
            },
          ],
        },
      });
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: { features: [] },
      });

      const { searchSentinel2 } = require("../../src/services/S2Service");
      const result = await searchSentinel2({
        start: "2023-01-01",
        end: "2023-01-02",
        bbox: [0, 0, 10, 10],
        cloudLt: 20,
        limit: 1,
      });

      expect(result.count).toBe(0);
    });

    it("should filter by product type", async () => {
      const got = require("got");
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          features: [
            {
              id: "S2A_MSIL1C_20230101T000000_T01ABC",
              properties: { datetime: "2023-01-01T00:00:00Z", "s2:product_type": "S2MSI1C" },
              geometry: { type: "Polygon" },
            },
          ],
        },
      });
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: { features: [] },
      });

      const { searchSentinel2 } = require("../../src/services/S2Service");
      const result = await searchSentinel2({
        start: "2023-01-01",
        end: "2023-01-02",
        bbox: [0, 0, 10, 10],
        productType: "S2MSI2A",
        limit: 1,
      });

      expect(result.count).toBe(0);
    });

    it("should save quicklooks when save is true", async () => {
      const got = require("got");
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          features: [
            {
              id: "S2A_MSIL2A_20230101T000000_T01ABC",
              properties: { datetime: "2023-01-01T00:00:00Z" },
              geometry: { type: "Polygon" },
              assets: { quicklook: { href: "https://example.com/quicklook.jpg" } },
            },
          ],
        },
      });
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: { features: [] },
      });
      (got.get as jest.Mock).mockResolvedValue({
        statusCode: 200,
        body: Buffer.from("fake image"),
      });
      const fs = require("node:fs/promises");
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const { searchSentinel2 } = require("../../src/services/S2Service");
      await searchSentinel2({
        start: "2023-01-01",
        end: "2023-01-02",
        bbox: [0, 0, 10, 10],
        save: true,
        limit: 1,
      });

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it("should handle STAC provider error", async () => {
      const got = require("got");
      (got.post as jest.Mock).mockResolvedValue({
        statusCode: 500,
        body: {},
      });

      const { searchSentinel2 } = require("../../src/services/S2Service");
      const result = await searchSentinel2({
        start: "2023-01-01",
        end: "2023-01-02",
        bbox: [0, 0, 10, 10],
        limit: 1,
      });

      expect(result.count).toBe(0);
    });
  });

  describe("searchSentinel2Stream", () => {
    it("should yield scenes and summary", async () => {
      const got = require("got");
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          features: [
            {
              id: "S2A_MSIL2A_20230101T000000_T01ABC",
              properties: { datetime: "2023-01-01T00:00:00Z", "eo:cloud_cover": 10 },
              geometry: { type: "Polygon" },
            },
          ],
        },
      });
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: { features: [] },
      });

      const { searchSentinel2Stream } = require("../../src/services/S2Service");
      const results = [];
      for await (const item of searchSentinel2Stream({
        start: "2023-01-01",
        end: "2023-01-02",
        bbox: [0, 0, 10, 10],
        limit: 1,
      })) {
        results.push(item);
      }

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe("scene");
      expect(results[1].type).toBe("summary");
      expect(results[1].count).toBe(1);
    });

    it("should filter scenes in stream", async () => {
      const got = require("got");
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          features: [
            {
              id: "S2A_MSIL2A_20230101T000000_T01ABC",
              properties: { datetime: "2023-01-01T00:00:00Z", "eo:cloud_cover": 50 },
              geometry: { type: "Polygon" },
            },
          ],
        },
      });
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: { features: [] },
      });

      const { searchSentinel2Stream } = require("../../src/services/S2Service");
      const results = [];
      for await (const item of searchSentinel2Stream({
        start: "2023-01-01",
        end: "2023-01-02",
        bbox: [0, 0, 10, 10],
        cloudLt: 20,
        limit: 1,
      })) {
        results.push(item);
      }

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe("summary");
      expect(results[0].count).toBe(0);
    });

    it("should save quicklooks in stream", async () => {
      const got = require("got");
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: {
          features: [
            {
              id: "S2A_MSIL2A_20230101T000000_T01ABC",
              properties: { datetime: "2023-01-01T00:00:00Z" },
              geometry: { type: "Polygon" },
              assets: { quicklook: { href: "https://example.com/quicklook.jpg" } },
            },
          ],
        },
      });
      (got.post as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        body: { features: [] },
      });
      (got.get as jest.Mock).mockResolvedValue({
        statusCode: 200,
        body: Buffer.from("fake image"),
      });
      const fs = require("node:fs/promises");
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const { searchSentinel2Stream } = require("../../src/services/S2Service");
      for await (const _item of searchSentinel2Stream({
        start: "2023-01-01",
        end: "2023-01-02",
        bbox: [0, 0, 10, 10],
        save: true,
        limit: 1,
      })) {
        // consume stream
      }

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe("helpers", () => {
    it("should parse MGRS", () => {
      const { parseMgrs } = require("../../src/services/S2Service");
      const result = parseMgrs("S2A_MSIL2A_20230101T000000_T01ABC_");
      expect(result).toEqual({ zone: "01", latBand: "A", grid: "BC" });
    });

    it("should extract cloud cover", () => {
      const { cloudFrom } = require("../../src/services/S2Service");
      expect(cloudFrom({ "eo:cloud_cover": 10 })).toBe(10);
      expect(cloudFrom({ "s2:cloud_cover": "20" })).toBe(20);
      expect(cloudFrom({})).toBeUndefined();
    });

    it("should derive product type", () => {
      const { deriveProductType } = require("../../src/services/S2Service");
      expect(deriveProductType({ properties: { "s2:product_type": "S2MSI2A" } })).toBe("S2MSI2A");
      expect(deriveProductType({ id: "S2A_MSIL1C_" })).toBe("S2MSI1C");
      expect(deriveProductType({})).toBe("");
    });

    it("should convert s3 to https", () => {
      const { s3toHttps } = require("../../src/services/S2Service");
      expect(s3toHttps("s3://bucket/path")).toBe("https://bucket.s3.amazonaws.com/path");
      expect(s3toHttps("https://example.com")).toBe("https://example.com");
    });

    it("should check url exists", async () => {
      const got = require("got");
      (got.head as jest.Mock).mockResolvedValue({ statusCode: 200 });

      const { urlExists } = require("../../src/services/S2Service");
      const result = await urlExists("https://example.com");
      expect(result).toBe(true);
    });

    it("should build COG urls", () => {
      const { buildCogUrls } = require("../../src/services/S2Service");
      const result = buildCogUrls({ zone: "01", latBand: "A", grid: "BC" }, "2023-01-01T00:00:00Z");
      expect(result.B02).toContain("sentinel-cogs.s3.us-west-2.amazonaws.com");
      expect(result.B02).toContain("2023/1/1");
    });

    it("should create RGB tile template", () => {
      const { rgbTileTemplate } = require("../../src/services/S2Service");
      const result = rgbTileTemplate("red", "green", "blue");
      expect(result).toContain("http://localhost:8000/cog/tiles");
      expect(result).toContain("expression=rgb");
    });

    it("should create titiler preview", () => {
      const { titilerPreview } = require("../../src/services/S2Service");
      const result = titilerPreview("https://example.com/cog.tif");
      expect(result).toContain("/v1/s2/quicklook?href=");
    });
  });
});
