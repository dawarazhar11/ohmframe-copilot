import { useState, useEffect, useCallback } from "react";
import { fetch } from "@tauri-apps/plugin-http";
import {
  ManufacturingProcess,
  PROCESS_COST_LABELS,
} from "../lib/cost/types";

interface CostBreakdown {
  material: number;
  labor: number;
  tooling: number;
  overhead: number;
  total: number;
}

interface CostEstimate {
  process: ManufacturingProcess;
  unitCost: CostBreakdown;
  quantity: number;
  totalCost: number;
  leadTime: string;
  confidence: number;
  notes: string[];
}

interface VolumeBreak {
  quantity: number;
  unitCost: number;
  savings: number;
}

interface CostApiResponse {
  success: boolean;
  estimate: CostEstimate;
  volumeBreaks: VolumeBreak[];
  processLabel: string;
  alternativeProcesses?: {
    process: ManufacturingProcess;
    unitCost: number;
    savingsPercent: number;
    tradeoffs: string[];
  }[];
}

interface CostEstimationProps {
  process: ManufacturingProcess;
  stepData?: {
    topology?: {
      num_faces: number;
      num_edges: number;
    };
    features?: {
      cylindrical_faces: number;
      planar_faces: number;
    };
    bounding_box?: {
      dimensions: [number, number, number];
    };
    volume?: number;
  };
  onGetQuote?: () => void;
}

const MATERIAL_OPTIONS = [
  { value: "aluminum", label: "Aluminum" },
  { value: "steel", label: "Steel" },
  { value: "stainless_steel", label: "Stainless Steel" },
  { value: "copper", label: "Copper" },
  { value: "brass", label: "Brass" },
  { value: "titanium", label: "Titanium" },
  { value: "abs_plastic", label: "ABS Plastic" },
  { value: "nylon", label: "Nylon" },
  { value: "pla", label: "PLA" },
];

