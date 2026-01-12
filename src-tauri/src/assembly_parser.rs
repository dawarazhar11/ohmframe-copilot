// Assembly STEP parsing for tolerance stackup mode

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Result of assembly parsing
#[derive(Debug, Serialize, Deserialize)]
pub struct AssemblyParseResult {
    pub success: bool,
    pub error: Option<String>,
    pub filename: Option<String>,
    pub parts: Vec<ParsedPart>,
    pub total_parts: usize,
    pub has_sub_assemblies: bool,
}

/// Individual part from STEP parsing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedPart {
    pub id: String,
    pub name: String,
    pub step_entity_id: i64,
    pub transform: [f64; 16],  // 4x4 matrix flattened
    pub bounding_box: Option<PartBoundingBox>,
    pub faces: Vec<ParsedFace>,
    pub product_definition_id: Option<i64>,
}

/// Bounding box for a part
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartBoundingBox {
    pub min: [f64; 3],
    pub max: [f64; 3],
    pub dimensions: [f64; 3],
}

/// Face data from STEP parsing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedFace {
    pub id: i64,
    pub face_type: String,  // "planar", "cylindrical", "conical", "spherical", "toroidal", "freeform"
    pub normal: [f64; 3],
    pub center: [f64; 3],
    pub area: f64,
    pub radius: Option<f64>,
    pub axis: Option<[f64; 3]>,
    pub step_entity_id: Option<i64>,
}

/// STEP entity reference
#[derive(Debug, Clone)]
struct StepEntity {
    id: i64,
    entity_type: String,
    data: String,
}

/// Parse assembly STEP file and extract parts with transforms
#[tauri::command]
pub fn parse_assembly_step(content: String, filename: String) -> AssemblyParseResult {
    // Validate STEP format
    if !content.contains("ISO-10303-21") && !content.contains("STEP") {
        return AssemblyParseResult {
            success: false,
            error: Some("Invalid STEP file format".to_string()),
            filename: Some(filename),
            parts: vec![],
            total_parts: 0,
            has_sub_assemblies: false,
        };
    }

    // Parse all entities
    let entities = parse_step_entities(&content);

    // Extract product definitions (parts)
    let product_defs = extract_product_definitions(&entities);

    // Extract transforms for each product
    let transforms = extract_transforms(&entities, &product_defs);

    // Extract face data for each part
    let mut parts: Vec<ParsedPart> = Vec::new();
    let mut part_id = 0;

    for (product_id, product_name) in &product_defs {
        let transform = transforms.get(product_id).cloned().unwrap_or(identity_matrix());

        // Extract faces associated with this product
        let faces = extract_faces_for_product(&content, &entities, *product_id);

        // Calculate bounding box from faces
        let bounding_box = calculate_bounding_box(&faces);

        let part = ParsedPart {
            id: format!("part-{}", part_id),
            name: product_name.clone(),
            step_entity_id: *product_id,
            transform,
            bounding_box,
            faces,
            product_definition_id: Some(*product_id),
        };

        parts.push(part);
        part_id += 1;
    }

    // Check for sub-assemblies
    let has_sub_assemblies = content.contains("NEXT_ASSEMBLY_USAGE_OCCURRENCE");

    AssemblyParseResult {
        success: true,
        error: None,
        filename: Some(filename),
        total_parts: parts.len(),
        parts,
        has_sub_assemblies,
    }
}

/// Parse STEP entities into a map
fn parse_step_entities(content: &str) -> HashMap<i64, StepEntity> {
    let mut entities = HashMap::new();

    // Match entity pattern: #123=ENTITY_TYPE(...);
    let entity_re = Regex::new(r"#(\d+)\s*=\s*([A-Z_]+)\s*\(([^;]*)\)\s*;").unwrap();

    for cap in entity_re.captures_iter(content) {
        if let Ok(id) = cap[1].parse::<i64>() {
            entities.insert(id, StepEntity {
                id,
                entity_type: cap[2].to_string(),
                data: cap[3].to_string(),
            });
        }
    }

    entities
}

