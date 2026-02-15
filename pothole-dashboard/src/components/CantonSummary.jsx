import React from "react";

/**
 * Canton Summary Panel
 * Displays detailed statistics and photo gallery for selected canton
 */
export default function CantonSummary({ canton, reports, onSelectReport, onClose }) {
  if (!canton || reports.length === 0) {
    return null;
  }

  // Calculate canton statistics
  const reportCount = reports.length;
  const avgSeverity = reports.reduce((sum, r) => sum + (r.severity || 0.5), 0) / reportCount;
  
  // Severity distribution
  const severityBuckets = { high: 0, medium: 0, low: 0 };
  reports.forEach(r => {
    const s = r.severity || 0.5;
    if (s >= 0.7) severityBuckets.high++;
    else if (s >= 0.4) severityBuckets.medium++;
    else severityBuckets.low++;
  });

  // Recent reports (last 7 days)
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
  const recentReports = reports.filter(r => {
    const timestamp = new Date(r.createdAt).getTime();
    return timestamp >= sevenDaysAgo;
  });

  // Extract photos (up to 4)
  const reportsWithPhotos = reports.filter(r => r.photoUrl);
  const photoGallery = reportsWithPhotos.slice(0, 4);

  // Aggregate roads (if available)
  const roadCounts = {};
  reports.forEach(r => {
    if (r.geo?.road) {
      roadCounts[r.geo.road] = (roadCounts[r.geo.road] || 0) + 1;
    }
  });
  const topRoads = Object.entries(roadCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Severity analysis
  const highPct = ((severityBuckets.high / reportCount) * 100).toFixed(0);
  const medPct = ((severityBuckets.medium / reportCount) * 100).toFixed(0);
  const lowPct = ((severityBuckets.low / reportCount) * 100).toFixed(0);

  const cantonKey = `${canton.province}/${canton.canton}`;

  return (
    <div className="canton-summary-panel">
      <div className="canton-summary-header">
        <div>
          <div className="canton-summary-title">
            {canton.canton}, {canton.province}
          </div>
          <div className="canton-summary-subtitle">
            {reportCount} report{reportCount !== 1 ? 's' : ''} • Avg Severity {(avgSeverity * 100).toFixed(0)}%
          </div>
        </div>
        <button className="canton-close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="canton-summary-body">
        {/* Statistics Grid */}
        <div className="canton-stats-grid">
          <div className="canton-stat-card">
            <div className="canton-stat-label">Total Reports</div>
            <div className="canton-stat-value">{reportCount}</div>
          </div>

          <div className="canton-stat-card">
            <div className="canton-stat-label">Avg Severity</div>
            <div className="canton-stat-value">{(avgSeverity * 100).toFixed(0)}%</div>
          </div>

          <div className="canton-stat-card">
            <div className="canton-stat-label">Last 7 Days</div>
            <div className="canton-stat-value">{recentReports.length}</div>
          </div>
        </div>

        {/* Severity Distribution */}
        <div className="canton-severity-dist">
          <div className="canton-section-title">Severity Distribution</div>
          <div className="severity-bars">
            <div className="severity-bar">
              <div className="severity-bar-label">
                <span className="severity-dot" style={{ background: '#e74c3c' }}></span>
                High ({highPct}%)
              </div>
              <div className="severity-bar-track">
                <div 
                  className="severity-bar-fill" 
                  style={{ width: `${highPct}%`, background: '#e74c3c' }}
                ></div>
              </div>
              <div className="severity-bar-count">{severityBuckets.high}</div>
            </div>

            <div className="severity-bar">
              <div className="severity-bar-label">
                <span className="severity-dot" style={{ background: '#f39c12' }}></span>
                Medium ({medPct}%)
              </div>
              <div className="severity-bar-track">
                <div 
                  className="severity-bar-fill" 
                  style={{ width: `${medPct}%`, background: '#f39c12' }}
                ></div>
              </div>
              <div className="severity-bar-count">{severityBuckets.medium}</div>
            </div>

            <div className="severity-bar">
              <div className="severity-bar-label">
                <span className="severity-dot" style={{ background: '#5abc8a' }}></span>
                Low ({lowPct}%)
              </div>
              <div className="severity-bar-track">
                <div 
                  className="severity-bar-fill" 
                  style={{ width: `${lowPct}%`, background: '#5abc8a' }}
                ></div>
              </div>
              <div className="severity-bar-count">{severityBuckets.low}</div>
            </div>
          </div>
        </div>

        {/* Top Roads */}
        {topRoads.length > 0 && (
          <div className="canton-roads">
            <div className="canton-section-title">Top Affected Roads</div>
            <div className="roads-list">
              {topRoads.map(([road, count]) => (
                <div key={road} className="road-item">
                  <span className="road-name">{road}</span>
                  <span className="road-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Damage Descriptions */}
        <div className="canton-damage-reports">
          <div className="canton-section-title">Damage Reports Summary</div>
          <div className="damage-reports-list">
            {reports.map((report, idx) => (
              <div key={report.id} className="damage-report-item">
                <div className="damage-report-header">
                  <span className="damage-report-id">{report.id}</span>
                  <span className="damage-report-severity" style={{
                    background: report.severity >= 0.7 ? '#e74c3c' : 
                                report.severity >= 0.4 ? '#f39c12' : '#5abc8a',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: '700',
                    color: 'white'
                  }}>
                    {(report.severity * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="damage-report-title">{report.title}</div>
                {report.geo?.road && (
                  <div className="damage-report-street">📍 {report.geo.road}</div>
                )}
                <div className="damage-report-notes">{report.notes}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Analysis Summary */}
        <div className="canton-analysis">
          <div className="canton-section-title">Analysis</div>
          <div className="analysis-text">
            {severityBuckets.high > severityBuckets.medium + severityBuckets.low ? (
              <p><strong>High priority canton:</strong> Majority of reports ({highPct}%) are high-severity. Immediate attention recommended.</p>
            ) : severityBuckets.high > reportCount * 0.3 ? (
              <p><strong>Mixed severity:</strong> Significant high-severity presence ({highPct}%). Regular monitoring advised.</p>
            ) : (
              <p><strong>Lower priority:</strong> Most reports are low-to-medium severity. Routine maintenance recommended.</p>
            )}
            
            {recentReports.length >= reportCount * 0.5 && (
              <p><strong>Active reporting:</strong> {recentReports.length} of {reportCount} reports submitted in the last 7 days.</p>
            )}

            {topRoads.length > 0 && topRoads[0][1] >= reportCount * 0.3 && (
              <p><strong>Clustering detected:</strong> {topRoads[0][0]} has {topRoads[0][1]} reports ({((topRoads[0][1] / reportCount) * 100).toFixed(0)}%).</p>
            )}
          </div>
        </div>

        {/* Photo Gallery */}
        {photoGallery.length > 0 && (
          <div className="canton-photos">
            <div className="canton-section-title">
              Damage Photos ({photoGallery.length}/{reportsWithPhotos.length})
            </div>
            <div className="photo-gallery">
              {photoGallery.map((report) => (
                <div 
                  key={report.id} 
                  className="photo-thumb"
                >
                  <img src={report.photoUrl} alt={report.title} />
                  <div className="photo-overlay">
                    <div className="photo-severity" style={{
                      background: report.severity >= 0.7 ? '#e74c3c' : 
                                  report.severity >= 0.4 ? '#f39c12' : '#5abc8a'
                    }}>
                      {(report.severity * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
