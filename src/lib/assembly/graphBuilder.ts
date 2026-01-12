// Assembly graph builder utility

import type {
  AssemblyGraph,
  AssemblyPart,
  MatingInterface,
  ParsedPart,
} from './types';
import { generatePartColors } from './interfaceDetector';

/**
 * Build assembly graph from parsed parts and detected interfaces
 */
export function buildAssemblyGraph(
  parsedParts: ParsedPart[],
  interfaces: MatingInterface[]
): AssemblyGraph {
  const graph: AssemblyGraph = {
    parts: new Map(),
    interfaces: new Map(),
    chains: new Map(),
    partAdjacency: new Map(),
  };

  // Generate colors for parts
  const colors = generatePartColors(parsedParts.length);

  // Convert parsed parts to assembly parts
  parsedParts.forEach((parsed, index) => {
    const part: AssemblyPart = {
      id: parsed.id,
      name: parsed.name,
      stepEntityId: parsed.stepEntityId,
      transform: parsed.transform,
      boundingBox: parsed.boundingBox || {
        min: [0, 0, 0],
        max: [1, 1, 1],
        dimensions: [1, 1, 1],
      },
      faces: parsed.faces.map((f) => ({
        id: f.id,
        globalId: `${parsed.id}-face-${f.id}`,
        faceType: f.faceType,
        normal: f.normal,
        center: f.center,
        area: f.area,
        radius: f.radius,
        axis: f.axis,
      })),
      color: colors[index],
    };

    graph.parts.set(part.id, part);
    graph.partAdjacency.set(part.id, []);
  });

  // Add interfaces and build adjacency
  interfaces.forEach((iface) => {
    graph.interfaces.set(iface.id, iface);

    // Update adjacency
    const adjA = graph.partAdjacency.get(iface.partA.partId) || [];
    if (!adjA.includes(iface.partB.partId)) {
      adjA.push(iface.partB.partId);
      graph.partAdjacency.set(iface.partA.partId, adjA);
    }

    const adjB = graph.partAdjacency.get(iface.partB.partId) || [];
    if (!adjB.includes(iface.partA.partId)) {
      adjB.push(iface.partA.partId);
      graph.partAdjacency.set(iface.partB.partId, adjB);
    }
  });

  return graph;
}

/**
 * Find path between two parts through interfaces
 */
export function findPath(
  graph: AssemblyGraph,
  startPartId: string,
  endPartId: string
): { path: string[]; interfaces: string[] } | null {
  // BFS to find shortest path
  const visited = new Set<string>();
  const queue: { partId: string; path: string[]; interfaces: string[] }[] = [
    { partId: startPartId, path: [startPartId], interfaces: [] },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.partId === endPartId) {
      return { path: current.path, interfaces: current.interfaces };
    }

    if (visited.has(current.partId)) {
      continue;
    }
    visited.add(current.partId);

    // Find connected parts through interfaces
    const adjacent = graph.partAdjacency.get(current.partId) || [];

    for (const nextPartId of adjacent) {
      if (visited.has(nextPartId)) {
        continue;
      }

      // Find the interface between current and next
      const iface = findInterfaceBetween(graph, current.partId, nextPartId);
      if (iface) {
        queue.push({
          partId: nextPartId,
          path: [...current.path, nextPartId],
          interfaces: [...current.interfaces, iface.id],
        });
      }
    }
  }

  return null; // No path found
}

/**
 * Find interface between two parts
 */
export function findInterfaceBetween(
  graph: AssemblyGraph,
  partIdA: string,
  partIdB: string
): MatingInterface | null {
  for (const [_, iface] of graph.interfaces) {
    if (
      (iface.partA.partId === partIdA && iface.partB.partId === partIdB) ||
      (iface.partA.partId === partIdB && iface.partB.partId === partIdA)
    ) {
      return iface;
    }
  }
  return null;
}

/**
 * Get all interfaces for a specific part
 */
export function getPartInterfaces(
  graph: AssemblyGraph,
  partId: string
): MatingInterface[] {
  const interfaces: MatingInterface[] = [];

  for (const [_, iface] of graph.interfaces) {
    if (iface.partA.partId === partId || iface.partB.partId === partId) {
      interfaces.push(iface);
    }
  }

  return interfaces;
}

/**
 * Check if a part is a junction (has multiple interfaces)
 */
export function isJunctionPart(graph: AssemblyGraph, partId: string): boolean {
  return getPartInterfaces(graph, partId).length > 1;
}

/**
 * Get junction parts in the assembly
 */
export function getJunctionParts(graph: AssemblyGraph): AssemblyPart[] {
  const junctions: AssemblyPart[] = [];

  for (const [partId, part] of graph.parts) {
    if (isJunctionPart(graph, partId)) {
      junctions.push(part);
    }
  }

  return junctions;
}

/**
 * Calculate assembly bounding box
 */
export function calculateAssemblyBounds(
  parts: AssemblyPart[]
): { min: [number, number, number]; max: [number, number, number] } {
  if (parts.length === 0) {
    return {
      min: [0, 0, 0],
      max: [1, 1, 1],
    };
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const part of parts) {
    // Transform bounding box corners
    const corners = getBoundingBoxCorners(part.boundingBox);

    for (const corner of corners) {
      const transformed = transformPoint(corner, part.transform);
      min[0] = Math.min(min[0], transformed[0]);
      min[1] = Math.min(min[1], transformed[1]);
      min[2] = Math.min(min[2], transformed[2]);
      max[0] = Math.max(max[0], transformed[0]);
      max[1] = Math.max(max[1], transformed[1]);
      max[2] = Math.max(max[2], transformed[2]);
    }
  }

  return { min, max };
}

/**
 * Get 8 corners of a bounding box
 */
function getBoundingBoxCorners(
  bbox: { min: [number, number, number]; max: [number, number, number] }
): [number, number, number][] {
  const { min, max } = bbox;
  return [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [min[0], max[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], min[1], max[2]],
    [min[0], max[1], max[2]],
    [max[0], max[1], max[2]],
  ];
}

/**
 * Transform point by 4x4 matrix
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
 * Serialize graph to JSON for storage
 */
export function serializeGraph(graph: AssemblyGraph): string {
  const serializable = {
    parts: Array.from(graph.parts.entries()),
    interfaces: Array.from(graph.interfaces.entries()),
    chains: Array.from(graph.chains.entries()),
    partAdjacency: Array.from(graph.partAdjacency.entries()),
  };
  return JSON.stringify(serializable);
}

/**
 * Deserialize graph from JSON
 */
export function deserializeGraph(json: string): AssemblyGraph {
  const data = JSON.parse(json);
  return {
    parts: new Map(data.parts),
    interfaces: new Map(data.interfaces),
    chains: new Map(data.chains),
    partAdjacency: new Map(data.partAdjacency),
  };
}