/// Extract product definitions (part names)
fn extract_product_definitions(entities: &HashMap<i64, StepEntity>) -> HashMap<i64, String> {
    let mut products = HashMap::new();

    // Look for PRODUCT_DEFINITION entities
    for (id, entity) in entities {
        if entity.entity_type == "PRODUCT_DEFINITION" {
            // Try to extract product name from linked PRODUCT entity
            if let Some(name) = extract_product_name(entities, &entity.data) {
                products.insert(*id, name);
            } else {
                products.insert(*id, format!("Part_{}", id));
            }
        }
    }

    // Also check MANIFOLD_SOLID_BREP for parts without PRODUCT_DEFINITION
    if products.is_empty() {
        for (id, entity) in entities {
            if entity.entity_type == "MANIFOLD_SOLID_BREP" {
                let name = extract_quoted_name(&entity.data).unwrap_or(format!("Solid_{}", id));
                products.insert(*id, name);
            }
        }
    }

    products
}

/// Extract product name from PRODUCT entity
fn extract_product_name(entities: &HashMap<i64, StepEntity>, data: &str) -> Option<String> {
    // PRODUCT_DEFINITION references PRODUCT_DEFINITION_FORMATION which references PRODUCT
    let ref_re = Regex::new(r"#(\d+)").unwrap();

    for cap in ref_re.captures_iter(data) {
        if let Ok(ref_id) = cap[1].parse::<i64>() {
            if let Some(entity) = entities.get(&ref_id) {
                if entity.entity_type == "PRODUCT_DEFINITION_FORMATION" {
                    return extract_product_name(entities, &entity.data);
                } else if entity.entity_type == "PRODUCT" {
                    return extract_quoted_name(&entity.data);
                }
            }
        }
    }

    None
}

/// Extract quoted name from entity data
fn extract_quoted_name(data: &str) -> Option<String> {
    let name_re = Regex::new(r"'([^']*)'").unwrap();
    name_re.captures(data).map(|c| c[1].to_string())
}

/// Extract transforms for products
fn extract_transforms(entities: &HashMap<i64, StepEntity>, _products: &HashMap<i64, String>) -> HashMap<i64, [f64; 16]> {
    let mut transforms = HashMap::new();

    // Look for ITEM_DEFINED_TRANSFORMATION and AXIS2_PLACEMENT_3D
    for (id, entity) in entities {
        if entity.entity_type == "AXIS2_PLACEMENT_3D" {
            if let Some(transform) = parse_axis_placement(entities, &entity.data) {
                transforms.insert(*id, transform);
            }
        }
    }

    transforms
}

/// Parse AXIS2_PLACEMENT_3D into transformation matrix
fn parse_axis_placement(entities: &HashMap<i64, StepEntity>, data: &str) -> Option<[f64; 16]> {
    let ref_re = Regex::new(r"#(\d+)").unwrap();
    let refs: Vec<i64> = ref_re.captures_iter(data)
        .filter_map(|c| c[1].parse().ok())
        .collect();

    if refs.is_empty() {
        return Some(identity_matrix());
    }

    // First ref is location point, second is Z axis, third is X axis
    let location = refs.get(0)
        .and_then(|id| entities.get(id))
        .and_then(|e| parse_cartesian_point(&e.data))
        .unwrap_or([0.0, 0.0, 0.0]);

    let z_axis = refs.get(1)
        .and_then(|id| entities.get(id))
        .and_then(|e| parse_direction(&e.data))
        .unwrap_or([0.0, 0.0, 1.0]);

    let x_axis = refs.get(2)
        .and_then(|id| entities.get(id))
        .and_then(|e| parse_direction(&e.data))
        .unwrap_or([1.0, 0.0, 0.0]);

    // Calculate Y axis
    let y_axis = cross(&z_axis, &x_axis);

    // Build 4x4 transformation matrix (column-major)
    Some([
        x_axis[0], x_axis[1], x_axis[2], 0.0,
        y_axis[0], y_axis[1], y_axis[2], 0.0,
        z_axis[0], z_axis[1], z_axis[2], 0.0,
        location[0], location[1], location[2], 1.0,
    ])
}

