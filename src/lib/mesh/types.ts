// Mesh data types matching Rust structs

export interface MeshData {
  vertices: number[];      // [x1,y1,z1,x2,y2,z2,...] flat array
  indices: number[];       // Triangle indices
  normals: number[];       // Per-vertex normals
  face_groups: FaceGroup[]; // Map triangles to STEP faces
}

export interface FaceGroup {
  face_id: number;         // STEP entity ID
  face_type: string;       // "planar", "cylindrical", "curved", etc.
  start_index: number;     // First triangle index in indices array
  triangle_count: number;  // Number of triangles
  center: [number, number, number]; // Face center for marker placement
}

export interface BoundingBox {
  min: [number, number, number];
  max: [number, number, number];
  dimensions: [number, number, number];
}

export interface StepMeshResult {
  success: boolean;
  error?: string;
  filename?: string;
  mesh?: MeshData;
  bounding_box?: BoundingBox;
  topology?: {
    num_solids: number;
    num_shells: number;
    num_faces: number;
    num_edges: number;
    num_vertices: number;
  };
  features?: {
    cylindrical_faces: number;
    planar_faces: number;
    curved_faces: number;
  };
}

export interface FailedFace {
  ruleId: string;
  faceId: number;
  center: [number, number, number];
  faceType: string;
  status: 'fail' | 'warning';
}

// Assembly mesh data structures for tolerance stackup mode

/**
 * Mesh data for a single part in an assembly
 */
export interface PartMeshData {
  partId: string;
  partName: string;
  vertices: number[];      // [x1,y1,z1,...] flat array
  indices: number[];       // Triangle indices
  normals: number[];       // Per-vertex normals
  faceGroups: FaceGroup[];
  transform: number[];     // 4x4 transformation matrix (16 values)
  color: [number, number, number];  // RGB color (0-1)
  boundingBox: BoundingBox;
}

/**
 * Complete assembly mesh data
 */
export interface AssemblyMeshData {
  parts: PartMeshData[];
  assemblyBoundingBox: BoundingBox;
  partCount: number;
}

/**
 * Interface marker for 3D visualization
 */
export interface InterfaceMarker {
  id: string;
  position: [number, number, number];
  interfaceType: string;
  partAId: string;
  partBId: string;
  isSelected: boolean;
  isHighlighted: boolean;
}

/**
 * Chain path segment for 3D visualization
 */
export interface ChainPathSegment {
  startPosition: [number, number, number];
  endPosition: [number, number, number];
  linkId: string;
  type: 'part_dimension' | 'interface_gap';
  color: [number, number, number];
}
