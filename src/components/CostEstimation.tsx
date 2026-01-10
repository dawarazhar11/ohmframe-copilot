import { useState, useMemo } from "react";
import {
  CostBreakdown,
  CostEstimate,
  ManufacturingProcess,
  PROCESS_COST_LABELS,
  PROCESS_BASE_COSTS,
  PROCESS_LEAD_TIMES,
} from "../lib/cost/types";

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
  };
  onGetQuote?: () => void;
}

// Calculate complexity multiplier based on STEP data
function calculateComplexityMultiplier(stepData?: CostEstimationProps["stepData"]): number {
  if (!stepData) return 1.0;

  let multiplier = 1.0;

  // More faces = more complex
  const numFaces = stepData.topology?.num_faces || 0;
  if (numFaces > 50) multiplier += 0.3;
  else if (numFaces > 20) multiplier += 0.15;

  // Cylindrical faces (holes) add complexity
  const holes = stepData.features?.cylindrical_faces || 0;
  if (holes > 10) multiplier += 0.25;
  else if (holes > 5) multiplier += 0.1;

  return Math.min(multiplier, 2.0); // Cap at 2x
}

// Calculate size multiplier based on dimensions
function calculateSizeMultiplier(stepData?: CostEstimationProps["stepData"]): number {
  if (!stepData?.bounding_box?.dimensions) return 1.0;

  const [x, y, z] = stepData.bounding_box.dimensions;
  const maxDim = Math.max(x, y, z);
  const volume = x * y * z;

  // Large parts cost more
  if (maxDim > 500) return 1.5; // > 500mm
  if (maxDim > 300) return 1.25; // > 300mm
  if (volume > 1000000) return 1.3; // > 1L volume

  // Small parts may have handling overhead
  if (maxDim < 20) return 1.1; // < 20mm

  return 1.0;
}

// Generate cost estimate for a given quantity
function generateEstimate(
  process: ManufacturingProcess,
  quantity: number,
  complexityMultiplier: number,
  sizeMultiplier: number
): CostEstimate {
  const baseCost = PROCESS_BASE_COSTS[process];
  const combinedMultiplier = complexityMultiplier * sizeMultiplier;

  // Volume discount factors
  let volumeDiscount = 1.0;
  if (quantity >= 1000) volumeDiscount = 0.6;
  else if (quantity >= 500) volumeDiscount = 0.7;
  else if (quantity >= 100) volumeDiscount = 0.85;
  else if (quantity >= 10) volumeDiscount = 0.95;

  // Special case for injection molding: high tooling but low per-part at volume
  let toolingCost = baseCost.tooling * combinedMultiplier;
  if (process === "injection_molding" || process === "die_casting") {
    // Amortize tooling over quantity
    const baseTooling = process === "injection_molding" ? 5000 : 15000;
    toolingCost = baseTooling / quantity;
  }

  const unitCost: CostBreakdown = {
    material: Math.round(baseCost.material * combinedMultiplier * volumeDiscount * 100) / 100,
    labor: Math.round(baseCost.labor * combinedMultiplier * volumeDiscount * 100) / 100,
    tooling: Math.round(toolingCost * 100) / 100,
    overhead: Math.round(baseCost.overhead * combinedMultiplier * 100) / 100,
    total: 0,
  };
  unitCost.total = Math.round((unitCost.material + unitCost.labor + unitCost.tooling + unitCost.overhead) * 100) / 100;

  return {
    process,
    unitCost,
    quantity,
    totalCost: Math.round(unitCost.total * quantity * 100) / 100,
    leadTime: PROCESS_LEAD_TIMES[process],
    confidence: 0.7, // Mock confidence
    notes: [],
  };
}

export function CostEstimation({ process, stepData, onGetQuote }: CostEstimationProps) {
  const [quantity, setQuantity] = useState(100);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const complexityMultiplier = useMemo(
    () => calculateComplexityMultiplier(stepData),
    [stepData]
  );
  const sizeMultiplier = useMemo(
    () => calculateSizeMultiplier(stepData),
    [stepData]
  );

  const estimate = useMemo(
    () => generateEstimate(process, quantity, complexityMultiplier, sizeMultiplier),
    [process, quantity, complexityMultiplier, sizeMultiplier]
  );

  // Generate volume breaks for comparison
  const volumeBreaks = useMemo(() => {
    return [1, 10, 100, 500, 1000].map((qty) =>
      generateEstimate(process, qty, complexityMultiplier, sizeMultiplier)
    );
  }, [process, complexityMultiplier, sizeMultiplier]);

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

      {/* Quantity Selector */}
      <div className="cost-quantity">
        <label>Quantity</label>
        <div className="quantity-input-group">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - (quantity >= 100 ? 100 : 10)))}
            disabled={quantity <= 1}
          >
            -
          </button>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
          />
          <button onClick={() => setQuantity(quantity + (quantity >= 100 ? 100 : 10))}>
            +
          </button>
        </div>
      </div>

      {/* Main Cost Display */}
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
              <span className="volume-unit">{formatCurrency(vb.unitCost.total)}/ea</span>
              <span className="volume-total">{formatCurrency(vb.totalCost)}</span>
            </div>
          ))}
        </div>
      </div>

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
