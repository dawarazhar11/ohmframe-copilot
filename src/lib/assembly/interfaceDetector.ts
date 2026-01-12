// TypeScript interface detector (fallback when Rust unavailable)

import type {
  AssemblyPart,
  PartFace,
  MatingInterface,
  InterfaceType,
  InterfaceDetectionParams,
} from './types';
import { DEFAULT_DETECTION_PARAMS } from './types';

/**
 * Detect mating interfaces between parts in an assembly
 */
export function detectInterfaces(
  parts: AssemblyPart[],
  params: InterfaceDetectionParams = DEFAULT_DETECTION_PARAMS
): { interfaces: MatingInterface[]; junctionParts: string[] } {
  const interfaces: MatingInterface[] = [];
  const interfaceCountPerPart: Map<string, number> = new Map();
  let interfaceId = 0;

  // Compare each pair of parts
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const partA = parts[i];
      const partB = parts[j];

      // Find interfaces between this pair
      const pairInterfaces = findInterfacesBetweenParts(
        partA,
        partB,
        params,
        interfaceId
      );

      for (const iface of pairInterfaces) {
        interfaceCountPerPart.set(
          iface.partA.partId,
          (interfaceCountPerPart.get(iface.partA.partId) || 0) + 1
        );
        interfaceCountPerPart.set(
          iface.partB.partId,
          (interfaceCountPerPart.get(iface.partB.partId) || 0) + 1
        );
        interfaceId++;
      }

      interfaces.push(...pairInterfaces);
    }
  }

  // Find junction parts (parts with >1 interface)
  const junctionParts = Array.from(interfaceCountPerPart.entries())
    .filter(([_, count]) => count > 1)
    .map(([id]) => id);

  return { interfaces, junctionParts };
}

/**
 * Find interfaces between two parts
 */
function findInterfacesBetweenParts(
  partA: AssemblyPart,
  partB: AssemblyPart,
  params: InterfaceDetectionParams,
  startId: number
): MatingInterface[] {
  const candidates: Array<{
    interface: MatingInterface;
    score: number;
  }> = [];
  let id = startId;

  // Transform faces to world coordinates
  const facesA = partA.faces.map((f) => transformFace(f, partA.transform));
  const facesB = partB.faces.map((f) => transformFace(f, partB.transform));

  // Use a more generous proximity for initial filtering - based on bounding box
  const maxProximity = Math.max(
    params.proximityThreshold * 50, // 100mm default
    getBoundingBoxDiagonal(partA) * 0.5,
    getBoundingBoxDiagonal(partB) * 0.5
  );

  // Check each face pair
  for (let idxA = 0; idxA < facesA.length; idxA++) {
    for (let idxB = 0; idxB < facesB.length; idxB++) {
      const faceA = facesA[idxA];
      const faceB = facesB[idxB];

      // Skip non-planar/non-cylindrical faces
      if (!['planar', 'cylindrical'].includes(faceA.faceType) ||
          !['planar', 'cylindrical'].includes(faceB.faceType)) {
        continue;
      }

      // Calculate proximity (distance between face centers)
      const distance = vecDistance(faceA.center, faceB.center);

      if (distance > maxProximity) {
        continue;
      }

      // Calculate normal alignment (dot product)
      const alignment = normalAlignment(faceA.normal, faceB.normal);

      // For face-to-face contact: normals should be opposing (alignment < -0.8)
      // For cylindrical interfaces: normals might be aligned or perpendicular
      const isFaceToFace = faceA.faceType === 'planar' && faceB.faceType === 'planar' && alignment < -0.8;
      const isCylindricalMatch = faceA.faceType === 'cylindrical' && faceB.faceType === 'cylindrical';

      if (!isFaceToFace && !isCylindricalMatch) {
        continue;
      }

      // Classify interface type
      const interfaceType = classifyInterface(
        faceA.faceType,
        faceB.faceType,
        alignment,
        faceA.radius,
        faceB.radius
      );

      // Skip unknown interfaces entirely - we only want real mating surfaces
      if (interfaceType === 'unknown') {
        continue;
      }

      // Calculate contact point
      const contactPoint: [number, number, number] = [
        (faceA.center[0] + faceB.center[0]) / 2,
        (faceA.center[1] + faceB.center[1]) / 2,
        (faceA.center[2] + faceB.center[2]) / 2,
      ];

      // Calculate a quality score for ranking
      const alignmentScore = Math.abs(alignment);
      const proximityScore = 1 / (1 + distance / 10); // Closer is better
      const score = alignmentScore * proximityScore;

      candidates.push({
        interface: {
          id: `interface-${id++}`,
          partA: {
            partId: partA.id,
            faceId: partA.faces[idxA].globalId,
          },
          partB: {
            partId: partB.id,
            faceId: partB.faces[idxB].globalId,
          },
          interfaceType,
          proximity: distance,
          normalAlignment: Math.abs(alignment),
          contactArea: estimateContactArea(faceA, faceB, interfaceType),
          defaultTolerance: getDefaultTolerance(interfaceType),
          defaultDistribution: 'normal',
          contactPoint,
        },
        score,
      });
    }
  }

  // Sort by score (best first) and limit to top interfaces
  candidates.sort((a, b) => b.score - a.score);

  // Keep only top 10 interfaces per part pair to avoid overwhelming the UI
  const MAX_INTERFACES_PER_PAIR = 10;
  return candidates.slice(0, MAX_INTERFACES_PER_PAIR).map(c => c.interface);
}

