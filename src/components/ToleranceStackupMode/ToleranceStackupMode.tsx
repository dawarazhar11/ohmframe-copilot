// Tolerance Stackup Mode - Main component integrating assembly explorer, chain builder, and results

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AssemblyExplorer } from '../AssemblyExplorer/AssemblyExplorer';
import { ChainBuilder } from '../ChainBuilder/ChainBuilder';
import { ToleranceResults } from '../ToleranceResults/ToleranceResults';
import type { AssemblyPart, MatingInterface } from '../../lib/assembly/types';
import type { ToleranceChain, ChainLink, ToleranceResult } from '../../lib/tolerance/types';
import { createNewChain } from '../../lib/tolerance/types';
import { calculateToleranceStackup } from '../../lib/tolerance/calculator';
import { detectInterfaces, generatePartColors } from '../../lib/assembly/interfaceDetector';

// Rust response types (snake_case from Tauri)
interface RustAssemblyResult {
  success: boolean;
  error?: string;
  parts: RustParsedPart[];
}

interface RustParsedPart {
  id: string;
  name: string;
  step_entity_id: number;
  transform: number[];
  bounding_box?: { min: [number, number, number]; max: [number, number, number]; dimensions: [number, number, number] };
  faces: RustParsedFace[];
}

interface RustParsedFace {
  id: number;
  face_type: string;
  normal: [number, number, number];
  center: [number, number, number];
  area: number;
  radius?: number;
  axis?: [number, number, number];
}

interface ToleranceStackupModeProps {
  stepContent: string | null;
  stepFilename: string | null;
  onStatusChange?: (status: string) => void;
}

