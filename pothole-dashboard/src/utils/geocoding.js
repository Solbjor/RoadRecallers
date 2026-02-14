// OpenStreetMap Nominatim reverse geocoding
// Usage policy: https://operations.osmfoundation.org/policies/nominatim/

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

// Cache to avoid repeated requests for the same coordinates
const cache = new Map();

/**
 * Convert lat/lng to human-readable address
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Address details
 */
export async function reverseGeocode(lat, lng) {
  // Round coordinates to reduce cache misses for nearby points
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    // Important: Include User-Agent header and email per Nominatim usage policy
    const response = await fetch(
      `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          "User-Agent": "PotholeDashboard/1.0 (contact@yourapp.com)", // Replace with your info
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();
    
    const result = {
      display_name: data.display_name,
      address: data.address,
      // Extract useful location info
      city: data.address?.city || data.address?.town || data.address?.village,
      district: data.address?.state_district || data.address?.county,
      state: data.address?.state,
      country: data.address?.country,
      postcode: data.address?.postcode,
      road: data.address?.road,
    };

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return null;
  }
}

/**
 * Batch reverse geocode multiple coordinates with rate limiting
 * @param {Array<{lat: number, lng: number}>} coordinates 
 * @param {number} delayMs - Delay between requests (respect 1 request/sec limit)
 * @returns {Promise<Array>}
 */
export async function batchReverseGeocode(coordinates, delayMs = 1000) {
  const results = [];
  
  for (const coord of coordinates) {
    const result = await reverseGeocode(coord.lat, coord.lng);
    results.push({ ...coord, location: result });
    
    // Rate limiting: wait between requests
    if (coordinates.indexOf(coord) < coordinates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

/**
 * Get a simple location label from coordinates
 * @param {number} lat 
 * @param {number} lng 
 * @returns {Promise<string>}
 */
export async function getLocationLabel(lat, lng) {
  const result = await reverseGeocode(lat, lng);
  
  if (!result) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  
  // Build a nice label: "Road, City" or "City, District" or similar
  const parts = [
    result.road,
    result.city || result.district,
  ].filter(Boolean);
  
  return parts.length > 0 ? parts.join(", ") : result.display_name;
}
