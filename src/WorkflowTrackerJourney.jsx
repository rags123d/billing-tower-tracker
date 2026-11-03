import React, { useState, useMemo } from "react";
import {
  calculateWorkflowTracking,
  formatStageDate,
  CANONICAL_JOURNEY_PHASES
} from "./workflowTrackingHelper";

export default function WorkflowTrackerJourney({
  bill,
  user,
  onStepClick,
  onTransitionStep,
  saving = false,
  onSwitchBill,
  billsList = []
}) {
  const [selectedPhaseFilter, setSelectedPhaseFilter] = useState("ALL");
  const [showMatrixView, setShowMatrixView] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [copiedBillId, setCopiedBillId] = useState(false);

  const tracking = useMemo(() => {
    return calculateWorkflowTracking(bill);
  }, [bill]);

  if (!tracking) {
    return (
      <div className="card workflow-tracker-loading">
        <p>Loading Workflow Tracking Information…</p>
      </div>
    );
  }

  const {
    completedStages,
    completedStagesCount,
    currentStage,
    pendingStage,
    pendingStagesQueue,
    pendingStagesCount,
    dateEnteredIntoStage,
    daysPending,
    sla,
    stageSlaDays,
    slaStatus,
    slaPercentageConsumed,
    nextStage,
    journeyPhases,
    totalStages,
    progressPercentage
  } = tracking;

  const handleCopyId = () => {
    if (bill?.id) {
      navigator.clipboard.writeText(bill.id);
      setCopiedBillId(true);
      setTimeout(() => setCopiedBillId(false), 2000);
    }
  };

  // Filter stages based on selected phase filter
  const displayedStages = useMemo(() => {
    if (!bill?.stages) return [];
    if (selectedPhaseFilter === "ALL") return bill.stages;

    return bill.stages.filter((st, idx) => {
      const step = idx + 1;
      const ph = journeyPhases.find((p) => p.id === selectedPhaseFilter);
      return ph?.stages.some((s) => s.step === step);
    });
  }, [bill, selectedPhaseFilter, journeyPhases]);

  return (
    <section className="card workflow-tracker-card" id="workflow-tracking-section">
      {/* 6. WORKFLOW TRACKING HEADER */}
      <div className="wt-header">
        <div className="wt-title-area">
          <div className="wt-badge-strip">
            <span className="wt-section-badge">
              6. Workflow Tracking & Journey Engine
            </span>
            <span className="wt-mandate-badge">
              Mandatory Statutory Governance
            </span>
            {bill.isPilot && (
              <span className="wt-pilot-badge">
                🎯 {bill.pilotName || "Designated Pilot"}
              </span>
            )}
          </div>

          <h2 className="wt-main-heading">
            End-to-End Bill Lifecycle & Stage Journey
          </h2>
          <p className="wt-subtext">
            Mandatory complete journey tracking across canonical phases:{" "}
            <strong>Submission → Approval stages → Finance → Audit, where applicable → Payment</strong>
          </p>
        </div>

        <div className="wt-header-actions">
          {/* Bill Identifier Capsule */}
          <div className="wt-bill-capsule">
            <span className="wt-bill-id" onClick={handleCopyId} title="Click to copy unique Bill ID">
              {bill.id}
            </span>
            <button
              type="button"
              className="btn-copy-chip"
              onClick={handleCopyId}
              title="Copy Bill ID"
            >
              {copiedBillId ? "✓" : "📋"}
            </button>
            <span className="wt-client-chip">{bill.client || "BBMP"}</span>
          </div>

          {/* Quick Switcher dropdown if available */}
          {billsList.length > 1 && onSwitchBill && (
            <select
              className="wt-quick-switcher"
              value={bill.id}
              onChange={(e) => onSwitchBill(e.target.value)}
              title="Switch bill docket"
            >
              {billsList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} — {b.projectName?.slice(0, 20)}…
                </option>
              ))}
            </select>
          )}

          {/* View Mode Toggle */}
          <button
            type="button"
            className={`btn-wt-toggle ${showMatrixView ? "active" : ""}`}
            onClick={() => setShowMatrixView((prev) => !prev)}
            title="Toggle between Interactive Stepper & Structured Matrix"
          >
            {showMatrixView ? "📈 Visual Stepper" : "📑 Full Stage Matrix"}
          </button>
        </div>
      </div>

      {/* ============================================================
          SECTION 1: THE 5 CANONICAL MACRO-JOURNEY PHASES
          Submission → Approval stages → Finance → Audit, where applicable → Payment
          ============================================================ */}
      <div className="wt-macro-journey-wrapper">
        <div className="wt-macro-journey-label">
          <span>COMPLETE 5-PHASE STATUTORY JOURNEY</span>
          <span className="wt-filter-hint">
            {selectedPhaseFilter !== "ALL" ? (
              <button
                type="button"
                className="btn-reset-filter"
                onClick={() => setSelectedPhaseFilter("ALL")}
              >
                Reset Filter (Showing {selectedPhaseFilter}) ✕
              </button>
            ) : (
              "Click any phase to filter stages below"
            )}
          </span>
        </div>

        <div className="wt-macro-phases-ribbon">
          {journeyPhases.map((phase, idx) => {
            const isSelected = selectedPhaseFilter === phase.id;
            const isAudit = phase.id === "audit";

            let stateClass = "pending";
            if (!phase.isApplicable) stateClass = "na";
            else if (phase.status === "COMPLETED") stateClass = "completed";
            else if (phase.status === "CURRENT") stateClass = "active";

            return (
              <React.Fragment key={phase.id}>
                <div
                  className={`wt-phase-card ${stateClass} ${isSelected ? "selected-filter" : ""}`}
                  onClick={() => {
                    setSelectedPhaseFilter((prev) => (prev === phase.id ? "ALL" : phase.id));
                  }}
                  role="button"
                  tabIndex={0}
                  title={`${phase.label} (${phase.completedCount}/${phase.totalCount} completed)`}
                >
                  <div className="wt-phase-card-top">
                    <span className="wt-phase-num">0{idx + 1}</span>
                    <span className="wt-phase-icon">{phase.icon}</span>
                    <span className={`wt-phase-pill ${stateClass}`}>
                      {phase.statusLabel}
                    </span>
                  </div>

                  <div className="wt-phase-title">{phase.label}</div>

                  <div className="wt-phase-meta">
                    {phase.isApplicable ? (
                      <span>
                        <strong>{phase.completedCount}</strong> of <strong>{phase.totalCount}</strong> stages
                      </span>
                    ) : (
                      <span className="text-muted">Not applicable for this workflow</span>
                    )}
                  </div>

                  {phase.isApplicable && (
                    <div className="wt-phase-mini-progress">
                      <div
                        className="wt-phase-mini-fill"
                        style={{
                          width: `${phase.totalCount > 0 ? (phase.completedCount / phase.totalCount) * 100 : 0}%`,
                          backgroundColor: phase.color
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Arrow connector between stages */}
                {idx < journeyPhases.length - 1 && (
                  <div className={`wt-phase-arrow ${journeyPhases[idx + 1].status !== "PENDING" ? "arrow-passed" : ""}`}>
                    <span>➔</span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ============================================================
          SECTION 2: MANDATED 8-CRITERIA TRACKING HUD
          1. Completed stages
          2. Current stage
          3. Pending stage
          4. Date entered into stage
          5. Days pending
          6. SLA
          7. SLA status
          8. Next stage
          ============================================================ */}
      <div className="wt-hud-container">
        <div className="wt-hud-header">
          <span className="wt-hud-title">⚡ STATUTORY TRACKING DASHBOARD (8 MANDATED CRITERIA)</span>
          <span className="wt-hud-progress-label">
            Overall Completion: <strong>{progressPercentage}%</strong> ({completedStagesCount}/{totalStages} stages cleared)
          </span>
        </div>

        <div className="wt-hud-grid">
          {/* CRITERION 1: COMPLETED STAGES */}
          <div
            className="wt-hud-card hud-completed"
            onClick={() => setShowCompletedModal(true)}
            role="button"
            tabIndex={0}
            title="Click to view full list of cleared and verified stages"
          >
            <div className="wt-hud-card-label">
              <span>1. COMPLETED STAGES</span>
              <span className="wt-badge-view-link">View List ↗</span>
            </div>
            <div className="wt-hud-metric-row">
              <span className="wt-hud-metric-large text-emerald">
                {completedStagesCount}
              </span>
              <span className="wt-hud-metric-sub">/ {totalStages} cleared</span>
            </div>
            <div className="wt-hud-detail-snippet">
              {completedStagesCount > 0 ? (
                <span>Last: <strong>{completedStages[completedStagesCount - 1]?.name}</strong></span>
              ) : (
                <span className="text-muted">Initial submission stage</span>
              )}
            </div>
          </div>

          {/* CRITERION 2: CURRENT STAGE */}
          <div className="wt-hud-card hud-current">
            <div className="wt-hud-card-label">
              <span>2. CURRENT STAGE</span>
              <span className="wt-live-indicator">● ACTIVE</span>
            </div>
            <div className="wt-hud-stage-name">
              Step {currentStage.step}: <strong>{currentStage.name}</strong>
            </div>
            <div className="wt-hud-detail-snippet">
              <span>Authority: <strong style={{ color: "var(--accent-primary)" }}>{currentStage.role}</strong></span>
              {currentStage.person && <span> • {currentStage.person}</span>}
            </div>
          </div>

          {/* CRITERION 3: PENDING STAGE */}
          <div className="wt-hud-card hud-pending">
            <div className="wt-hud-card-label">
              <span>3. PENDING STAGE</span>
              <span className="wt-pending-pill">Awaiting Clearance</span>
            </div>
            <div className="wt-hud-stage-name" style={{ color: "#d97706" }}>
              {pendingStage.name}
            </div>
            <div className="wt-hud-detail-snippet">
              <span>
                <strong>{pendingStagesCount}</strong> total stage{pendingStagesCount === 1 ? "" : "s"} in pipeline
              </span>
            </div>
          </div>

          {/* CRITERION 4: DATE ENTERED INTO STAGE */}
          <div className="wt-hud-card hud-entered">
            <div className="wt-hud-card-label">
              <span>4. DATE ENTERED INTO STAGE</span>
              <span>📅</span>
            </div>
            <div className="wt-hud-metric-date">
              {formatStageDate(dateEnteredIntoStage)}
            </div>
            <div className="wt-hud-detail-snippet">
              <span>
                Entered <strong>{daysPending}</strong> day{daysPending === 1 ? "" : "s"} ago
              </span>
            </div>
          </div>

          {/* CRITERION 5: DAYS PENDING */}
          <div className={`wt-hud-card hud-days ${daysPending > stageSlaDays ? "hud-breached" : ""}`}>
            <div className="wt-hud-card-label">
              <span>5. DAYS PENDING</span>
              <span>⏱️</span>
            </div>
            <div className="wt-hud-metric-row">
              <span className={`wt-hud-metric-large ${daysPending > stageSlaDays ? "text-red" : daysPending >= stageSlaDays * 0.75 ? "text-amber" : "text-emerald"}`}>
                {daysPending}
              </span>
              <span className="wt-hud-metric-sub">Days dwell time</span>
            </div>
            <div className="wt-hud-detail-snippet">
              <span>Benchmark limit: {stageSlaDays} days</span>
            </div>
          </div>

          {/* CRITERION 6: SLA (TURNAROUND TIME) */}
          <div className="wt-hud-card hud-sla">
            <div className="wt-hud-card-label">
              <span>6. SLA (ALLOWANCE)</span>
              <span>🛡️</span>
            </div>
            <div className="wt-hud-metric-row">
              <span className="wt-hud-metric-large" style={{ color: "var(--accent-primary)" }}>
                {stageSlaDays}d
              </span>
              <span className="wt-hud-metric-sub">({stageSlaDays * 24} Hours)</span>
            </div>
            <div className="wt-hud-detail-snippet">
              <span>Statutory Turnaround Limit</span>
            </div>
          </div>

          {/* CRITERION 7: SLA STATUS */}
          <div className={`wt-hud-card hud-sla-status ${slaStatus.toLowerCase()}`}>
            <div className="wt-hud-card-label">
              <span>7. SLA STATUS</span>
              <span>⚡</span>
            </div>
            <div className="wt-sla-status-badge-wrapper">
              <span className={`wt-sla-chip ${slaStatus.toLowerCase()}`}>
                {slaStatus === "BREACHED_SLA" ? "🔴 BREACHED SLA" :
                 slaStatus === "APPROACHING_SLA" ? "🟠 APPROACHING SLA" :
                 "🟢 WITHIN SLA"}
              </span>
            </div>
            <div className="wt-sla-bar-container">
              <div
                className={`wt-sla-bar-fill ${slaStatus.toLowerCase()}`}
                style={{ width: `${Math.min(100, slaPercentageConsumed)}%` }}
              />
            </div>
            <div className="wt-hud-detail-snippet">
              <span>{slaPercentageConsumed}% of stage SLA consumed</span>
            </div>
          </div>

          {/* CRITERION 8: NEXT STAGE */}
          <div className="wt-hud-card hud-next">
            <div className="wt-hud-card-label">
              <span>8. NEXT STAGE</span>
              <span>⏭️</span>
            </div>
            <div className="wt-hud-stage-name" style={{ color: "var(--accent-primary)" }}>
              {nextStage ? (
                <>Step {nextStage.step}: <strong>{nextStage.name}</strong></>
              ) : (
                <strong>Final Payment Disbursed</strong>
              )}
            </div>
            <div className="wt-hud-detail-snippet">
              {nextStage ? (
                <span>Next Authority: <strong>{nextStage.role}</strong> ({nextStage.slaDays}d SLA)</span>
              ) : (
                <span className="text-emerald">Bill lifecycle fully cleared</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          SECTION 3: INTERACTIVE PROGRESSION TRACK (STEPPER)
          OR STRUCTURED STAGES MATRIX
          ============================================================ */}
      {!showMatrixView ? (
        <div className="wt-stepper-container">
          <div className="wt-stepper-header">
            <div>
              <h3 className="wt-stepper-title">Sequential Stage Progression Tracker</h3>
              <p className="wt-stepper-desc">
                Click any stage node to inspect verified documents, checklist items, and audit entries.
              </p>
            </div>

            {/* Quick Action to Approve & Transition Step */}
            {currentStage.step < totalStages && onTransitionStep && (
              <button
                type="button"
                className="btn-wt-advance"
                disabled={saving}
                onClick={() => onTransitionStep(currentStage.step + 1)}
                title={`Approve Step ${currentStage.step} and advance to Step ${currentStage.step + 1}`}
              >
                {saving ? "Authorizing…" : `✓ Approve & Advance to Step ${currentStage.step + 1}`}
              </button>
            )}
          </div>

          {/* Stepper Node Ribbon */}
          <div className="wt-timeline-scroll">
            <div className="timeline">
              {displayedStages.map((stageName, i) => {
                const step = i + 1;
                const isCompleted = step < currentStage.step;
                const isActive = step === currentStage.step;
                const isUpcoming = step > currentStage.step;
                const phase = CANONICAL_JOURNEY_PHASES.find(
                  (p) => p.stages?.some((s) => s.step === step)
                );

                return (
                  <button
                    key={stageName + step}
                    type="button"
                    className={`node ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""} ${
                      isUpcoming ? "upcoming" : ""
                    }`}
                    onClick={() => onStepClick && onStepClick(step)}
                    title={`Click to view operational protocol & checklist for Step ${step}: ${stageName}`}
                  >
                    <span className="line" />
                    <span className="dot">
                      {isCompleted ? <span className="tick-anim">✓</span> : step}
                    </span>
                    <span className="stage-no">STEP {step}</span>
                    <span className="stage-title">{stageName}</span>
                    {isCompleted ? (
                      <span className="passed-label">PASSED ✓</span>
                    ) : isActive ? (
                      <span className="current-label">CURRENT</span>
                    ) : (
                      <span className="pending-label">PENDING</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* STRUCTURED STAGE MATRIX TABLE */
        <div className="wt-matrix-container">
          <div className="wt-matrix-header">
            <h4>Stage Audit & Parameter Matrix (All {totalStages} Stages)</h4>
            <span className="badge-unique-rule">Statutory Traceability</span>
          </div>

          <div className="table-responsive">
            <table className="custom-table wt-matrix-table">
              <thead>
                <tr>
                  <th>Step #</th>
                  <th>Canonical Phase</th>
                  <th>Stage Name</th>
                  <th>Assigned Authority</th>
                  <th>Status</th>
                  <th>SLA</th>
                  <th>Dwell / Timestamp</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {bill.stages.map((stName, idx) => {
                  const stepNum = idx + 1;
                  const isCompleted = stepNum < currentStage.step;
                  const isActive = stepNum === currentStage.step;
                  const phaseInfo = CANONICAL_JOURNEY_PHASES.find((p) =>
                    p.stages?.some((s) => s.step === stepNum)
                  );
                  const hist = (bill.history || []).find((h) => h.step === stepNum);

                  return (
                    <tr
                      key={stepNum}
                      className={isActive ? "wt-row-active" : isCompleted ? "wt-row-completed" : ""}
                      onClick={() => onStepClick && onStepClick(stepNum)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <strong className="id-code">Step {stepNum}</strong>
                      </td>
                      <td>
                        <span className="wt-table-phase-chip">
                          {phaseInfo?.icon || "📋"} {phaseInfo?.label || "Approval"}
                        </span>
                      </td>
                      <td>
                        <strong>{stName}</strong>
                      </td>
                      <td>
                        <div style={{ fontSize: "12.5px" }}>
                          {hist?.performedBy || (isActive ? currentStage.role : "Reviewing Officer")}
                        </div>
                      </td>
                      <td>
                        {isCompleted ? (
                          <span className="status-pill status-paid">✓ Passed</span>
                        ) : isActive ? (
                          <span className="status-pill status-under_review">● Active</span>
                        ) : (
                          <span className="status-pill status-closed">⏳ Pending</span>
                        )}
                      </td>
                      <td>
                        <span className="sla-days-badge">{stageSlaDays}d</span>
                      </td>
                      <td>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                          {isCompleted && hist?.savedAt
                            ? formatStageDate(hist.savedAt)
                            : isActive
                            ? `${daysPending} days in stage`
                            : "Queued"}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-tbl-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onStepClick) onStepClick(stepNum);
                          }}
                        >
                          🔍 Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL: COMPLETED STAGES DRILL-DOWN MODAL
          ============================================================ */}
      {showCompletedModal && (
        <div className="custom-modal-backdrop" onClick={() => setShowCompletedModal(false)}>
          <div
            className="custom-modal-card"
            style={{ maxWidth: "680px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="custom-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "24px" }}>✅</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>
                    1. Completed Stages Log ({completedStagesCount} Stages Cleared)
                  </h3>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Bill: {bill.id} • {bill.projectName}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="custom-modal-close"
                onClick={() => setShowCompletedModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="custom-modal-body" style={{ maxHeight: "60vh", overflowY: "auto", padding: "16px 20px" }}>
              {completedStages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)" }}>
                  <p>Bill is currently in its initial submission stage. No stages completed yet.</p>
                </div>
              ) : (
                <div className="wt-completed-list">
                  {completedStages.map((cs) => (
                    <div key={cs.step} className="wt-completed-item">
                      <div className="wt-completed-dot">✓</div>
                      <div className="wt-completed-info">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong>Step {cs.step}: {cs.name}</strong>
                          <span className="wt-phase-tag">{cs.phaseIcon} {cs.phaseLabel}</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                          Authorized by: <strong>{cs.authorizedBy}</strong>
                          {cs.completedAt && <span> • {formatStageDate(cs.completedAt)}</span>}
                        </div>
                        <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                          Action: {cs.action}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="custom-modal-footer">
              <button
                type="button"
                className="custom-btn-secondary"
                onClick={() => setShowCompletedModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
