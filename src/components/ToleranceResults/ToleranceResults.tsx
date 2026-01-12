// Tolerance Results - Display stackup calculation results

import { useState } from 'react';
import type { ToleranceResult } from '../../lib/tolerance/types';
import { generateInsights } from '../../lib/tolerance/calculator';

interface ToleranceResultsProps {
  result: ToleranceResult | null;
  chainName: string;
}

type ResultView = 'summary' | 'contributions' | 'monteCarlo';

export function ToleranceResults({ result, chainName }: ToleranceResultsProps) {
  const [activeView, setActiveView] = useState<ResultView>('summary');

  if (!result) {
    return (
      <div className="tolerance-results-panel empty">
        <div className="tolerance-results-empty">
          <p>No results yet</p>
          <p className="tolerance-results-hint">
            Add dimensions to the chain and click Calculate
          </p>
        </div>
      </div>
    );
  }

  const insights = generateInsights(result);
  const wcTol = result.worstCase.tolerance;
  const rssTol = result.rss.tolerance;
  const savings = wcTol > 0 ? ((wcTol - rssTol) / wcTol) * 100 : 0;

  const getCpkClass = (cpk: number) => {
    if (cpk >= 1.33) return 'good';
    if (cpk >= 1.0) return 'ok';
    return 'bad';
  };

  return (
    <div className="tolerance-results-panel">
      <div className="tolerance-results-header">
        <span className="tolerance-results-title">{chainName} Results</span>
        <div className="tolerance-method-selector">
          <button
            className={`tolerance-method-btn ${activeView === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveView('summary')}
          >
            Summary
          </button>
          <button
            className={`tolerance-method-btn ${activeView === 'contributions' ? 'active' : ''}`}
            onClick={() => setActiveView('contributions')}
          >
            Contributors
          </button>
          {result.monteCarlo && (
            <button
              className={`tolerance-method-btn ${activeView === 'monteCarlo' ? 'active' : ''}`}
              onClick={() => setActiveView('monteCarlo')}
            >
              Monte Carlo
            </button>
          )}
        </div>
      </div>

      {activeView === 'summary' && (
        <div className="tolerance-results">
          {/* Main Results */}
          <div className="result-main">
            <div className="result-nominal">
              <span className="result-label">Total Nominal</span>
              <span className="result-value">{result.totalNominal.toFixed(3)} mm</span>
            </div>

            <div className="result-row">
              <div className="result-item worst-case">
                <span className="result-label">Worst Case</span>
                <span className="result-value">±{result.worstCase.tolerance.toFixed(3)}</span>
                <span className="result-range">
                  ({result.worstCase.min.toFixed(3)} to {result.worstCase.max.toFixed(3)})
                </span>
              </div>

              <div className="result-item rss">
                <span className="result-label">RSS (3σ)</span>
                <span className="result-value">±{result.rss.tolerance.toFixed(3)}</span>
                <span className="result-range">
                  ({result.rss.min.toFixed(3)} to {result.rss.max.toFixed(3)})
                </span>
              </div>
            </div>
          </div>

          {/* RSS Savings */}
          {savings > 5 && (
            <div className="result-savings">
              RSS shows {savings.toFixed(0)}% tighter tolerance than worst-case analysis
            </div>
          )}

          {/* Insights */}
          {insights.length > 0 && (
            <div className="tolerance-insights">
              <div className="insights-header">AI Insights</div>
              <ul className="insights-list">
                {insights.map((insight, index) => (
                  <li key={index} className="insight-item">
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {activeView === 'contributions' && (
        <div className="contribution-analysis">
          <div className="contrib-header">Variance Contribution</div>
          {result.contributions
            .sort((a, b) => b.percentOfTotal - a.percentOfTotal)
            .map((contrib) => (
              <div key={contrib.linkId} className="contrib-row">
                <span className="contrib-name" title={contrib.linkName}>
                  {contrib.linkName}
                </span>
                <div className="contrib-bar-container">
                  <div
                    className="contrib-bar"
                    style={{ width: `${contrib.percentOfTotal}%` }}
                  />
                </div>
                <span className="contrib-percent">
                  {contrib.percentOfTotal.toFixed(0)}%
                </span>
              </div>
            ))}
        </div>
      )}

      {activeView === 'monteCarlo' && result.monteCarlo && (
        <div className="monte-carlo-results">
          <div className="mc-header">
            Monte Carlo Simulation ({result.monteCarlo.sampleSize.toLocaleString()} samples)
          </div>

          <div className="mc-stats">
            <div className="mc-stat">
              <span className="mc-label">Mean</span>
              <span className="mc-value">{result.monteCarlo.mean.toFixed(3)}</span>
            </div>
            <div className="mc-stat">
              <span className="mc-label">Std Dev</span>
              <span className="mc-value">{result.monteCarlo.stdDev.toFixed(4)}</span>
            </div>
            <div className={`mc-stat cpk ${getCpkClass(result.monteCarlo.cpk)}`}>
              <span className="mc-label">Cpk</span>
              <span className="mc-value">{result.monteCarlo.cpk.toFixed(2)}</span>
            </div>
          </div>

          {/* Percentiles */}
          <div className="mc-percentiles">
            <div className="mc-percentile-header">Distribution Percentiles</div>
            <div className="mc-percentile-grid">
              <div className="mc-percentile">
                <span className="mc-p-label">0.1%</span>
                <span className="mc-p-value">
                  {result.monteCarlo.percentiles.p0_1.toFixed(3)}
                </span>
              </div>
              <div className="mc-percentile">
                <span className="mc-p-label">5%</span>
                <span className="mc-p-value">
                  {result.monteCarlo.percentiles.p5.toFixed(3)}
                </span>
              </div>
              <div className="mc-percentile highlight">
                <span className="mc-p-label">50%</span>
                <span className="mc-p-value">
                  {result.monteCarlo.percentiles.p50.toFixed(3)}
                </span>
              </div>
              <div className="mc-percentile">
                <span className="mc-p-label">95%</span>
                <span className="mc-p-value">
                  {result.monteCarlo.percentiles.p95.toFixed(3)}
                </span>
              </div>
              <div className="mc-percentile">
                <span className="mc-p-label">99.9%</span>
                <span className="mc-p-value">
                  {result.monteCarlo.percentiles.p99_9.toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          {/* Simple Histogram */}
          <div className="mc-histogram">
            <div className="mc-histogram-header">Distribution</div>
            <div className="mc-histogram-bars">
              {result.monteCarlo.histogram
                .filter((_, i) => i % 2 === 0) // Show every other bar for compactness
                .map((bin, index) => {
                  const maxPct = Math.max(
                    ...result.monteCarlo!.histogram.map((b) => b.percentage)
                  );
                  const height = (bin.percentage / maxPct) * 100;
                  return (
                    <div
                      key={index}
                      className="mc-histogram-bar"
                      style={{ height: `${height}%` }}
                      title={`${bin.min.toFixed(2)} - ${bin.max.toFixed(2)}: ${bin.percentage.toFixed(1)}%`}
                    />
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ToleranceResults;
