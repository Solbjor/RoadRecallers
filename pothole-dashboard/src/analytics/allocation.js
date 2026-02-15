/**
 * Resource Allocation Model (Prioritization Engine)
 * for Costa Rica MOPT Pothole Reporting Dashboard
 * 
 * This module provides deterministic, explainable prioritization
 * for repair allocation based on severity, confidence, recency, and clustering.
 * 
 * Key assumptions:
 * - createdAt can be ISO string or epoch milliseconds
 * - Missing severity/confidence defaults to 0.5 (medium uncertainty)
 * - Distance calculations use Haversine formula (sufficient for small areas)
 * - Clustering uses simple radius-based neighbor counting (O(n²) for demo scale)
 */

// ============================================
// UTILITY: Haversine Distance
// ============================================

/**
 * Calculate distance between two points using Haversine formula.
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lng1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lng2 - Longitude of point 2 (degrees)
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  
  const c = 2 * Math.asin(Math.sqrt(a));
  return R * c;
}

/**
 * Clamp value between 0 and 1.
 */
function clamp01(value) {
  if (typeof value !== "number" || isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Parse createdAt to timestamp (ms).
 * Accepts ISO string or epoch milliseconds.
 * Returns null if invalid.
 */
function parseTimestamp(createdAt) {
  if (!createdAt) return null;
  
  // If already a number (epoch ms)
  if (typeof createdAt === "number") {
    return isNaN(createdAt) ? null : createdAt;
  }
  
  // Try parsing as ISO string
  const parsed = new Date(createdAt).getTime();
  return isNaN(parsed) ? null : parsed;
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Compute recency weight based on how old the report is.
 * 
 * Weights:
 * - <= 1 day: 1.20 (most recent, highest priority)
 * - 1-3 days: 1.00 (baseline)
 * - 3-7 days: 0.85 (slightly lower)
 * - > 7 days: 0.70 (older reports)
 * 
 * @param {string|number} createdAt - ISO string or epoch milliseconds
 * @param {number} now - Current timestamp (epoch ms), defaults to Date.now()
 * @returns {number} Recency weight multiplier
 */
export function computeRecencyWeight(createdAt, now = Date.now()) {
  const timestamp = parseTimestamp(createdAt);
  
  // If invalid date, return neutral weight
  if (!timestamp) return 1.0;
  
  const ageMs = now - timestamp;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  
  if (ageDays <= 1) return 1.20;
  if (ageDays <= 3) return 1.00;
  if (ageDays <= 7) return 0.85;
  return 0.70;
}

/**
 * Compute cluster weight based on spatial proximity to other reports.
 * Higher density = higher priority (repair efficiency).
 * 
 * Formula: clusterWeight = 1 + min(neighborCount, maxBoostCount) * 0.08
 * 
 * @param {object} report - Report with lat, lng
 * @param {array} reports - All reports to check proximity
 * @param {number} radiusMeters - Radius to consider neighbors (default 750m)
 * @param {number} maxBoostCount - Max neighbors to count for boost (default 5)
 * @returns {number} Cluster weight multiplier (>= 1.0)
 * 
 * NOTE: O(n²) complexity - suitable for demo scale (~1000 reports).
 * For production scale, consider spatial indexing (e.g., geohash, R-tree).
 */
export function computeClusterWeight(
  report,
  reports,
  radiusMeters = 750,
  maxBoostCount = 5
) {
  if (!report.lat || !report.lng) return 1.0;
  
  let neighborCount = 0;
  
  for (const other of reports) {
    // Skip self
    if (other.id === report.id) continue;
    
    // Skip invalid coordinates
    if (!other.lat || !other.lng) continue;
    
    const distance = haversineDistance(
      report.lat,
      report.lng,
      other.lat,
      other.lng
    );
    
    if (distance <= radiusMeters) {
      neighborCount++;
    }
  }
  
  const effectiveNeighbors = Math.min(neighborCount, maxBoostCount);
  return 1 + effectiveNeighbors * 0.08;
}

/**
 * Compute overall priority score for a single report.
 * 
 * Score = severity × confidence × recencyWeight × clusterWeight
 * 
 * @param {object} report - Report object
 * @param {array} reports - All reports (for cluster calculation)
 * @param {number} now - Current timestamp
 * @param {object} options - { radiusMeters, maxBoostCount }
 * @returns {object} { score, breakdown }
 * 
 * breakdown = {
 *   severity: number,
 *   confidence: number,
 *   recencyWeight: number,
 *   clusterWeight: number,
 *   score: number,
 *   flags: array of warning strings
 * }
 */
export function computeReportScore(report, reports, now = Date.now(), options = {}) {
  const radiusMeters = options.radiusMeters || 750;
  const maxBoostCount = options.maxBoostCount || 5;
  
  const flags = [];
  
  // Handle missing severity/confidence
  let severity = report.severity;
  let confidence = report.pothole_confidence;
  
  if (severity == null || typeof severity !== "number" || isNaN(severity)) {
    severity = 0.5;
    flags.push("severity_missing");
  }
  
  if (confidence == null || typeof confidence !== "number" || isNaN(confidence)) {
    confidence = 0.5;
    flags.push("confidence_missing");
  }
  
  severity = clamp01(severity);
  confidence = clamp01(confidence);
  
  const recencyWeight = computeRecencyWeight(report.createdAt, now);
  const clusterWeight = computeClusterWeight(report, reports, radiusMeters, maxBoostCount);
  
  const score = severity * confidence * recencyWeight * clusterWeight;
  
  return {
    breakdown: {
      severity,
      confidence,
      recencyWeight,
      clusterWeight,
      score,
      flags,
    },
  };
}

/**
 * Build canton-level priority aggregation.
 * Groups reports by province then canton, calculates total priority.
 * 
 * @param {array} reports - All reports
 * @param {number} now - Current timestamp
 * @param {object} options - { radiusMeters, maxBoostCount }
 * @returns {object} Grouped by province → canton
 * 
 * Structure:
 * {
 *   "San José": [
 *     {
 *       province: "San José",
 *       canton: "Central",
 *       reportCount: 10,
 *       totalPriority: 8.5,
 *       avgSeverityWeighted: 0.75,
 *       avgConfidence: 0.82,
 *       topRecentAt: timestamp,
 *       topHotspotCenter: { lat, lng }
 *     },
 *     ...
 *   ],
 *   ...
 * }
 */
export function buildCantonPriority(reports, now = Date.now(), options = {}) {
  // Group reports by province → canton
  const provinceMap = new Map();
  
  for (const report of reports) {
    const province = report.geo?.province?.trim() || "Unknown Province";
    const canton = report.geo?.canton?.trim() || "Unknown Canton";
    
    if (!provinceMap.has(province)) {
      provinceMap.set(province, new Map());
    }
    
    const cantonMap = provinceMap.get(province);
    
    if (!cantonMap.has(canton)) {
      cantonMap.set(canton, []);
    }
    
    cantonMap.get(canton).push(report);
  }
  
  // Build aggregated data for each canton
  const result = {};
  
  for (const [province, cantonMap] of provinceMap.entries()) {
    result[province] = [];
    
    for (const [canton, cantonReports] of cantonMap.entries()) {
      let totalPriority = 0;
      let totalSeverity = 0;
      let totalConfidence = 0;
      let validScoreCount = 0;
      let topRecentAt = 0;
      let sumLat = 0;
      let sumLng = 0;
      let validCoordCount = 0;
      
      for (const report of cantonReports) {
        const { breakdown } = computeReportScore(report, reports, now, options);
        
        totalPriority += breakdown.score;
        totalSeverity += breakdown.severity * breakdown.score; // Weighted by score
        totalConfidence += breakdown.confidence;
        validScoreCount++;
        
        // Track most recent report timestamp
        const timestamp = parseTimestamp(report.createdAt);
        if (timestamp && timestamp > topRecentAt) {
          topRecentAt = timestamp;
        }
        
        // Accumulate coordinates for hotspot center
        if (report.lat && report.lng) {
          sumLat += report.lat;
          sumLng += report.lng;
          validCoordCount++;
        }
      }
      
      const reportCount = cantonReports.length;
      const avgSeverityWeighted = validScoreCount > 0 ? totalSeverity / totalPriority : 0;
      const avgConfidence = validScoreCount > 0 ? totalConfidence / validScoreCount : 0;
      
      const topHotspotCenter =
        validCoordCount > 0
          ? { lat: sumLat / validCoordCount, lng: sumLng / validCoordCount }
          : null;
      
      result[province].push({
        province,
        canton,
        reportCount,
        totalPriority,
        avgSeverityWeighted,
        avgConfidence,
        topRecentAt,
        topHotspotCenter,
      });
    }
    
    // Sort cantons within province by totalPriority desc
    result[province].sort((a, b) => b.totalPriority - a.totalPriority);
  }
  
  return result;
}

/**
 * Flatten priority table to single sorted array.
 * Returns all canton records sorted by totalPriority descending.
 * 
 * @param {object} grouped - Output from buildCantonPriority
 * @returns {array} Flat array of canton priority records
 */
export function flattenPriorityTable(grouped) {
  const allCantons = [];
  
  for (const province in grouped) {
    allCantons.push(...grouped[province]);
  }
  
  // Sort by totalPriority desc (stable sort)
  allCantons.sort((a, b) => b.totalPriority - a.totalPriority);
  
  return allCantons;
}
