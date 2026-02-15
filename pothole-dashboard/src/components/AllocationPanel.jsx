import React, { useMemo } from "react";
import { buildCantonPriority, flattenPriorityTable } from "../analytics/allocation";

/**
 * Helper to create a unique canton key for filtering
 */
export function cantonKey(province, canton) {
  const p = (province || "Unknown Province").trim();
  const c = (canton || "Unknown Canton").trim();
  return `${p}__${c}`;
}

/**
 * Determine priority badge based on totalPriority percentiles
 */
function getPriorityBadge(totalPriority, allPriorities) {
  if (allPriorities.length === 0) return { level: "low", color: "#95a5a6" };
  
  // Sort priorities descending
  const sorted = [...allPriorities].sort((a, b) => b - a);
  const top20 = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const top70 = sorted[Math.floor(sorted.length * 0.7)] || 0;
  
  if (totalPriority >= top20) {
    return { level: "high", color: "#e74c3c" };
  } else if (totalPriority >= top70) {
    return { level: "medium", color: "#f39c12" };
  } else {
    return { level: "low", color: "#95a5a6" };
  }
}

/**
 * Format timestamp to readable date
 */
function formatDate(timestamp) {
  if (!timestamp) return "N/A";
  const date = new Date(timestamp);
  return date.toISOString().split('T')[0];
}

export default function AllocationPanel({ reports, selectedCanton, onSelectCanton }) {
  // Compute allocation data
  const allocationData = useMemo(() => {
    if (reports.length === 0) return { grouped: {}, flat: [], allPriorities: [] };
    
    const now = Date.now();
    const grouped = buildCantonPriority(reports, now, {
      radiusMeters: 750,
      maxBoostCount: 5,
    });
    const flat = flattenPriorityTable(grouped);
    const allPriorities = flat.map(r => r.totalPriority);
    
    return { grouped, flat, allPriorities };
  }, [reports]);

  const { grouped, flat, allPriorities } = allocationData;

  // Group rows by province for rendering
  const provinceGroups = useMemo(() => {
    const groups = {};
    for (const row of flat) {
      if (!groups[row.province]) {
        groups[row.province] = [];
      }
      groups[row.province].push(row);
    }
    return groups;
  }, [flat]);

  const handleRowClick = (province, canton) => {
    const key = cantonKey(province, canton);
    
    // Toggle selection: if same canton clicked, clear selection
    if (selectedCanton === key) {
      onSelectCanton(null);
    } else {
      onSelectCanton(key);
    }
  };

  if (reports.length === 0) {
    return (
      <div className="analysis-body">
        <div style={{ padding: 16, opacity: 0.8, textAlign: "center" }}>
          <p>No reports available for allocation analysis.</p>
          <p style={{ fontSize: "0.9em", marginTop: 8 }}>
            Add reports to see canton-level resource prioritization.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="analysis-body">
      <div className="card">
        <div className="k">Resource Allocation Priority</div>
        <div className="caption" style={{ marginTop: 6, marginBottom: 12 }}>
          Cantons ranked by repair priority. Click a row to filter map and reports.
        </div>

        <div className="allocation-table-wrap">
          {Object.keys(provinceGroups).length === 0 ? (
            <div style={{ opacity: 0.8, padding: 10 }}>No allocation data available.</div>
          ) : (
            Object.entries(provinceGroups).map(([province, cantons]) => (
              <div key={province} className="province-group">
                <div className="province-header">{province}</div>
                
                <div className="allocation-table">
                  <div className="allocation-row allocation-header">
                    <div className="col-canton">Canton</div>
                    <div className="col-priority">Priority</div>
                    <div className="col-reports">Reports</div>
                    <div className="col-severity">Avg Sev</div>
                    <div className="col-score">Score</div>
                    <div className="col-recent">Recent</div>
                  </div>

                  {cantons.map((canton) => {
                    const key = cantonKey(canton.province, canton.canton);
                    const isSelected = selectedCanton === key;
                    const badge = getPriorityBadge(canton.totalPriority, allPriorities);

                    return (
                      <div
                        key={key}
                        className={`allocation-row allocation-data ${isSelected ? "selected" : ""}`}
                        onClick={() => handleRowClick(canton.province, canton.canton)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="col-canton">
                          <span className="canton-name">{canton.canton}</span>
                        </div>
                        <div className="col-priority">
                          <span
                            className="priority-badge"
                            style={{ backgroundColor: badge.color }}
                          >
                            {badge.level.toUpperCase()}
                          </span>
                        </div>
                        <div className="col-reports mono">{canton.reportCount}</div>
                        <div className="col-severity mono">
                          {canton.avgSeverityWeighted.toFixed(2)}
                        </div>
                        <div className="col-score mono">
                          {canton.totalPriority.toFixed(2)}
                        </div>
                        <div className="col-recent mono">
                          {formatDate(canton.topRecentAt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="caption" style={{ marginTop: 12 }}>
          <strong>Score factors:</strong> Severity × Confidence × Recency × Clustering
        </div>
      </div>
    </div>
  );
}
