// Tolerance stackup types

/**
 * Statistical distribution type for tolerance analysis
 */
export type DistributionType = 'normal' | 'uniform' | 'triangular';

/**
 * Direction of contribution to stackup
 */
export type ContributionDirection = 'positive' | 'negative';

/**
 * Type of link in tolerance chain
 */
export type LinkType = 'part_dimension' | 'interface_gap' | 'datum_reference';

/**
 * Individual link in a tolerance chain
 */
export interface ChainLink {
  id: string;
  type: LinkType;
  name: string;
  // Reference to part or interface
  partId?: string;
  interfaceId?: string;
  faceId?: string;
  // Dimension values
  nominal: number;               // Nominal dimension (mm)
  plusTolerance: number;         // Upper tolerance (+mm)
  minusTolerance: number;        // Lower tolerance (-mm, stored as positive)
  // Analysis parameters
  direction: ContributionDirection;
  distribution: DistributionType;
  // Optional: for RSS with different sigma
  sigma?: number;                // Number of standard deviations (default 3)
  // UI state
  isEditing?: boolean;
  hasError?: boolean;
  errorMessage?: string;
}

/**
 * Tolerance chain definition
 */
export interface ToleranceChain {
  id: string;
  name: string;
  description?: string;
  // Chain direction (unit vector for measurement direction)
  direction: [number, number, number];
  // Ordered list of links
  links: ChainLink[];
  // Datum references
  startDatum?: {
    partId: string;
    faceId: string;
    description: string;
  };
  endDatum?: {
    partId: string;
    faceId: string;
    description: string;
  };
  // Calculated result
  result?: ToleranceResult;
  // UI state
  isComplete: boolean;
  isCalculated: boolean;
}

/**
 * Worst-case analysis result
 */
export interface WorstCaseResult {
  min: number;                   // Minimum possible value
  max: number;                   // Maximum possible value
  tolerance: number;             // Total tolerance (max - min) / 2
  range: number;                 // Total range (max - min)
}

/**
 * RSS (Root Sum Square) analysis result
 */
export interface RssResult {
  min: number;                   // Statistical min (mean - tolerance)
  max: number;                   // Statistical max (mean + tolerance)
  tolerance: number;             // RSS tolerance
  sigma: number;                 // Standard deviation
  processCapability: number;     // Cp value if spec provided
}

/**
 * Monte Carlo simulation result
 */
export interface MonteCarloResult {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  cpk: number;                   // Process capability index
  percentiles: {
    p0_1: number;                // 0.1%
    p1: number;                  // 1%
    p5: number;                  // 5%
    p50: number;                 // 50% (median)
    p95: number;                 // 95%
    p99: number;                 // 99%
    p99_9: number;               // 99.9%
  };
  histogram: HistogramBin[];
  sampleSize: number;
}

/**
 * Histogram bin for Monte Carlo visualization
 */
export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  percentage: number;
}

/**
 * Contribution analysis for each link
 */
export interface LinkContribution {
  linkId: string;
  linkName: string;
  nominalContribution: number;
  toleranceContribution: number;
  varianceContribution: number;
  percentOfTotal: number;
}

/**
 * Complete tolerance result
 */
export interface ToleranceResult {
  // Basic results
  totalNominal: number;
  linkCount: number;
  // Analysis methods
  worstCase: WorstCaseResult;
  rss: RssResult;
  monteCarlo?: MonteCarloResult;
  // Contribution breakdown
  contributions: LinkContribution[];
  // Target spec (if provided)
  targetSpec?: {
    nominal: number;
    plusTolerance: number;
    minusTolerance: number;
  };
  // Assessment
  meetsSpec?: boolean;
  margin?: number;               // How much margin to spec
}

/**
 * Input for Rust calculator
 */
export interface ToleranceCalcInput {
  links: {
    nominal: number;
    plusTolerance: number;
    minusTolerance: number;
    direction: 'positive' | 'negative';
    distribution: 'normal' | 'uniform';
    sigma?: number;
  }[];
  monteCarloSamples?: number;    // Default 10000
  targetSpec?: {
    nominal: number;
    plusTolerance: number;
    minusTolerance: number;
  };
}

/**
 * Result from Rust calculator
 */
export interface ToleranceCalcResult {
  success: boolean;
  error?: string;
  totalNominal: number;
  worstCase: {
    min: number;
    max: number;
    tolerance: number;
  };
  rss: {
    min: number;
    max: number;
    tolerance: number;
    sigma: number;
  };
  monteCarlo?: {
    mean: number;
    stdDev: number;
    cpk: number;
    percentiles: Record<string, number>;
    histogram: { min: number; max: number; count: number }[];
  };
  contributions: {
    index: number;
    percent: number;
  }[];
}

/**
 * Tolerance stackup mode state
 */
export interface ToleranceStackupState {
  chains: ToleranceChain[];
  activeChainId?: string;
  isBuilding: boolean;
  buildStep: 'select_start' | 'add_links' | 'select_end' | 'input_values' | 'complete';
  pendingLinks: Partial<ChainLink>[];
}

/**
 * Create a new empty chain
 */
export function createNewChain(id: string, name: string): ToleranceChain {
  return {
    id,
    name,
    direction: [1, 0, 0],
    links: [],
    isComplete: false,
    isCalculated: false,
  };
}

/**
 * Create a new link with defaults
 */
export function createNewLink(
  id: string,
  type: LinkType,
  name: string,
  nominal: number = 0
): ChainLink {
  return {
    id,
    type,
    name,
    nominal,
    plusTolerance: 0.1,
    minusTolerance: 0.1,
    direction: 'positive',
    distribution: 'normal',
    sigma: 3,
  };
}

/**
 * Suggested tolerances by interface type
 */
export const SUGGESTED_TOLERANCES: Record<string, { plus: number; minus: number }> = {
  face_to_face: { plus: 0.05, minus: 0.05 },
  pin_in_hole: { plus: 0.025, minus: 0.025 },
  shaft_in_bore: { plus: 0.016, minus: 0.016 },
  thread_engagement: { plus: 0.1, minus: 0.1 },
  unknown: { plus: 0.1, minus: 0.1 },
};

/**
 * Standard fit tolerances (ISO)
 */
export const STANDARD_FITS = {
  clearance: {
    H7g6: { hole: { plus: 0.025, minus: 0 }, shaft: { plus: 0, minus: 0.016 } },
    H8f7: { hole: { plus: 0.033, minus: 0 }, shaft: { plus: 0, minus: 0.025 } },
    H9d9: { hole: { plus: 0.052, minus: 0 }, shaft: { plus: 0, minus: 0.052 } },
  },
  transition: {
    H7k6: { hole: { plus: 0.025, minus: 0 }, shaft: { plus: 0.015, minus: 0.001 } },
    H7n6: { hole: { plus: 0.025, minus: 0 }, shaft: { plus: 0.023, minus: 0.002 } },
  },
  interference: {
    H7p6: { hole: { plus: 0.025, minus: 0 }, shaft: { plus: 0.035, minus: 0.022 } },
    H7s6: { hole: { plus: 0.025, minus: 0 }, shaft: { plus: 0.043, minus: 0.035 } },
  },
};
