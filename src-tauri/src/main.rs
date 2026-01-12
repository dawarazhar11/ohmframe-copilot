// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageBuffer, Rgba};
use screenshots::Screen;
use std::io::Cursor;
use std::path::Path;
use tauri::Manager;
use serde::{Deserialize, Serialize};

// Regex for parsing STEP coordinates
use regex::Regex;

// Assembly and tolerance stackup modules
mod assembly_parser;
mod interface_detection;
mod tolerance_calc;

pub use assembly_parser::*;
pub use interface_detection::*;
pub use tolerance_calc::*;

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

/// Extract 3D points from STEP file content
fn extract_step_points(content: &str) -> Vec<[f64; 3]> {
    let mut points = Vec::new();

    // Match CARTESIAN_POINT patterns: #123=CARTESIAN_POINT('',(-1.5,2.3,4.5));
    let point_re = Regex::new(r"CARTESIAN_POINT\s*\(\s*'[^']*'\s*,\s*\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*,\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*,\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)").unwrap();

    for cap in point_re.captures_iter(content) {
        if let (Ok(x), Ok(y), Ok(z)) = (
            cap[1].parse::<f64>(),
            cap[2].parse::<f64>(),
            cap[3].parse::<f64>(),
        ) {
            points.push([x, y, z]);
        }
    }

    points
}

/// Create a convex hull approximation mesh from points
fn create_mesh_from_points(points: &[[f64; 3]]) -> (Vec<f32>, Vec<u32>, Vec<f32>, BoundingBox) {
    if points.is_empty() {
        // Return empty mesh
        return (vec![], vec![], vec![], BoundingBox {
            min: [0.0, 0.0, 0.0],
            max: [0.0, 0.0, 0.0],
            dimensions: [0.0, 0.0, 0.0],
        });
    }

    // Calculate bounding box
    let mut min = [f64::MAX, f64::MAX, f64::MAX];
    let mut max = [f64::MIN, f64::MIN, f64::MIN];

    for p in points {
        min[0] = min[0].min(p[0]);
        min[1] = min[1].min(p[1]);
        min[2] = min[2].min(p[2]);
        max[0] = max[0].max(p[0]);
        max[1] = max[1].max(p[1]);
        max[2] = max[2].max(p[2]);
    }

    let bbox = BoundingBox {
        min,
        max,
        dimensions: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    };

    // Create a box mesh based on the bounding box
    let mut vertices: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    // 8 corners of the bounding box
    let corners = [
        [min[0], min[1], min[2]], // 0
        [max[0], min[1], min[2]], // 1
        [max[0], max[1], min[2]], // 2
        [min[0], max[1], min[2]], // 3
        [min[0], min[1], max[2]], // 4
        [max[0], min[1], max[2]], // 5
        [max[0], max[1], max[2]], // 6
        [min[0], max[1], max[2]], // 7
    ];

    // 6 faces of the box with their normals
    let faces = [
        ([0, 1, 2, 3], [0.0, 0.0, -1.0]),  // Back (-Z)
        ([4, 7, 6, 5], [0.0, 0.0, 1.0]),   // Front (+Z)
        ([0, 4, 5, 1], [0.0, -1.0, 0.0]),  // Bottom (-Y)
        ([2, 6, 7, 3], [0.0, 1.0, 0.0]),   // Top (+Y)
        ([0, 3, 7, 4], [-1.0, 0.0, 0.0]),  // Left (-X)
        ([1, 5, 6, 2], [1.0, 0.0, 0.0]),   // Right (+X)
    ];

    let mut vertex_offset: u32 = 0;

    for (face_indices, normal) in faces.iter() {
        // Add 4 vertices for this face
        for &vi in face_indices {
            vertices.push(corners[vi][0] as f32);
            vertices.push(corners[vi][1] as f32);
            vertices.push(corners[vi][2] as f32);
            normals.push(normal[0] as f32);
            normals.push(normal[1] as f32);
            normals.push(normal[2] as f32);
        }

        // Two triangles per face
        indices.push(vertex_offset);
        indices.push(vertex_offset + 1);
        indices.push(vertex_offset + 2);
        indices.push(vertex_offset);
        indices.push(vertex_offset + 2);
        indices.push(vertex_offset + 3);

        vertex_offset += 4;
    }

    (vertices, indices, normals, bbox)
}

