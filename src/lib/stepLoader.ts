// STEP file loader using occt-import-js
import occtimportjs from "occt-import-js";
import { resolveResource } from "@tauri-apps/api/path";
import { readFile } from "@tauri-apps/plugin-fs";

let occtInstance: any = null;
let initPromise: Promise<any> | null = null;

// Check if we're running in Tauri production mode
const isTauriProduction = window.__TAURI__ && !window.location.href.includes('localhost');

// Load WASM file as ArrayBuffer
async function loadWasmFile(): Promise<ArrayBuffer> {
  try {
    if (isTauriProduction) {
      // In Tauri production, load from resources directory
      console.log("[stepLoader] Loading WASM from Tauri resources...");
      const resourcePath = await resolveResource("occt-import-js.wasm");
      console.log("[stepLoader] Resource path:", resourcePath);
      const wasmBytes = await readFile(resourcePath);
      return wasmBytes.buffer;
    } else {
      // In dev mode, fetch from local server
      console.log("[stepLoader] Loading WASM from dev server...");
      const response = await fetch("/occt-import-js.wasm");
      if (!response.ok) {
        throw new Error(`Failed to fetch WASM: ${response.status}`);
      }
      return await response.arrayBuffer();
    }
  } catch (err) {
    console.error("[stepLoader] Failed to load WASM file:", err);
    throw err;
  }
}

