// TypeScript tolerance stackup calculator (fallback for when Rust is unavailable)

import type {
  ChainLink,
  ToleranceResult,
  WorstCaseResult,
  RssResult,
  MonteCarloResult,
  LinkContribution,
  HistogramBin,
} from './types';

/**
 * Calculate worst-case tolerance stackup
 */
export function calculateWorstCase(links: ChainLink[]): WorstCaseResult {
  let totalMin = 0;
  let totalMax = 0;

  for (const link of links) {
    const sign = link.direction === 'negative' ? -1 : 1;

    if (sign > 0) {
      totalMin += link.nominal - link.minusTolerance;
      totalMax += link.nominal + link.plusTolerance;
    } else {
      totalMin -= link.nominal + link.plusTolerance;
      totalMax -= link.nominal - link.minusTolerance;
    }
  }

  return {
    min: totalMin,
    max: totalMax,
    tolerance: (totalMax - totalMin) / 2,
    range: totalMax - totalMin,
  };
}

/**
 * Calculate RSS (Root Sum Square) tolerance stackup
 */
export function calculateRSS(links: ChainLink[]): { result: RssResult; variances: number[] } {
  let totalNominal = 0;
  const variances: number[] = [];

  for (const link of links) {
    const sign = link.direction === 'negative' ? -1 : 1;
    totalNominal += sign * link.nominal;

    const totalTol = link.plusTolerance + link.minusTolerance;
    const sigma = link.sigma || 3;

    let variance: number;
    if (link.distribution === 'uniform') {
      // Uniform distribution: variance = (range)^2 / 12
      variance = Math.pow(totalTol, 2) / 12;
    } else {
      // Normal distribution: tolerance = k*sigma, variance = (tolerance/k)^2
      const halfTol = totalTol / 2;
      variance = Math.pow(halfTol / sigma, 2);
    }

    variances.push(variance);
  }

  const totalVariance = variances.reduce((sum, v) => sum + v, 0);
  const stdDev = Math.sqrt(totalVariance);
  const tolerance = 3 * stdDev; // 3-sigma tolerance

  return {
    result: {
      min: totalNominal - tolerance,
      max: totalNominal + tolerance,
      tolerance,
      sigma: stdDev,
      processCapability: 1.0, // Cp = 1 when spec equals 3-sigma
    },
    variances,
  };
}

/**
 * Run Monte Carlo simulation
 */
export function runMonteCarlo(
  links: ChainLink[],
  samples: number = 10000,
  targetSpec?: { nominal: number; plusTolerance: number; minusTolerance: number }
): MonteCarloResult {
  const results: number[] = [];

  // Generate samples
  for (let i = 0; i < samples; i++) {
    let total = 0;

    for (const link of links) {
      const sign = link.direction === 'negative' ? -1 : 1;
      const sigma = link.sigma || 3;

      let sample: number;
      if (link.distribution === 'uniform') {
        // Uniform distribution
        sample = link.nominal - link.minusTolerance +
          Math.random() * (link.plusTolerance + link.minusTolerance);
      } else {
        // Normal distribution using Box-Muller transform
        const mean = link.nominal + (link.plusTolerance - link.minusTolerance) / 2;
        const std = (link.plusTolerance + link.minusTolerance) / (2 * sigma);
        sample = boxMullerRandom(mean, std);
      }

      total += sign * sample;
    }

    results.push(total);
  }

  // Sort for percentile calculation
  results.sort((a, b) => a - b);

  // Calculate statistics
  const mean = results.reduce((sum, x) => sum + x, 0) / samples;
  const variance = results.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / samples;
  const stdDev = Math.sqrt(variance);

  const min = results[0];
  const max = results[samples - 1];

  // Calculate Cpk
  let cpk = 1.0;
  if (targetSpec) {
    const upperLimit = targetSpec.nominal + targetSpec.plusTolerance;
    const lowerLimit = targetSpec.nominal - targetSpec.minusTolerance;
    const cpu = (upperLimit - mean) / (3 * stdDev);
    const cpl = (mean - lowerLimit) / (3 * stdDev);
    cpk = Math.min(cpu, cpl);
  }

  // Calculate percentiles
  const percentiles = {
    p0_1: results[Math.floor(samples * 0.001)],
    p1: results[Math.floor(samples * 0.01)],
    p5: results[Math.floor(samples * 0.05)],
    p50: results[Math.floor(samples / 2)],
    p95: results[Math.floor(samples * 0.95)],
    p99: results[Math.floor(samples * 0.99)],
    p99_9: results[Math.min(Math.floor(samples * 0.999), samples - 1)],
  };

  // Create histogram
  const numBins = 50;
  const binWidth = (max - min) / numBins;
  const histogram: HistogramBin[] = [];

  for (let i = 0; i < numBins; i++) {
    const binMin = min + i * binWidth;
    const binMax = binMin + binWidth;
    const count = results.filter(
      (x) => x >= binMin && (i === numBins - 1 || x < binMax)
    ).length;

    histogram.push({
      min: binMin,
      max: binMax,
      count,
      percentage: (100 * count) / samples,
    });
  }

  return {
    mean,
    stdDev,
    min,
    max,
    cpk,
    percentiles,
    histogram,
    sampleSize: samples,
  };
}