export function ToleranceStackupMode({
  stepContent,
  stepFilename,
  onStatusChange,
}: ToleranceStackupModeProps) {
  // Assembly state
  const [parts, setParts] = useState<AssemblyPart[]>([]);
  const [interfaces, setInterfaces] = useState<MatingInterface[]>([]);
  const [junctionParts, setJunctionParts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedInterfaceId, setSelectedInterfaceId] = useState<string | null>(null);

  // Chain state
  const [chains, setChains] = useState<ToleranceChain[]>([]);
  const [activeChainId, setActiveChainId] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Results state
  const [result, setResult] = useState<ToleranceResult | null>(null);

  const activeChain = chains.find((c) => c.id === activeChainId) || null;

  // Parse assembly when STEP content changes
  useEffect(() => {
    if (stepContent && stepFilename) {
      parseAssembly(stepContent, stepFilename);
    } else {
      // Clear state when no STEP file
      setParts([]);
      setInterfaces([]);
      setJunctionParts([]);
      setChains([]);
      setActiveChainId(null);
      setResult(null);
    }
  }, [stepContent, stepFilename]);

  const parseAssembly = async (content: string, filename: string) => {
    setIsLoading(true);
    setError(null);
    onStatusChange?.('Parsing assembly...');

    try {
      // Try Rust backend first
      let parsedParts: AssemblyPart[] = [];

      try {
        const rustResult = await invoke<RustAssemblyResult>('parse_assembly_step', {
          content,
          filename,
        });

        if (rustResult.success && rustResult.parts.length > 0) {
          // Convert Rust result (snake_case) to our types (camelCase)
          const colors = generatePartColors(rustResult.parts.length);
          parsedParts = rustResult.parts.map((p, i) => ({
            id: p.id,
            name: p.name,
            stepEntityId: p.step_entity_id,
            transform: p.transform,
            boundingBox: p.bounding_box || { min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] },
            faces: p.faces.map((f) => ({
              id: f.id,
              globalId: `${p.id}-face-${f.id}`,
              faceType: f.face_type as 'planar' | 'cylindrical' | 'conical' | 'spherical' | 'toroidal' | 'freeform',
              normal: f.normal,
              center: f.center,
              area: f.area,
              radius: f.radius,
              axis: f.axis,
            })),
            color: colors[i],
          }));
        }
      } catch (rustErr) {
        console.warn('Rust parsing failed, using fallback:', rustErr);
      }

      // If Rust parsing failed or returned empty, create mock parts from topology
      if (parsedParts.length === 0) {
        // Create a single part placeholder
        parsedParts = [{
          id: 'part-0',
          name: filename.replace(/\.(step|stp)$/i, ''),
          stepEntityId: 1,
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          boundingBox: { min: [0, 0, 0], max: [100, 100, 50], dimensions: [100, 100, 50] },
          faces: [],
          color: [0.4, 0.6, 0.8],
        }];
      }

      setParts(parsedParts);
      onStatusChange?.('Detecting interfaces...');

      // Detect interfaces
      if (parsedParts.length > 1) {
        try {
          const rustInterfaces = await invoke<{
            success: boolean;
            interfaces: any[];
            junction_parts: string[];
          }>('detect_mating_interfaces', {
            parts: parsedParts.map((p) => ({
              id: p.id,
              name: p.name,
              step_entity_id: p.stepEntityId,
              transform: p.transform,
              bounding_box: p.boundingBox,
              faces: p.faces.map((f) => ({
                id: f.id,
                face_type: f.faceType,
                normal: f.normal,
                center: f.center,
                area: f.area,
                radius: f.radius,
                axis: f.axis,
              })),
            })),
            proximityThreshold: 2.0,
            normalThreshold: 0.95,
          });

          if (rustInterfaces.success) {
            setInterfaces(
              rustInterfaces.interfaces.map((i) => ({
                id: i.id,
                partA: { partId: i.part_a_id, faceId: `${i.part_a_id}-face-${i.part_a_face_id}` },
                partB: { partId: i.part_b_id, faceId: `${i.part_b_id}-face-${i.part_b_face_id}` },
                interfaceType: i.interface_type as any,
                proximity: i.proximity,
                normalAlignment: i.normal_alignment,
                contactArea: i.contact_area,
                defaultTolerance: 0.05,
                defaultDistribution: 'normal',
                contactPoint: i.contact_point,
              }))
            );
            setJunctionParts(rustInterfaces.junction_parts);
          }
        } catch (ifaceErr) {
          console.warn('Rust interface detection failed, using TypeScript fallback:', ifaceErr);
          // Use TypeScript fallback
          const { interfaces: tsInterfaces, junctionParts: tsJunctions } = detectInterfaces(parsedParts);
          setInterfaces(tsInterfaces);
          setJunctionParts(tsJunctions);
        }
      }

      onStatusChange?.(`Loaded ${parsedParts.length} parts`);
    } catch (err) {
      console.error('Assembly parsing failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse assembly');
      onStatusChange?.('Parsing failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-generate a tolerance chain from detected parts and interfaces
  const handleAutoGenerate = useCallback(() => {
    if (parts.length === 0) return;

    const chainId = `chain-${Date.now()}`;
    const links: ChainLink[] = [];

    // Add part dimensions based on bounding boxes
    parts.forEach((part, idx) => {
      // Calculate the largest dimension (assume stackup direction is the largest)
      const dims = part.boundingBox?.dimensions || [50, 50, 50];
      const maxDim = Math.max(...dims);

      // Create a link for this part's contribution
      links.push({
        id: `link-part-${idx}`,
        type: 'part_dimension',
        name: `${part.name} Length`,
        partId: part.id,
        nominal: maxDim,
        plusTolerance: maxDim * 0.001, // Default 0.1% tolerance
        minusTolerance: maxDim * 0.001,
        direction: idx % 2 === 0 ? 'positive' : 'negative', // Alternate directions
        distribution: 'normal',
        sigma: 3,
      });
    });

    // Add interface gaps from detected interfaces (top 3 best ones)
    const topInterfaces = interfaces
      .filter(iface => iface.interfaceType !== 'unknown')
      .slice(0, 3);

    topInterfaces.forEach((iface, idx) => {
      links.push({
        id: `link-iface-${idx}`,
        type: 'interface_gap',
        name: `Interface Gap ${idx + 1}`,
        interfaceId: iface.id,
        nominal: iface.proximity || 0.05, // Use detected proximity as gap
        plusTolerance: iface.defaultTolerance,
        minusTolerance: iface.defaultTolerance,
        direction: 'positive',
        distribution: 'normal',
        sigma: 3,
      });
    });

    const newChain: ToleranceChain = {
      id: chainId,
      name: 'Auto-Generated Stackup',
      direction: [1, 0, 0], // X-direction default
      links,
      isCalculated: false,
      isComplete: links.length >= 2,
    };

    setChains((prev) => [...prev, newChain]);
    setActiveChainId(chainId);
    setResult(null);
    onStatusChange?.(`Auto-generated chain with ${links.length} links`);
  }, [parts, interfaces, onStatusChange]);

  // Chain management
  const handleCreateChain = useCallback((name: string) => {
    const newChain = createNewChain(`chain-${Date.now()}`, name);
    setChains((prev) => [...prev, newChain]);
    setActiveChainId(newChain.id);
    setResult(null);
  }, []);

  const handleAddLink = useCallback((link: ChainLink) => {
    if (!activeChainId) return;

    setChains((prev) =>
      prev.map((chain) =>
        chain.id === activeChainId
          ? { ...chain, links: [...chain.links, link], isCalculated: false }
          : chain
      )
    );
    setResult(null);
  }, [activeChainId]);

  const handleUpdateLink = useCallback((linkId: string, updates: Partial<ChainLink>) => {
    if (!activeChainId) return;

    setChains((prev) =>
      prev.map((chain) =>
        chain.id === activeChainId
          ? {
              ...chain,
              links: chain.links.map((link) =>
                link.id === linkId ? { ...link, ...updates } : link
              ),
              isCalculated: false,
            }
          : chain
      )
    );
    setResult(null);
  }, [activeChainId]);

  const handleRemoveLink = useCallback((linkId: string) => {
    if (!activeChainId) return;

    setChains((prev) =>
      prev.map((chain) =>
        chain.id === activeChainId
          ? {
              ...chain,
              links: chain.links.filter((link) => link.id !== linkId),
              isCalculated: false,
            }
          : chain
      )
    );
    setResult(null);
  }, [activeChainId]);

  const handleCalculate = useCallback(async () => {
    if (!activeChain || activeChain.links.length === 0) return;

    setIsCalculating(true);
    onStatusChange?.('Calculating stackup...');

    try {
      // Try Rust backend first
      try {
        const rustResult = await invoke<any>('calculate_tolerance_stackup', {
          input: {
            links: activeChain.links.map((link) => ({
              nominal: link.nominal,
              plus_tolerance: link.plusTolerance,
              minus_tolerance: link.minusTolerance,
              direction: link.direction,
              distribution: link.distribution,
              sigma: link.sigma,
            })),
            monte_carlo_samples: 10000,
          },
        });

        if (rustResult.success) {
          // Convert Rust result
          setResult({
            totalNominal: rustResult.total_nominal,
            linkCount: activeChain.links.length,
            worstCase: {
              min: rustResult.worst_case.min,
              max: rustResult.worst_case.max,
              tolerance: rustResult.worst_case.tolerance,
              range: rustResult.worst_case.max - rustResult.worst_case.min,
            },
            rss: {
              min: rustResult.rss.min,
              max: rustResult.rss.max,
              tolerance: rustResult.rss.tolerance,
              sigma: rustResult.rss.sigma,
              processCapability: 1.0,
            },
            monteCarlo: rustResult.monte_carlo
              ? {
                  mean: rustResult.monte_carlo.mean,
                  stdDev: rustResult.monte_carlo.std_dev,
                  min: rustResult.monte_carlo.min,
                  max: rustResult.monte_carlo.max,
                  cpk: rustResult.monte_carlo.cpk,
                  percentiles: rustResult.monte_carlo.percentiles,
                  histogram: rustResult.monte_carlo.histogram,
                  sampleSize: 10000,
                }
              : undefined,
            contributions: rustResult.contributions.map((c: any) => ({
              linkId: activeChain.links[c.index].id,
              linkName: activeChain.links[c.index].name,
              nominalContribution: activeChain.links[c.index].nominal,
              toleranceContribution:
                activeChain.links[c.index].plusTolerance +
                activeChain.links[c.index].minusTolerance,
              varianceContribution: 0,
              percentOfTotal: c.percent,
            })),
          });
          onStatusChange?.('Calculation complete');
          return;
        }
      } catch (rustErr) {
        console.warn('Rust calculation failed, using TypeScript fallback:', rustErr);
      }

      // TypeScript fallback
      const tsResult = calculateToleranceStackup(activeChain.links, {
        runMonteCarlo: true,
        monteCarloSamples: 10000,
      });
      setResult(tsResult);
      onStatusChange?.('Calculation complete');
    } catch (err) {
      console.error('Calculation failed:', err);
      setError(err instanceof Error ? err.message : 'Calculation failed');
      onStatusChange?.('Calculation failed');
    } finally {
      setIsCalculating(false);
    }
  }, [activeChain, onStatusChange]);

  if (isLoading) {
    return (
      <div className="tolerance-stackup-mode">
        <div className="detecting-interfaces">
          <div className="detecting-spinner" />
          <span>Loading assembly...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tolerance-stackup-mode">
        <div className="tolerance-error">
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      </div>
    );
  }

  if (!stepContent) {
    return (
      <div className="tolerance-stackup-mode">
        <div className="tolerance-empty">
          <div className="tolerance-empty-icon">⚙️</div>
          <h3>Tolerance Stackup Analysis</h3>
          <p>Upload an assembly STEP file to begin analyzing tolerance stackups.</p>
          <div className="tolerance-features">
            <div className="tolerance-feature">
              <span className="feature-check">✓</span>
              Auto-detect mating interfaces
            </div>
            <div className="tolerance-feature">
              <span className="feature-check">✓</span>
              Build tolerance chains
            </div>
            <div className="tolerance-feature">
              <span className="feature-check">✓</span>
              Calculate WC, RSS, Monte Carlo
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tolerance-stackup-mode">
      <div className="tolerance-layout">
        {/* Left Panel - Assembly Explorer */}
        <div className="tolerance-panel explorer-panel">
          <AssemblyExplorer
            parts={parts}
            interfaces={interfaces}
            junctionParts={junctionParts}
            selectedPartId={selectedPartId}
            selectedInterfaceId={selectedInterfaceId}
            onPartSelect={setSelectedPartId}
            onInterfaceSelect={setSelectedInterfaceId}
          />
        </div>

        {/* Center Panel - Chain Builder */}
        <div className="tolerance-panel builder-panel">
          <ChainBuilder
            chain={activeChain}
            onCreateChain={handleCreateChain}
            onAutoGenerate={handleAutoGenerate}
            hasPartsAndInterfaces={parts.length > 0}
            onAddLink={handleAddLink}
            onUpdateLink={handleUpdateLink}
            onRemoveLink={handleRemoveLink}
            onCalculate={handleCalculate}
            isCalculating={isCalculating}
          />
        </div>

        {/* Right Panel - Results */}
        <div className="tolerance-panel results-panel">
          <ToleranceResults
            result={result}
            chainName={activeChain?.name || 'Tolerance Chain'}
          />
        </div>
      </div>
    </div>
  );
}

export default ToleranceStackupMode;
