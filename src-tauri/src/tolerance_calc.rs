// Tolerance stackup calculations

use serde::{Deserialize, Serialize};
use rand::Rng;
use rand::distributions::{Distribution, Uniform};
use rand_distr::Normal;

/// Input for tolerance calculation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToleranceInput {
    pub links: Vec<LinkInput>,
    pub monte_carlo_samples: Option<usize>,
    pub target_spec: Option<TargetSpec>,
}

/// Individual link input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkInput {
    pub nominal: f64,
    pub plus_tolerance: f64,
    pub minus_tolerance: f64,
    pub direction: String,       // "positive" or "negative"
    pub distribution: String,    // "normal" or "uniform"
    pub sigma: Option<f64>,      // Default 3.0 for normal distribution
}

/// Target specification for comparison
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetSpec {
    pub nominal: f64,
    pub plus_tolerance: f64,
    pub minus_tolerance: f64,
}

/// Result of tolerance calculation
#[derive(Debug, Serialize, Deserialize)]
pub struct ToleranceCalcResult {
    pub success: bool,
    pub error: Option<String>,
    pub total_nominal: f64,
    pub worst_case: WorstCaseResult,
    pub rss: RssResult,
    pub monte_carlo: Option<MonteCarloResult>,
    pub contributions: Vec<ContributionResult>,
}

/// Worst-case analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorstCaseResult {
    pub min: f64,
    pub max: f64,
    pub tolerance: f64,
}

/// RSS analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RssResult {
    pub min: f64,
    pub max: f64,
    pub tolerance: f64,
    pub sigma: f64,
}

/// Monte Carlo simulation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonteCarloResult {
    pub mean: f64,
    pub std_dev: f64,
    pub min: f64,
    pub max: f64,
    pub cpk: f64,
    pub percentiles: PercentileResult,
    pub histogram: Vec<HistogramBin>,
}

/// Percentile values
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PercentileResult {
    pub p0_1: f64,
    pub p1: f64,
    pub p5: f64,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub p99_9: f64,
}

/// Histogram bin
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistogramBin {
    pub min: f64,
    pub max: f64,
    pub count: usize,
    pub percentage: f64,
}

/// Contribution of each link
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributionResult {
    pub index: usize,
    pub nominal_contribution: f64,
    pub variance_contribution: f64,
    pub percent: f64,
}

/// Calculate tolerance stackup
#[tauri::command]
pub fn calculate_tolerance_stackup(input: ToleranceInput) -> ToleranceCalcResult {
    if input.links.is_empty() {
        return ToleranceCalcResult {
            success: false,
            error: Some("No links provided".to_string()),
            total_nominal: 0.0,
            worst_case: WorstCaseResult { min: 0.0, max: 0.0, tolerance: 0.0 },
            rss: RssResult { min: 0.0, max: 0.0, tolerance: 0.0, sigma: 0.0 },
            monte_carlo: None,
            contributions: vec![],
        };
    }

    // Calculate total nominal
    let total_nominal: f64 = input.links.iter()
        .map(|link| {
            let sign = if link.direction == "negative" { -1.0 } else { 1.0 };
            sign * link.nominal
        })
        .sum();

    // Worst-case analysis
    let worst_case = calculate_worst_case(&input.links);

    // RSS analysis
    let (rss, variances) = calculate_rss(&input.links);

    // Contribution analysis
    let total_variance: f64 = variances.iter().sum();
    let contributions: Vec<ContributionResult> = input.links.iter().enumerate()
        .map(|(i, link)| {
            let sign = if link.direction == "negative" { -1.0 } else { 1.0 };
            ContributionResult {
                index: i,
                nominal_contribution: sign * link.nominal,
                variance_contribution: variances[i],
                percent: if total_variance > 0.0 {
                    100.0 * variances[i] / total_variance
                } else {
                    0.0
                },
            }
        })
        .collect();

    // Monte Carlo simulation (optional)
    let monte_carlo = if let Some(samples) = input.monte_carlo_samples {
        Some(run_monte_carlo(&input.links, samples, input.target_spec.as_ref()))
    } else {
        // Default to 10000 samples
        Some(run_monte_carlo(&input.links, 10000, input.target_spec.as_ref()))
    };

    ToleranceCalcResult {
        success: true,
        error: None,
        total_nominal,
        worst_case,
        rss,
        monte_carlo,
        contributions,
    }
}

