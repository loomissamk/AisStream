import { makeQueryKey } from "../../src/services/QueryKey";

describe("makeQueryKey", () => {
  it("should make key with bbox array", () => {
    const params = { bbox: [1, 2, 3, 4] as [number, number, number, number], start: "2023-01-01" };
    const key = makeQueryKey(params);
    expect(key).toBe("v2:1,2,3,4:2023-01-01::p5:s1:fndjson:gnone");
  });

  it("should make key with bbox string", () => {
    const params = { bbox: "1,2,3,4", start: "2023-01-01" };
    const key = makeQueryKey(params);
    expect(key).toBe("v2:1,2,3,4:2023-01-01::p5:s1:fndjson:gnone");
  });

  it("should make key with end", () => {
    const params = { bbox: [1, 2, 3, 4] as [number, number, number, number], start: "2023-01-01", end: "2023-01-02" };
    const key = makeQueryKey(params);
    expect(key).toBe("v2:1,2,3,4:2023-01-01:2023-01-02:p5:s1:fndjson:gnone");
  });

  it("should make key with precision", () => {
    const params = { bbox: [1, 2, 3, 4] as [number, number, number, number], start: "2023-01-01", precision: 6 };
    const key = makeQueryKey(params);
    expect(key).toBe("v2:1,2,3,4:2023-01-01::p6:s1:fndjson:gnone");
  });

  it("should make key with sample", () => {
    const params = { bbox: [1, 2, 3, 4] as [number, number, number, number], start: "2023-01-01", sample: 2 };
    const key = makeQueryKey(params);
    expect(key).toBe("v2:1,2,3,4:2023-01-01::p5:s2:fndjson:gnone");
  });

  it("should make key with format", () => {
    const params = { bbox: [1, 2, 3, 4] as [number, number, number, number], start: "2023-01-01", format: "json" };
    const key = makeQueryKey(params);
    expect(key).toBe("v2:1,2,3,4:2023-01-01::p5:s1:fjson:gnone");
  });

  it("should make key with grid", () => {
    const params = { bbox: [1, 2, 3, 4] as [number, number, number, number], start: "2023-01-01", grid: "webmercator" };
    const key = makeQueryKey(params);
    expect(key).toBe("v2:1,2,3,4:2023-01-01::p5:s1:fndjson:gwebmercator");
  });

  it("should make key with all params", () => {
    const params = {
      bbox: [1, 2, 3, 4] as [number, number, number, number],
      start: "2023-01-01",
      end: "2023-01-02",
      precision: 6,
      sample: 2,
      format: "json",
      grid: "webmercator"
    };
    const key = makeQueryKey(params);
    expect(key).toBe("v2:1,2,3,4:2023-01-01:2023-01-02:p6:s2:fjson:gwebmercator");
  });
});
