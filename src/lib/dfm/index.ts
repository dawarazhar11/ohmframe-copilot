// DFM Library - Design for Manufacturing Rule Checker
// Barrel export for all DFM functionality

// Types
export type {
  ManufacturingProcess,
  RuleSeverity,
  RuleStatus,
  DfmRule,
  DfmRuleResult,
  DfmAnalysisResult,
  GroupedDfmResults,
} from "./types";

export { PROCESS_LABELS } from "./types";

// Rules
export {
  DFM_RULES,
  getRulesByProcess,
  getRuleById,
  getCategoriesByProcess,
  getRuleCountByProcess,
} from "./rules";

// Parser
export {
  parseDfmResponse,
  groupDfmResults,
  getDfmStats,
  getScoreColor,
  getScoreLabel,
} from "./parser";
