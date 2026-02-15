import React, { useMemo, useState } from "react";
import Tabs from "./Tabs";
import AllocationPanel from "./AllocationPanel";
import { severityLabel } from "../utils/severity";
import {
  severityBuckets,
  reportsPerDay,
  hotspotCantonTop,
} from "../analytics/aggregates";
import { formatCRLabel } from "../utils/geocoding";

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

export default function AnalysisPanel({ selected, reports, selectedCanton, onSelectCanton }) {
  const [tab, setTab] = useState("allocation");

  const sevData = useMemo(() => severityBuckets(reports), [reports]);
  const perDay = useMemo(() => reportsPerDay(reports), [reports]);
  const hotspots = useMemo(() => hotspotCantonTop(reports, 5), [reports]);

  const tabs = [
    { key: "allocation", label: "Allocation" },
    { key: "analytics", label: "Analytics" },
  ];

  // Generate location label from stored geo data
  const locationLabel = selected?.geo
    ? formatCRLabel(selected.geo, selected.lat, selected.lng)
    : "Resolviendo dirección…";



  return (
    <aside className="panel analysis">
      <div className="panel-head">
        <div className="panel-title">Analysis</div>
        <div className="panel-meta">Decision support</div>
      </div>

      <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {tab === "allocation" ? (
        <AllocationPanel 
          reports={reports}
          selectedCanton={selectedCanton}
          onSelectCanton={onSelectCanton}
        />
      ) : tab === "analytics" ? (
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
            <div className="k">Top hotspots by canton</div>
            <div className="caption" style={{ marginTop: 6 }}>
              Grouped by canton from reverse geocoding data.
            </div>

            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {hotspots.map((h) => (
                <div
                  key={h.canton}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "8px 10px",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <span>{h.canton}</span>
                  <span className="mono">{h.count}</span>
                </div>
              ))}
              {hotspots.length === 0 ? (
                <div style={{ opacity: 0.8 }}>No data yet.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
