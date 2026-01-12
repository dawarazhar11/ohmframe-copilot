// Assembly types for tolerance stackup mode

import type { BoundingBox } from '../mesh/types';
import type { ToleranceChain } from '../tolerance/types';

/**
 * Face type classifications from STEP geometry
 */
export type FaceType = 'planar' | 'cylindrical' | 'conical' | 'spherical' | 'toroidal' | 'freeform';

/**
 * Interface type classifications for mating analysis
 */
export type InterfaceType = 'face_to_face' | 'pin_in_hole' | 'shaft_in_bore' | 'thread_engagement' | 'unknown';

/**
 * Individual face within a part
 */
export interface PartFace {
  id: number;
  globalId: string;              // `${partId}-face-${faceId}`
  faceType: FaceType;
  normal: [number, number, number];
  center: [number, number, number];
  area: number;
  // Optional geometry data for cylindrical/conical faces
  radius?: number;
  axis?: [number, number, number];
}

/**
 * Single part within an assembly
 */
export interface AssemblyPart {
  id: string;
  name: string;
  stepEntityId: number;
  transform: number[];           // 4x4 matrix flattened (16 values)
  boundingBox: BoundingBox;
  faces: PartFace[];
  color?: [number, number, number];
  // Mesh data for 3D rendering
  meshVertices?: number[];
  meshIndices?: number[];
  meshNormals?: number[];
}

/**
 * Mating interface between two parts
 */
export interface MatingInterface {
  id: string;
  partA: {
    partId: string;
    faceId: string;
    faceName?: string;
  };
  partB: {
    partId: string;
    faceId: string;
    faceName?: string;
  };
  interfaceType: InterfaceType;
  // Detection metrics
  proximity: number;             // Distance between faces (mm)
  normalAlignment: number;       // Cosine of angle between normals (0-1)
  contactArea: number;           // Estimated contact area (mm^2)
  // Tolerance defaults
  defaultTolerance: number;      // Suggested tolerance based on interface type
  defaultDistribution: 'normal' | 'uniform';
  // Visual data
  contactPoint: [number, number, number];
  isJunction?: boolean;          // Part has multiple interfaces
}

/**
 * Assembly graph containing parts and their relationships
 */
export interface AssemblyGraph {
  parts: Map<string, AssemblyPart>;
  interfaces: Map<string, MatingInterface>;
  chains: Map<string, ToleranceChain>;
  partAdjacency: Map<string, string[]>;  // partId -> connected partIds
}

/**
 * Result from Rust assembly parsing
 */
export interface AssemblyParseResult {
  success: boolean;
  error?: string;
  filename?: string;
  parts: ParsedPart[];
  totalParts: number;
  hasSubAssemblies: boolean;
}

/**
 * Individual part from STEP parsing
 */
export interface ParsedPart {
  id: string;
  name: string;
  stepEntityId: number;
  transform: number[];           // 4x4 matrix
  boundingBox?: BoundingBox;
  faces: ParsedFace[];
  // Raw STEP data
  productDefinitionId?: number;
}

/**
 * Face data from STEP parsing
 */
export interface ParsedFace {
  id: number;
  faceType: FaceType;
  normal: [number, number, number];
  center: [number, number, number];
  area: number;
  radius?: number;
  axis?: [number, number, number];
  // Original STEP entity reference
  stepEntityId?: number;
}

/**
 * Result from interface detection
 */
export interface InterfaceDetectionResult {
  success: boolean;
  error?: string;
  interfaces: DetectedInterface[];
  junctionParts: string[];       // Parts with >1 interface
  totalInterfaces: number;
}

/**
 * Individual detected interface
 */
export interface DetectedInterface {
  id: string;
  partAId: string;
  partAFaceId: number;
  partBId: string;
  partBFaceId: number;
  interfaceType: InterfaceType;
  proximity: number;
  normalAlignment: number;
  contactArea: number;
  contactPoint: [number, number, number];
}

/**
 * Parameters for interface detection
 */
export interface InterfaceDetectionParams {
  proximityThreshold: number;    // Max distance for potential contact (default 2.0mm)
  normalThreshold: number;       // Min alignment for face-to-face (default 0.95, ~18 deg)
  minContactArea: number;        // Min area for valid interface (default 1.0 mm^2)
}

/**
 * Default detection parameters
 */
export const DEFAULT_DETECTION_PARAMS: InterfaceDetectionParams = {
  proximityThreshold: 2.0,
  normalThreshold: 0.95,
  minContactArea: 1.0,
};

/**
 * Assembly state for UI
 */
export interface AssemblyState {
  isLoading: boolean;
  error?: string;
  parts: AssemblyPart[];
  interfaces: MatingInterface[];
  selectedPartId?: string;
  selectedInterfaceId?: string;
  highlightedFaces: string[];    // globalIds of highlighted faces
}

/**
 * Convert parsed data to assembly graph
 */
export function createEmptyAssemblyGraph(): AssemblyGraph {
  return {
    parts: new Map(),
    interfaces: new Map(),
    chains: new Map(),
    partAdjacency: new Map(),
  };
}
