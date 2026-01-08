import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  image?: string;
  timestamp: Date;
}

interface AnalysisRequest {
  image: string;
  prompt: string;
  context?: string;
  mode?: "general" | "dfm";
  stepData?: StepAnalysisResult;
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
      setLastCapture(screenshot);

      // Add capture message
      const captureMsg: Message = {
        id: `capture-${Date.now()}`,
        role: "system",
        content: "Screen captured. Ask a question about what you see.",
        image: screenshot,
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
      // Call the Ohmframe API for vision analysis
      const response = await fetch("https://ai.ohmframe.com/api/vision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          image: image || lastCapture,
          prompt: stepData
            ? `${prompt}\n\nSTEP File Data: ${JSON.stringify(stepData, null, 2)}`
            : prompt,
          mode: analysisMode,
          // Only send custom context for general mode; DFM mode uses server-side prompt
          ...(analysisMode === "general" ? { context: ENGINEERING_CONTEXT } : {}),
          // Include STEP data if available
          ...(stepData ? { stepData } : {}),
        } as AnalysisRequest),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response || data.message,
        timestamp: new Date(),
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
          <button className="step-clear" onClick={clearStepData}>×</button>
        </div>
      )}

      {/* Messages */}
      <main className="messages">
        {messages.length === 0 ? (
          <div className="welcome">
            <h2>Engineering Co-Pilot</h2>
            <p>Click "Capture Screen" to capture your CAD screen, then ask questions about your design.</p>
            <div className="quick-actions">
              <button onClick={captureScreen} className="action-btn primary">
                Capture Screen
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
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
