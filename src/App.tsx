import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DfmResults } from "./components/DfmResults";
import { ModelViewer } from "./components/ModelViewer";
import { CostEstimation } from "./components/CostEstimation";
import { ManufacturingInfo } from "./components/ManufacturingInfo";
import type { DfmAnalysisResult, GroupedDfmResults } from "./lib/dfm/types";
import type { ManufacturingProcess } from "./lib/cost/types";
import { groupDfmResults, getDfmStats } from "./lib/dfm/parser";
import type { MeshData, StepMeshResult } from "./lib/mesh/types";
import { loadStepToMesh } from "./lib/stepLoader";

// Image compression settings to avoid 413 payload too large errors
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const JPEG_QUALITY = 0.85;

// Compress base64 image to reduce payload size
function compressImage(base64: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions maintaining aspect ratio
      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG for smaller file size
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        const compressedBase64 = dataUrl.split(",")[1];
        resolve(compressedBase64);
      } else {
        reject(new Error("Could not get canvas context"));
      }
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = `data:image/png;base64,${base64}`;
  });
}

interface DfmStats {
  totalRules: number;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  naCount: number;
  criticalFailures: number;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  image?: string;
  timestamp: Date;
  // DFM structured data (if available)
  dfmAnalysis?: DfmAnalysisResult;
  dfmGrouped?: GroupedDfmResults;
  dfmStats?: DfmStats;
}

type AnalysisMode = "general" | "dfm";

