// Interface detection for assembly tolerance analysis

use serde::{Deserialize, Serialize};
use crate::assembly_parser::{ParsedPart, ParsedFace};

/// Result of interface detection
#[derive(Debug, Serialize, Deserialize)]
pub struct InterfaceDetectionResult {
    pub success: bool,
    pub error: Option<String>,
    pub interfaces: Vec<DetectedInterface>,
    pub junction_parts: Vec<String>,  // Parts with >1 interface
    pub total_interfaces: usize,
}

/// Individual detected interface between two parts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedInterface {
    pub id: String,
    pub part_a_id: String,
    pub part_a_face_id: i64,
    pub part_b_id: String,
    pub part_b_face_id: i64,
    pub interface_type: String,  // "face_to_face", "pin_in_hole", "shaft_in_bore", "unknown"
    pub proximity: f64,          // Distance between faces (mm)
    pub normal_alignment: f64,   // Cosine of angle between normals (0-1)
    pub contact_area: f64,       // Estimated contact area (mm^2)
    pub contact_point: [f64; 3], // Center of contact region
}

/// Parameters for interface detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionParams {
    pub proximity_threshold: f64,   // Max distance for potential contact (default 2.0mm)
    pub normal_threshold: f64,      // Min alignment for face-to-face (default 0.95)
    pub min_contact_area: f64,      // Min area for valid interface (default 1.0 mm^2)
}

impl Default for DetectionParams {
    fn default() -> Self {
        DetectionParams {
            proximity_threshold: 2.0,
            normal_threshold: 0.95,
            min_contact_area: 1.0,
        }
    }
}

/// Detect mating interfaces between parts
#[tauri::command]
pub fn detect_mating_interfaces(
    parts: Vec<ParsedPart>,
    proximity_threshold: f64,
    normal_threshold: f64,
) -> InterfaceDetectionResult {
    let params = DetectionParams {
        proximity_threshold,
        normal_threshold,
        min_contact_area: 1.0,
    };

    let mut interfaces: Vec<DetectedInterface> = Vec::new();
    let mut interface_count_per_part: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut interface_id = 0;

    // Compare each pair of parts
    for i in 0..parts.len() {
        for j in (i + 1)..parts.len() {
            let part_a = &parts[i];
            let part_b = &parts[j];

            // Find interfaces between this pair
            let pair_interfaces = find_interfaces_between_parts(
                part_a,
                part_b,
                &params,
                &mut interface_id,
            );

            for interface in &pair_interfaces {
                *interface_count_per_part.entry(interface.part_a_id.clone()).or_insert(0) += 1;
                *interface_count_per_part.entry(interface.part_b_id.clone()).or_insert(0) += 1;
            }

            interfaces.extend(pair_interfaces);
        }
    }

    // Find junction parts (parts with more than one interface)
    let junction_parts: Vec<String> = interface_count_per_part
        .iter()
        .filter(|(_, count)| **count > 1)
        .map(|(id, _)| id.clone())
        .collect();

    InterfaceDetectionResult {
        success: true,
        error: None,
        total_interfaces: interfaces.len(),
        interfaces,
        junction_parts,
    }
}

/// Find interfaces between two parts
fn find_interfaces_between_parts(
    part_a: &ParsedPart,
    part_b: &ParsedPart,
    params: &DetectionParams,
    interface_id: &mut usize,
) -> Vec<DetectedInterface> {
    let mut interfaces = Vec::new();

    // Transform faces to world coordinates
    let faces_a: Vec<TransformedFace> = part_a.faces.iter()
        .map(|f| transform_face(f, &part_a.transform))
        .collect();
    let faces_b: Vec<TransformedFace> = part_b.faces.iter()
        .map(|f| transform_face(f, &part_b.transform))
        .collect();

    // Check each face pair
    for (idx_a, face_a) in faces_a.iter().enumerate() {
        for (idx_b, face_b) in faces_b.iter().enumerate() {
            // Calculate proximity (distance between face centers)
            let distance = vec_distance(&face_a.center, &face_b.center);

            if distance > params.proximity_threshold {
                continue;
            }

            // Calculate normal alignment
            let alignment = normal_alignment(&face_a.normal, &face_b.normal);

            // Classify interface type
            let interface_type = classify_interface(
                &face_a.face_type,
                &face_b.face_type,
                alignment,
                face_a.radius,
                face_b.radius,
            );

            // Skip if no valid interface detected
            if interface_type == "none" {
                continue;
            }

            // Calculate contact point (midpoint between centers)
            let contact_point = [
                (face_a.center[0] + face_b.center[0]) / 2.0,
                (face_a.center[1] + face_b.center[1]) / 2.0,
                (face_a.center[2] + face_b.center[2]) / 2.0,
            ];

            // Estimate contact area (simplified)
            let contact_area = estimate_contact_area(face_a, face_b, &interface_type);

            if contact_area < params.min_contact_area {
                continue;
            }

            *interface_id += 1;

            interfaces.push(DetectedInterface {
                id: format!("interface-{}", interface_id),
                part_a_id: part_a.id.clone(),
                part_a_face_id: part_a.faces[idx_a].id,
                part_b_id: part_b.id.clone(),
                part_b_face_id: part_b.faces[idx_b].id,
                interface_type,
                proximity: distance,
                normal_alignment: alignment.abs(),
                contact_area,
                contact_point,
            });
        }
    }

    interfaces
}

