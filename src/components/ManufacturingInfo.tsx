import { useState, useEffect, useCallback } from "react";
import { fetch } from "@tauri-apps/plugin-http";
import {
  ManufacturingProcess,
  PROCESS_COST_LABELS,
} from "../lib/cost/types";

interface ManufacturingOperation {
  name: string;
  description: string;
  setupTimeMinutes: number;
  cycleTimeMinutes: number;
  isOptional?: boolean;
}

interface ManufacturingTimeEstimate {
  process: ManufacturingProcess;
  operations: ManufacturingOperation[];
  totalOperations: number;
  totalSetupTimeMinutes: number;
  cycleTimePerPartMinutes: number;
  totalTimeForQuantityMinutes: number;
  quantity: number;
  formattedSetupTime: string;
  formattedCycleTime: string;
  formattedTotalTime: string;
  notes: string[];
}

interface ManufacturingApiResponse {
  success: boolean;
  manufacturingTime: ManufacturingTimeEstimate;
  processLabel: string;
}

interface ManufacturingInfoProps {
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
}

export function ManufacturingInfo({ process, stepData }: ManufacturingInfoProps) {
  const [quantity, setQuantity] = useState(100);
  const [showOperations, setShowOperations] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeEstimate, setTimeEstimate] = useState<ManufacturingTimeEstimate | null>(null);

  // Fetch manufacturing time from API
  const fetchManufacturingTime = useCallback(async (qty: number) => {
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
          } : undefined,
          includeAlternatives: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: ManufacturingApiResponse = await response.json();

      if (data.success && data.manufacturingTime) {
        setTimeEstimate(data.manufacturingTime);
      } else {
        throw new Error("Manufacturing time estimation failed");
      }
    } catch (err) {
      console.error("Manufacturing API error:", err);
      setError(err instanceof Error ? err.message : "Failed to get manufacturing info");
      setTimeEstimate(null);
    } finally {
      setIsLoading(false);
    }
  }, [process, stepData]);

  // Fetch on mount and when quantity changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchManufacturingTime(quantity);
    }, 300);
    return () => clearTimeout(timer);
  }, [quantity, fetchManufacturingTime]);

  return (
    <div className="manufacturing-info">
      {/* Header */}
      <div className="mfg-header">
        <div className="mfg-title">
          <span className="mfg-icon">⚙</span>
          <span>Manufacturing Info</span>
        </div>
        <span className="mfg-process">{PROCESS_COST_LABELS[process]}</span>
      </div>

      {/* Quantity Selector */}
      <div className="mfg-quantity">
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
        <div className="mfg-loading">
          <div className="loading-spinner"></div>
          <span>Calculating...</span>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="mfg-error">
          <span>Unable to load manufacturing info</span>
          <button onClick={() => fetchManufacturingTime(quantity)}>Retry</button>
        </div>
      )}

      {/* Main Display */}
      {timeEstimate && !isLoading && (
        <>
          {/* Summary Cards */}
          <div className="mfg-summary">
            <div className="mfg-card">
              <div className="mfg-card-value">{timeEstimate.totalOperations}</div>
              <div className="mfg-card-label">Operations</div>
            </div>
            <div className="mfg-card">
              <div className="mfg-card-value">{timeEstimate.formattedSetupTime}</div>
              <div className="mfg-card-label">Total Setup</div>
            </div>
            <div className="mfg-card">
              <div className="mfg-card-value">{timeEstimate.formattedCycleTime}</div>
              <div className="mfg-card-label">Per Part</div>
            </div>
          </div>

          {/* Total Time Highlight */}
          <div className="mfg-total-time">
            <div className="mfg-total-icon">⏱</div>
            <div className="mfg-total-content">
              <div className="mfg-total-label">Total Manufacturing Time</div>
              <div className="mfg-total-value">{timeEstimate.formattedTotalTime}</div>
              <div className="mfg-total-qty">for {quantity} unit{quantity !== 1 ? "s" : ""}</div>
            </div>
          </div>

          {/* Operations Toggle */}
          <button
            className="mfg-operations-toggle"
            onClick={() => setShowOperations(!showOperations)}
          >
            <span>Manufacturing Operations</span>
            <span className="toggle-arrow">{showOperations ? "^" : "v"}</span>
          </button>

          {showOperations && (
            <div className="mfg-operations">
              {timeEstimate.operations.map((op, index) => (
                <div key={index} className="mfg-operation">
                  <div className="mfg-op-header">
                    <span className="mfg-op-number">{index + 1}</span>
                    <span className="mfg-op-name">{op.name}</span>
                    {op.isOptional && <span className="mfg-op-optional">Optional</span>}
                  </div>
                  <div className="mfg-op-description">{op.description}</div>
                  <div className="mfg-op-times">
                    <span className="mfg-op-time">
                      <span className="mfg-op-time-label">Setup:</span>
                      <span className="mfg-op-time-value">{op.setupTimeMinutes}m</span>
                    </span>
                    <span className="mfg-op-time">
                      <span className="mfg-op-time-label">Cycle:</span>
                      <span className="mfg-op-time-value">{op.cycleTimeMinutes}m/part</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Time Breakdown */}
          <div className="mfg-breakdown">
            <div className="mfg-breakdown-row">
              <span className="mfg-breakdown-label">Setup (one-time)</span>
              <span className="mfg-breakdown-value">{timeEstimate.formattedSetupTime}</span>
            </div>
            <div className="mfg-breakdown-row">
              <span className="mfg-breakdown-label">Cycle time ({quantity} parts)</span>
              <span className="mfg-breakdown-value">
                {Math.round(timeEstimate.cycleTimePerPartMinutes * quantity)} min
              </span>
            </div>
            <div className="mfg-breakdown-row mfg-breakdown-total">
              <span className="mfg-breakdown-label">Total</span>
              <span className="mfg-breakdown-value">{timeEstimate.formattedTotalTime}</span>
            </div>
          </div>

          {/* Notes */}
          {timeEstimate.notes && timeEstimate.notes.length > 0 && (
            <div className="mfg-notes">
              {timeEstimate.notes.map((note, i) => (
                <div key={i} className="mfg-note">{note}</div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Disclaimer */}
      <div className="mfg-disclaimer">
        Time estimates are based on typical manufacturing scenarios.
        Actual times may vary based on shop capacity and tooling.
      </div>
    </div>
  );
}
