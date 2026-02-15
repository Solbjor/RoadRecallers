// src/utils/geocoding.js
const cache = new Map();

function key(lat, lng) {
  // Round to 5 decimals for caching (~1m precision)
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/**
 * Validate and potentially fix Costa Rica coordinates
 * CR bounds: lat 8-11, lng -86 to -82
 */
function validateCoordinates(lat, lng) {
  // Check if coordinates are swapped (common error)
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null; // Invalid
  }
  
  // If lat looks like longitude and vice versa, swap
  if (lat < -82 && lat > -86 && lng > 8 && lng < 11) {
    return { lat: lng, lng: lat, swapped: true };
  }
  
  // Validate Costa Rica bounds
  if (lat < 5 || lat > 12 || lng < -87 || lng > -82) {
    return { lat, lng, outsideCR: true };
  }
  
  return { lat, lng, valid: true };
}

/**
 * Normalize Costa Rica province names from Nominatim
 */
function normalizeProvince(rawProvince) {
  if (!rawProvince) return "";
  
  const normalized = rawProvince.trim().toLowerCase();
  
  // Map common variations to standard CR provinces
  const provinceMap = {
    "san josé": "San José",
    "san jose": "San José",
    "sanjose": "San José",
    "provincia de san josé": "San José",
    "alajuela": "Alajuela",
    "provincia de alajuela": "Alajuela",
    "cartago": "Cartago",
    "provincia de cartago": "Cartago",
    "heredia": "Heredia",
    "provincia de heredia": "Heredia",
    "guanacaste": "Guanacaste",
    "provincia de guanacaste": "Guanacaste",
    "puntarenas": "Puntarenas",
    "provincia de puntarenas": "Puntarenas",
    "limón": "Limón",
    "limon": "Limón",
    "provincia de limón": "Limón",
  };
  
  return provinceMap[normalized] || rawProvince;
}

/**
 * Normalize Costa Rica canton names from Nominatim
 */
function normalizeCanton(rawCanton) {
  if (!rawCanton) return "";
  
  const canton = rawCanton.trim();
  
  // Remove "Cantón de" prefix if present
  if (canton.toLowerCase().startsWith("cantón de ")) {
    return canton.substring(10);
  }
  if (canton.toLowerCase().startsWith("canton de ")) {
    return canton.substring(10);
  }
  
  return canton;
}

// NOTE: For production, proxy this through your backend.
// For hackathon + small volume, direct Nominatim calls are usually fine.
export async function reverseGeocode(lat, lng) {
  // Validate coordinates
  const validation = validateCoordinates(lat, lng);
  if (!validation) {
    throw new Error(`Invalid coordinates: ${lat}, ${lng}`);
  }
  
  // Use validated/corrected coordinates
  const useLat = validation.lat;
  const useLng = validation.lng;
  
  const k = key(useLat, useLng);
  if (cache.has(k)) {
    const cached = cache.get(k);
    if (validation.swapped) {
      cached.warning = "Coordinates were swapped (lat/lng)";
    }
    return cached;
  }

  const url =
    `https://nominatim.openstreetmap.org/reverse?` +
    new URLSearchParams({
      format: "jsonv2",
      lat: String(useLat),
      lon: String(useLng),
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

  // Costa Rica field mapping with normalization
  const road = a.road || a.pedestrian || a.cycleway || a.path || a.street || "";
  const district = a.suburb || a.neighbourhood || a.quarter || a.village || a.hamlet || "";
  
  // Canton: county is most reliable for CR
  const rawCanton = a.county || a.municipality || a.city_district || a.city || a.town || "";
  const canton = normalizeCanton(rawCanton);
  
  // Province: state is most common
  const rawProvince = a.state || a.province || a.region || "";
  const province = normalizeProvince(rawProvince);
  
  const country = a.country || "";

  const parts = {
    display: data.display_name || "",
    road,
    district,
    canton,
    province,
    country,
  };
  
  if (validation.swapped) {
    parts.warning = "Coordinates were swapped (lat/lng)";
  }
  if (validation.outsideCR) {
    parts.warning = "Coordinates outside Costa Rica bounds";
  }

  cache.set(k, parts);
  return parts;
}

export function formatCRLabel(parts, lat, lng) {
  if (!parts) return `lat ${lat.toFixed(4)}, lng ${lng.toFixed(4)}`;

  // Prefer street + canton + province when available
  const road = parts.road ? parts.road : null;
  const canton = parts.canton ? parts.canton : null;
  const province = parts.province ? parts.province : null;

  const components = [road, canton, province].filter(Boolean);
  
  if (components.length === 0) {
    return `lat ${lat.toFixed(4)}, lng ${lng.toFixed(4)}`;
  }
  
  return components.join(", ");
}
