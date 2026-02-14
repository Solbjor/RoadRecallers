import React from "react";
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

const CR_CENTER = [9.7489, -83.7534];
const DEFAULT_ZOOM = 8;

export default function MapView({ reports, onSelect }) {
  return (
    <main className="panel map">
      <div className="panel-head">
        <div className="panel-title">Map View</div>
        <div className="panel-meta">Costa Rica (foundation)</div>
      </div>

      <div className="map-wrap">
        <MapContainer center={CR_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {reports.map((r) => (
            <Marker
              key={r.id}
              position={[r.lat, r.lng]}
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
          ))}
        </MapContainer>
      </div>
    </main>
  );
}
