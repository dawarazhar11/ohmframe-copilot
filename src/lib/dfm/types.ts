// Manufacturing Process Types
export type ManufacturingProcess =
  | "sheet_metal"
  | "cnc_machining"
  | "injection_molding"
  | "die_casting"
  | "3d_printing_fdm"
  | "3d_printing_sla"
  | "weldment"
  | "pcba";

// Rule Severity Levels
export type RuleSeverity = "critical" | "warning" | "info";

// Rule Evaluation Status
export type RuleStatus = "pass" | "fail" | "warning" | "na";

// DFM Rule Definition
export interface DfmRule {
  id: string; // e.g., "SM-001"
  name: string; // e.g., "Minimum Bend Radius"
  process: ManufacturingProcess;
  category: string; // e.g., "Bending", "Holes", "Features"
  description: string; // Full description
  requirement: string; // e.g., ">= material thickness"
  threshold: {
    min?: number;
    max?: number;
    recommended?: number;
  };
  unit: string; // e.g., "mm", "ratio", "degrees", "x thickness"
  severity: RuleSeverity; // Impact if violated
  reasoning: string; // Why this rule matters
  fixSuggestion: string; // How to fix if violated
}

// Result of evaluating a single rule
export interface DfmRuleResult {
  ruleId: string;
  status: RuleStatus;
  actualValue?: string;
  expectedValue?: string;
  location?: string; // Where in the design
  confidence: number; // AI confidence 0-1
  recommendation?: string;
  notes?: string;
}

// Complete DFM Analysis Response
export interface DfmAnalysisResult {
  processDetected: ManufacturingProcess | "unknown";
  overallScore: number; // 0-100
  ruleResults: DfmRuleResult[];
  summary: string; // AI-generated summary
  rawCommentary?: string; // Original AI text response (fallback)
  timestamp: string;
  modelUsed?: string;
}

// Grouped results for UI display
export interface GroupedDfmResults {
  critical: DfmRuleResult[]; // Failed critical rules
  warnings: DfmRuleResult[]; // Failed warning/info rules
  passed: DfmRuleResult[]; // Passed rules
  notApplicable: DfmRuleResult[]; // N/A rules
}

// Process display info
export const PROCESS_LABELS: Record<ManufacturingProcess | "unknown", string> = {
  sheet_metal: "Sheet Metal",
  cnc_machining: "CNC Machining",
  injection_molding: "Injection Molding",
  die_casting: "Die Casting",
  "3d_printing_fdm": "3D Printing (FDM)",
  "3d_printing_sla": "3D Printing (SLA)",
  weldment: "Weldment",
  pcba: "PCBA",
  unknown: "Unknown Process",
};
