import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
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

    // Set vertices
    const positions = new Float32Array(meshData.vertices);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Set normals
    const normals = new Float32Array(meshData.normals);
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

    // Set indices
    const indices = new Uint32Array(meshData.indices);
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    // Generate colors based on face groups and failures
    const colors = new Float32Array(meshData.vertices.length); // Same length as vertices
    const failedFaceIds = new Set(failedFaces.map((f) => f.faceId));

    // Default color: light gray
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = 0.7;     // R
      colors[i + 1] = 0.7; // G
      colors[i + 2] = 0.7; // B
    }

    // Color failed faces
    for (const group of meshData.face_groups) {
      if (failedFaceIds.has(group.face_id) && group.triangle_count > 0) {
        const failure = failedFaces.find((f) => f.faceId === group.face_id);
        const isError = failure?.status === "fail";

        // Each triangle has 3 vertices, each vertex has 3 color components
        // But we're using face-vertex geometry, so we need to find the right vertices
        const startVertex = (group.start_index / 6) * 4; // Convert triangle index to vertex index
        const vertexCount = group.triangle_count * 2; // 4 vertices per 2 triangles

        for (let v = 0; v < vertexCount * 2; v++) {
          const vi = (startVertex + v) * 3;
          if (vi + 2 < colors.length) {
            if (isError) {
              colors[vi] = 1.0;     // R - red for errors
              colors[vi + 1] = 0.3;
              colors[vi + 2] = 0.3;
            } else {
              colors[vi] = 1.0;     // Orange for warnings
              colors[vi + 1] = 0.6;
              colors[vi + 2] = 0.2;
            }
          }
        }
      }
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    return geo;
  }, [meshData, failedFaces]);

  return (
    <mesh geometry={geometry}>
      <meshPhongMaterial vertexColors flatShading />
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

export function ModelViewer({ meshData, dfmResults, onMarkerClick }: ModelViewerProps) {
  const failedFaces = useMemo(
    () => mapFailuresToFaces(dfmResults, meshData.face_groups),
    [dfmResults, meshData.face_groups]
  );

  return (
    <div className="model-viewer-container">
      <Canvas camera={{ position: [100, 80, 100], fov: 50 }}>
        <Suspense fallback={<LoadingFallback />}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[50, 50, 50]} intensity={0.8} />
          <directionalLight position={[-50, -50, -50]} intensity={0.3} />
          <Center>
            <StepMesh meshData={meshData} failedFaces={failedFaces} />
            <FailureMarkers failures={failedFaces} onClick={onMarkerClick} />
          </Center>
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={30}
            maxDistance={500}
          />
          {/* Grid helper for reference */}
          <gridHelper args={[200, 20, "#444444", "#333333"]} />
        </Suspense>
      </Canvas>
    </div>
  );
}