/**
 * Box-Muller transform for generating normal random numbers
 */
function boxMullerRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * Calculate variance contribution for each link
 */
export function calculateContributions(
  links: ChainLink[],
  variances: number[]
): LinkContribution[] {
  const totalVariance = variances.reduce((sum, v) => sum + v, 0);

  return links.map((link, index) => ({
    linkId: link.id,
    linkName: link.name,
    nominalContribution: link.direction === 'negative' ? -link.nominal : link.nominal,
    toleranceContribution: link.plusTolerance + link.minusTolerance,
    varianceContribution: variances[index],
    percentOfTotal: totalVariance > 0 ? (100 * variances[index]) / totalVariance : 0,
  }));
}

/**
 * Complete tolerance stackup calculation
 */
export function calculateToleranceStackup(
  links: ChainLink[],
  options: {
    runMonteCarlo?: boolean;
    monteCarloSamples?: number;
    targetSpec?: { nominal: number; plusTolerance: number; minusTolerance: number };
  } = {}
): ToleranceResult {
  const { runMonteCarlo: doMonteCarlo = true, monteCarloSamples = 10000, targetSpec } = options;

  // Calculate total nominal
  const totalNominal = links.reduce((sum, link) => {
    const sign = link.direction === 'negative' ? -1 : 1;
    return sum + sign * link.nominal;
  }, 0);

  // Worst-case analysis
  const worstCase = calculateWorstCase(links);

  // RSS analysis
  const { result: rss, variances } = calculateRSS(links);

  // Monte Carlo simulation (optional)
  const monteCarlo = doMonteCarlo
    ? runMonteCarlo(links, monteCarloSamples, targetSpec)
    : undefined;

  // Contribution analysis
  const contributions = calculateContributions(links, variances);

  // Assessment against target spec
  let meetsSpec: boolean | undefined;
  let margin: number | undefined;

  if (targetSpec) {
    const upperLimit = targetSpec.nominal + targetSpec.plusTolerance;
    const lowerLimit = targetSpec.nominal - targetSpec.minusTolerance;
    meetsSpec = rss.min >= lowerLimit && rss.max <= upperLimit;
    margin = Math.min(rss.min - lowerLimit, upperLimit - rss.max);
  }

  return {
    totalNominal,
    linkCount: links.length,
    worstCase,
    rss,
    monteCarlo,
    contributions,
    targetSpec,
    meetsSpec,
    margin,
  };
}

/**
 * Generate insights based on results
 */
export function generateInsights(result: ToleranceResult): string[] {
  const insights: string[] = [];

  // RSS vs Worst-case comparison
  const wcTol = result.worstCase.tolerance;
  const rssTol = result.rss.tolerance;
  const savings = ((wcTol - rssTol) / wcTol) * 100;

  if (savings > 20) {
    insights.push(
      `RSS analysis shows ${savings.toFixed(0)}% tighter tolerance than worst-case, suggesting statistical tolerancing could reduce costs.`
    );
  }

  // Top contributors
  const sorted = [...result.contributions].sort(
    (a, b) => b.percentOfTotal - a.percentOfTotal
  );
  if (sorted.length > 0 && sorted[0].percentOfTotal > 40) {
    insights.push(
      `"${sorted[0].linkName}" contributes ${sorted[0].percentOfTotal.toFixed(0)}% of total variance - tightening this tolerance would have the biggest impact.`
    );
  }

  // Cpk assessment
  if (result.monteCarlo) {
    const cpk = result.monteCarlo.cpk;
    if (cpk < 1.0) {
      insights.push(
        `Cpk of ${cpk.toFixed(2)} is below 1.0, indicating process may not meet specifications. Consider tightening tolerances.`
      );
    } else if (cpk >= 1.33) {
      insights.push(
        `Cpk of ${cpk.toFixed(2)} indicates a capable process with good margin to specification limits.`
      );
    }
  }

  // Target spec assessment
  if (result.targetSpec && result.meetsSpec === false) {
    insights.push(
      `Current stackup does NOT meet target specification. Consider relaxing the spec or tightening component tolerances.`
    );
  }

  return insights;
}