export function CostEstimation({ process, stepData, onGetQuote }: CostEstimationProps) {
  const [quantity, setQuantity] = useState(100);
  const [material, setMaterial] = useState("aluminum");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [volumeBreaks, setVolumeBreaks] = useState<VolumeBreak[]>([]);

  // Fetch cost estimate from API
  const fetchCostEstimate = useCallback(async (qty: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const apiKey = localStorage.getItem("ohmframe_api_key");
      if (!apiKey) {
        throw new Error("API key not configured");
      }

      const response = await fetch("https://ai.ohmframe.com/api/cost/estimate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          process,
          quantity: qty,
          geometry: stepData ? {
            boundingBox: stepData.bounding_box,
            topology: stepData.topology,
            features: stepData.features,
            volume: stepData.volume,
          } : undefined,
          material: { type: material },
          includeAlternatives: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: CostApiResponse = await response.json();

      if (data.success) {
        setEstimate(data.estimate);
        setVolumeBreaks(data.volumeBreaks);
      } else {
        throw new Error("Cost estimation failed");
      }
    } catch (err) {
      console.error("Cost API error:", err);
      setError(err instanceof Error ? err.message : "Failed to get cost estimate");
      // Fall back to showing a message
      setEstimate(null);
    } finally {
      setIsLoading(false);
    }
  }, [process, stepData, material]);

  // Fetch on mount and when quantity/material changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCostEstimate(quantity);
    }, 300);
    return () => clearTimeout(timer);
  }, [quantity, material, fetchCostEstimate]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="cost-estimation">
      {/* Header */}
      <div className="cost-header">
        <div className="cost-title">
          <span className="cost-icon">$</span>
          <span>Cost Estimate</span>
        </div>
        <span className="cost-process">{PROCESS_COST_LABELS[process]}</span>
      </div>

      {/* Material Selector */}
      <div className="cost-material">
        <label>Material</label>
        <select
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          disabled={isLoading}
        >
          {MATERIAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Quantity Selector */}
      <div className="cost-quantity">
        <label>Quantity</label>
        <div className="quantity-input-group">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - (quantity >= 100 ? 100 : 10)))}
            disabled={quantity <= 1 || isLoading}
          >
            -
          </button>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
            disabled={isLoading}
          />
          <button
            onClick={() => setQuantity(quantity + (quantity >= 100 ? 100 : 10))}
            disabled={isLoading}
          >
            +
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="cost-loading">
          <div className="loading-spinner"></div>
          <span>Calculating estimate...</span>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="cost-error">
          <span>Unable to load cost estimate</span>
          <button onClick={() => fetchCostEstimate(quantity)}>Retry</button>
        </div>
      )}

      {/* Main Cost Display */}
      {estimate && !isLoading && (
        <>
          <div className="cost-main">
            <div className="cost-unit">
              <div className="cost-value">{formatCurrency(estimate.unitCost.total)}</div>
              <div className="cost-label">per unit</div>
            </div>
            <div className="cost-total">
              <div className="cost-value-large">{formatCurrency(estimate.totalCost)}</div>
              <div className="cost-label">total for {quantity} units</div>
            </div>
          </div>

          {/* Lead Time */}
          <div className="cost-leadtime">
            <span className="leadtime-icon">clock</span>
            <span className="leadtime-label">Lead Time:</span>
            <span className="leadtime-value">{estimate.leadTime}</span>
          </div>

          {/* Cost Breakdown Toggle */}
          <button
            className="cost-breakdown-toggle"
            onClick={() => setShowBreakdown(!showBreakdown)}
          >
            <span>Cost Breakdown</span>
            <span className="toggle-arrow">{showBreakdown ? "^" : "v"}</span>
          </button>

          {showBreakdown && (
            <div className="cost-breakdown">
              <div className="breakdown-row">
                <span className="breakdown-label">Material</span>
                <span className="breakdown-value">{formatCurrency(estimate.unitCost.material)}</span>
              </div>
              <div className="breakdown-row">
                <span className="breakdown-label">Labor</span>
                <span className="breakdown-value">{formatCurrency(estimate.unitCost.labor)}</span>
              </div>
              <div className="breakdown-row">
                <span className="breakdown-label">Tooling</span>
                <span className="breakdown-value">{formatCurrency(estimate.unitCost.tooling)}</span>
              </div>
              <div className="breakdown-row">
                <span className="breakdown-label">Overhead</span>
                <span className="breakdown-value">{formatCurrency(estimate.unitCost.overhead)}</span>
              </div>
              <div className="breakdown-row breakdown-total">
                <span className="breakdown-label">Total</span>
                <span className="breakdown-value">{formatCurrency(estimate.unitCost.total)}</span>
              </div>
            </div>
          )}

          {/* Volume Pricing Table */}
          {volumeBreaks.length > 0 && (
            <div className="cost-volume">
              <div className="volume-header">Volume Pricing</div>
              <div className="volume-table">
                {volumeBreaks.map((vb) => (
                  <div
                    key={vb.quantity}
                    className={`volume-row ${vb.quantity === quantity ? "active" : ""}`}
                    onClick={() => setQuantity(vb.quantity)}
                  >
                    <span className="volume-qty">{vb.quantity}</span>
                    <span className="volume-unit">{formatCurrency(vb.unitCost)}/ea</span>
                    {vb.savings > 0 && (
                      <span className="volume-savings">-{vb.savings}%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confidence Indicator */}
          <div className="cost-confidence">
            <span className="confidence-label">Estimate Confidence:</span>
            <div className="confidence-bar">
              <div
                className="confidence-fill"
                style={{ width: `${estimate.confidence * 100}%` }}
              />
            </div>
            <span className="confidence-value">{Math.round(estimate.confidence * 100)}%</span>
          </div>

          {/* Notes */}
          {estimate.notes && estimate.notes.length > 0 && (
            <div className="cost-notes">
              {estimate.notes.map((note, i) => (
                <div key={i} className="cost-note">{note}</div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Disclaimer */}
      <div className="cost-disclaimer">
        This is a preliminary estimate based on geometry analysis.
        Request a quote for accurate pricing.
      </div>

      {/* Get Quote Button */}
      <button className="cost-quote-btn" onClick={onGetQuote}>
        Get Detailed Quote
        <span className="quote-arrow">-&gt;</span>
      </button>
    </div>
  );
}
