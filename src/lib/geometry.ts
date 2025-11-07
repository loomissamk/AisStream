import * as turf from "@turf/turf";

type BBox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

export function bboxPolygon(bbox: string) {
  const coords = bbox.split(",").map(Number) as BBox;
  return turf.bboxPolygon(coords);
}

export function pointInPolygon(lon: number, lat: number, poly: ReturnType<typeof turf.bboxPolygon>) {
  return turf.booleanPointInPolygon(turf.point([lon, lat]), poly);
}
