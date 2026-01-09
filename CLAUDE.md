# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ohmframe Copilot is a desktop AI-powered engineering co-pilot for CAD screen analysis and DFM (Design for Manufacturing) review. Built with Tauri 2.x (Rust backend) and React (TypeScript frontend).

## Build Commands

```bash
# Development
npm run dev              # Start Vite dev server (port 1420)
npm run tauri dev        # Full Tauri development mode with hot reload

# Production
npm run build            # Build frontend only (tsc + vite)
npm run tauri build      # Build complete desktop app

# Rust-only
cd src-tauri && cargo check    # Type check Rust code
cd src-tauri && cargo build    # Build Rust backend
```

## Architecture

### Tech Stack
- **Frontend**: React 19 + TypeScript + Vite + Three.js (3D viewer)
- **Backend**: Rust + Tauri 2.x + truck crates (STEP processing)
- **API**: Remote vision API at `ai.ohmframe.com/api/vision`

### Key Directories
```
src/                          # React frontend
  App.tsx                     # Main component (screen capture, API calls, DFM display)
  components/
    DfmResults.tsx            # DFM analysis display with collapsible rules
    ModelViewer/              # Three.js 3D mesh viewer with failure markers
  lib/
    dfm/                      # DFM rule engine
      rules.ts                # 50+ rules for 8 manufacturing processes
      types.ts                # DfmRule, DfmRuleResult, ManufacturingProcess types
      parser.ts               # API response parsing
    mesh/types.ts             # MeshData, FaceGroup, StepMeshResult types

src-tauri/src/main.rs         # Rust Tauri commands
```

### Tauri IPC Commands (Rust → Frontend)
- `capture_screen` - Returns base64 PNG of primary display
- `analyze_step_content(content, filename)` - Parse STEP file text, extract topology/features
- `parse_step_mesh(content, filename)` - Generate mesh for 3D viewer
- `analyze_step_file` - Open file picker dialog for STEP files

### Data Flow
1. User captures screen → base64 image stored in React state
2. User sends prompt → frontend calls `ai.ohmframe.com/api/vision` with image + prompt + mode
3. In DFM mode, response is parsed into structured `DfmRuleResult[]`
4. If STEP file loaded, mesh data enables 3D viewer with failure markers

### DFM Rule System
Manufacturing processes: `sheet_metal`, `cnc_machining`, `injection_molding`, `die_casting`, `3d_printing_fdm`, `3d_printing_sla`, `weldment`, `pcba`

Rule categories per process (e.g., Sheet Metal): Bending, Holes, Features, Walls, Hardware, Tolerances

### Image Compression
Frontend compresses screenshots before API calls to avoid 413 errors:
- Max 1920x1080, JPEG quality 0.85
- See `compressImage()` in App.tsx

## Release Process

Push a version tag to trigger GitHub Actions build:
```bash
# Update version in: package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json
git tag v1.x.x
git push origin v1.x.x
# Then publish draft release via: gh release edit v1.x.x --draft=false
```

## Configuration Files
- `src-tauri/tauri.conf.json` - Window size (500x700), app identifier, capabilities
- `vite.config.ts` - Dev server port 1420, clearScreen disabled for Tauri
- `tsconfig.json` - Strict mode, ES2020 target
