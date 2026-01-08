// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageBuffer, Rgba};
use screenshots::Screen;
use std::io::Cursor;
use std::path::Path;
use tauri::Manager;
use serde::{Deserialize, Serialize};

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

/// Analyze a STEP file and extract geometry information
#[tauri::command]
fn analyze_step_file(file_path: String) -> StepAnalysisResult {
    let path = Path::new(&file_path);

    // Check file exists
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

    // Get filename
    let filename = path.file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());

    // Try to read and parse the STEP file
    match std::fs::read_to_string(path) {
        Ok(step_content) => {
            // Parse STEP content by looking at the raw text
            // This is a simplified analysis that doesn't require full truck geometry parsing

            // Count entities by searching for keywords
            let num_faces = step_content.matches("ADVANCED_FACE").count()
                + step_content.matches("FACE_SURFACE").count();
            let num_edges = step_content.matches("EDGE_CURVE").count();
            let num_vertices = step_content.matches("VERTEX_POINT").count();

            // Count face types
            let cylindrical_faces = step_content.matches("CYLINDRICAL_SURFACE").count();
            let planar_faces = step_content.matches("PLANE(").count();
            let curved_faces = step_content.matches("B_SPLINE_SURFACE").count()
                + step_content.matches("TOROIDAL_SURFACE").count()
                + step_content.matches("SPHERICAL_SURFACE").count()
                + step_content.matches("CONICAL_SURFACE").count();

            // Count solids and shells
            let num_solids = step_content.matches("MANIFOLD_SOLID_BREP").count()
                .max(step_content.matches("BREP_WITH_VOIDS").count())
                .max(1);
            let num_shells = step_content.matches("CLOSED_SHELL").count()
                + step_content.matches("OPEN_SHELL").count();

            StepAnalysisResult {
                success: true,
                error: None,
                filename,
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
        Err(e) => StepAnalysisResult {
            success: false,
            error: Some(format!("Failed to read file: {}", e)),
            filename,
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            capture_window,
            analyze_step_file,
            select_step_file
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
