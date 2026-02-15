import React from "react";
import moptLogo from "../assets/MoptLogo.jpeg";

export default function TopBar({ onAddSample }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img src={moptLogo} alt="MOPT Logo" className="mopt-logo" />
        <div>
          <div className="title">MOPT Community Reports Dashboard</div>
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
