// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageBuffer, Rgba};
use screenshots::Screen;
use std::io::Cursor;
use std::path::Path;
use tauri::Manager;
use serde::{Deserialize, Serialize};

// Note: Truck crates declared in Cargo.toml for future use
// Currently using simplified mesh generation based on STEP metadata

/// Result of STEP file analysis
#[derive(Debug, Serialize, Deserialize)]
pub struct StepAnalysisResult {
    pub success: bool,
    pub error: Option<String>,
    pub filename: Option<String>,
    pub bounding_box: Option<BoundingBox>,
    pub volume_estimate: Option<f64>,
    pub surface_area_estimate: Option<f64>,
    pub topology: Option<TopologyInfo>,
    pub features: Option<FeatureInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BoundingBox {
    pub min: [f64; 3],
    pub max: [f64; 3],
    pub dimensions: [f64; 3], // width, height, depth
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TopologyInfo {
    pub num_solids: usize,
    pub num_shells: usize,
    pub num_faces: usize,
    pub num_edges: usize,
    pub num_vertices: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FeatureInfo {
    pub cylindrical_faces: usize, // potential holes
    pub planar_faces: usize,
    pub curved_faces: usize,
}

// ============ 3D Mesh Data Structures ============

/// Mesh data for 3D viewer
#[derive(Debug, Serialize, Deserialize)]
pub struct MeshData {
    pub vertices: Vec<f32>,      // [x1,y1,z1,x2,y2,z2,...] flat array
    pub indices: Vec<u32>,       // Triangle indices
    pub normals: Vec<f32>,       // Per-vertex normals
    pub face_groups: Vec<FaceGroup>, // Map triangles to STEP faces
}

/// Group of triangles belonging to a STEP face
#[derive(Debug, Serialize, Deserialize)]
pub struct FaceGroup {
    pub face_id: u32,            // STEP entity ID
    pub face_type: String,       // "planar", "cylindrical", "curved", etc.
    pub start_index: u32,        // First triangle index in indices array
    pub triangle_count: u32,     // Number of triangles
    pub center: [f64; 3],        // Face center for marker placement
}

/// Result of STEP mesh parsing
#[derive(Debug, Serialize, Deserialize)]
pub struct StepMeshResult {
    pub success: bool,
    pub error: Option<String>,
    pub filename: Option<String>,
    pub mesh: Option<MeshData>,
    pub bounding_box: Option<BoundingBox>,
    pub topology: Option<TopologyInfo>,
    pub features: Option<FeatureInfo>,
}

/// Capture the primary screen and return as base64 PNG
#[tauri::command]
fn capture_screen() -> Result<String, String> {
    // Get all screens
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;

    // Get the primary screen (first one)
    let screen = screens.first().ok_or("No screens found")?;

    // Capture the screen
    let capture = screen.capture().map_err(|e| format!("Failed to capture screen: {}", e))?;

    // Convert screenshots::Image to image::ImageBuffer
    let width = capture.width();
    let height = capture.height();
    let rgba_data = capture.rgba().to_vec();

    let img_buffer: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_raw(width, height, rgba_data)
            .ok_or("Failed to create image buffer")?;

    // Encode to PNG
    let mut png_bytes = Vec::new();
    let mut cursor = Cursor::new(&mut png_bytes);

    img_buffer
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode image: {}", e))?;

    // Encode as base64
    let base64_string = STANDARD.encode(&png_bytes);

    Ok(base64_string)
}

/// Capture a specific window by title (for CAD software)
#[tauri::command]
fn capture_window(title: String) -> Result<String, String> {
    let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;

    // For now, just capture the primary screen
    // TODO: Implement window-specific capture when screenshots crate supports it
    let screen = screens.first().ok_or("No screens found")?;
    let capture = screen.capture().map_err(|e| format!("Failed to capture: {}", e))?;

    // Convert screenshots::Image to image::ImageBuffer
    let width = capture.width();
    let height = capture.height();
    let rgba_data = capture.rgba().to_vec();

    let img_buffer: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_raw(width, height, rgba_data)
            .ok_or("Failed to create image buffer")?;

    // Encode to PNG
    let mut png_bytes = Vec::new();
    let mut cursor = Cursor::new(&mut png_bytes);

    img_buffer
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode: {}", e))?;

    let _ = title; // Silence unused warning for now
    Ok(STANDARD.encode(&png_bytes))
}

/// Analyze STEP file content directly (passed from frontend)
#[tauri::command]
fn analyze_step_content(content: String, filename: String) -> StepAnalysisResult {
    // Validate it looks like a STEP file
    if !content.contains("ISO-10303-21") && !content.contains("STEP") {
        return StepAnalysisResult {
            success: false,
            error: Some("Invalid STEP file format".to_string()),
            filename: Some(filename),
            bounding_box: None,
            volume_estimate: None,
            surface_area_estimate: None,
            topology: None,
            features: None,
        };
    }

    // Parse STEP content by looking at the raw text
    // This is a simplified analysis that doesn't require full truck geometry parsing

    // Count entities by searching for keywords
    let num_faces = content.matches("ADVANCED_FACE").count()
        + content.matches("FACE_SURFACE").count();
    let num_edges = content.matches("EDGE_CURVE").count();
    let num_vertices = content.matches("VERTEX_POINT").count();

    // Count face types
    let cylindrical_faces = content.matches("CYLINDRICAL_SURFACE").count();
    let planar_faces = content.matches("PLANE(").count();
    let curved_faces = content.matches("B_SPLINE_SURFACE").count()
        + content.matches("TOROIDAL_SURFACE").count()
        + content.matches("SPHERICAL_SURFACE").count()
        + content.matches("CONICAL_SURFACE").count();

    // Count solids and shells
    let num_solids = content.matches("MANIFOLD_SOLID_BREP").count()
        .max(content.matches("BREP_WITH_VOIDS").count())
        .max(1);
    let num_shells = content.matches("CLOSED_SHELL").count()
        + content.matches("OPEN_SHELL").count();

    StepAnalysisResult {
        success: true,
        error: None,
        filename: Some(filename),
        bounding_box: None, // Would need full geometry processing
        volume_estimate: None,
        surface_area_estimate: None,
        topology: Some(TopologyInfo {
            num_solids,
            num_shells: num_shells.max(1),
            num_faces,
            num_edges,
            num_vertices,
        }),
        features: Some(FeatureInfo {
            cylindrical_faces,
            planar_faces,
            curved_faces,
        }),
    }
}

/// Analyze a STEP file from path (kept for CLI/future use)
#[tauri::command]
fn analyze_step_file(file_path: String) -> StepAnalysisResult {
    let path = Path::new(&file_path);

    if !path.exists() {
        return StepAnalysisResult {
            success: false,
            error: Some(format!("File not found: {}", file_path)),
            filename: None,
            bounding_box: None,
            volume_estimate: None,
            surface_area_estimate: None,
            topology: None,
            features: None,
        };
    }

    let filename = path.file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_default();

    match std::fs::read_to_string(path) {
        Ok(content) => analyze_step_content(content, filename),
        Err(e) => StepAnalysisResult {
            success: false,
            error: Some(format!("Failed to read file: {}", e)),
            filename: Some(filename),
            bounding_box: None,
            volume_estimate: None,
            surface_area_estimate: None,
            topology: None,
            features: None,
        },
    }
}

/// Open file dialog and return selected STEP file path
#[tauri::command]
async fn select_step_file() -> Result<Option<String>, String> {
    // File selection is handled on the frontend with <input type="file">
    // This command is a placeholder for future native dialog support
    Ok(None)
}

/// Parse STEP file and generate mesh for 3D viewer
#[tauri::command]
fn parse_step_mesh(content: String, filename: String) -> StepMeshResult {
    // First, get basic analysis using text-based parsing (always works)
    let basic_result = analyze_step_content(content.clone(), filename.clone());

    // Try to parse with truck crates for mesh generation
    match parse_step_to_mesh(&content) {
        Ok((mesh, bbox)) => {
            StepMeshResult {
                success: true,
                error: None,
                filename: Some(filename),
                mesh: Some(mesh),
                bounding_box: Some(bbox),
                topology: basic_result.topology,
                features: basic_result.features,
            }
        }
        Err(e) => {
            // Fallback: return basic analysis without mesh
            StepMeshResult {
                success: false,
                error: Some(format!("Mesh generation failed: {}. Basic analysis available.", e)),
                filename: Some(filename),
                mesh: None,
                bounding_box: basic_result.bounding_box,
                topology: basic_result.topology,
                features: basic_result.features,
            }
        }
    }
}

/// Generate a simple representative mesh from STEP metadata
/// This is a placeholder - full truck-based parsing can be added later
fn parse_step_to_mesh(content: &str) -> std::result::Result<(MeshData, BoundingBox), String> {
    // Get basic analysis first
    let basic = analyze_step_content(content.to_string(), "temp.step".to_string());

    if !basic.success {
        return Err("Invalid STEP file".to_string());
    }

    let topology = basic.topology.ok_or("No topology found")?;
    let features = basic.features.ok_or("No features found")?;

    // Generate a placeholder mesh based on detected features
    // This creates a simple box with face groups representing the detected face types
    let mut vertices: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut face_groups: Vec<FaceGroup> = Vec::new();

    // Create a unit cube (will be scaled by frontend based on bounding box)
    let size = 50.0_f32; // Base size in mm
    let half = size / 2.0;

    // Define cube vertices (8 corners)
    let cube_verts: [[f32; 3]; 8] = [
        [-half, -half, -half], // 0
        [ half, -half, -half], // 1
        [ half,  half, -half], // 2
        [-half,  half, -half], // 3
        [-half, -half,  half], // 4
        [ half, -half,  half], // 5
        [ half,  half,  half], // 6
        [-half,  half,  half], // 7
    ];

    // Define 6 faces with their normals (each face = 2 triangles = 4 vertices)
    let face_defs: [([usize; 4], [f32; 3], &str); 6] = [
        ([0, 1, 2, 3], [ 0.0,  0.0, -1.0], "planar"),  // Back
        ([4, 7, 6, 5], [ 0.0,  0.0,  1.0], "planar"),  // Front
        ([0, 4, 5, 1], [ 0.0, -1.0,  0.0], "planar"),  // Bottom
        ([2, 6, 7, 3], [ 0.0,  1.0,  0.0], "planar"),  // Top
        ([0, 3, 7, 4], [-1.0,  0.0,  0.0], "planar"),  // Left
        ([1, 5, 6, 2], [ 1.0,  0.0,  0.0], "planar"),  // Right
    ];

    let mut vertex_offset: u32 = 0;
    let mut face_id: u32 = 0;

    for (face_indices, normal, face_type) in face_defs.iter() {
        let start_index = indices.len() as u32;

        // Add 4 vertices for this face (duplicated for flat shading)
        for &vi in face_indices {
            vertices.extend_from_slice(&cube_verts[vi]);
            normals.extend_from_slice(normal);
        }

        // Add 2 triangles (6 indices)
        indices.push(vertex_offset);
        indices.push(vertex_offset + 1);
        indices.push(vertex_offset + 2);
        indices.push(vertex_offset);
        indices.push(vertex_offset + 2);
        indices.push(vertex_offset + 3);

        // Calculate face center
        let center: [f64; 3] = [
            (cube_verts[face_indices[0]][0] + cube_verts[face_indices[2]][0]) as f64 / 2.0,
            (cube_verts[face_indices[0]][1] + cube_verts[face_indices[2]][1]) as f64 / 2.0,
            (cube_verts[face_indices[0]][2] + cube_verts[face_indices[2]][2]) as f64 / 2.0,
        ];

        // Assign face type based on STEP features detected
        let detected_type = if face_id < features.cylindrical_faces as u32 {
            "cylindrical"
        } else if face_id < (features.cylindrical_faces + features.curved_faces) as u32 {
            "curved"
        } else {
            face_type
        };

        face_groups.push(FaceGroup {
            face_id,
            face_type: detected_type.to_string(),
            start_index,
            triangle_count: 2,
            center,
        });

        vertex_offset += 4;
        face_id += 1;
    }

    // Add additional face groups to match STEP face count (markers will be placed on these)
    let total_faces = topology.num_faces.max(6);
    for extra_id in 6..total_faces {
        // Distribute extra faces evenly across the cube surface
        let base_face = (extra_id % 6) as usize;
        let (_, _, base_type) = face_defs[base_face];

        // Slight offset for marker placement
        let offset = (extra_id as f64 - 6.0) * 2.0;
        let center = [
            (extra_id % 2) as f64 * 10.0 - 5.0 + offset,
            ((extra_id / 2) % 2) as f64 * 10.0 - 5.0,
            ((extra_id / 4) % 2) as f64 * 10.0 - 5.0,
        ];

        let face_type = if extra_id < features.cylindrical_faces {
            "cylindrical"
        } else if extra_id < features.cylindrical_faces + features.curved_faces {
            "curved"
        } else {
            base_type
        };

        face_groups.push(FaceGroup {
            face_id: extra_id as u32,
            face_type: face_type.to_string(),
            start_index: 0, // Points to first triangle (visual placeholder)
            triangle_count: 0, // Marker only, no geometry
            center,
        });
    }

    let bbox = BoundingBox {
        min: [-half as f64, -half as f64, -half as f64],
        max: [half as f64, half as f64, half as f64],
        dimensions: [size as f64, size as f64, size as f64],
    };

    Ok((
        MeshData {
            vertices,
            indices,
            normals,
            face_groups,
        },
        bbox,
    ))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            capture_window,
            analyze_step_content,
            analyze_step_file,
            select_step_file,
            parse_step_mesh
        ])
        .setup(|app| {
            // Get the main window - handle potential errors gracefully
            if let Some(window) = app.get_webview_window("main") {
                // Set window title
                let _ = window.set_title("Ohmframe Copilot");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
