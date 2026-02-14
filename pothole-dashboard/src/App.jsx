import React, { useEffect, useMemo, useState } from "react";
import TopBar from "./components/TopBar";
import ReportList from "./components/ReportList";
import MapView from "./components/MapView";
import AnalysisPanel from "./components/AnalysisPanel";
import { seedReports } from "./utils/seedReports";
import { reverseGeocode } from "./utils/geocoding";

export default function App() {
  const [reports, setReports] = useState(seedReports);
  const [selectedId, setSelectedId] = useState(seedReports[0]?.id);

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) || null,
    [reports, selectedId]
  );

  function addSampleReport() {
    // Random location within Costa Rica bounds
    const costaRicaBounds = {
      latMin: 8.0,
      latMax: 11.2,
      lngMin: -86.0,
      lngMax: -82.5,
    };
    
    const randomLat = costaRicaBounds.latMin + 
      Math.random() * (costaRicaBounds.latMax - costaRicaBounds.latMin);
    const randomLng = costaRicaBounds.lngMin + 
      Math.random() * (costaRicaBounds.lngMax - costaRicaBounds.lngMin);
    
    const titles = [
      "Pothole near bridge approach",
      "Deep crack in pavement",
      "Multiple potholes in cluster",
      "Road surface deterioration",
      "Large pothole blocking lane",
    ];
    
    const notesList = [
      "Sharp edge, likely tire damage at speed.",
      "Water pooling, getting worse.",
      "Multiple reports from citizens.",
      "Needs immediate attention.",
      "Traffic is slowing to avoid damage.",
    ];
    
    const randomTitle = titles[Math.floor(Math.random() * titles.length)];
    const randomNotes = notesList[Math.floor(Math.random() * notesList.length)];
    const randomSeverity = Math.random() * 0.5 + 0.3; // 0.3 to 0.8
    
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const newReport = {
      id: `cr-${String(reports.length + 1).padStart(3, "0")}`,
      createdAt: timestamp,
      lat: randomLat,
      lng: randomLng,
      title: randomTitle,
      notes: randomNotes,
      severity: randomSeverity,
      photoUrl:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=60",
    };

    setReports((prev) => [newReport, ...prev]);
    setSelectedId(newReport.id);
  }
  useEffect(() => {
  let cancelled = false;

  async function enrichMissingGeo() {
    // Only geocode reports that don't have geo yet
    const missing = reports.filter(r => !r.geo);
    if (missing.length === 0) return;

    // IMPORTANT: keep requests low (sequential) to avoid rate limits
    const updates = [];
    for (const r of missing) {
      try {
        const parts = await reverseGeocode(r.lat, r.lng);
        updates.push({ id: r.id, geo: parts });
      } catch {
        updates.push({ id: r.id, geo: { canton: "Unknown", province: "", road: "" } });
      }
      if (cancelled) return;
    }

    // Apply updates
    setReports(prev =>
      prev.map(r => {
        const u = updates.find(x => x.id === r.id);
        return u ? { ...r, geo: u.geo } : r;
      })
    );
  }

  enrichMissingGeo();
  return () => { cancelled = true; };
}, [reports]); // ok for small demo; for bigger, trigger on add/report changes only

  return (
    <div className="shell">
      <TopBar onAddSample={addSampleReport} />

      <div className="content">
        <ReportList
          reports={reports}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <MapView reports={reports} onSelect={setSelectedId} />

        <AnalysisPanel selected={selected} reports={reports} />
      </div>
    </div>
  );
  
}