/// Calculate worst-case stackup
fn calculate_worst_case(links: &[LinkInput]) -> WorstCaseResult {
    let mut total_min = 0.0;
    let mut total_max = 0.0;

    for link in links {
        let sign = if link.direction == "negative" { -1.0 } else { 1.0 };

        if sign > 0.0 {
            // Positive direction: nominal - minus to nominal + plus
            total_min += link.nominal - link.minus_tolerance;
            total_max += link.nominal + link.plus_tolerance;
        } else {
            // Negative direction: -(nominal + plus) to -(nominal - minus)
            total_min -= link.nominal + link.plus_tolerance;
            total_max -= link.nominal - link.minus_tolerance;
        }
    }

    WorstCaseResult {
        min: total_min,
        max: total_max,
        tolerance: (total_max - total_min) / 2.0,
    }
}

/// Calculate RSS (Root Sum Square) stackup
fn calculate_rss(links: &[LinkInput]) -> (RssResult, Vec<f64>) {
    let mut total_nominal = 0.0;
    let mut variances: Vec<f64> = Vec::new();

    for link in links {
        let sign = if link.direction == "negative" { -1.0 } else { 1.0 };
        total_nominal += sign * link.nominal;

        // Calculate variance based on distribution
        let total_tol = link.plus_tolerance + link.minus_tolerance;
        let sigma = link.sigma.unwrap_or(3.0);

        let variance = match link.distribution.as_str() {
            "normal" => {
                // For normal distribution, tolerance = k*sigma
                // Variance = (tolerance / k)^2
                let half_tol = total_tol / 2.0;
                (half_tol / sigma).powi(2)
            }
            "uniform" => {
                // For uniform distribution, variance = (range)^2 / 12
                total_tol.powi(2) / 12.0
            }
            _ => {
                // Default to normal
                let half_tol = total_tol / 2.0;
                (half_tol / sigma).powi(2)
            }
        };

        variances.push(variance);
    }

    let total_variance: f64 = variances.iter().sum();
    let std_dev = total_variance.sqrt();

    // RSS tolerance at 3 sigma
    let tolerance = 3.0 * std_dev;

    (RssResult {
        min: total_nominal - tolerance,
        max: total_nominal + tolerance,
        tolerance,
        sigma: std_dev,
    }, variances)
}

