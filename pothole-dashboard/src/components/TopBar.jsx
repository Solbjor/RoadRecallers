import React from "react";

export default function TopBar({ onAddSample }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo">CR</div>
        <div>
          <div className="title">MOPT Road Reports</div>
          <div className="subtitle">Pothole Detection • Agency Dashboard</div>
        </div>
      </div>

      <div className="actions">
        <button className="btn" onClick={onAddSample} type="button">
          + Add sample report
        </button>
      </div>
    </header>
  );
}