/// Face with world coordinates
struct TransformedFace {
    center: [f64; 3],
    normal: [f64; 3],
    face_type: String,
    radius: Option<f64>,
}

/// Transform face to world coordinates
fn transform_face(face: &ParsedFace, transform: &[f64; 16]) -> TransformedFace {
    TransformedFace {
        center: transform_point(&face.center, transform),
        normal: transform_direction(&face.normal, transform),
        face_type: face.face_type.clone(),
        radius: face.radius,
    }
}

/// Transform a point by 4x4 matrix
fn transform_point(point: &[f64; 3], matrix: &[f64; 16]) -> [f64; 3] {
    // Matrix is column-major: [x_col, y_col, z_col, translation]
    [
        matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
        matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
        matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
    ]
}

/// Transform a direction by 4x4 matrix (no translation)
fn transform_direction(direction: &[f64; 3], matrix: &[f64; 16]) -> [f64; 3] {
    let transformed = [
        matrix[0] * direction[0] + matrix[4] * direction[1] + matrix[8] * direction[2],
        matrix[1] * direction[0] + matrix[5] * direction[1] + matrix[9] * direction[2],
        matrix[2] * direction[0] + matrix[6] * direction[1] + matrix[10] * direction[2],
    ];
    normalize(&transformed)
}

/// Calculate distance between two points
fn vec_distance(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    let dz = b[2] - a[2];
    (dx * dx + dy * dy + dz * dz).sqrt()
}

/// Calculate alignment between two normals (dot product)
/// Returns -1 to 1, where -1 means opposing normals (face-to-face contact)
fn normal_alignment(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Normalize a vector
fn normalize(v: &[f64; 3]) -> [f64; 3] {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if len > 1e-10 {
        [v[0] / len, v[1] / len, v[2] / len]
    } else {
        *v
    }
}

/// Classify interface type based on face geometry
fn classify_interface(
    type_a: &str,
    type_b: &str,
    alignment: f64,
    radius_a: Option<f64>,
    radius_b: Option<f64>,
) -> String {
    // Face-to-face: two planar faces with opposing normals
    if type_a == "planar" && type_b == "planar" && alignment < -0.9 {
        return "face_to_face".to_string();
    }

    // Pin-in-hole: cylindrical face (pin) inside another cylindrical face (hole)
    if type_a == "cylindrical" && type_b == "cylindrical" {
        if let (Some(r_a), Some(r_b)) = (radius_a, radius_b) {
            if (r_a - r_b).abs() < 0.5 {  // Similar radii = clearance fit
                if r_a < r_b {
                    return "pin_in_hole".to_string();  // a is pin, b is hole
                } else {
                    return "pin_in_hole".to_string();  // b is pin, a is hole
                }
            }
        }
    }

    // Shaft-in-bore: cylindrical with planar end face contact
    if (type_a == "cylindrical" && type_b == "planar") ||
       (type_a == "planar" && type_b == "cylindrical") {
        return "shaft_in_bore".to_string();
    }

    // Default
    "unknown".to_string()
}

/// Estimate contact area based on interface type
fn estimate_contact_area(face_a: &TransformedFace, face_b: &TransformedFace, interface_type: &str) -> f64 {
    match interface_type {
        "face_to_face" => {
            // Assume square contact proportional to proximity
            10.0  // Default 10 mm^2 for face contact
        }
        "pin_in_hole" | "shaft_in_bore" => {
            // Circular contact based on radius
            if let Some(r) = face_a.radius.or(face_b.radius) {
                std::f64::consts::PI * r * r
            } else {
                5.0  // Default
            }
        }
        _ => 1.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vec_distance() {
        let a = [0.0, 0.0, 0.0];
        let b = [3.0, 4.0, 0.0];
        assert!((vec_distance(&a, &b) - 5.0).abs() < 1e-6);
    }

    #[test]
    fn test_normal_alignment() {
        let a = [0.0, 0.0, 1.0];
        let b = [0.0, 0.0, -1.0];
        assert!((normal_alignment(&a, &b) - (-1.0)).abs() < 1e-6);
    }

    #[test]
    fn test_classify_face_to_face() {
        let result = classify_interface("planar", "planar", -0.99, None, None);
        assert_eq!(result, "face_to_face");
    }
}
