import React, { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

// Fix missing Leaflet default marker icons in many bundlers
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Costa Rica center (rough)
const CR_CENTER = [9.7489, -83.7534];
const DEFAULT_ZOOM = 8;

// Simple severity → label + color hint (UI only)
function severityLabel(score) {
  if (score >= 0.8) return { text: "High", chip: "chip chip-high" };
  if (score >= 0.5) return { text: "Medium", chip: "chip chip-med" };
  return { text: "Low", chip: "chip chip-low" };
}

const seedReports = [
  {
    id: "cr-001",
    createdAt: "2026-02-14 10:21",
    lat: 9.9333,
    lng: -84.0833, // San José area
    title: "Deep pothole near intersection",
    notes: "Cars swerving into opposite lane. Visible water pooling.",
    severity: 0.86,
    photoUrl:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "cr-002",
    createdAt: "2026-02-14 11:02",
    lat: 10.0163,
    lng: -84.2116, // Alajuela-ish
    title: "Multiple cracks + pothole cluster",
    notes: "Road surface collapsing over ~15m stretch.",
    severity: 0.62,
    photoUrl:
      "https://images.unsplash.com/photo-1544986581-efac024faf62?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "cr-003",
    createdAt: "2026-02-14 12:10",
    lat: 9.9763,
    lng: -84.8384, // Puntarenas-ish
    title: "Small pothole, low risk",
    notes: "Annoying but passable. Might worsen with rain.",
    severity: 0.34,
    photoUrl:
      "https://images.unsplash.com/photo-1523413651479-597eb2da0ad6?auto=format&fit=crop&w=900&q=60",
  },
];

export default function App() {
  const [reports, setReports] = useState(seedReports);
  const [selectedId, setSelectedId] = useState(seedReports[0].id);

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) || reports[0],
    [reports, selectedId]
  );

  function addSampleReport() {
    // Mock a new incoming report near Liberia (Guanacaste)
    const newReport = {
      id: `cr-${String(reports.length + 1).padStart(3, "0")}`,
      createdAt: "2026-02-14 13:05",
      lat: 10.6346,
      lng: -85.4407,
      title: "Pothole near bridge approach",
      notes: "Sharp edge, likely tire damage at speed.",
      severity: 0.74,
      photoUrl:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=60",
    };
    setReports((prev) => [newReport, ...prev]);
    setSelectedId(newReport.id);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">CR</div>
          <div>
            <div className="title">Panel de Alertas Ministerio de Obras Publicas y Transporte</div>
            <div className="subtitle">Pothole Detection • Agency Dashboard</div>
          </div>
        </div>

        <div className="actions">
          <button className="btn" onClick={addSampleReport}>
            + Add sample report
          </button>
        </div>
      </header>

      <div className="content">
        {/* Left: report list */}
        <aside className="panel list">
          <div className="panel-head">
            <div className="panel-title">Incoming Reports</div>
            <div className="panel-meta">{reports.length} total</div>
          </div>

          <div className="list-scroll">
            {reports.map((r) => {
              const sev = severityLabel(r.severity);
              const active = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  className={`list-item ${active ? "active" : ""}`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className="li-top">
                    <div className="li-title">{r.title}</div>
                    <span className={sev.chip}>{sev.text}</span>
                  </div>
                  <div className="li-sub">
                    <span className="mono">{r.id}</span> • {r.createdAt}
                  </div>
                  <div className="li-notes">{r.notes}</div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Middle: map */}
        <main className="panel map">
          <div className="panel-head">
            <div className="panel-title">Map View</div>
            <div className="panel-meta">Click a marker to inspect</div>
          </div>

          <div className="map-wrap">
            <MapContainer center={CR_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {reports.map((r) => (
                <Marker
                  key={r.id}
                  position={[r.lat, r.lng]}
                  eventHandlers={{
                    click: () => setSelectedId(r.id),
                  }}
                >
                  <Popup>
                    <div style={{ maxWidth: 220 }}>
                      <div style={{ fontWeight: 700 }}>{r.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {r.id} • {r.createdAt}
                      </div>
                      <div style={{ marginTop: 6 }}>{r.notes}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </main>

        {/* Right: analysis */}
        <aside className="panel analysis">
          <div className="panel-head">
            <div className="panel-title">Analysis</div>
            <div className="panel-meta">Model output (demo)</div>
          </div>

          {selected ? (
            <div className="analysis-body">
              <div className="card">
                <div className="row">
                  <div>
                    <div className="k">Report</div>
                    <div className="v mono">{selected.id}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="k">Severity</div>
                    <div className="v">
                      <span className={severityLabel(selected.severity).chip}>
                        {severityLabel(selected.severity).text}
                      </span>{" "}
                      <span className="mono" style={{ marginLeft: 8 }}>
                        {selected.severity.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="divider" />

                <div className="k">Location</div>
                <div className="v mono">
                  lat {selected.lat.toFixed(4)}, lng {selected.lng.toFixed(4)}
                </div>

                <div className="k" style={{ marginTop: 10 }}>
                  Notes
                </div>
                <div className="v">{selected.notes}</div>

                <div className="k" style={{ marginTop: 10 }}>
                  Suggested Priority
                </div>
                <div className="v">
                  {selected.severity >= 0.8
                    ? "Dispatch within 24–48 hours (high risk to vehicles)."
                    : selected.severity >= 0.5
                    ? "Schedule repair within 1–2 weeks."
                    : "Monitor and re-check after heavy rain."}
                </div>
              </div>

              <div className="card">
                <div className="k">Photo</div>
                <div className="photo">
                  <img src={selected.photoUrl} alt="report" />
                </div>
                <div className="caption">
                  In the real version, this panel is produced by your AI model
                  (damage type + severity + confidence).
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 16, opacity: 0.8 }}>No report selected.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