/// Parse STEP file and generate mesh for 3D viewer
fn parse_step_to_mesh(content: &str) -> std::result::Result<(MeshData, BoundingBox), String> {
    // Get basic analysis first
    let basic = analyze_step_content(content.to_string(), "temp.step".to_string());

    if !basic.success {
        return Err("Invalid STEP file".to_string());
    }

    // Extract actual 3D points from the STEP file
    let points = extract_step_points(content);

    if points.is_empty() {
        return Err("No geometry points found in STEP file".to_string());
    }

    // Create mesh from extracted points
    let (vertices, indices, normals, bbox) = create_mesh_from_points(&points);

    // Create face groups based on STEP analysis
    let topology = basic.topology.unwrap_or(TopologyInfo {
        num_solids: 1,
        num_shells: 1,
        num_faces: 6,
        num_edges: 12,
        num_vertices: 8,
    });

    let features = basic.features.unwrap_or(FeatureInfo {
        cylindrical_faces: 0,
        planar_faces: 6,
        curved_faces: 0,
    });

    // Create face groups for the bounding box mesh
    let mut face_groups = Vec::new();
    let center = [
        (bbox.min[0] + bbox.max[0]) / 2.0,
        (bbox.min[1] + bbox.max[1]) / 2.0,
        (bbox.min[2] + bbox.max[2]) / 2.0,
    ];

    // Map the 6 box faces to actual STEP face data
    let face_offsets = [
        [0.0, 0.0, bbox.min[2]],  // Back
        [0.0, 0.0, bbox.max[2]],  // Front
        [0.0, bbox.min[1], 0.0],  // Bottom
        [0.0, bbox.max[1], 0.0],  // Top
        [bbox.min[0], 0.0, 0.0],  // Left
        [bbox.max[0], 0.0, 0.0],  // Right
    ];

    for (i, offset) in face_offsets.iter().enumerate() {
        let face_center = [
            center[0] + offset[0] * 0.5,
            center[1] + offset[1] * 0.5,
            center[2] + offset[2] * 0.5,
        ];

        // Assign face type based on STEP features
        let face_type = if i < features.cylindrical_faces {
            "cylindrical"
        } else if i < features.cylindrical_faces + features.curved_faces {
            "curved"
        } else {
            "planar"
        };

        face_groups.push(FaceGroup {
            face_id: i as u32,
            face_type: face_type.to_string(),
            start_index: (i * 6) as u32,  // 6 indices per face (2 triangles)
            triangle_count: 2,
            center: face_center,
        });
    }

    // Add additional face groups for STEP faces beyond 6
    for extra_id in 6..topology.num_faces {
        // Distribute extra faces markers around the model
        let angle = (extra_id as f64) * 2.0 * std::f64::consts::PI / (topology.num_faces as f64);
        let radius = bbox.dimensions[0].max(bbox.dimensions[1]).max(bbox.dimensions[2]) * 0.3;

        let face_center = [
            center[0] + radius * angle.cos(),
            center[1] + radius * angle.sin() * 0.5,
            center[2] + radius * angle.sin() * 0.5,
        ];

        let face_type = if extra_id < features.cylindrical_faces {
            "cylindrical"
        } else if extra_id < features.cylindrical_faces + features.curved_faces {
            "curved"
        } else {
            "planar"
        };

        face_groups.push(FaceGroup {
            face_id: extra_id as u32,
            face_type: face_type.to_string(),
            start_index: 0,  // Visual marker only
            triangle_count: 0,
            center: face_center,
        });
    }

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
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            capture_window,
            analyze_step_content,
            analyze_step_file,
            select_step_file,
            parse_step_mesh,
            // Assembly and tolerance stackup commands
            assembly_parser::parse_assembly_step,
            interface_detection::detect_mating_interfaces,
            tolerance_calc::calculate_tolerance_stackup
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
