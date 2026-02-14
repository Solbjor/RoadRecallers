import { severityLabel } from "../utils/severity";

// Bucket by severity label
export function severityBuckets(reports) {
  const buckets = { Low: 0, Medium: 0, High: 0 };

  for (const r of reports) {
    const label = severityLabel(r.severity).text;
    buckets[label] += 1;
  }

  return [
    { name: "Low", count: buckets.Low },
    { name: "Medium", count: buckets.Medium },
    { name: "High", count: buckets.High },
  ];
}

// Reports per day (expects createdAt like "YYYY-MM-DD HH:mm")
export function reportsPerDay(reports) {
  const map = new Map();

  for (const r of reports) {
    const day = (r.createdAt || "").slice(0, 10) || "Unknown";
    map.set(day, (map.get(day) || 0) + 1);
  }

  // Sort by date string ascending
  return Array.from(map.entries())
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([day, count]) => ({ day, count }));
}

// "Hotspots" without geocoding: group by coarse grid cell.
// Later you can swap this to canton/province once reverse-geocoding is added.
export function hotspotGridTop(reports, topN = 5) {
  const cell = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const map = new Map();

  for (const r of reports) {
    const key = cell(r.lat, r.lng);
    map.set(key, (map.get(key) || 0) + 1);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([cellKey, count]) => ({ area: cellKey, count }));
}
