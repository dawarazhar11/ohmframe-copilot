// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageBuffer, Rgba};
use screenshots::Screen;
use std::io::Cursor;
use tauri::Manager;

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![capture_screen, capture_window])
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
