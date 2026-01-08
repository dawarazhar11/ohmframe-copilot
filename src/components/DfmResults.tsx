import { useState } from "react";
import type {
  DfmAnalysisResult,
  DfmRuleResult,
  GroupedDfmResults,
} from "../lib/dfm/types";
import { getRuleById, PROCESS_LABELS } from "../lib/dfm";

interface DfmResultsProps {
  dfmAnalysis: DfmAnalysisResult;
  dfmGrouped: GroupedDfmResults;
  dfmStats: {
    totalRules: number;
    passedCount: number;
    failedCount: number;
    warningCount: number;
    naCount: number;
    criticalFailures: number;
  };
}

// Collapsible section component
function CollapsibleSection({
  title,
  count,
  type,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  type: "critical" | "warning" | "pass" | "na";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (count === 0) return null;

  const colors = {
    critical: { bg: "#3a1a1a", border: "#ff4444", icon: "#ff4444" },
    warning: { bg: "#3a2a1a", border: "#d4a574", icon: "#d4a574" },
    pass: { bg: "#1a3a2a", border: "#4ade80", icon: "#4ade80" },
    na: { bg: "#2a2a4a", border: "#666", icon: "#666" },
  };

  const style = colors[type];

  return (
    <div className="dfm-section" style={{ borderColor: style.border }}>
      <button
        className="dfm-section-header"
        onClick={() => setIsOpen(!isOpen)}
        style={{ background: style.bg }}
      >
        <div className="dfm-section-title">
          <span className="dfm-section-icon" style={{ color: style.icon }}>
            {type === "critical" && "⚠"}
            {type === "warning" && "!"}
            {type === "pass" && "✓"}
            {type === "na" && "—"}
          </span>
          <span>{title}</span>
          <span className="dfm-section-count">({count})</span>
        </div>
        <span className="dfm-section-arrow">{isOpen ? "▼" : "▶"}</span>
      </button>
      {isOpen && <div className="dfm-section-content">{children}</div>}
    </div>
  );
}

// Individual rule result card
function RuleResultCard({ result }: { result: DfmRuleResult }) {
  const rule = getRuleById(result.ruleId);

  const statusColors = {
    pass: "#4ade80",
    fail: "#ff4444",
    warning: "#d4a574",
    na: "#666",
  };

  const severityColors = {
    critical: { bg: "rgba(255, 68, 68, 0.2)", border: "#ff4444", text: "#ff6666" },
    warning: { bg: "rgba(212, 165, 116, 0.2)", border: "#d4a574", text: "#d4a574" },
    info: { bg: "rgba(0, 212, 255, 0.2)", border: "#00d4ff", text: "#00d4ff" },
  };

  const sevStyle = rule ? severityColors[rule.severity] : severityColors.info;

  return (
    <div className="dfm-rule-card">
      <div className="dfm-rule-header">
        <span
          className="dfm-rule-status"
          style={{ color: statusColors[result.status] }}
        >
          {result.status === "pass" && "✓"}
          {result.status === "fail" && "✗"}
          {result.status === "warning" && "!"}
          {result.status === "na" && "—"}
        </span>
        <span className="dfm-rule-id">{result.ruleId}</span>
        <span className="dfm-rule-name">{rule?.name || "Unknown Rule"}</span>
        {rule && (
          <span
            className="dfm-rule-severity"
            style={{
              background: sevStyle.bg,
              borderColor: sevStyle.border,
              color: sevStyle.text,
            }}
          >
            {rule.severity.toUpperCase()}
          </span>
        )}
      </div>

      {rule?.description && (
        <p className="dfm-rule-description">{rule.description}</p>
      )}

      {(result.actualValue || result.expectedValue) && (
        <div className="dfm-rule-values">
          {result.actualValue && (
            <div className="dfm-value">
              <span className="dfm-value-label">Actual:</span>
              <span
                className="dfm-value-text"
                style={{ color: result.status === "fail" ? "#ff4444" : "#fff" }}
              >
                {result.actualValue}
              </span>
            </div>
          )}
          {result.expectedValue && (
            <div className="dfm-value">
              <span className="dfm-value-label">Required:</span>
              <span className="dfm-value-text" style={{ color: "#4ade80" }}>
                {result.expectedValue}
              </span>
            </div>
          )}
        </div>
      )}

      {result.location && (
        <div className="dfm-rule-location">
          <span className="dfm-value-label">Location:</span>
          <span>{result.location}</span>
        </div>
      )}

      {result.recommendation && (
        <div className="dfm-rule-fix">
          <span className="dfm-fix-label">Fix:</span>
          <span>{result.recommendation}</span>
        </div>
      )}

      <div className="dfm-rule-confidence">
        <span>Confidence: {Math.round(result.confidence * 100)}%</span>
        <div className="dfm-confidence-bar">
          <div
            className="dfm-confidence-fill"
            style={{ width: `${result.confidence * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Score display component
function ScoreDisplay({ score }: { score: number }) {
  let color = "#ff4444";
  let label = "Critical Issues";

  if (score >= 90) {
    color = "#4ade80";
    label = "Excellent";
  } else if (score >= 80) {
    color = "#4ade80";
    label = "Good";
  } else if (score >= 70) {
    color = "#d4a574";
    label = "Acceptable";
  } else if (score >= 60) {
    color = "#d4a574";
    label = "Needs Work";
  } else if (score >= 40) {
    color = "#ff4444";
    label = "Poor";
  }

  return (
    <div className="dfm-score">
      <div className="dfm-score-value" style={{ color }}>
        {score}
      </div>
      <div className="dfm-score-info">
        <div className="dfm-score-label" style={{ color }}>
          {label}
        </div>
        <div className="dfm-score-subtitle">DFM Score</div>
      </div>
    </div>
  );
}

export function DfmResults({ dfmAnalysis, dfmGrouped, dfmStats }: DfmResultsProps) {
  return (
    <div className="dfm-results">
      {/* Summary Card */}
      <div className="dfm-summary">
        <div className="dfm-summary-header">
          <ScoreDisplay score={dfmAnalysis.overallScore} />
          <div className="dfm-summary-stats">
            <div className="dfm-stat">
              <div className="dfm-stat-value" style={{ color: "#ff4444" }}>
                {dfmStats.criticalFailures}
              </div>
              <div className="dfm-stat-label">Critical</div>
            </div>
            <div className="dfm-stat">
              <div className="dfm-stat-value" style={{ color: "#d4a574" }}>
                {dfmStats.warningCount}
              </div>
              <div className="dfm-stat-label">Warnings</div>
            </div>
            <div className="dfm-stat">
              <div className="dfm-stat-value" style={{ color: "#4ade80" }}>
                {dfmStats.passedCount}
              </div>
              <div className="dfm-stat-label">Passed</div>
            </div>
          </div>
        </div>
        <div className="dfm-summary-process">
          Process: <span>{PROCESS_LABELS[dfmAnalysis.processDetected]}</span>
        </div>
        <p className="dfm-summary-text">{dfmAnalysis.summary}</p>
      </div>

      {/* Rule Results by Category */}
      <div className="dfm-sections">
        <CollapsibleSection
          title="Critical Issues"
          count={dfmGrouped.critical.length}
          type="critical"
          defaultOpen={true}
        >
          {dfmGrouped.critical.map((result) => (
            <RuleResultCard key={result.ruleId} result={result} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title="Warnings"
          count={dfmGrouped.warnings.length}
          type="warning"
          defaultOpen={true}
        >
          {dfmGrouped.warnings.map((result) => (
            <RuleResultCard key={result.ruleId} result={result} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title="Passed Rules"
          count={dfmGrouped.passed.length}
          type="pass"
          defaultOpen={false}
        >
          {dfmGrouped.passed.map((result) => (
            <RuleResultCard key={result.ruleId} result={result} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title="Not Applicable"
          count={dfmGrouped.notApplicable.length}
          type="na"
          defaultOpen={false}
        >
          {dfmGrouped.notApplicable.map((result) => (
            <RuleResultCard key={result.ruleId} result={result} />
          ))}
        </CollapsibleSection>
      </div>

      {/* Raw Commentary Fallback */}
      {dfmAnalysis.rawCommentary && (
        <div className="dfm-raw">
          <div className="dfm-raw-header">
            Raw Analysis (JSON parsing incomplete)
          </div>
          <div className="dfm-raw-content">{dfmAnalysis.rawCommentary}</div>
        </div>
      )}
    </div>
  );
}
