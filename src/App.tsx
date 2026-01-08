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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
          prompt: prompt,
          context: ENGINEERING_CONTEXT,
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

  const quickPrompts = [
    "What's happening in this design?",
    "Analyze this from first principles",
    "What could fail here?",
    "How can I improve manufacturability?",
    "Check tolerances and GD&T",
  ];

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-ohm">Ohm</span>
          <span className="logo-frame">frame</span>
          <span className="logo-copilot">Copilot</span>
        </div>
        <div className="header-actions">
          <button
            className={`capture-btn ${isCapturing ? "capturing" : ""}`}
            onClick={captureScreen}
            disabled={isCapturing}
          >
            {isCapturing ? "Capturing..." : "Capture Screen"}
          </button>
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>

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
