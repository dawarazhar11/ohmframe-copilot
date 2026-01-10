// Cost Estimation Types

export interface CostBreakdown {
  material: number;
  labor: number;
  tooling: number;
  overhead: number;
  total: number;
}

export interface CostEstimate {
  process: ManufacturingProcess;
  unitCost: CostBreakdown;
  quantity: number;
  totalCost: number;
  leadTime: string; // e.g., "2-3 weeks"
  confidence: number; // 0-1
  notes?: string[];
}

export interface CostAnalysisResult {
  estimates: CostEstimate[];
  recommendedProcess: ManufacturingProcess;
  savings?: {
    alternativeProcess: ManufacturingProcess;
    savingsPercent: number;
    tradeoffs: string[];
  };
  volumeBreaks?: VolumeBreak[];
}

export interface VolumeBreak {
  quantity: number;
  unitCost: number;
  notes: string;
}

export type ManufacturingProcess =
  | "sheet_metal"
  | "cnc_machining"
  | "injection_molding"
  | "die_casting"
  | "3d_printing_fdm"
  | "3d_printing_sla"
  | "weldment"
  | "pcba";

export const PROCESS_COST_LABELS: Record<ManufacturingProcess, string> = {
  sheet_metal: "Sheet Metal Fabrication",
  cnc_machining: "CNC Machining",
  injection_molding: "Injection Molding",
  die_casting: "Die Casting",
  "3d_printing_fdm": "3D Printing (FDM)",
  "3d_printing_sla": "3D Printing (SLA)",
  weldment: "Weldment",
  pcba: "PCB Assembly",
};

// Mock cost data for different processes ($/unit at qty 100)
export const PROCESS_BASE_COSTS: Record<ManufacturingProcess, CostBreakdown> = {
  sheet_metal: { material: 15, labor: 25, tooling: 5, overhead: 10, total: 55 },
  cnc_machining: { material: 20, labor: 40, tooling: 10, overhead: 15, total: 85 },
  injection_molding: { material: 2, labor: 3, tooling: 50, overhead: 5, total: 60 },
  die_casting: { material: 3, labor: 5, tooling: 80, overhead: 7, total: 95 },
  "3d_printing_fdm": { material: 8, labor: 5, tooling: 0, overhead: 7, total: 20 },
  "3d_printing_sla": { material: 15, labor: 8, tooling: 0, overhead: 10, total: 33 },
  weldment: { material: 30, labor: 50, tooling: 5, overhead: 15, total: 100 },
  pcba: { material: 25, labor: 15, tooling: 10, overhead: 10, total: 60 },
};

// Lead times by process
export const PROCESS_LEAD_TIMES: Record<ManufacturingProcess, string> = {
  sheet_metal: "1-2 weeks",
  cnc_machining: "1-2 weeks",
  injection_molding: "6-8 weeks (tooling) + 1-2 weeks",
  die_casting: "8-12 weeks (tooling) + 2-3 weeks",
  "3d_printing_fdm": "2-5 days",
  "3d_printing_sla": "2-5 days",
  weldment: "2-3 weeks",
  pcba: "2-4 weeks",
};
