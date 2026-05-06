import { useCallback, useEffect, useState } from "react";
import { get } from "../api/fetchAPI";
import socket from "../socket/socket"; 

const API_BASE_URL = "http://localhost:3000";

const initialRcaForm = {
  incident_start: "",
  incident_end: "",
  rca_category: "DB Issue",
  fix_applied: "",
  prevention_steps: ""
};

const validateRcaForm = (form) => {
  if (!form.incident_start || !form.incident_end) {
    return "Incident start and end are required";
  }

  if (new Date(form.incident_end) < new Date(form.incident_start)) {
    return "Incident end must be after incident start";
  }

  if (!form.rca_category || !form.fix_applied.trim() || !form.prevention_steps.trim()) {
    return "RCA category, fix applied, and prevention steps are required";
  }

  return "";
};

const ActiveIncidents = () => {

  const [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showRCA, setShowRCA] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [toast, setToast] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [rcaForm, setRcaForm] = useState(initialRcaForm);
  const [rcaError, setRcaError] = useState("");
  const [submittingRca, setSubmittingRca] = useState(false);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const data = await get("/work-items/open");
      console.log("📦 GET /work-items/open:", data);
      setIncidents(data.data);
    } catch (err) {
      console.error("❌ Fetch error:", err);
      showToast("Failed to fetch incidents", "error");
    }
  }, [showToast]);

  const handleClose = useCallback(async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/work-items/${id}/close`, {
        method: "POST"
      });

      const data = await res.json();
      console.log("📦 Close response:", data);

      if (!res.ok) {
        showToast(data.message || "Failed to close incident", "error");
        return;
      }

      showToast("Incident closed successfully ✅");
      fetchData();
    } catch (err) {
      console.error("❌ Close error:", err);
      showToast("Error closing incident", "error");
    }
  }, [fetchData, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Add this useEffect alongside the existing polling one:
  useEffect(() => {
    socket.on("work_item_created", () => fetchData());
    socket.on("work_item_updated", () => fetchData());
    socket.on("work_item_closed",  () => fetchData());

    return () => {
      socket.off("work_item_created");
      socket.off("work_item_updated");
      socket.off("work_item_closed");
    };
  }, [fetchData]);

  useEffect(() => {
    const fetchSignals = async () => {
      if (!selected) return;

      try {
        setLoadingSignals(true);

        const res = await fetch(
          `${API_BASE_URL}/signals/${selected.component_id}`
        );

        const data = await res.json();

        console.log("📦 Signals:", data);

        setSignals(data.data || []);
      } catch (err) {
        console.error("❌ Signals fetch error:", err);
      } finally {
        setLoadingSignals(false);
      }
    };

    fetchSignals();
  }, [selected]);

  const openRcaForm = () => {
    setRcaForm({
      ...initialRcaForm,
      incident_start: selected?.first_seen
        ? new Date(selected.first_seen).toISOString().slice(0, 16)
        : ""
    });
    setRcaError("");
    setShowRCA(true);
  };

  const handleRcaChange = (event) => {
    const { name, value } = event.target;
    setRcaForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const submitRcaAndClose = async () => {
    const validationError = validateRcaForm(rcaForm);

    if (validationError) {
      setRcaError(validationError);
      return;
    }

    try {
      setSubmittingRca(true);
      setRcaError("");

      const rcaRes = await fetch(
        `${API_BASE_URL}/work-items/${selected.id}/rca`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rcaForm)
        }
      );

      const rcaData = await rcaRes.json();

      if (!rcaRes.ok) {
        const message = rcaData.errors?.join(", ") || rcaData.message || "Invalid RCA";
        setRcaError(message);
        return;
      }

      const closeRes = await fetch(
        `${API_BASE_URL}/work-items/${selected.id}/close`,
        { method: "POST" }
      );

      const closeData = await closeRes.json();

      if (!closeRes.ok) {
        showToast(closeData.message || "Failed to close", "error");
        return;
      }

      showToast("Incident closed with RCA");
      setShowRCA(false);
      setSelected(null);
      setRcaForm(initialRcaForm);
      fetchData();
    } catch (err) {
      console.error("RCA error:", err);
      showToast("Error submitting RCA", "error");
    } finally {
      setSubmittingRca(false);
    }
  };

  const filteredIncidents = incidents.filter((item) => {
    if (filter === "ALL") return true;
    return item.severity === filter;
  });

  return (
    <div className="container">
      <h1>Active Incidents ({filteredIncidents.length})</h1>

      {/* 🔥 TOAST */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* FILTER */}
      <div className="filter-bar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="ALL">All</option>
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
        </select>
      </div>

      <div className="incident-list">
        {filteredIncidents.map((item) => (
          <div
            key={item.id}
            className="incident-card"
            onClick={() => setSelected(item)}
          >
            <div className="incident-info">
              <h2>{item.component_id}</h2>
              <p>Status: {item.status}</p>
              <span className={`severity ${item.severity}`}>
                {item.severity}
              </span>
            </div>

            <button
              className="close-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleClose(item.id);
              }}
            >
              Close
            </button>
          </div>
        ))}
      </div>

      {/* DETAILS MODAL */}
      {selected && !showRCA && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 style={{ marginTop: "12px" }}>Recent Signals</h3>

              {loadingSignals ? (
                <p>Loading signals...</p>
                ) : signals.length === 0 ? (
                <p>No signals found</p>
                ) : (
                <div className="signals-list">
                  {signals.slice(0, 20).map((sig, idx) => (
                  <div key={idx} className="signal-item">
                    <div><strong>{sig.componentId}</strong></div>
                    <div>{sig.errorType} - {sig.severity}</div>
                    <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                      {new Date(sig.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
                </div>
              )}
            <h2>{selected.component_id}</h2>

            <p>Status: {selected.status}</p>
            <p>Severity: {selected.severity}</p>
            <p>Signals: {selected.signal_count}</p>

            {selected.mttr != null && (
              <p>
                MTTR: {(selected.mttr / 1000 / 60).toFixed(2)} mins
              </p>
            )}

            <div className="modal-actions">
              <button
                className="close-btn"
                onClick={openRcaForm}
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

      {/* RCA MODAL */}
      {selected && showRCA && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>RCA for {selected.component_id}</h2>

            <div className="form-group">
              <label>Incident Start</label>
              <input
                type="datetime-local"
                name="incident_start"
                value={rcaForm.incident_start}
                onChange={handleRcaChange}
              />
            </div>

            <div className="form-group">
              <label>Incident End</label>
              <input
                type="datetime-local"
                name="incident_end"
                value={rcaForm.incident_end}
                onChange={handleRcaChange}
              />
            </div>

            <div className="form-group">
              <label>Root Cause Category</label>
              <select
                name="rca_category"
                value={rcaForm.rca_category}
                onChange={handleRcaChange}
              >
                <option value="DB Issue">DB Issue</option>
                <option value="API Failure">API Failure</option>
                <option value="Network">Network</option>
                <option value="Infra">Infra</option>
              </select>
            </div>

            <div className="form-group">
              <label>Fix Applied</label>
              <textarea
                name="fix_applied"
                value={rcaForm.fix_applied}
                onChange={handleRcaChange}
              />
            </div>

            <div className="form-group">
              <label>Prevention Steps</label>
              <textarea
                name="prevention_steps"
                value={rcaForm.prevention_steps}
                onChange={handleRcaChange}
              />
            </div>

            {rcaError && <p className="form-error">{rcaError}</p>}

            <div className="modal-actions">
              <button
                className="close-btn"
                onClick={submitRcaAndClose}
                disabled={submittingRca}
              >
                {submittingRca ? "Submitting..." : "Submit & Close"}
              </button>

              <button
                onClick={() => setShowRCA(false)}
                disabled={submittingRca}
              >
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
