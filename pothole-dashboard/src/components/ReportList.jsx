import React from "react";
import { severityLabel } from "../utils/severity";

export default function ReportList({ reports, selectedId, onSelect }) {
  return (
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
              onClick={() => onSelect(r.id)}
              type="button"
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
  );
}
