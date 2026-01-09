import { Suspense, useMemo, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Center, Html } from "@react-three/drei";
import * as THREE from "three";
import type { MeshData, FaceGroup, FailedFace } from "../../lib/mesh/types";
import type { DfmRuleResult } from "../../lib/dfm/types";
import { getRuleById } from "../../lib/dfm";

interface ModelViewerProps {
  meshData: MeshData;
  dfmResults?: DfmRuleResult[];
  onMarkerClick?: (ruleId: string) => void;
}

// Map DFM failures to face groups
function mapFailuresToFaces(
  dfmResults: DfmRuleResult[] | undefined,
  faceGroups: FaceGroup[]
): FailedFace[] {
  if (!dfmResults || dfmResults.length === 0) return [];

  const failedFaces: FailedFace[] = [];

  for (const result of dfmResults) {
    if (result.status !== "fail" && result.status !== "warning") continue;

    const rule = getRuleById(result.ruleId);
    if (!rule) continue;

    // Match rule category to face types
    let matchingFaces: FaceGroup[] = [];

    if (rule.category === "Holes" || rule.name.toLowerCase().includes("hole")) {
      matchingFaces = faceGroups.filter((g) => g.face_type === "cylindrical");
    } else if (rule.category === "Bending") {
      // Bends are typically at edges between planar faces
      matchingFaces = faceGroups.filter((g) => g.face_type === "planar").slice(0, 2);
    } else if (rule.category === "Walls" || rule.name.toLowerCase().includes("wall")) {
      matchingFaces = faceGroups.filter((g) => g.face_type === "planar").slice(0, 1);
    } else {
      // Default: pick first face
      if (faceGroups.length > 0) {
        matchingFaces = [faceGroups[0]];
      }
    }

    for (const face of matchingFaces) {
      failedFaces.push({
        ruleId: result.ruleId,
        faceId: face.face_id,
        center: face.center,
        faceType: face.face_type,
        status: result.status as "fail" | "warning",
      });
    }
  }

  return failedFaces;
}

// Mesh component
function StepMesh({
  meshData,
  failedFaces,
}: {
  meshData: MeshData;
  failedFaces: FailedFace[];
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    // Set vertices - convert to Float32Array if needed
    const positions = meshData.vertices instanceof Float32Array
      ? meshData.vertices
      : new Float32Array(meshData.vertices);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Set normals - convert to Float32Array if needed
    const normals = meshData.normals instanceof Float32Array
      ? meshData.normals
      : new Float32Array(meshData.normals);
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

    // Set indices - convert to Uint32Array if needed
    if (meshData.indices && meshData.indices.length > 0) {
      const indices = meshData.indices instanceof Uint32Array
        ? meshData.indices
        : new Uint32Array(meshData.indices);
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
    }

    // Generate vertex colors (gray by default, red for failed areas)
    const vertexCount = positions.length / 3;
    const colors = new Float32Array(vertexCount * 3);

    // Default color: metallic gray
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = 0.6;     // R
      colors[i + 1] = 0.65; // G
      colors[i + 2] = 0.7; // B
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // Compute bounding sphere for proper camera positioning
    geo.computeBoundingSphere();

    return geo;
  }, [meshData, failedFaces]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        metalness={0.3}
        roughness={0.7}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// Failure markers component
function FailureMarkers({
  failures,
  onClick,
}: {
  failures: FailedFace[];
  onClick?: (ruleId: string) => void;
}) {
  // Deduplicate by ruleId
  const uniqueFailures = useMemo(() => {
    const seen = new Set<string>();
    return failures.filter((f) => {
      if (seen.has(f.ruleId)) return false;
      seen.add(f.ruleId);
      return true;
    });
  }, [failures]);

  return (
    <group>
      {uniqueFailures.map((failure, idx) => {
        const isError = failure.status === "fail";
        const color = isError ? "#ff4444" : "#d4a574";

        return (
          <group key={`${failure.ruleId}-${idx}`} position={failure.center}>
            {/* Pulsing sphere marker */}
            <mesh onClick={() => onClick?.(failure.ruleId)}>
              <sphereGeometry args={[3, 16, 16]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.85}
              />
            </mesh>
            {/* Rule ID label */}
            <Html center distanceFactor={15} style={{ pointerEvents: "none" }}>
              <div
                style={{
                  background: color,
                  color: "white",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  whiteSpace: "nowrap",
                  fontFamily: "monospace",
                }}
              >
                {failure.ruleId}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// Loading fallback
function LoadingFallback() {
  return (
    <Html center>
      <div style={{ color: "#00d4ff", fontSize: "14px" }}>Loading 3D model...</div>
    </Html>
  );
}

// Auto-fit camera component
function AutoFitCamera({ meshData }: { meshData: MeshData }) {
  const { camera } = useThree();

  useEffect(() => {
    // Calculate bounding box from vertices
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    const vertices = meshData.vertices;
    for (let i = 0; i < vertices.length; i += 3) {
      minX = Math.min(minX, vertices[i]);
      minY = Math.min(minY, vertices[i + 1]);
      minZ = Math.min(minZ, vertices[i + 2]);
      maxX = Math.max(maxX, vertices[i]);
      maxY = Math.max(maxY, vertices[i + 1]);
      maxZ = Math.max(maxZ, vertices[i + 2]);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ);

    // Position camera to fit the model
    const distance = maxSize * 2;
    camera.position.set(
      centerX + distance * 0.7,
      centerY + distance * 0.5,
      centerZ + distance * 0.7
    );
    camera.lookAt(centerX, centerY, centerZ);
    camera.updateProjectionMatrix();
  }, [meshData, camera]);

  return null;
}

export function ModelViewer({ meshData, dfmResults, onMarkerClick }: ModelViewerProps) {
  const failedFaces = useMemo(
    () => mapFailuresToFaces(dfmResults, meshData.face_groups),
    [dfmResults, meshData.face_groups]
  );

  return (
    <div className="model-viewer-container">
      <Canvas camera={{ fov: 45, near: 0.001, far: 10000 }}>
        <Suspense fallback={<LoadingFallback />}>
          {/* Lighting setup for CAD-style rendering */}
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 10]} intensity={0.8} />
          <directionalLight position={[-10, -10, -10]} intensity={0.3} />
          <directionalLight position={[0, 10, 0]} intensity={0.4} />

          <Center>
            <StepMesh meshData={meshData} failedFaces={failedFaces} />
            <FailureMarkers failures={failedFaces} onClick={onMarkerClick} />
          </Center>

          <AutoFitCamera meshData={meshData} />

          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            makeDefault
          />

          {/* Grid helper - scaled based on model size */}
          <gridHelper args={[1000, 100, "#333333", "#222222"]} rotation={[0, 0, 0]} />
        </Suspense>
      </Canvas>
    </div>
  );
}