// STEP file analysis types (matches Rust structs)
interface StepAnalysisResult {
  success: boolean;
  error?: string;
  filename?: string;
  bounding_box?: {
    min: [number, number, number];
    max: [number, number, number];
    dimensions: [number, number, number];
  };
  volume_estimate?: number;
  surface_area_estimate?: number;
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

const ENGINEERING_CONTEXT = `You are an expert engineering co-pilot with deep knowledge of:
- CAD software (SolidWorks, Fusion 360, Inventor, CATIA)
- First principles thinking and physics-based analysis
- Mechanical design, stress analysis, and material selection
- Manufacturing processes (CNC, injection molding, sheet metal, 3D printing)
- GD&T and tolerancing
- DFM/DFA best practices

When analyzing screenshots:
1. Identify the CAD software and current operation
2. Analyze the design from first principles
3. Consider failure modes and stress concentrations
4. Suggest improvements based on manufacturability
5. Flag potential issues with tolerances or assembly

Be concise but thorough. Use engineering terminology appropriately.`;

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("general");
  const [stepData, setStepData] = useState<StepAnalysisResult | null>(null);
  const [isLoadingStep, setIsLoadingStep] = useState(false);
  const [meshData, setMeshData] = useState<MeshData | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<"dfm" | "3d" | "cost" | "mfg">("dfm");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stepInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load API key from storage
  useEffect(() => {
    const stored = localStorage.getItem("ohmframe_api_key");
    if (stored) setApiKey(stored);
  }, []);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem("ohmframe_api_key", key);
    setShowSettings(false);
  };

  const captureScreen = useCallback(async () => {
    setIsCapturing(true);
    try {
      // Call Tauri command to capture screen
      const screenshot = await invoke<string>("capture_screen");

      // Compress the screenshot to avoid 413 payload too large errors
      const compressedScreenshot = await compressImage(screenshot);
      setLastCapture(compressedScreenshot);

      // Add capture message
      const captureMsg: Message = {
        id: `capture-${Date.now()}`,
        role: "system",
        content: "Screen captured. Ask a question about what you see.",
        image: compressedScreenshot,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, captureMsg]);
    } catch (err) {
      console.error("Screen capture failed:", err);
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "system",
        content: `Capture failed: ${err}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsCapturing(false);
    }
  }, []);

  // Handle STEP file selection
  const handleStepFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file extension
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.step') && !ext.endsWith('.stp')) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "system",
        content: "Please select a STEP file (.step or .stp)",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      return;
    }

    setIsLoadingStep(true);

    try {
      // Read file content as text (STEP files are text-based)
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
      });

      // Pass file content and name to Rust for analysis
      const result = await invoke<StepAnalysisResult>("analyze_step_content", {
        content: fileContent,
        filename: file.name,
      });

      if (result.success) {
        setStepData(result);

        // Load mesh data using frontend OCCT loader for accurate 3D rendering
        try {
          console.log("[App] Attempting to load mesh with frontend OCCT loader...");
          const occtMesh = await loadStepToMesh(fileContent);
          console.log("[App] OCCT mesh result:", occtMesh);
          if (occtMesh && occtMesh.vertices.length > 0) {
            // Convert OCCT mesh to our MeshData format with proper face groups
            const meshData: MeshData = {
              vertices: occtMesh.vertices,
              indices: occtMesh.indices,
              normals: occtMesh.normals,
              face_groups: occtMesh.faceGroups.map(fg => ({
                face_id: fg.face_id,
                face_type: fg.face_type,
                start_index: fg.start_index,
                triangle_count: fg.triangle_count,
                center: fg.center,
              })),
            };
            console.log("[App] Setting mesh data from frontend loader:", {
              vertexCount: meshData.vertices.length / 3,
              indexCount: meshData.indices.length,
              triangleCount: meshData.indices.length / 3,
              faceGroupCount: meshData.face_groups.length,
              faceTypes: meshData.face_groups.reduce((acc, fg) => {
                acc[fg.face_type] = (acc[fg.face_type] || 0) + 1;
                return acc;
              }, {} as Record<string, number>),
            });
            setMeshData(meshData);
          } else {
            console.warn("[App] Frontend loader returned empty or null mesh, falling back to Rust");
            throw new Error("Empty mesh from frontend loader");
          }
        } catch (meshErr) {
          console.warn("[App] Frontend mesh generation failed, trying Rust backend:", meshErr);
          // Fallback to Rust backend
          try {
            console.log("[App] Trying Rust backend for mesh generation...");
            const meshResult = await invoke<StepMeshResult>("parse_step_mesh", {
              content: fileContent,
              filename: file.name,
            });
            console.log("[App] Rust mesh result:", meshResult);
            if (meshResult.success && meshResult.mesh) {
              console.log("[App] Using Rust backend mesh (placeholder)");
              setMeshData(meshResult.mesh);
            }
          } catch (rustErr) {
            console.warn("[App] Rust mesh generation also failed:", rustErr);
            setMeshData(null);
          }
        }

        // Add system message about STEP file
        const stepMsg: Message = {
          id: `step-${Date.now()}`,
          role: "system",
          content: `STEP file loaded: ${result.filename}\n` +
            `Topology: ${result.topology?.num_faces || 0} faces, ${result.topology?.num_edges || 0} edges\n` +
            `Features: ${result.features?.cylindrical_faces || 0} cylindrical (potential holes), ` +
            `${result.features?.planar_faces || 0} planar, ${result.features?.curved_faces || 0} curved`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, stepMsg]);
      } else {
        throw new Error(result.error || "Failed to parse STEP file");
      }
    } catch (err) {
      console.error("STEP analysis failed:", err);
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "system",
        content: `STEP analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setStepData(null);
    } finally {
      setIsLoadingStep(false);
      // Reset the input so the same file can be selected again
      if (stepInputRef.current) {
        stepInputRef.current.value = '';
      }
    }
  }, []);

  const clearStepData = () => {
    setStepData(null);
    setMeshData(null);
    setActiveResultTab("dfm");
  };

  const analyzeWithVision = async (prompt: string, image?: string) => {
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    setIsLoading(true);

    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt,
      image: image,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // Determine if we have an image to send
      const imageToSend = image || lastCapture;

      // In DFM mode with STEP data, image is optional
      // In other modes, we need either an image or STEP data
      if (!imageToSend && !stepData) {
        throw new Error("Please capture a screenshot or upload a STEP file first");
      }

      // Build request body - only include image if we have one
      const requestBody: Record<string, unknown> = {
        prompt: stepData
          ? `${prompt}\n\nSTEP File Data: ${JSON.stringify(stepData, null, 2)}`
          : prompt,
        mode: analysisMode,
      };

      // Include image only if available
      if (imageToSend) {
        requestBody.image = imageToSend;
      }

      // Only send custom context for general mode; DFM mode uses server-side prompt
      if (analysisMode === "general") {
        requestBody.context = ENGINEERING_CONTEXT;
      }

      // Include STEP data if available
      if (stepData) {
        requestBody.stepData = stepData;
      }

      // Call the Ohmframe API for vision analysis
      const response = await fetch("https://ai.ohmframe.com/api/vision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Re-group DFM results locally to ensure correct critical/warning categorization
      // The server may group differently, so we apply our own grouping logic
      let dfmGrouped = data.dfmGrouped;
      let dfmStats = data.dfmStats;

      if (data.dfmAnalysis) {
        // Re-group using local function to fix critical/warning classification
        dfmGrouped = groupDfmResults(data.dfmAnalysis);
        dfmStats = getDfmStats(data.dfmAnalysis);
      }

      // Create assistant message with optional DFM structured data
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response || data.message,
        timestamp: new Date(),
        // Include DFM structured data if available (DFM mode returns these)
        dfmAnalysis: data.dfmAnalysis,
        dfmGrouped: dfmGrouped,
        dfmStats: dfmStats,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "system",
        content: `Analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    analyzeWithVision(input.trim());
    setInput("");
  };

  const quickPromptsGeneral = [
    "What's happening in this design?",
    "Analyze this from first principles",
    "What could fail here?",
    "How can I improve manufacturability?",
    "Check tolerances and GD&T",
  ];

  const quickPromptsDfm = [
    "Full DFM analysis",
    "Check for manufacturability issues",
    "What's the DFM score?",
    "How can I reduce cost?",
    "Identify critical issues",
  ];

  const quickPrompts = analysisMode === "dfm" ? quickPromptsDfm : quickPromptsGeneral;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-ohm">Ohm</span>
          <span className="logo-frame">frame</span>
          <span className="logo-copilot">Copilot</span>
        </div>

        {/* Mode Toggle */}
        <div className="mode-toggle">
          <button
            className={`mode-btn ${analysisMode === "general" ? "active" : ""}`}
            onClick={() => setAnalysisMode("general")}
          >
            General
          </button>
          <button
            className={`mode-btn dfm ${analysisMode === "dfm" ? "active" : ""}`}
            onClick={() => setAnalysisMode("dfm")}
          >
            DFM
          </button>
        </div>

        <div className="header-actions">
          <button
            className={`capture-btn ${isCapturing ? "capturing" : ""}`}
            onClick={captureScreen}
            disabled={isCapturing}
          >
            {isCapturing ? "Capturing..." : "Capture Screen"}
          </button>
          <button
            className={`step-btn ${stepData ? "has-data" : ""} ${isLoadingStep ? "loading" : ""}`}
            onClick={() => stepInputRef.current?.click()}
            disabled={isLoadingStep}
          >
            {isLoadingStep ? "Loading..." : stepData ? "STEP ✓" : "STEP"}
          </button>
          <input
            ref={stepInputRef}
            type="file"
            accept=".step,.stp"
            onChange={handleStepFileSelect}
            style={{ display: "none" }}
          />
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>

      {/* STEP File Info Banner */}
      {stepData && (
        <div className="step-banner">
          <span className="step-filename">{stepData.filename}</span>
          <span className="step-info">
            {stepData.topology?.num_faces || 0} faces •{" "}
            {stepData.features?.cylindrical_faces || 0} holes
          </span>
          {analysisMode === "dfm" && (
            <span className="step-hint">Ready for DFM analysis</span>
          )}
          <button className="step-clear" onClick={clearStepData}>×</button>
        </div>
      )}

      {/* Messages */}
      <main className="messages">
        {messages.length === 0 ? (
          <div className="welcome">
            <h2>Engineering Co-Pilot</h2>
            <p>
              {analysisMode === "dfm"
                ? "Upload a STEP file or capture screen to run DFM analysis."
                : "Capture your CAD screen, then ask questions about your design."}
            </p>
            <div className="quick-actions">
              <button onClick={captureScreen} className="action-btn primary">
                Capture Screen
              </button>
              <button
                onClick={() => stepInputRef.current?.click()}
                className="action-btn secondary"
              >
                Upload STEP
              </button>
            </div>
            <div className="features">
              <div className="feature">
                <span className="feature-icon">1</span>
                <span>First Principles Analysis</span>
              </div>
              <div className="feature">
                <span className="feature-icon">2</span>
                <span>DFM Review</span>
              </div>
              <div className="feature">
                <span className="feature-icon">3</span>
                <span>Failure Mode Detection</span>
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              {msg.image && (
                <div className="message-image">
                  <img src={`data:image/png;base64,${msg.image}`} alt="Screen capture" />
                </div>
              )}
              <div className="message-content">
                {msg.role === "assistant" ? (
                  // Check if we have structured DFM results
                  msg.dfmAnalysis && msg.dfmGrouped && msg.dfmStats ? (
                    <div className="dfm-results-container">
                      {/* Tabs for DFM/3D/Cost views */}
                      <div className="dfm-tabs">
                        <button
                          className={`dfm-tab ${activeResultTab === "dfm" ? "active" : ""}`}
                          onClick={() => setActiveResultTab("dfm")}
                        >
                          DFM Analysis
                        </button>
                        {meshData && (
                          <button
                            className={`dfm-tab ${activeResultTab === "3d" ? "active" : ""}`}
                            onClick={() => setActiveResultTab("3d")}
                          >
                            3D View
                          </button>
                        )}
                        <button
                          className={`dfm-tab cost-tab ${activeResultTab === "cost" ? "active" : ""}`}
                          onClick={() => setActiveResultTab("cost")}
                        >
                          Cost Estimate
                        </button>
                        <button
                          className={`dfm-tab mfg-tab ${activeResultTab === "mfg" ? "active" : ""}`}
                          onClick={() => setActiveResultTab("mfg")}
                        >
                          Manufacturing
                        </button>
                      </div>

                      {/* Conditionally show based on active tab */}
                      {activeResultTab === "3d" && meshData ? (
                        <ModelViewer
                          meshData={meshData}
                          dfmResults={msg.dfmAnalysis.ruleResults}
                          onMarkerClick={(ruleId) => {
                            // Switch to DFM tab and scroll to rule
                            setActiveResultTab("dfm");
                            setTimeout(() => {
                              const el = document.getElementById(`rule-${ruleId}`);
                              el?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }, 100);
                          }}
                        />
                      ) : activeResultTab === "cost" ? (
                        <CostEstimation
                          process={msg.dfmAnalysis.processDetected as ManufacturingProcess}
                          stepData={stepData ? {
                            topology: stepData.topology,
                            features: stepData.features,
                            bounding_box: stepData.bounding_box,
                          } : undefined}
                          onGetQuote={() => {
                            // Open the Ohmframe portal for detailed quote
                            window.open("https://ohmframe.com/quote", "_blank");
                          }}
                        />
                      ) : activeResultTab === "mfg" ? (
                        <ManufacturingInfo
                          process={msg.dfmAnalysis.processDetected as ManufacturingProcess}
                          stepData={stepData ? {
                            topology: stepData.topology,
                            features: stepData.features,
                            bounding_box: stepData.bounding_box,
                          } : undefined}
                        />
                      ) : (
                        <DfmResults
                          dfmAnalysis={msg.dfmAnalysis}
                          dfmGrouped={msg.dfmGrouped}
                          dfmStats={msg.dfmStats}
                        />
                      )}
                    </div>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  )
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="message assistant loading">
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Quick Prompts */}
      {lastCapture && (
        <div className="quick-prompts">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => analyzeWithVision(prompt)}
              disabled={isLoading}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form className="input-area" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={lastCapture ? "Ask about the captured screen..." : "Capture a screen first"}
          disabled={isLoading || !lastCapture}
        />
        <button type="submit" disabled={isLoading || !input.trim() || !lastCapture}>
          Send
        </button>
      </form>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            <div className="setting-item">
              <label>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Ohmframe Enterprise API key"
              />
              <small>Get your API key from ai.ohmframe.com/account</small>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowSettings(false)}>Cancel</button>
              <button onClick={() => saveApiKey(apiKey)} className="primary">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
