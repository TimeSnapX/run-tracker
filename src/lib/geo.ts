const R = 6371008.8 // mean Earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180

/** Great-circle distance in metres between two lat/lon points. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function distanceBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return haversine(a.lat, a.lon, b.lat, b.lon)
}

/** Move a point by metres north/east (small distances; used for synthetic tracks/tests). */
export function offsetMetres(lat: number, lon: number, north: number, east: number): { lat: number; lon: number } {
  const dLat = north / R
  const dLon = east / (R * Math.cos(toRad(lat)))
  return { lat: lat + (dLat * 180) / Math.PI, lon: lon + (dLon * 180) / Math.PI }
}
