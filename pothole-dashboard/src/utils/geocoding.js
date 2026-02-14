// src/utils/geocoding.js
const cache = new Map();

function key(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

// NOTE: For production, proxy this through your backend.
// For hackathon + small volume, direct Nominatim calls are usually fine.
export async function reverseGeocode(lat, lng) {
  const k = key(lat, lng);
  if (cache.has(k)) return cache.get(k);

  const url =
    `https://nominatim.openstreetmap.org/reverse?` +
    new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      zoom: "18",
      addressdetails: "1",
      // optional but helpful for demo etiquette:
      // email: "your-email@example.com",
      "accept-language": "es",
    }).toString();

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Reverse geocode failed: ${res.status}`);
  }

  const data = await res.json();
  const a = data.address || {};

  // Costa Rica mapping (best-effort; varies by OSM coverage)
  const road = a.road || a.pedestrian || a.cycleway || a.path || "";
  const district = a.suburb || a.neighbourhood || a.quarter || a.village || "";
  // "county" often maps closest to cantón in many places, but not always:
  const canton = a.county || a.municipality || a.city_district || a.city || "";
  const province = a.state || a.region || "";
  const country = a.country || "";

  const parts = {
    road,
    district,
    canton,
    province,
    country,
    display: data.display_name || "",
  };

  cache.set(k, parts);
  return parts;
}

export function formatCRLabel(parts, lat, lng) {
  if (!parts) return `lat ${lat.toFixed(4)}, lng ${lng.toFixed(4)}`;

  // Prefer street + canton + province when available
  const road = parts.road ? parts.road : null;
  const canton = parts.canton ? parts.canton : null;
  const province = parts.province ? parts.province : null;

  const label = [road, canton, province].filter(Boolean).join(", ");
  return label.length ? `${label} (aprox.)` : `lat ${lat.toFixed(4)}, lng ${lng.toFixed(4)}`;
}