/// Run Monte Carlo simulation
fn run_monte_carlo(links: &[LinkInput], samples: usize, target_spec: Option<&TargetSpec>) -> MonteCarloResult {
    let mut rng = rand::thread_rng();
    let mut results: Vec<f64> = Vec::with_capacity(samples);

    // Generate samples
    for _ in 0..samples {
        let mut total = 0.0;

        for link in links {
            let sign = if link.direction == "negative" { -1.0 } else { 1.0 };
            let nominal = link.nominal;
            let plus = link.plus_tolerance;
            let minus = link.minus_tolerance;
            let sigma = link.sigma.unwrap_or(3.0);

            let sample = match link.distribution.as_str() {
                "uniform" => {
                    let uniform = Uniform::new(nominal - minus, nominal + plus);
                    uniform.sample(&mut rng)
                }
                _ => {
                    // Normal distribution
                    let mean = nominal + (plus - minus) / 2.0;  // Adjust for asymmetric tolerance
                    let std = (plus + minus) / (2.0 * sigma);
                    let normal = Normal::new(mean, std).unwrap_or(Normal::new(mean, 0.001).unwrap());
                    normal.sample(&mut rng)
                }
            };

            total += sign * sample;
        }

        results.push(total);
    }

    // Sort for percentile calculation
    results.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    // Calculate statistics
    let mean: f64 = results.iter().sum::<f64>() / samples as f64;
    let variance: f64 = results.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / samples as f64;
    let std_dev = variance.sqrt();

    let min = results[0];
    let max = results[samples - 1];

    // Calculate Cpk
    let cpk = if let Some(spec) = target_spec {
        let upper_limit = spec.nominal + spec.plus_tolerance;
        let lower_limit = spec.nominal - spec.minus_tolerance;
        let cpu = (upper_limit - mean) / (3.0 * std_dev);
        let cpl = (mean - lower_limit) / (3.0 * std_dev);
        cpu.min(cpl)
    } else {
        // Use ±3sigma as spec limits
        1.0
    };

    // Calculate percentiles
    let percentiles = PercentileResult {
        p0_1: results[(samples as f64 * 0.001) as usize],
        p1: results[(samples as f64 * 0.01) as usize],
        p5: results[(samples as f64 * 0.05) as usize],
        p50: results[samples / 2],
        p95: results[(samples as f64 * 0.95) as usize],
        p99: results[(samples as f64 * 0.99) as usize],
        p99_9: results[(samples as f64 * 0.999).min((samples - 1) as f64) as usize],
    };

    // Create histogram
    let num_bins = 50;
    let bin_width = (max - min) / num_bins as f64;
    let mut histogram: Vec<HistogramBin> = Vec::with_capacity(num_bins);

    for i in 0..num_bins {
        let bin_min = min + i as f64 * bin_width;
        let bin_max = bin_min + bin_width;
        let count = results.iter()
            .filter(|&&x| x >= bin_min && (i == num_bins - 1 || x < bin_max))
            .count();

        histogram.push(HistogramBin {
            min: bin_min,
            max: bin_max,
            count,
            percentage: 100.0 * count as f64 / samples as f64,
        });
    }

    MonteCarloResult {
        mean,
        std_dev,
        min,
        max,
        cpk,
        percentiles,
        histogram,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_worst_case_single_link() {
        let links = vec![LinkInput {
            nominal: 10.0,
            plus_tolerance: 0.1,
            minus_tolerance: 0.1,
            direction: "positive".to_string(),
            distribution: "normal".to_string(),
            sigma: Some(3.0),
        }];

        let result = calculate_worst_case(&links);
        assert!((result.min - 9.9).abs() < 1e-6);
        assert!((result.max - 10.1).abs() < 1e-6);
    }

    #[test]
    fn test_worst_case_stack() {
        let links = vec![
            LinkInput {
                nominal: 10.0,
                plus_tolerance: 0.1,
                minus_tolerance: 0.1,
                direction: "positive".to_string(),
                distribution: "normal".to_string(),
                sigma: Some(3.0),
            },
            LinkInput {
                nominal: 5.0,
                plus_tolerance: 0.05,
                minus_tolerance: 0.05,
                direction: "positive".to_string(),
                distribution: "normal".to_string(),
                sigma: Some(3.0),
            },
        ];

        let result = calculate_worst_case(&links);
        assert!((result.min - 14.85).abs() < 1e-6);
        assert!((result.max - 15.15).abs() < 1e-6);
    }

    #[test]
    fn test_monte_carlo() {
        let links = vec![LinkInput {
            nominal: 10.0,
            plus_tolerance: 0.1,
            minus_tolerance: 0.1,
            direction: "positive".to_string(),
            distribution: "normal".to_string(),
            sigma: Some(3.0),
        }];

        let result = run_monte_carlo(&links, 1000, None);
        assert!((result.mean - 10.0).abs() < 0.1);  // Mean should be close to nominal
    }
}
