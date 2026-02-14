import React, { useEffect, useMemo, useState } from "react";
import Tabs from "./Tabs";
import { severityLabel } from "../utils/severity";
import {
  severityBuckets,
  reportsPerDay,
  hotspotGridTop,
} from "../analytics/aggregates";
import { getLocationLabel } from "../utils/geocoding";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";

const geoCache = new Map();

function cacheKey(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export default function AnalysisPanel({ selected, reports }) {
  const [tab, setTab] = useState("report");
  const [locationLabel, setLocationLabel] = useState("");

  const sevData = useMemo(() => severityBuckets(reports), [reports]);
  const perDay = useMemo(() => reportsPerDay(reports), [reports]);
  const hotspots = useMemo(() => hotspotGridTop(reports, 5), [reports]);

  const tabs = [
    { key: "report", label: "Report" },
    { key: "analytics", label: "Analytics" },
  ];

  // Fetch location when selected report changes
useEffect(() => {
  if (!selected) return;

  const key = cacheKey(selected.lat, selected.lng);

  // If we already resolved this location before, use cached value
  if (geoCache.has(key)) {
    setLocationLabel(geoCache.get(key));
    return;
  }

  let cancelled = false;
  setLocationLabel("Resolving address (approx.)…");

    getLocationLabel(selected.lat, selected.lng)
      .then((label) => {
        if (cancelled) return;

        const safeLabel =
          label && String(label).trim().length > 0
            ? `${label} (approx.)`
            : `lat ${selected.lat.toFixed(4)}, lng ${selected.lng.toFixed(4)}`;

        geoCache.set(key, safeLabel);
        setLocationLabel(safeLabel);
      })
      .catch(() => {
        if (cancelled) return;

        const fallback = `lat ${selected.lat.toFixed(4)}, lng ${selected.lng.toFixed(4)}`;
        geoCache.set(key, fallback);
        setLocationLabel(fallback);
      });

    return () => {
      cancelled = true;
    };
  }, [selected?.id]);



  return (
    <aside className="panel analysis">
      <div className="panel-head">
        <div className="panel-title">Analysis</div>
        <div className="panel-meta">MOPT decision support</div>
      </div>

      <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {tab === "report" ? (
        <div className="analysis-body">
          {selected ? (
            <>
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
                <div className="v">{locationLabel}</div>
                <div className="v mono" style={{ fontSize: '0.85em', opacity: 0.7 }}>
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
                    ? "Dispatch within 24–48 hours (high risk)."
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
                  Next: replace demo fields with AI output (damage type, bbox,
                  confidence).
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 16, opacity: 0.8 }}>No report selected.</div>
          )}
        </div>
      ) : (
        <div className="analysis-body">
          <div className="card">
            <div className="k">Severity distribution</div>
            <div style={{ height: 220, marginTop: 10 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sevData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#e74c3c" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="caption">
              Quick view of how many reports are low/medium/high priority.
            </div>
          </div>

          <div className="card">
            <div className="k">Reports over time</div>
            <div style={{ height: 220, marginTop: 10 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="caption">
              Uses the report timestamps. Later you can switch to hourly if
              needed.
            </div>
          </div>

          <div className="card">
            <div className="k">Top hotspots (coarse grid)</div>
            <div className="caption" style={{ marginTop: 6 }}>
              For now this groups by rounded lat/lng. Once reverse geocoding is
              added, replace this with top cantons/districts.
            </div>

            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {hotspots.map((h) => (
                <div
                  key={h.area}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "8px 10px",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <span className="mono">{h.area}</span>
                  <span className="mono">{h.count}</span>
                </div>
              ))}
              {hotspots.length === 0 ? (
                <div style={{ opacity: 0.8 }}>No data yet.</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
