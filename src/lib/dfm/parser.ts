// DFM Response Parser with Fallback Logic

import { getRuleById } from "./rules";
import type {
  DfmAnalysisResult,
  DfmRuleResult,
  GroupedDfmResults,
  ManufacturingProcess,
  RuleStatus,
} from "./types";

/**
 * Extract JSON from AI response that may contain markdown or other text
 */
function extractJson(text: string): string | null {
  // First, try to find JSON in code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return null;
}

/**
 * Validate and normalize a rule result from AI
 */
function validateRuleResult(result: unknown): DfmRuleResult | null {
  if (!result || typeof result !== "object") return null;

  const r = result as Record<string, unknown>;

  // ruleId is required
  if (!r.ruleId || typeof r.ruleId !== "string") return null;

  // Normalize status
  let status: RuleStatus = "na";
  if (typeof r.status === "string") {
    const s = r.status.toLowerCase();
    if (s === "pass" || s === "passed" || s === "ok") status = "pass";
    else if (s === "fail" || s === "failed" || s === "error") status = "fail";
    else if (s === "warning" || s === "warn") status = "warning";
    else status = "na";
  }

  // Normalize confidence
  let confidence = 0.5;
  if (typeof r.confidence === "number") {
    confidence = Math.min(1, Math.max(0, r.confidence));
  }

  return {
    ruleId: r.ruleId as string,
    status,
    actualValue: typeof r.actualValue === "string" ? r.actualValue : undefined,
    expectedValue: typeof r.expectedValue === "string" ? r.expectedValue : undefined,
    location: typeof r.location === "string" ? r.location : undefined,
    confidence,
    recommendation: typeof r.recommendation === "string" ? r.recommendation : undefined,
    notes: typeof r.notes === "string" ? r.notes : undefined,
  };
}

/**
 * Validate manufacturing process string
 */
function validateProcess(process: unknown): ManufacturingProcess | "unknown" {
  const validProcesses: Array<ManufacturingProcess | "unknown"> = [
    "sheet_metal",
    "cnc_machining",
    "injection_molding",
    "die_casting",
    "3d_printing_fdm",
    "3d_printing_sla",
    "weldment",
    "pcba",
    "unknown",
  ];

  if (typeof process === "string") {
    const normalized = process.toLowerCase().replace(/[- ]/g, "_");
    if (validProcesses.includes(normalized as ManufacturingProcess)) {
      return normalized as ManufacturingProcess;
    }
  }

  return "unknown";
}

/**
 * Parse AI response into structured DFM analysis result
 * Handles malformed JSON and provides fallback
 */
export function parseDfmResponse(
  rawResponse: string,
  modelUsed?: string
): DfmAnalysisResult {
  const timestamp = new Date().toISOString();

  // Try to extract and parse JSON
  const jsonString = extractJson(rawResponse);

  if (jsonString) {
    try {
      const parsed = JSON.parse(jsonString);

      // Validate and extract process
      const processDetected = validateProcess(parsed.processDetected || parsed.process);

      // Validate overall score
      let overallScore = 50;
      if (typeof parsed.overallScore === "number") {
        overallScore = Math.min(100, Math.max(0, Math.round(parsed.overallScore)));
      } else if (typeof parsed.score === "number") {
        overallScore = Math.min(100, Math.max(0, Math.round(parsed.score)));
      }

      // Parse rule results
      const ruleResults: DfmRuleResult[] = [];
      if (Array.isArray(parsed.ruleResults)) {
        for (const result of parsed.ruleResults) {
          const validated = validateRuleResult(result);
          if (validated) {
            ruleResults.push(validated);
          }
        }
      } else if (Array.isArray(parsed.rules)) {
        // Alternative field name
        for (const result of parsed.rules) {
          const validated = validateRuleResult(result);
          if (validated) {
            ruleResults.push(validated);
          }
        }
      }

      // Extract summary
      let summary = "DFM analysis complete.";
      if (typeof parsed.summary === "string" && parsed.summary.length > 0) {
        summary = parsed.summary;
      } else if (typeof parsed.description === "string") {
        summary = parsed.description;
      }

      return {
        processDetected,
        overallScore,
        ruleResults,
        summary,
        timestamp,
        modelUsed,
      };
    } catch (e) {
      // JSON parsing failed, fall through to fallback
      console.warn("DFM JSON parse error:", e);
    }
  }

  // Fallback: Return raw response as commentary
  return {
    processDetected: "unknown",
    overallScore: 0,
    ruleResults: [],
    summary: "Could not parse structured response. See raw commentary below.",
    rawCommentary: rawResponse,
    timestamp,
    modelUsed,
  };
}

/**
 * Group DFM results by severity for UI display
 */
export function groupDfmResults(result: DfmAnalysisResult): GroupedDfmResults {
  const grouped: GroupedDfmResults = {
    critical: [],
    warnings: [],
    passed: [],
    notApplicable: [],
  };

  for (const ruleResult of result.ruleResults) {
    // Get the rule definition to check severity
    const rule = getRuleById(ruleResult.ruleId);
    const severity = rule?.severity || "info";

    switch (ruleResult.status) {
      case "fail":
        if (severity === "critical") {
          grouped.critical.push(ruleResult);
        } else {
          grouped.warnings.push(ruleResult);
        }
        break;
      case "warning":
        grouped.warnings.push(ruleResult);
        break;
      case "pass":
        grouped.passed.push(ruleResult);
        break;
      case "na":
      default:
        grouped.notApplicable.push(ruleResult);
        break;
    }
  }

  // Sort each group by confidence (highest first)
  const sortByConfidence = (a: DfmRuleResult, b: DfmRuleResult) =>
    b.confidence - a.confidence;

  grouped.critical.sort(sortByConfidence);
  grouped.warnings.sort(sortByConfidence);
  grouped.passed.sort(sortByConfidence);
  grouped.notApplicable.sort(sortByConfidence);

  return grouped;
}

/**
 * Calculate summary statistics for display
 */
export function getDfmStats(result: DfmAnalysisResult): {
  totalRules: number;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  naCount: number;
  criticalFailures: number;
} {
  let passedCount = 0;
  let failedCount = 0;
  let warningCount = 0;
  let naCount = 0;
  let criticalFailures = 0;

  for (const ruleResult of result.ruleResults) {
    switch (ruleResult.status) {
      case "pass":
        passedCount++;
        break;
      case "fail":
        failedCount++;
        const rule = getRuleById(ruleResult.ruleId);
        if (rule?.severity === "critical") {
          criticalFailures++;
        }
        break;
      case "warning":
        warningCount++;
        break;
      default:
        naCount++;
    }
  }

  return {
    totalRules: result.ruleResults.length,
    passedCount,
    failedCount,
    warningCount,
    naCount,
    criticalFailures,
  };
}

/**
 * Get score color based on DFM score
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

/**
 * Get score label based on DFM score
 */
export function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 70) return "Acceptable";
  if (score >= 60) return "Needs Improvement";
  if (score >= 40) return "Poor";
  return "Critical Issues";
}
