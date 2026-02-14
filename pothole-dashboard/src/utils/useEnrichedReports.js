import { useState, useEffect } from "react";
import { batchReverseGeocode } from "../utils/geocoding";

/**
 * Hook to enrich reports with location data
 * @param {Array} reports - Array of report objects with lat/lng
 * @param {boolean} enabled - Whether to fetch location data
 * @returns {Object} { enrichedReports, loading, error }
 */
export function useEnrichedReports(reports, enabled = true) {
  const [enrichedReports, setEnrichedReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !reports || reports.length === 0) {
      setEnrichedReports(reports);
      return;
    }

    let cancelled = false;

    async function enrichData() {
      setLoading(true);
      setError(null);

      try {
        // Extract unique coordinates to minimize API calls
        const uniqueCoords = [];
        const coordMap = new Map();

        reports.forEach(report => {
          const key = `${report.lat.toFixed(4)},${report.lng.toFixed(4)}`;
          if (!coordMap.has(key)) {
            coordMap.set(key, { lat: report.lat, lng: report.lng });
            uniqueCoords.push({ lat: report.lat, lng: report.lng });
          }
        });

        // Batch geocode unique coordinates
        const geocoded = await batchReverseGeocode(uniqueCoords);
        
        if (cancelled) return;

        // Create lookup map
        const locationLookup = new Map();
        geocoded.forEach(item => {
          const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
          locationLookup.set(key, item.location);
        });

        // Enrich reports with location data
        const enriched = reports.map(report => {
          const key = `${report.lat.toFixed(4)},${report.lng.toFixed(4)}`;
          const location = locationLookup.get(key);
          
          return {
            ...report,
            location,
            locationLabel: location 
              ? [location.road, location.city].filter(Boolean).join(", ") || location.display_name
              : `${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}`,
          };
        });

        setEnrichedReports(enriched);
      } catch (err) {
        console.error("Error enriching reports:", err);
        setError(err);
        setEnrichedReports(reports); // Fallback to original data
      } finally {
        setLoading(false);
      }
    }

    enrichData();

    return () => {
      cancelled = true;
    };
  }, [reports, enabled]);

  return { enrichedReports, loading, error };
}
