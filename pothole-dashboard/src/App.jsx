import React, { useEffect, useMemo, useState } from "react";
import TopBar from "./components/TopBar";
import ReportList from "./components/ReportList";
import MapView from "./components/MapView";
import AnalysisPanel from "./components/AnalysisPanel";
import CantonSummary from "./components/CantonSummary";
import { seedReports } from "./utils/seedReports";
import { reverseGeocode } from "./utils/geocoding";

// API configuration
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

// Photo URL resolver for backend-relative paths
export function resolvePhotoUrl(photoUrl) {
  if (!photoUrl) return "";
  if (photoUrl.startsWith("http")) return photoUrl;
  if (photoUrl.startsWith("/")) return `${API_BASE}${photoUrl}`;
  return `${API_BASE}/${photoUrl}`;
}

export default function App() {
  const [reports, setReports] = useState(seedReports);
  const [selectedId, setSelectedId] = useState(seedReports[0]?.id);
  const [selectedCanton, setSelectedCanton] = useState(null);

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) || null,
    [reports, selectedId]
  );

  // Filter reports by selected canton
  const filteredReports = useMemo(() => {
    if (!selectedCanton) return reports;
    
    return reports.filter((r) => {
      const province = (r.geo?.province || "Unknown Province").trim();
      const canton = (r.geo?.canton || "Unknown Canton").trim();
      const key = `${province}__${canton}`;
      return key === selectedCanton;
    });
  }, [reports, selectedCanton]);

  function addSampleReport() {
    // Major Costa Rican cities/regions as seed points
    // This ensures reports are near actual populated areas
    const seedLocations = [
      { lat: 9.9281, lng: -84.0907, name: "San José" },
      { lat: 10.0162, lng: -84.2166, name: "Alajuela" },
      { lat: 9.8626, lng: -83.9152, name: "Cartago" },
      { lat: 9.9981, lng: -84.1170, name: "Heredia" },
      { lat: 10.6346, lng: -85.4406, name: "Liberia" },
      { lat: 9.9753, lng: -84.8322, name: "Puntarenas", coastalConstraint: "inland-north-east" },
      { lat: 10.0000, lng: -83.0333, name: "Limón", coastalConstraint: "inland-west-south" },
      { lat: 9.3730, lng: -83.7352, name: "Pérez Zeledón" },
      { lat: 10.4639, lng: -84.6446, name: "Cañas" },
      { lat: 9.4500, lng: -84.1667, name: "Puriscal" },
    ];
    
    // Pick a random seed location
    const seed = seedLocations[Math.floor(Math.random() * seedLocations.length)];
    
    // Generate coordinates within ~30km radius of seed point
    // (roughly 0.27 degrees = 30km at Costa Rica's latitude)
    let offsetLat, offsetLng;
    
    if (seed.coastalConstraint === "inland-west-south") {
      // Limón (Caribbean coast): Only generate west and south (inland)
      // Avoid east (ocean)
      offsetLat = -Math.random() * 0.27; // South only (negative)
      offsetLng = -Math.random() * 0.27; // West only (negative)
    } else if (seed.coastalConstraint === "inland-north-east") {
      // Puntarenas (Pacific coast): Only generate north and east (inland)
      // Avoid south/southeast/southwest (ocean)
      offsetLat = Math.random() * 0.27; // North only (positive)
      offsetLng = Math.random() * 0.27; // East only (positive, toward inland)
    } else {
      // Inland cities: any direction
      offsetLat = (Math.random() - 0.5) * 0.54; // ±27km
      offsetLng = (Math.random() - 0.5) * 0.54; // ±27km
    }
    
    const randomLat = seed.lat + offsetLat;
    const randomLng = seed.lng + offsetLng;
    
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
    const randomConfidence = Math.random() * 0.3 + 0.65; // 0.65 to 0.95
    
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
      pothole_confidence: randomConfidence,
      photoUrl:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=60",
    };

    setReports((prev) => [newReport, ...prev]);
    setSelectedId(newReport.id);
  }

  // Poll backend for new WhatsApp reports
  useEffect(() => {
    let intervalId;

    async function fetchReports() {
      try {
        console.log('[POLL] Fetching from:', API_BASE);
        const response = await fetch(`${API_BASE}/reports`, {
          headers: {
            'ngrok-skip-browser-warning': '69420'
          }
        });
        if (!response.ok) {
          console.log('[POLL] Response not OK:', response.status);
          return;
        }
        
        const backendReports = await response.json();
        console.log('[POLL] Backend reports received:', backendReports.length);
        if (backendReports.length > 0) {
          console.log('[POLL] First ID:', backendReports[0]?.id, 'Last ID:', backendReports[backendReports.length - 1]?.id);
        }
        
        setReports((prev) => {
          console.log('[POLL] Current reports before merge:', prev.length);
          
          // Create a map for deduplication (backend version wins)
          const reportsMap = new Map();
          
          // Add all backend reports first (these are source of truth)
          backendReports.forEach(r => reportsMap.set(r.id, r));
          
          // Add seed reports that aren't in backend (keep demo data)
          prev.forEach(r => {
            if (!reportsMap.has(r.id)) {
              reportsMap.set(r.id, r);
            }
          });
          
          // Convert back to array
          const merged = Array.from(reportsMap.values());
          
          // Sort by timestamp - newest first
          merged.sort((a, b) => {
            const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
            const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
            return timeB - timeA; // Descending order (newest first)
          });
          
          console.log('[POLL] Merged reports:', merged.length, 'First ID:', merged[0]?.id);
          
          // Force new array reference to trigger React update
          return [...merged];
        });
      } catch (error) {
        console.debug('[POLL] Fetch error:', error.message);
      }
    }

    // Initial fetch
    fetchReports();

    // Poll every 3 seconds
    intervalId = setInterval(fetchReports, 3000);

    return () => clearInterval(intervalId);
  }, []); // Empty deps - runs once on mount, cleans up on unmount

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
      {/* Debug Info & Filter Controls */}
      <div style={{ 
        padding: '8px 12px', 
        background: '#f0f2f5', 
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '12px',
        color: '#666'
      }}>
        <div>
          Total Reports: {reports.length} | Showing: {filteredReports.length}
          {selectedCanton && (
            <span style={{ marginLeft: '12px', color: '#1565c0', fontWeight: 600 }}>
              Filter: {selectedCanton.split('__')[1]}, {selectedCanton.split('__')[0]}
            </span>
          )}
        </div>
        {selectedCanton && (
          <button 
            onClick={() => setSelectedCanton(null)}
            style={{
              padding: '4px 10px',
              border: '1px solid #d0d4da',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            Clear Filter
          </button>
        )}
      </div>

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
          reports={filteredReports}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <MapView 
          reports={filteredReports} 
          onSelect={setSelectedId}
          selectedCanton={selectedCanton}
        />

        <AnalysisPanel 
          selected={selected} 
          reports={reports}
          selectedCanton={selectedCanton}
          onSelectCanton={setSelectedCanton}
        />
      </div>

      {/* Canton Summary Modal */}
      {selectedCanton && (
        <>
          {/* Backdrop */}
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              zIndex: 9999,
            }}
            onClick={() => setSelectedCanton(null)}
          />
          
          {/* Summary Panel */}
          <CantonSummary
            canton={{
              canton: selectedCanton.split('__')[1],
              province: selectedCanton.split('__')[0],
            }}
            reports={filteredReports}
            onSelectReport={setSelectedId}
            onClose={() => setSelectedCanton(null)}
          />
        </>
      )}
    </div>
  );
  
}
