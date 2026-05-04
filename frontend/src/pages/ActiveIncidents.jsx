import { useEffect, useState } from "react";
import { get } from "../api/fetchAPI";

const ActiveIncidents = () => {
  const [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showRCA, setShowRCA] = useState(false);

  const fetchData = async () => {
    const data = await get("/work-items/open");
    setIncidents(data.result.rows);
  };

  const handleClose = async (id) => {
    try {
      await fetch(`http://localhost:3000/work-items/${id}/close`, {
        method: "POST"
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container">
      <h1>Active Incidents</h1>

      <div className="stats">
        <div className="stat-card">
          <span>Total</span>
          <strong>{incidents.length}</strong>
        </div>
      </div>

      <div className="incident-list">
        {incidents.map((item) => (
          <div key={item.id} className="incident-card" onClick={() => {setSelected(item); console.log("selected")}}>
            <div className="incident-info">
              <h2>{item.component_id}</h2>
              <p>Status: {item.status}</p>
              <p className={`severity ${item.severity}`}>
                {item.severity}
              </p>
            </div>

            <button
              className="close-btn"
              onClick={() => handleClose(item.id)}
            >
              Close
            </button>
          </div>
        ))}
      </div>

      {selected && !showRCA && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{selected.component_id}</h2>

            <p>Status: {selected.status}</p>
            <p>Severity: {selected.severity}</p>
            <p>Signals: {selected.signal_count}</p>

            <div className="modal-actions">
              <button
                className="close-btn"
                onClick={() => setShowRCA(true)}
              >
                Close Incident
              </button>

              <button onClick={() => setSelected(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && showRCA && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>RCA for {selected.component_id}</h2>
            <div className="form-group">
              <label>Incident Start</label>
              <input type="datetime-local" id="start" />
            </div>

            <div className="form-group">
              <label>Incident End</label>
              <input type="datetime-local" id="end" />
            </div>

            <div className="form-group">
              <label>Root Cause Category</label>
              <select id="category">
                <option>DB Issue</option>
                <option>API Failure</option>
                <option>Network</option>
                <option>Infra</option>
              </select>
            </div>

            <div className="form-group">
              <label>Fix Applied</label>
              <textarea id="fix" />
            </div>

            <div className="form-group">
              <label>Prevention Steps</label>
              <textarea id="prevention" />
            </div>

            <div className="modal-actions">
              <button
                className="close-btn"
                onClick={async () => {
                  const payload = {
                    incident_start: document.getElementById("start").value,
                    incident_end: document.getElementById("end").value,
                    rca_category: document.getElementById("category").value,
                    fix_applied: document.getElementById("fix").value,
                    prevention_steps: document.getElementById("prevention").value
                  };

                  await fetch(`http://localhost:3000/work-items/${selected.id}/rca`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                  });

                  await fetch(`http://localhost:3000/work-items/${selected.id}/close`, {
                    method: "POST"
                  });

                  setShowRCA(false);
                  setSelected(null);
                  fetchData();
                }}
              >
                Submit & Close
              </button>

              <button onClick={() => setShowRCA(false)}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ActiveIncidents;