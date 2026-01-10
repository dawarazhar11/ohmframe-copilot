import { useState, useCallback } from "react";
import { fetch } from "@tauri-apps/plugin-http";

interface Dimension {
  id: string;
  name: string;
  nominal: number;
  tolerance: number;
  direction: "positive" | "negative";
}

interface Contribution {
  name: string;
  nominal: number;
  tolerance: number;
  direction: string;
  percentContribution: number;
}

interface MonteCarloResult {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  cpk: number;
}

interface ToleranceResult {
  totalNominal: number;
  worstCaseTolerance: number;
  rssTolerance: number;
  worstCaseMin: number;
  worstCaseMax: number;
  rssMin: number;
  rssMax: number;
  contributions: Contribution[];
  monteCarlo?: MonteCarloResult;
}

interface ApiResponse {
  success: boolean;
  method: string;
  result: ToleranceResult;
  insights: string[];
  error?: string;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const DEFAULT_DIMENSIONS: Dimension[] = [
  { id: generateId(), name: "Part A", nominal: 25.0, tolerance: 0.1, direction: "positive" },
  { id: generateId(), name: "Gap", nominal: 0.5, tolerance: 0.05, direction: "negative" },
  { id: generateId(), name: "Part B", nominal: 30.0, tolerance: 0.15, direction: "positive" },
];

export function ToleranceStackup() {
  const [dimensions, setDimensions] = useState<Dimension[]>(DEFAULT_DIMENSIONS);
  const [method, setMethod] = useState<"worst_case" | "rss" | "monte_carlo">("rss");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const addDimension = () => {
    if (dimensions.length >= 20) return;
    const newDim: Dimension = {
      id: generateId(),
      name: `Part ${dimensions.length + 1}`,
      nominal: 10.0,
      tolerance: 0.05,
      direction: "positive",
    };
    setDimensions([...dimensions, newDim]);
  };

  const removeDimension = (id: string) => {
    if (dimensions.length > 1) {
      setDimensions(dimensions.filter((d) => d.id !== id));
    }
  };

  const updateDimension = (id: string, field: keyof Dimension, value: string | number) => {
    setDimensions(
      dimensions.map((d) =>
        d.id === id ? { ...d, [field]: value } : d
      )
    );
  };

  const toggleDirection = (id: string) => {
    setDimensions(
      dimensions.map((d) =>
        d.id === id
          ? { ...d, direction: d.direction === "positive" ? "negative" : "positive" }
          : d
      )
    );
  };

  const calculateStackup = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const apiKey = localStorage.getItem("ohmframe_api_key");
      if (!apiKey) {
        throw new Error("API key not configured");
      }

      const response = await fetch("https://ai.ohmframe.com/api/tolerance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          dimensions: dimensions.map((d) => ({
            name: d.name,
            nominal: d.nominal,
            tolerance: d.tolerance,
            direction: d.direction,
          })),
          method,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: ApiResponse = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        throw new Error(data.error || "Calculation failed");
      }
    } catch (err) {
      console.error("Tolerance API error:", err);
      setError(err instanceof Error ? err.message : "Failed to calculate stackup");
    } finally {
      setIsLoading(false);
    }
  }, [dimensions, method]);

  return (
    <div className="tolerance-stackup">
      {/* Header */}
      <div className="tolerance-header">
        <div className="tolerance-title">
          <span className="tolerance-icon">📐</span>
          <span>Tolerance Stackup</span>
        </div>
        <span className="dimension-count">{dimensions.length} dimensions</span>
      </div>

      {/* Dimension Chain */}
      <div className="dimension-chain">
        {dimensions.map((dim, idx) => (
          <div key={dim.id} className="dimension-row">
            <span className="dimension-index">{idx + 1}</span>

            <input
              type="text"
              value={dim.name}
              onChange={(e) => updateDimension(dim.id, "name", e.target.value)}
              placeholder="Name"
              className="dimension-name"
            />

            <input
              type="number"
              value={dim.nominal}
              onChange={(e) => updateDimension(dim.id, "nominal", parseFloat(e.target.value) || 0)}
              step="0.01"
              className="dimension-nominal"
            />

            <span className="dimension-pm">±</span>

            <input
              type="number"
              value={dim.tolerance}
              onChange={(e) => updateDimension(dim.id, "tolerance", parseFloat(e.target.value) || 0)}
              step="0.01"
              min="0"
              className="dimension-tolerance"
            />

            <button
              onClick={() => toggleDirection(dim.id)}
              className={`direction-btn ${dim.direction}`}
              title={dim.direction === "positive" ? "Adds to total" : "Subtracts from total"}
            >
              {dim.direction === "positive" ? "↑" : "↓"}
            </button>

            <button
              onClick={() => removeDimension(dim.id)}
              disabled={dimensions.length === 1}
              className="remove-btn"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Add Dimension Button */}
      <button
        onClick={addDimension}
        disabled={dimensions.length >= 20}
        className="add-dimension-btn"
      >
        + Add Dimension
      </button>

      {/* Method Selection */}
      <div className="method-selection">
        <label>Analysis Method</label>
        <div className="method-buttons">
          <button
            onClick={() => setMethod("worst_case")}
            className={`method-btn ${method === "worst_case" ? "active" : ""}`}
          >
            Worst-Case
          </button>
          <button
            onClick={() => setMethod("rss")}
            className={`method-btn ${method === "rss" ? "active" : ""}`}
          >
            RSS (3σ)
          </button>
          <button
            onClick={() => setMethod("monte_carlo")}
            className={`method-btn ${method === "monte_carlo" ? "active" : ""}`}
          >
            Monte Carlo
          </button>
        </div>
      </div>

      {/* Calculate Button */}
      <button
        onClick={calculateStackup}
        disabled={isLoading || dimensions.length === 0}
        className="calculate-btn"
      >
        {isLoading ? (
          <span className="loading-dots">
            <span></span><span></span><span></span>
          </span>
        ) : (
          "Calculate Stackup"
        )}
      </button>

      {/* Error */}
      {error && <div className="tolerance-error">{error}</div>}

      {/* Results */}
      {result && (
        <div className="tolerance-results">
          {/* Main Results */}
          <div className="result-main">
            <div className="result-nominal">
              <span className="result-label">Total Nominal</span>
              <span className="result-value">{result.result.totalNominal.toFixed(3)} mm</span>
            </div>

            <div className="result-row">
              <div className="result-item worst-case">
                <span className="result-label">Worst-Case</span>
                <span className="result-value">±{result.result.worstCaseTolerance.toFixed(3)} mm</span>
                <span className="result-range">
                  {result.result.worstCaseMin.toFixed(3)} - {result.result.worstCaseMax.toFixed(3)}
                </span>
              </div>

              <div className="result-item rss">
                <span className="result-label">RSS (3σ)</span>
                <span className="result-value">±{result.result.rssTolerance.toFixed(3)} mm</span>
                <span className="result-range">
                  {result.result.rssMin.toFixed(3)} - {result.result.rssMax.toFixed(3)}
                </span>
              </div>
            </div>

            {/* RSS Savings */}
            <div className="result-savings">
              RSS is {Math.round((1 - result.result.rssTolerance / result.result.worstCaseTolerance) * 100)}% tighter than worst-case
            </div>
          </div>

          {/* Monte Carlo */}
          {result.result.monteCarlo && (
            <div className="monte-carlo-results">
              <div className="mc-header">Monte Carlo (10,000 samples)</div>
              <div className="mc-stats">
                <div className="mc-stat">
                  <span className="mc-label">Mean</span>
                  <span className="mc-value">{result.result.monteCarlo.mean.toFixed(3)}</span>
                </div>
                <div className="mc-stat">
                  <span className="mc-label">Std Dev</span>
                  <span className="mc-value">{result.result.monteCarlo.stdDev.toFixed(3)}</span>
                </div>
                <div className={`mc-stat cpk ${
                  result.result.monteCarlo.cpk >= 1.33 ? "good" :
                  result.result.monteCarlo.cpk >= 1.0 ? "ok" : "bad"
                }`}>
                  <span className="mc-label">Cpk</span>
                  <span className="mc-value">{result.result.monteCarlo.cpk.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Contribution Analysis */}
          <div className="contribution-analysis">
            <div className="contrib-header">Variance Contribution</div>
            {result.result.contributions.map((contrib, idx) => (
              <div key={idx} className="contrib-row">
                <span className="contrib-name">{contrib.name}</span>
                <div className="contrib-bar-container">
                  <div
                    className="contrib-bar"
                    style={{ width: `${contrib.percentContribution}%` }}
                  />
                </div>
                <span className="contrib-percent">{contrib.percentContribution}%</span>
              </div>
            ))}
          </div>

          {/* AI Insights */}
          {result.insights && result.insights.length > 0 && (
            <div className="tolerance-insights">
              <div className="insights-header">AI Insights</div>
              <ul className="insights-list">
                {result.insights.map((insight, idx) => (
                  <li key={idx} className="insight-item">{insight}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="tolerance-help">
        Enter dimensions with ±tolerance. Use ↑ for dimensions that add to the total, ↓ for those that subtract.
      </div>
    </div>
  );
}
