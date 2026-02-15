/**
 * Example: Integrating Allocation Model into React Dashboard
 * 
 * This file demonstrates how to use the allocation model
 * in the existing AnalysisPanel component.
 */

import React, { useMemo } from 'react';
import {
  buildCantonPriority,
  flattenPriorityTable,
  computeReportScore,
} from '../analytics/allocation';

// ============================================
// Example 1: Add Priority Tab to AnalysisPanel
// ============================================

export function PriorityTab({ reports }) {
  const priorityData = useMemo(() => {
    const now = Date.now();
    const grouped = buildCantonPriority(reports, now);
    const flat = flattenPriorityTable(grouped);
    return flat.slice(0, 10); // Top 10
  }, [reports]);

  return (
    <div className="priority-tab">
      <h3>Resource Allocation Priority</h3>
      <p className="subtitle">Top cantons by repair priority</p>
      
      <table className="priority-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Province</th>
            <th>Canton</th>
            <th>Priority</th>
            <th>Reports</th>
            <th>Avg Severity</th>
          </tr>
        </thead>
        <tbody>
          {priorityData.map((canton, idx) => (
            <tr key={`${canton.province}-${canton.canton}`}>
              <td>{idx + 1}</td>
              <td>{canton.province}</td>
              <td>{canton.canton}</td>
              <td className="priority-score">
                {canton.totalPriority.toFixed(2)}
              </td>
              <td>{canton.reportCount}</td>
              <td>{(canton.avgSeverityWeighted * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <div className="legend">
        <p>Priority Score Factors:</p>
        <ul>
          <li>Severity × Confidence</li>
          <li>Recency (recent reports prioritized)</li>
          <li>Clustering (repair efficiency)</li>
        </ul>
      </div>
    </div>
  );
}

// ============================================
// Example 2: Add Priority Badge to Report List
// ============================================

export function ReportWithPriority({ report, allReports }) {
  const priorityInfo = useMemo(() => {
    const { breakdown } = computeReportScore(report, allReports);
    
    // Determine priority level
    let level = 'low';
    let color = '#95a5a6';
    
    if (breakdown.score > 0.8) {
      level = 'critical';
      color = '#e74c3c';
    } else if (breakdown.score > 0.6) {
      level = 'high';
      color = '#e67e22';
    } else if (breakdown.score > 0.4) {
      level = 'medium';
      color = '#f39c12';
    }
    
    return { level, color, score: breakdown.score };
  }, [report, allReports]);

  return (
    <div className="report-item">
      <div className="report-header">
        <span className="report-id">{report.id}</span>
        <span
          className="priority-badge"
          style={{ backgroundColor: priorityInfo.color }}
        >
          {priorityInfo.level.toUpperCase()}
        </span>
      </div>
      
      <div className="report-details">
        <p>Location: {report.geo?.canton}, {report.geo?.province}</p>
        <p>Severity: {(report.severity * 100).toFixed(0)}%</p>
        <p>Confidence: {(report.pothole_confidence * 100).toFixed(0)}%</p>
        <p className="priority-score">
          Priority Score: {priorityInfo.score.toFixed(3)}
        </p>
      </div>
    </div>
  );
}

// ============================================
// Example 3: Priority Heatmap Data
// ============================================

export function usePriorityHeatmap(reports) {
  return useMemo(() => {
    const now = Date.now();
    const grouped = buildCantonPriority(reports, now);
    
    // Convert to heatmap format for Leaflet
    const heatmapPoints = [];
    
    for (const province in grouped) {
      for (const canton of grouped[province]) {
        if (canton.topHotspotCenter) {
          // Intensity based on totalPriority
          // Normalize to 0-1 range (assuming max priority ~20)
          const intensity = Math.min(canton.totalPriority / 20, 1);
          
          heatmapPoints.push([
            canton.topHotspotCenter.lat,
            canton.topHotspotCenter.lng,
            intensity,
          ]);
        }
      }
    }
    
    return heatmapPoints;
  }, [reports]);
}

// ============================================
// Example 4: Add to Tabs Component
// ============================================

/*
In components/Tabs.jsx, add new tab:

const tabs = [
  { id: 'analysis', label: 'Analysis' },
  { id: 'priority', label: 'Priority' },  // NEW
  { id: 'reports', label: 'Reports' },
];

In components/AnalysisPanel.jsx:

import { PriorityTab } from './PriorityTab';

function AnalysisPanel({ reports, activeTab }) {
  if (activeTab === 'priority') {
    return <PriorityTab reports={reports} />;
  }
  
  // ... existing analysis tab code
}
*/

// ============================================
// Example 5: Export Priority Report as CSV
// ============================================

export function exportPriorityCSV(reports) {
  const now = Date.now();
  const grouped = buildCantonPriority(reports, now);
  const flat = flattenPriorityTable(grouped);
  
  // CSV header
  let csv = 'Rank,Province,Canton,Priority,Reports,AvgSeverity,AvgConfidence\n';
  
  // CSV rows
  flat.forEach((canton, idx) => {
    csv += `${idx + 1},`;
    csv += `"${canton.province}",`;
    csv += `"${canton.canton}",`;
    csv += `${canton.totalPriority.toFixed(2)},`;
    csv += `${canton.reportCount},`;
    csv += `${canton.avgSeverityWeighted.toFixed(3)},`;
    csv += `${canton.avgConfidence.toFixed(3)}\n`;
  });
  
  // Create download link
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mopt-priority-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================
// CSS Suggestions
// ============================================

/*
.priority-tab {
  padding: 1rem;
}

.priority-table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
}

.priority-table th,
.priority-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #ecf0f1;
}

.priority-table th {
  background-color: #34495e;
  color: white;
  font-weight: 600;
}

.priority-score {
  font-weight: bold;
  color: #e74c3c;
}

.priority-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  color: white;
  font-size: 0.75rem;
  font-weight: bold;
  text-transform: uppercase;
}

.legend {
  margin-top: 1.5rem;
  padding: 1rem;
  background-color: #ecf0f1;
  border-radius: 0.5rem;
}

.legend ul {
  margin: 0.5rem 0 0 1.5rem;
  padding: 0;
}
*/
