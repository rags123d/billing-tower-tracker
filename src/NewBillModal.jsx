import React, { useState, useEffect } from "react";
import { API_BASE } from "./config";

export default function NewBillModal({ onClose, onCreated, fetchWithAuth, currentBillCount = 1 }) {
  const defaultNextId = `BILL-${1000 + currentBillCount + 1}`;

  const [towersList, setTowersList] = useState([]);
  const [formData, setFormData] = useState({
    id: defaultNextId,
    towerId: "TWR-101",
    projectName: "",
    projectType: "BBMP_LAKES",
    amount: "₹ 35,00,000",
    contractor: "Sri Sai Infratech Projects",
    ward: "Ward 42, Bellandur",
    mbNumber: `MB-2026/${Math.floor(100 + Math.random() * 900)}`,
    submitImmediately: true,
    description: "",
    customPhotoUrl: ""
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load existing Towers for linking
  useEffect(() => {
    let mounted = true;
    fetchWithAuth(`${API_BASE}/towers`)
      .then((res) => res.json())
      .then((list) => {
        if (mounted && Array.isArray(list) && list.length > 0) {
          setTowersList(list);
          const first = list[0];
          setFormData((prev) => ({
            ...prev,
            towerId: first.id,
            contractor: prev.contractor || first.contractor,
            ward: prev.ward || first.ward
          }));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [fetchWithAuth]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === "checkbox" ? checked : value;

    if (name === "towerId") {
      const matched = towersList.find((t) => t.id === value);
      setFormData((prev) => ({
        ...prev,
        towerId: value,
        contractor: matched?.contractor || prev.contractor,
        ward: matched?.ward || prev.ward
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.projectName.trim()) {
      setError("Please enter a valid Project / Work Scope Name.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        id: formData.id.trim(),
        towerId: formData.towerId,
        projectName: formData.projectName.trim(),
        projectType: formData.projectType,
        amount: formData.amount.trim() || "₹ 35,00,000",
        contractor: formData.contractor.trim() || "BBMP Registered Vendor",
        ward: formData.ward.trim() || "BBMP Municipal Ward",
        mbNumber: formData.mbNumber.trim() || "MB-2026/001",
        submitImmediately: !!formData.submitImmediately,
        description: formData.description.trim() || "Civil maintenance and monitoring work docket"
      };

      if (formData.customPhotoUrl.trim()) {
        payload.photoUrls = [formData.customPhotoUrl.trim()];
      }

      const res = await fetchWithAuth(`${API_BASE}/bills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create new bill project");
      }

      onCreated(data.bill);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save bill project");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="custom-modal-backdrop" onClick={onClose}>
      <div
        className="custom-modal-window"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="custom-modal-header">
          <div className="custom-modal-title-group">
            <span className="custom-modal-tag">TOWER BILLING DOCKET INITIATION</span>
            <h2>Create New Bill / Project Tracker</h2>
          </div>
          <button
            type="button"
            className="custom-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="custom-modal-body">
          {error && <div className="custom-modal-error-alert">{error}</div>}

          {/* Tower Association & Bill Code */}
          <div className="custom-modal-row-2">
            <div className="custom-modal-field">
              <label>
                Associated Master Tower <span className="req">*</span>
              </label>
              <select
                name="towerId"
                value={formData.towerId}
                onChange={handleChange}
                required
              >
                {towersList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name} ({t.ward})
                  </option>
                ))}
              </select>
              <span className="field-hint">Ties billing, budget and milestones to this tower</span>
            </div>

            <div className="custom-modal-field">
              <label>
                Bill Identifier Code <span className="req">*</span>
              </label>
              <input
                type="text"
                name="id"
                value={formData.id}
                onChange={handleChange}
                placeholder="e.g. BILL-1007"
                required
              />
              <span className="field-hint">Unique tracking reference number</span>
            </div>
          </div>

          <div className="custom-modal-field">
            <label>
              Project Name / Work Scope Title <span className="req">*</span>
            </label>
            <input
              type="text"
              name="projectName"
              value={formData.projectName}
              onChange={handleChange}
              placeholder="e.g. Bellandur Lake South Inlet Desilting & Silt Trap Construction"
              required
            />
          </div>

          <div className="custom-modal-row-3">
            <div className="custom-modal-field">
              <label>Gross Value / Amount <span className="req">*</span></label>
              <input
                type="text"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                placeholder="e.g. ₹ 48,50,000"
                required
              />
            </div>

            <div className="custom-modal-field">
              <label>Measurement Book # (MB)</label>
              <input
                type="text"
                name="mbNumber"
                value={formData.mbNumber}
                onChange={handleChange}
                placeholder="e.g. MB-2026/042-A"
              />
            </div>

            <div className="custom-modal-field">
              <label>Workflow Template</label>
              <select
                name="projectType"
                value={formData.projectType}
                onChange={handleChange}
              >
                <option value="BBMP_LAKES">BBMP Lakes & Water Bodies</option>
                <option value="STANDARD">Standard Public Works</option>
              </select>
            </div>
          </div>

          <div className="custom-modal-row-2">
            <div className="custom-modal-field">
              <label>Executing Contractor</label>
              <input
                type="text"
                name="contractor"
                value={formData.contractor}
                onChange={handleChange}
                placeholder="e.g. Sri Sai Infratech Projects"
              />
            </div>

            <div className="custom-modal-field">
              <label>Ward / Municipal Division</label>
              <input
                type="text"
                name="ward"
                value={formData.ward}
                onChange={handleChange}
                placeholder="e.g. Ward 42, Bellandur"
              />
            </div>
          </div>

          <div className="custom-modal-field">
            <label>Custom Site Inspection Image URL (Optional)</label>
            <input
              type="url"
              name="customPhotoUrl"
              value={formData.customPhotoUrl}
              onChange={handleChange}
              placeholder="https://images.unsplash.com/... (or leave blank to auto-link site photos)"
            />
            <span className="field-hint">
              💡 If left blank, verified photographic evidence for the selected Tower/Site will be automatically attached.
            </span>
          </div>

          <div className="custom-modal-field">
            <label>Work Scope Summary & Technical Notes</label>
            <textarea
              name="description"
              rows={2}
              value={formData.description}
              onChange={handleChange}
              placeholder="Enter key chainage details, tender sanction reference, or engineering notes..."
            />
          </div>

          {/* Submit immediately option */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0" }}>
            <input
              type="checkbox"
              id="submitImmediately"
              name="submitImmediately"
              checked={formData.submitImmediately}
              onChange={handleChange}
              style={{ width: "18px", height: "18px", cursor: "pointer" }}
            />
            <label htmlFor="submitImmediately" style={{ fontSize: "13px", color: "#f1f5f9", cursor: "pointer" }}>
              <b>Submit directly to Departmental Review Queue (UNDER_REVIEW)</b>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                Uncheck to save as a preliminary draft or initial docket.
              </div>
            </label>
          </div>

          <div className="custom-modal-footer">
            <button
              type="button"
              className="custom-btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="custom-btn-primary"
              disabled={submitting}
            >
              {submitting ? "Registering…" : "✓ Create & Track Bill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