// Initialize OCCT (singleton)
async function initOcct(): Promise<any> {
  if (occtInstance) return occtInstance;

  // Prevent multiple simultaneous initializations
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log("[stepLoader] Initializing OCCT...");
      console.log("[stepLoader] isTauriProduction:", isTauriProduction);

      // Pre-load the WASM file
      const wasmBuffer = await loadWasmFile();
      console.log("[stepLoader] WASM loaded, size:", wasmBuffer.byteLength);

      // Initialize with custom WASM instantiation
      occtInstance = await occtimportjs({
        locateFile: (name: string) => {
          // This is called to locate the WASM file
          // In dev mode, return the URL; in prod, we use instantiateWasm
          console.log("[stepLoader] locateFile called for:", name);
          return `/${name}`;
        },
        instantiateWasm: async (imports: WebAssembly.Imports, receiveInstance: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) => {
          try {
            console.log("[stepLoader] Instantiating WASM...");
            const result = await WebAssembly.instantiate(wasmBuffer, imports);
            receiveInstance(result.instance, result.module);
            return result.instance.exports;
          } catch (err) {
            console.error("[stepLoader] WASM instantiation failed:", err);
            throw err;
          }
        }
      });

      console.log("[stepLoader] OCCT initialized successfully");
      return occtInstance;
    } catch (err) {
      console.error("[stepLoader] OCCT initialization failed:", err);
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

export interface OcctFaceGroup {
  face_id: number;
  face_type: string;  // "planar", "cylindrical", "curved"
  start_index: number;
  triangle_count: number;
  center: [number, number, number];
  color?: [number, number, number];
}

export interface OcctMeshData {
  vertices: number[];
  indices: number[];
  normals: number[];
  faceCount: number;
  faceGroups: OcctFaceGroup[];
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

// Load STEP file content and convert to mesh
export async function loadStepToMesh(stepContent: string): Promise<OcctMeshData | null> {
  try {
    console.log("[stepLoader] Initializing OCCT...");
    const occt = await initOcct();
    console.log("[stepLoader] OCCT initialized successfully");

    // Convert string to Uint8Array
    const encoder = new TextEncoder();
    const fileBuffer = encoder.encode(stepContent);
    console.log("[stepLoader] File buffer size:", fileBuffer.length, "bytes");

    // Read STEP file
    console.log("[stepLoader] Reading STEP file...");
    const result = occt.ReadStepFile(fileBuffer, null);
    console.log("[stepLoader] ReadStepFile result:", {
      success: result.success,
      error: result.error,
      meshCount: result.meshes?.length || 0
    });

    if (!result.success || !result.meshes || result.meshes.length === 0) {
      console.error("[stepLoader] Failed to read STEP file:", result.error);
      return null;
    }

    // Combine all meshes and extract face groups
    const allVertices: number[] = [];
    const allIndices: number[] = [];
    const allNormals: number[] = [];
    const allFaceGroups: OcctFaceGroup[] = [];
    let vertexOffset = 0;
    let indexOffset = 0;
    let faceIdCounter = 0;

    // Track bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const mesh of result.meshes) {
      // Get mesh data
      const meshVertices = mesh.attributes.position.array;
      const meshNormals = mesh.attributes.normal?.array || [];
      const meshIndices = mesh.index?.array || [];
      const brepFaces = mesh.brep_faces || [];

      console.log("[stepLoader] Processing mesh with", brepFaces.length, "B-rep faces");

      // Add vertices and update bounding box
      for (let i = 0; i < meshVertices.length; i += 3) {
        const x = meshVertices[i];
        const y = meshVertices[i + 1];
        const z = meshVertices[i + 2];

        allVertices.push(x, y, z);

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }

      // Add normals (or generate default)
      if (meshNormals.length > 0) {
        allNormals.push(...meshNormals);
      } else {
        for (let i = 0; i < meshVertices.length; i += 3) {
          allNormals.push(0, 0, 1);
        }
      }

      // Add indices with offset
      for (const idx of meshIndices) {
        allIndices.push(idx + vertexOffset);
      }

      // Extract face groups from brep_faces
      for (const brepFace of brepFaces) {
        const firstTriIdx = brepFace.first;
        const lastTriIdx = brepFace.last;
        const triangleCount = lastTriIdx - firstTriIdx + 1;

        // Calculate face center by averaging triangle centroids
        let centerX = 0, centerY = 0, centerZ = 0;
        let triCount = 0;

        for (let t = firstTriIdx; t <= lastTriIdx && t * 3 + 2 < meshIndices.length; t++) {
          const i0 = meshIndices[t * 3] * 3;
          const i1 = meshIndices[t * 3 + 1] * 3;
          const i2 = meshIndices[t * 3 + 2] * 3;

          if (i0 + 2 < meshVertices.length && i1 + 2 < meshVertices.length && i2 + 2 < meshVertices.length) {
            centerX += (meshVertices[i0] + meshVertices[i1] + meshVertices[i2]) / 3;
            centerY += (meshVertices[i0 + 1] + meshVertices[i1 + 1] + meshVertices[i2 + 1]) / 3;
            centerZ += (meshVertices[i0 + 2] + meshVertices[i1 + 2] + meshVertices[i2 + 2]) / 3;
            triCount++;
          }
        }

        if (triCount > 0) {
          centerX /= triCount;
          centerY /= triCount;
          centerZ /= triCount;
        }

        // Determine face type by analyzing normals
        const faceType = determineFaceType(meshVertices, meshNormals, meshIndices, firstTriIdx, lastTriIdx);

        allFaceGroups.push({
          face_id: faceIdCounter++,
          face_type: faceType,
          start_index: indexOffset + firstTriIdx * 3,
          triangle_count: triangleCount,
          center: [centerX, centerY, centerZ],
          color: brepFace.color || undefined,
        });
      }

      // If no brep_faces, create a single face group for the entire mesh
      if (brepFaces.length === 0 && meshIndices.length > 0) {
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;

        allFaceGroups.push({
          face_id: faceIdCounter++,
          face_type: "solid",
          start_index: indexOffset,
          triangle_count: meshIndices.length / 3,
          center: [centerX, centerY, centerZ],
        });
      }

      vertexOffset += meshVertices.length / 3;
      indexOffset += meshIndices.length;
    }

    // Compute proper normals if needed
    if (allNormals.every(n => n === 0 || n === 1)) {
      computeNormals(allVertices, allIndices, allNormals);
    }

    const meshData = {
      vertices: allVertices,
      indices: allIndices,
      normals: allNormals,
      faceCount: result.meshes.length,
      faceGroups: allFaceGroups,
      boundingBox: {
        min: [minX, minY, minZ] as [number, number, number],
        max: [maxX, maxY, maxZ] as [number, number, number]
      }
    };

    console.log("[stepLoader] Mesh generated successfully:", {
      vertexCount: allVertices.length / 3,
      indexCount: allIndices.length,
      triangleCount: allIndices.length / 3,
      normalCount: allNormals.length / 3,
      faceGroupCount: allFaceGroups.length,
      boundingBox: meshData.boundingBox
    });

    return meshData;
  } catch (error) {
    console.error("[stepLoader] Error loading STEP file:", error);
    return null;
  }
}

// Determine face type by analyzing normal variation
function determineFaceType(
  _vertices: number[],
  normals: number[],
  indices: number[],
  firstTriIdx: number,
  lastTriIdx: number
): string {
  if (normals.length === 0) return "unknown";

  // Collect normals for this face
  const faceNormals: [number, number, number][] = [];

  for (let t = firstTriIdx; t <= lastTriIdx && t * 3 + 2 < indices.length; t++) {
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;

    // Get normals for each vertex of the triangle
    if (i0 + 2 < normals.length) {
      faceNormals.push([normals[i0], normals[i0 + 1], normals[i0 + 2]]);
    }
    if (i1 + 2 < normals.length) {
      faceNormals.push([normals[i1], normals[i1 + 1], normals[i1 + 2]]);
    }
    if (i2 + 2 < normals.length) {
      faceNormals.push([normals[i2], normals[i2 + 1], normals[i2 + 2]]);
    }
  }

  if (faceNormals.length < 3) return "unknown";

  // Calculate normal variance
  let avgNx = 0, avgNy = 0, avgNz = 0;
  for (const n of faceNormals) {
    avgNx += n[0];
    avgNy += n[1];
    avgNz += n[2];
  }
  avgNx /= faceNormals.length;
  avgNy /= faceNormals.length;
  avgNz /= faceNormals.length;

  // Calculate variance from average
  let variance = 0;
  for (const n of faceNormals) {
    const dx = n[0] - avgNx;
    const dy = n[1] - avgNy;
    const dz = n[2] - avgNz;
    variance += dx * dx + dy * dy + dz * dz;
  }
  variance /= faceNormals.length;

  // Low variance = planar face
  // Medium variance = cylindrical (normals vary in one direction)
  // High variance = curved/spherical
  if (variance < 0.01) {
    return "planar";
  } else if (variance < 0.5) {
    // Check if it's cylindrical by seeing if normals lie roughly on a plane
    // (i.e., they vary in 2D but not 3D)
    return "cylindrical";
  } else {
    return "curved";
  }
}

// Compute vertex normals from face data
function computeNormals(vertices: number[], indices: number[], normals: number[]) {
  // Reset normals
  for (let i = 0; i < normals.length; i++) {
    normals[i] = 0;
  }

  // Accumulate face normals for each vertex
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    // Get vertices
    const v0x = vertices[i0], v0y = vertices[i0 + 1], v0z = vertices[i0 + 2];
    const v1x = vertices[i1], v1y = vertices[i1 + 1], v1z = vertices[i1 + 2];
    const v2x = vertices[i2], v2y = vertices[i2 + 1], v2z = vertices[i2 + 2];

    // Compute face normal (cross product of edges)
    const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
    const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    // Add to vertex normals
    normals[i0] += nx; normals[i0 + 1] += ny; normals[i0 + 2] += nz;
    normals[i1] += nx; normals[i1 + 1] += ny; normals[i1 + 2] += nz;
    normals[i2] += nx; normals[i2 + 1] += ny; normals[i2 + 2] += nz;
  }

  // Normalize
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(
      normals[i] * normals[i] +
      normals[i + 1] * normals[i + 1] +
      normals[i + 2] * normals[i + 2]
    );
    if (len > 0) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    }
  }
}