/**
 * Get diagonal of bounding box for proximity scaling
 */
function getBoundingBoxDiagonal(part: AssemblyPart): number {
  if (!part.boundingBox) return 100;
  const dims = part.boundingBox.dimensions;
  return Math.sqrt(dims[0] * dims[0] + dims[1] * dims[1] + dims[2] * dims[2]);
}

interface TransformedFace {
  center: [number, number, number];
  normal: [number, number, number];
  faceType: string;
  radius?: number;
}

/**
 * Transform face to world coordinates
 */
function transformFace(face: PartFace, transform: number[]): TransformedFace {
  return {
    center: transformPoint(face.center, transform),
    normal: transformDirection(face.normal, transform),
    faceType: face.faceType,
    radius: face.radius,
  };
}

/**
 * Transform point by 4x4 matrix (column-major)
 */
function transformPoint(
  point: [number, number, number],
  matrix: number[]
): [number, number, number] {
  return [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ];
}

/**
 * Transform direction by 4x4 matrix (no translation)
 */
function transformDirection(
  dir: [number, number, number],
  matrix: number[]
): [number, number, number] {
  const transformed: [number, number, number] = [
    matrix[0] * dir[0] + matrix[4] * dir[1] + matrix[8] * dir[2],
    matrix[1] * dir[0] + matrix[5] * dir[1] + matrix[9] * dir[2],
    matrix[2] * dir[0] + matrix[6] * dir[1] + matrix[10] * dir[2],
  ];
  return normalize(transformed);
}

/**
 * Calculate distance between two points
 */
function vecDistance(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate alignment between normals (dot product)
 */
function normalAlignment(
  a: [number, number, number],
  b: [number, number, number]
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Normalize a vector
 */
function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len > 1e-10) {
    return [v[0] / len, v[1] / len, v[2] / len];
  }
  return v;
}

/**
 * Classify interface type based on face geometry
 */
function classifyInterface(
  typeA: string,
  typeB: string,
  alignment: number,
  radiusA?: number,
  radiusB?: number
): InterfaceType {
  // Face-to-face: two planar faces with opposing normals
  if (typeA === 'planar' && typeB === 'planar' && alignment < -0.9) {
    return 'face_to_face';
  }

  // Pin-in-hole: cylindrical face inside another cylindrical face
  if (typeA === 'cylindrical' && typeB === 'cylindrical') {
    if (radiusA !== undefined && radiusB !== undefined) {
      if (Math.abs(radiusA - radiusB) < 0.5) {
        return 'pin_in_hole';
      }
    }
  }

  // Shaft-in-bore: cylindrical with planar end face
  if (
    (typeA === 'cylindrical' && typeB === 'planar') ||
    (typeA === 'planar' && typeB === 'cylindrical')
  ) {
    return 'shaft_in_bore';
  }

  return 'unknown';
}

/**
 * Estimate contact area based on interface type
 */
function estimateContactArea(
  faceA: TransformedFace,
  faceB: TransformedFace,
  interfaceType: InterfaceType
): number {
  switch (interfaceType) {
    case 'face_to_face':
      return 10.0; // Default 10 mm^2 for face contact
    case 'pin_in_hole':
    case 'shaft_in_bore':
      const r = faceA.radius || faceB.radius || 5;
      return Math.PI * r * r;
    default:
      return 1.0;
  }
}

/**
 * Get default tolerance based on interface type
 */
function getDefaultTolerance(interfaceType: InterfaceType): number {
  switch (interfaceType) {
    case 'face_to_face':
      return 0.05;
    case 'pin_in_hole':
      return 0.025;
    case 'shaft_in_bore':
      return 0.016;
    case 'thread_engagement':
      return 0.1;
    default:
      return 0.1;
  }
}

/**
 * Generate distinct colors for parts
 */
export function generatePartColors(count: number): [number, number, number][] {
  const colors: [number, number, number][] = [];
  const goldenRatio = 0.618033988749895;
  let hue = Math.random();

  for (let i = 0; i < count; i++) {
    hue = (hue + goldenRatio) % 1;
    const rgb = hslToRgb(hue, 0.6, 0.5);
    colors.push(rgb);
  }

  return colors;
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r, g, b];
}