/// Parse CARTESIAN_POINT
fn parse_cartesian_point(data: &str) -> Option<[f64; 3]> {
    let coord_re = Regex::new(r"\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*,\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*,\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)").unwrap();

    coord_re.captures(data).and_then(|cap| {
        let x = cap[1].parse().ok()?;
        let y = cap[2].parse().ok()?;
        let z = cap[3].parse().ok()?;
        Some([x, y, z])
    })
}

/// Parse DIRECTION
fn parse_direction(data: &str) -> Option<[f64; 3]> {
    parse_cartesian_point(data).map(|v| normalize(&v))
}

/// Extract faces for a product
fn extract_faces_for_product(content: &str, entities: &HashMap<i64, StepEntity>, _product_id: i64) -> Vec<ParsedFace> {
    let mut faces = Vec::new();
    let mut face_id = 0;

    // Extract all ADVANCED_FACE entities
    for (id, entity) in entities {
        if entity.entity_type == "ADVANCED_FACE" || entity.entity_type == "FACE_SURFACE" {
            let (face_type, normal, center, radius, axis) = extract_face_geometry(entities, &entity.data, content);

            faces.push(ParsedFace {
                id: face_id,
                face_type,
                normal,
                center,
                area: 0.0,  // Would need full geometry for accurate area
                radius,
                axis,
                step_entity_id: Some(*id),
            });

            face_id += 1;
        }
    }

    faces
}

/// Extract face geometry (type, normal, center)
fn extract_face_geometry(entities: &HashMap<i64, StepEntity>, data: &str, content: &str) -> (String, [f64; 3], [f64; 3], Option<f64>, Option<[f64; 3]>) {
    let ref_re = Regex::new(r"#(\d+)").unwrap();

    // Default values
    let mut face_type = "freeform".to_string();
    let mut normal = [0.0, 0.0, 1.0];
    let mut center = [0.0, 0.0, 0.0];
    let mut radius = None;
    let mut axis = None;

    // Find the surface reference
    for cap in ref_re.captures_iter(data) {
        if let Ok(ref_id) = cap[1].parse::<i64>() {
            if let Some(entity) = entities.get(&ref_id) {
                match entity.entity_type.as_str() {
                    "PLANE" => {
                        face_type = "planar".to_string();
                        if let Some(placement) = find_axis_placement(entities, &entity.data) {
                            if let Some(pos) = placement.0 {
                                center = pos;
                            }
                            if let Some(dir) = placement.1 {
                                normal = dir;
                                axis = Some(dir);
                            }
                        }
                    }
                    "CYLINDRICAL_SURFACE" => {
                        face_type = "cylindrical".to_string();
                        if let Some((placement, r)) = parse_cylindrical_surface(entities, &entity.data) {
                            if let Some(pos) = placement.0 {
                                center = pos;
                            }
                            if let Some(dir) = placement.1 {
                                axis = Some(dir);
                                // For cylindrical, normal is radial (simplified)
                                normal = [1.0, 0.0, 0.0];
                            }
                            radius = r;
                        }
                    }
                    "CONICAL_SURFACE" => {
                        face_type = "conical".to_string();
                    }
                    "SPHERICAL_SURFACE" => {
                        face_type = "spherical".to_string();
                    }
                    "TOROIDAL_SURFACE" => {
                        face_type = "toroidal".to_string();
                    }
                    "B_SPLINE_SURFACE_WITH_KNOTS" | "B_SPLINE_SURFACE" => {
                        face_type = "freeform".to_string();
                    }
                    _ => {}
                }
            }
        }
    }

    // If still freeform, check content for surface type
    if face_type == "freeform" {
        if content.contains("PLANE") {
            face_type = "planar".to_string();
        }
    }

    (face_type, normal, center, radius, axis)
}

