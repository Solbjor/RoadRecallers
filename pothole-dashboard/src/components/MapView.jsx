import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import { computeReportScore } from "../analytics/allocation";

// Custom location marker icon for potholes
const potholeIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
      <circle cx="12" cy="12" r="11" fill="#e74c3c" stroke="#fff" stroke-width="2"/>
      <path d="M12 7v6M12 17v.01" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const CR_CENTER = [9.7489, -83.7534];
const DEFAULT_ZOOM = 8;

/**
 * Heatmap layer component
 */
function HeatmapLayer({ reports, weightMode }) {
  const map = useMap();

  useEffect(() => {
    if (!window.L || !window.L.heatLayer) return;

    // Convert reports to heat points
    const heatPoints = reports.map((r) => {
      let weight = 1; // Default: equal weight (count-based)
      
      if (weightMode === "score") {
        // Weight by severity * confidence * recency
        const { breakdown } = computeReportScore(r, reports, Date.now());
        weight = Math.max(0.1, breakdown.score); // Min 0.1 to ensure visibility
      } else if (weightMode === "severity") {
        weight = Math.max(0.1, r.severity || 0.5);
      }
      
      return [r.lat, r.lng, weight];
    });

    // Create heatmap layer
    const heat = L.heatLayer(heatPoints, {
      radius: 25,
      blur: 15,
      maxZoom: 13,
      max: 1.0,
      gradient: {
        0.0: '#0000ff',
        0.2: '#00ffff',
        0.4: '#00ff00',
        0.6: '#ffff00',
        0.8: '#ff8000',
        1.0: '#ff0000'
      }
    }).addTo(map);

    // Cleanup on unmount
    return () => {
      map.removeLayer(heat);
    };
  }, [map, reports, weightMode]);

  return null;
}

export default function MapView({ reports, onSelect }) {
  const [viewMode, setViewMode] = useState("markers"); // "markers" | "heatmap"
  const [heatWeight, setHeatWeight] = useState("count"); // "count" | "score" | "severity"

  return (
    <main className="panel map">
      <div className="panel-head">
        <div className="panel-title">Map View</div>
        <div className="panel-meta">Costa Rica (Centered)</div>
      </div>

      {/* Map controls */}
      <div style={{ 
        padding: '8px 12px', 
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`map-toggle-btn ${viewMode === 'markers' ? 'active' : ''}`}
            onClick={() => setViewMode('markers')}
          >
            Markers
          </button>
          <button
            className={`map-toggle-btn ${viewMode === 'heatmap' ? 'active' : ''}`}
            onClick={() => setViewMode('heatmap')}
          >
            Heatmap
          </button>
        </div>

        {viewMode === 'heatmap' && (
          <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Weight:</span>
            <select
              className="map-select"
              value={heatWeight}
              onChange={(e) => setHeatWeight(e.target.value)}
            >
              <option value="count">Count</option>
              <option value="severity">Severity</option>
              <option value="score">Priority Score</option>
            </select>
          </div>
        )}
      </div>

      <div className="map-wrap">
        <MapContainer center={CR_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {viewMode === "markers" ? (
            reports.map((r) => (
              <Marker
                key={r.id}
                position={[r.lat, r.lng]}
                icon={potholeIcon}
                eventHandlers={{ click: () => onSelect(r.id) }}
              >
                <Popup>
                  <div style={{ maxWidth: 240 }}>
                    <div style={{ fontWeight: 700 }}>{r.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {r.id} • {r.createdAt}
                    </div>
                    <div style={{ marginTop: 6 }}>{r.notes}</div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                      lat {r.lat.toFixed(4)}, lng {r.lng.toFixed(4)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))
          ) : (
            <HeatmapLayer reports={reports} weightMode={heatWeight} />
          )}
        </MapContainer>
      </div>
    </main>
  );
}
