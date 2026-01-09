// DFM Glossary - Definitions for manufacturing terms and geometry features

export interface GlossaryTerm {
  term: string;
  definition: string;
  category: "geometry" | "process" | "measurement" | "defect";
  relatedTerms?: string[];
  imageHint?: string; // Description for future image/diagram
}

export const DFM_GLOSSARY: GlossaryTerm[] = [
  // ==========================================
  // GEOMETRY FEATURES
  // ==========================================
  {
    term: "Hole",
    definition: "A circular through or blind feature with aspect ratio (depth/diameter) typically < 10:1. Created by drilling, punching, or as a cast/molded feature.",
    category: "geometry",
    relatedTerms: ["Counterbore", "Countersink", "Blind Hole", "Through Hole"],
    imageHint: "Cylindrical cavity in part",
  },
  {
    term: "Slot",
    definition: "An elongated opening with aspect ratio (length/width) > 2:1. Has parallel sides and radiused ends. Created by milling, punching, or laser cutting.",
    category: "geometry",
    relatedTerms: ["Keyway", "T-Slot", "Oblong Hole"],
    imageHint: "Elongated rounded rectangle opening",
  },
  {
    term: "Cutout",
    definition: "A non-circular internal removal of material. Can be rectangular, irregular, or complex shaped. Created by laser, waterjet, or progressive punching.",
    category: "geometry",
    relatedTerms: ["Pocket", "Opening", "Window"],
    imageHint: "Non-circular internal opening",
  },
  {
    term: "Notch",
    definition: "An open-sided cutout at the edge of a part. Removes material from the perimeter. Common in sheet metal for bend relief or fitment.",
    category: "geometry",
    relatedTerms: ["Bend Relief", "Edge Notch", "Corner Notch"],
    imageHint: "U or V shaped cut at edge",
  },
  {
    term: "Tab",
    definition: "A protruding flat feature extending from the main body. Used for mounting, alignment, or connection. Must consider bend allowance if formed.",
    category: "geometry",
    relatedTerms: ["Ear", "Lug", "Flange"],
    imageHint: "Flat protrusion from edge",
  },
  {
    term: "Boss",
    definition: "A cylindrical protrusion designed to receive fasteners (screws, heat-set inserts). Critical for plastic parts. Must consider draft and sink marks.",
    category: "geometry",
    relatedTerms: ["Standoff", "Mounting Boss", "Screw Boss"],
    imageHint: "Raised cylindrical feature",
  },
  {
    term: "Rib",
    definition: "A thin wall reinforcement feature that adds stiffness without significant mass. Height typically limited to 3x wall thickness to prevent sink marks.",
    category: "geometry",
    relatedTerms: ["Gusset", "Stiffener", "Web"],
    imageHint: "Thin vertical wall for reinforcement",
  },
  {
    term: "Fillet",
    definition: "An internal rounded corner (concave). Reduces stress concentration and aids material flow in molding. Minimum radius depends on process.",
    category: "geometry",
    relatedTerms: ["Internal Radius", "Corner Radius"],
    imageHint: "Rounded internal corner",
  },
  {
    term: "Round",
    definition: "An external rounded corner (convex). Also called an external fillet. Improves safety and aesthetics. May affect tooling in some processes.",
    category: "geometry",
    relatedTerms: ["External Fillet", "Edge Radius", "Bullnose"],
    imageHint: "Rounded external corner",
  },
  {
    term: "Chamfer",
    definition: "An angled edge break, typically 45 degrees. Used for deburring, assembly guidance, or aesthetics. Specified as angle x distance or two distances.",
    category: "geometry",
    relatedTerms: ["Bevel", "Edge Break", "C-Chamfer"],
    imageHint: "Angled cut on edge",
  },
  {
    term: "Bend",
    definition: "A formed angle in sheet metal. Characterized by bend radius, bend angle, and bend allowance. Inside radius must be >= material thickness.",
    category: "geometry",
    relatedTerms: ["Fold", "Flange", "Hem"],
    imageHint: "Angular deformation in sheet",
  },
  {
    term: "Bend Radius",
    definition: "The inside radius of a bend. Minimum is typically 1x material thickness for steel, 1.5x for aluminum. Smaller radii cause cracking.",
    category: "geometry",
    relatedTerms: ["Inside Bend Radius", "K-Factor"],
    imageHint: "Radius at inside of bend",
  },
  {
    term: "Flange",
    definition: "A bent portion of sheet metal, typically 90 degrees from the main body. Minimum height is 4x material thickness for proper forming.",
    category: "geometry",
    relatedTerms: ["Lip", "Edge Flange", "Hem"],
    imageHint: "90 degree bent edge",
  },
  {
    term: "Hem",
    definition: "A sheet metal edge folded back on itself (180 degrees). Adds edge strength and safety. Can be open, closed, or teardrop style.",
    category: "geometry",
    relatedTerms: ["Fold", "Safe Edge", "Rolled Edge"],
    imageHint: "Edge folded 180 degrees",
  },
  {
    term: "Counterbore",
    definition: "A cylindrical recess that allows a fastener head to sit flush or below the surface. Has flat bottom. Depth and diameter are critical.",
    category: "geometry",
    relatedTerms: ["Spotface", "CBORE"],
    imageHint: "Stepped hole with flat bottom",
  },
  {
    term: "Countersink",
    definition: "A conical recess for flat-head screws to sit flush. Standard angles are 82, 90, or 100 degrees. Depth determines head protrusion.",
    category: "geometry",
    relatedTerms: ["CSK", "Chamfered Hole"],
    imageHint: "Conical recess in hole",
  },
  {
    term: "Pocket",
    definition: "A recessed area milled into a part. Can be any shape. Requires corner radii equal to cutter diameter. Depth limited by cutter reach.",
    category: "geometry",
    relatedTerms: ["Cavity", "Recess", "Depression"],
    imageHint: "Milled recessed area",
  },
  {
    term: "Undercut",
    definition: "A feature that prevents straight mold/die separation. Requires side actions, lifters, or part redesign. Adds significant tooling cost.",
    category: "geometry",
    relatedTerms: ["Side Action", "Lifter", "Snap-Fit"],
    imageHint: "Feature blocking mold separation",
  },
  {
    term: "Draft Angle",
    definition: "Taper added to vertical walls to allow part ejection from mold/die. Typically 1-3 degrees. More for textured surfaces.",
    category: "geometry",
    relatedTerms: ["Taper", "Release Angle", "Draw"],
    imageHint: "Angled wall for ejection",
  },
  {
    term: "Wall Thickness",
    definition: "The material thickness of a part's walls. Should be uniform to prevent warping and sink marks. Process-specific minimums apply.",
    category: "geometry",
    relatedTerms: ["Shell Thickness", "Section Thickness"],
    imageHint: "Distance between inner and outer surfaces",
  },

  // ==========================================
  // MANUFACTURING PROCESSES
  // ==========================================
  {
    term: "Sheet Metal",
    definition: "Manufacturing process using flat metal sheets that are cut, punched, bent, and formed. Thickness typically 0.5-6mm. Includes laser, punch, brake forming.",
    category: "process",
    relatedTerms: ["Fabrication", "Press Brake", "Laser Cutting"],
  },
  {
    term: "CNC Machining",
    definition: "Subtractive manufacturing using computer-controlled cutting tools. Includes milling, turning, drilling. High precision but material waste.",
    category: "process",
    relatedTerms: ["Milling", "Turning", "5-Axis"],
  },
  {
    term: "Injection Molding",
    definition: "Process where molten plastic is injected into a mold cavity. High volume, low per-part cost. Requires draft, uniform walls, no undercuts.",
    category: "process",
    relatedTerms: ["Plastic Molding", "Insert Molding", "Overmolding"],
  },
  {
    term: "Die Casting",
    definition: "Process where molten metal is forced into a steel die. Similar to injection molding but for metals (aluminum, zinc, magnesium).",
    category: "process",
    relatedTerms: ["HPDC", "Pressure Die Casting", "Aluminum Casting"],
  },
  {
    term: "3D Printing (FDM)",
    definition: "Additive manufacturing using fused filament. Layer-by-layer deposition. Good for prototypes. Weak layer adhesion, requires support for overhangs.",
    category: "process",
    relatedTerms: ["FFF", "Filament Printing", "Additive Manufacturing"],
  },
  {
    term: "3D Printing (SLA)",
    definition: "Additive manufacturing using UV-cured resin. Higher resolution than FDM. Requires post-curing. Good for fine details and smooth surfaces.",
    category: "process",
    relatedTerms: ["Resin Printing", "DLP", "Stereolithography"],
  },

  // ==========================================
  // MEASUREMENTS & TOLERANCES
  // ==========================================
  {
    term: "Tolerance",
    definition: "Allowable variation from nominal dimension. Tighter tolerances increase cost. Standard machining: +/-0.1mm, precision: +/-0.025mm.",
    category: "measurement",
    relatedTerms: ["Dimensional Tolerance", "GD&T", "Allowance"],
  },
  {
    term: "Surface Finish (Ra)",
    definition: "Average roughness of a surface in micrometers or microinches. Lower Ra = smoother. Machined: 1.6-3.2 Ra, ground: 0.4-0.8 Ra.",
    category: "measurement",
    relatedTerms: ["Roughness", "Surface Texture", "RMS"],
  },
  {
    term: "Flatness",
    definition: "How close a surface is to a perfect plane. Specified as maximum deviation. Critical for sealing and mating surfaces.",
    category: "measurement",
    relatedTerms: ["Planarity", "Form Tolerance"],
  },
  {
    term: "Perpendicularity",
    definition: "How close a feature is to 90 degrees from a reference. Critical for holes and mating surfaces.",
    category: "measurement",
    relatedTerms: ["Squareness", "Orientation Tolerance"],
  },

  // ==========================================
  // DEFECTS & ISSUES
  // ==========================================
  {
    term: "Sink Mark",
    definition: "Depression on molded part surface caused by shrinkage at thick sections. Avoid by keeping wall thickness uniform and limiting rib/boss sizes.",
    category: "defect",
    relatedTerms: ["Shrinkage", "Surface Depression"],
  },
  {
    term: "Warpage",
    definition: "Distortion of part from intended shape. Caused by uneven cooling, non-uniform walls, or residual stress. Critical in flat parts.",
    category: "defect",
    relatedTerms: ["Distortion", "Bowing", "Twist"],
  },
  {
    term: "Short Shot",
    definition: "Incomplete filling of mold cavity. Caused by insufficient material, low pressure, or flow restrictions. Indicates wall too thin.",
    category: "defect",
    relatedTerms: ["Incomplete Fill", "Non-Fill"],
  },
  {
    term: "Flash",
    definition: "Excess material that escapes at mold parting line. Caused by excessive pressure or worn tooling. Requires secondary trimming.",
    category: "defect",
    relatedTerms: ["Burr", "Parting Line Flash"],
  },
  {
    term: "Weld Line",
    definition: "Visible line where two flow fronts meet in molding. Weaker than surrounding material. Gate placement affects location.",
    category: "defect",
    relatedTerms: ["Knit Line", "Meld Line"],
  },
  {
    term: "Springback",
    definition: "Elastic recovery after sheet metal bending. Part opens slightly after forming. Must be compensated in bend angle.",
    category: "defect",
    relatedTerms: ["Elastic Recovery", "Bend Compensation"],
  },
];

// Helper functions
export function getTermDefinition(term: string): GlossaryTerm | undefined {
  return DFM_GLOSSARY.find(
    (t) => t.term.toLowerCase() === term.toLowerCase()
  );
}

export function getTermsByCategory(category: GlossaryTerm["category"]): GlossaryTerm[] {
  return DFM_GLOSSARY.filter((t) => t.category === category);
}

export function searchGlossary(query: string): GlossaryTerm[] {
  const q = query.toLowerCase();
  return DFM_GLOSSARY.filter(
    (t) =>
      t.term.toLowerCase().includes(q) ||
      t.definition.toLowerCase().includes(q) ||
      t.relatedTerms?.some((rt) => rt.toLowerCase().includes(q))
  );
}