/// Find AXIS2_PLACEMENT_3D position and direction
fn find_axis_placement(entities: &HashMap<i64, StepEntity>, data: &str) -> Option<(Option<[f64; 3]>, Option<[f64; 3]>)> {
    let ref_re = Regex::new(r"#(\d+)").unwrap();

    for cap in ref_re.captures_iter(data) {
        if let Ok(ref_id) = cap[1].parse::<i64>() {
            if let Some(entity) = entities.get(&ref_id) {
                if entity.entity_type == "AXIS2_PLACEMENT_3D" {
                    // Parse the placement
                    let refs: Vec<i64> = ref_re.captures_iter(&entity.data)
                        .filter_map(|c| c[1].parse().ok())
                        .collect();

                    let position = refs.get(0)
                        .and_then(|id| entities.get(id))
                        .and_then(|e| parse_cartesian_point(&e.data));

                    let direction = refs.get(1)
                        .and_then(|id| entities.get(id))
                        .and_then(|e| parse_direction(&e.data));

                    return Some((position, direction));
                }
            }
        }
    }

    None
}

/// Parse cylindrical surface
fn parse_cylindrical_surface(entities: &HashMap<i64, StepEntity>, data: &str) -> Option<((Option<[f64; 3]>, Option<[f64; 3]>), Option<f64>)> {
    let ref_re = Regex::new(r"#(\d+)").unwrap();
    let num_re = Regex::new(r"(\d+\.?\d*(?:[eE][+-]?\d+)?)").unwrap();

    let placement = find_axis_placement(entities, data);

    // Extract radius (usually last number in data)
    let radius = num_re.captures_iter(data)
        .last()
        .and_then(|c| c[1].parse().ok());

    placement.map(|p| (p, radius))
}

/// Calculate bounding box from faces
fn calculate_bounding_box(faces: &[ParsedFace]) -> Option<PartBoundingBox> {
    if faces.is_empty() {
        return None;
    }

    let mut min = [f64::MAX, f64::MAX, f64::MAX];
    let mut max = [f64::MIN, f64::MIN, f64::MIN];

    for face in faces {
        for i in 0..3 {
            min[i] = min[i].min(face.center[i]);
            max[i] = max[i].max(face.center[i]);
        }
    }

    // Expand bounding box a bit based on face radii
    for face in faces {
        if let Some(r) = face.radius {
            for i in 0..3 {
                min[i] = min[i].min(face.center[i] - r);
                max[i] = max[i].max(face.center[i] + r);
            }
        }
    }

    Some(PartBoundingBox {
        min,
        max,
        dimensions: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    })
}

// Vector math utilities

fn identity_matrix() -> [f64; 16] {
    [
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]
}

fn cross(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn normalize(v: &[f64; 3]) -> [f64; 3] {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if len > 1e-10 {
        [v[0] / len, v[1] / len, v[2] / len]
    } else {
        *v
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cartesian_point() {
        let data = "'point',(1.5, -2.3, 4.0)";
        let result = parse_cartesian_point(data);
        assert!(result.is_some());
        let [x, y, z] = result.unwrap();
        assert!((x - 1.5).abs() < 1e-6);
        assert!((y - (-2.3)).abs() < 1e-6);
        assert!((z - 4.0).abs() < 1e-6);
    }

    #[test]
    fn test_identity_matrix() {
        let m = identity_matrix();
        assert_eq!(m[0], 1.0);
        assert_eq!(m[5], 1.0);
        assert_eq!(m[10], 1.0);
        assert_eq!(m[15], 1.0);
    }
}
