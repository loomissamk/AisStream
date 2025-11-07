import { bboxPolygon, pointInPolygon } from "../../src/lib/geometry";

describe("Geometry", () => {
  it("should create bbox polygon", () => {
    const bbox = "-10,-10,10,10";
    const poly = bboxPolygon(bbox);
    expect(poly.type).toBe("Feature");
    expect(poly.geometry.type).toBe("Polygon");
    expect(poly.geometry.coordinates[0]).toHaveLength(5); // closed ring
  });

  it("should check point in polygon", () => {
    const bbox = "-10,-10,10,10";
    const poly = bboxPolygon(bbox);
    expect(pointInPolygon(0, 0, poly)).toBe(true);
    expect(pointInPolygon(20, 20, poly)).toBe(false);
  });
});
