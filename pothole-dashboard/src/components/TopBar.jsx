import React from "react";

export default function TopBar({ onAddSample }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div>
          <div className="title">Community Reports Dashboard</div>
          <div className="subtitle">Infrastructure damage tracking</div>
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
