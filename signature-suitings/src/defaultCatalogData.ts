import { GarmentCategory, MeasurementTemplate, GarmentCatalogItem } from "./types";

export const defaultGarmentCategories: GarmentCategory[] = [
  { id: "cat_suits", name: "Suits", description: "Bespoke 2-piece, 3-piece, tuxedo & ceremonial suits", displayOrder: 1, active: true },
  { id: "cat_indian", name: "Indian Wear", description: "Kurtas, Sherwanis, Nehru jackets & Indo-western attire", displayOrder: 2, active: true },
  { id: "cat_shirts", name: "Shirts", description: "Formal, casual & tuxedo dress shirts", displayOrder: 3, active: true },
  { id: "cat_trousers", name: "Trousers", description: "Tailored pants, chinos, pleat & flat-front trousers", displayOrder: 4, active: true },
  { id: "cat_outerwear", name: "Outerwear", description: "Blazers, coats, overcoats & Bandhgalas", displayOrder: 5, active: true },
  { id: "cat_accessories", name: "Accessories & Vests", description: "Waistcoats, vests, ties & pocket squares", displayOrder: 6, active: true },
  { id: "cat_custom", name: "Custom", description: "Fully bespoke custom garment tailoring", displayOrder: 7, active: true }
];

export const defaultMeasurementTemplates: MeasurementTemplate[] = [
  {
    id: "tmpl_coat",
    name: "Coat / Blazer / Indo-Western Measurements",
    description: "Full measurement specifications for suit coats, blazers, overcoats & Indo-western jacket sets based on Neel Kamal master sizing.",
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: [
      { id: "f_c_len", fieldName: "Length", shortName: "LEN", unit: "Inches", inputType: "Number", required: true, displayOrder: 1, active: true },
      { id: "f_c_tira", fieldName: "Shoulder / Tira", shortName: "SHOULDER", unit: "Inches", inputType: "Number", required: true, displayOrder: 2, active: true },
      { id: "f_c_arms", fieldName: "Sleeve Length", shortName: "SLEEVE", unit: "Inches", inputType: "Number", required: true, displayOrder: 3, active: true },
      { id: "f_c_chest", fieldName: "Chest", shortName: "CHEST", unit: "Inches", inputType: "Number", required: true, displayOrder: 4, active: true },
      { id: "f_c_waist", fieldName: "Waist", shortName: "WAIST", unit: "Inches", inputType: "Number", required: true, displayOrder: 5, active: true },
      { id: "f_c_hip", fieldName: "Hip", shortName: "HIP", unit: "Inches", inputType: "Number", required: false, displayOrder: 6, active: true },
      { id: "f_c_neck", fieldName: "Neck", shortName: "NECK", unit: "Inches", inputType: "Number", required: false, displayOrder: 7, active: true },
      { id: "f_c_hb", fieldName: "Half Back", shortName: "H.B.", unit: "Inches", inputType: "Number", required: false, displayOrder: 8, active: true },
      { id: "f_c_cback", fieldName: "Cross Back", shortName: "C.BACK", unit: "Inches", inputType: "Number", required: false, displayOrder: 9, active: true },
      { id: "f_c_front", fieldName: "Cross Front", shortName: "C.FRONT", unit: "Inches", inputType: "Number", required: false, displayOrder: 10, active: true },
      { id: "f_c_bicep", fieldName: "Bicep", shortName: "BICEP", unit: "Inches", inputType: "Number", required: false, displayOrder: 11, active: true },
      { id: "f_c_moda", fieldName: "Arm Round / Moda", shortName: "MODA", unit: "Inches", inputType: "Number", required: false, displayOrder: 12, active: true },
      {
        id: "f_c_stance",
        fieldName: "Body Stance / Shape",
        shortName: "STANCE",
        unit: "",
        inputType: "Visual Selector",
        required: false,
        displayOrder: 13,
        active: true,
        options: [
          { label: "Normal", value: "Normal", iconOrVisual: "🧍" },
          { label: "Flat Back", value: "Flat Back", iconOrVisual: "🧍‍♂️" },
          { label: "Hunched Back", value: "Hunched Back", iconOrVisual: "🙇‍♂️" }
        ]
      },
      {
        id: "f_c_slope",
        fieldName: "Shoulder Slope",
        shortName: "SLOPE",
        unit: "",
        inputType: "Visual Selector",
        required: false,
        displayOrder: 14,
        active: true,
        options: [
          { label: "Normal", value: "Normal", iconOrVisual: "📐" },
          { label: "Square Shoulder", value: "Square Shoulder", iconOrVisual: "📏" },
          { label: "Drooping Shoulder", value: "Drooping Shoulder", iconOrVisual: "📉" }
        ]
      },
      {
        id: "f_c_lapel",
        fieldName: "Lapel Style",
        shortName: "LAPEL",
        unit: "",
        inputType: "Dropdown",
        required: false,
        displayOrder: 15,
        active: true,
        options: [
          { label: "Notch Lapel", value: "Notch Lapel" },
          { label: "Peak Lapel", value: "Peak Lapel" },
          { label: "Shawl Collar", value: "Shawl Collar" }
        ]
      },
      {
        id: "f_c_vents",
        fieldName: "Vents Style",
        shortName: "VENTS",
        unit: "",
        inputType: "Dropdown",
        required: false,
        displayOrder: 16,
        active: true,
        options: [
          { label: "Side Vents (Double)", value: "Side Vents (Double)" },
          { label: "Center Vent (Single)", value: "Center Vent (Single)" },
          { label: "No Vent", value: "No Vent" }
        ]
      },
      {
        id: "f_c_buttons",
        fieldName: "Button Style",
        shortName: "BUTTONS",
        unit: "",
        inputType: "Dropdown",
        required: false,
        displayOrder: 17,
        active: true,
        options: [
          { label: "1 Button", value: "1 Button" },
          { label: "2 Button", value: "2 Button" },
          { label: "3 Button", value: "3 Button" },
          { label: "Double Breasted 4B", value: "Double Breasted 4B" },
          { label: "Double Breasted 6B", value: "Double Breasted 6B" }
        ]
      }
    ]
  },
  {
    id: "tmpl_pant",
    name: "Pant / Trouser Measurements",
    description: "Custom specifications for trousers, suit pants, chinos & salwars including leg stance and pleat selections.",
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: [
      { id: "f_p_len", fieldName: "Length", shortName: "LEN", unit: "Inches", inputType: "Number", required: true, displayOrder: 1, active: true },
      { id: "f_p_inlen", fieldName: "Inseam / Inlength", shortName: "INSEAM", unit: "Inches", inputType: "Number", required: false, displayOrder: 2, active: true },
      { id: "f_p_crotch", fieldName: "Crotch / Latak", shortName: "CROTCH", unit: "Inches", inputType: "Number", required: false, displayOrder: 3, active: true },
      { id: "f_p_waist", fieldName: "Waist", shortName: "WAIST", unit: "Inches", inputType: "Number", required: true, displayOrder: 4, active: true },
      { id: "f_p_hips", fieldName: "Hip / Seat", shortName: "HIP", unit: "Inches", inputType: "Number", required: true, displayOrder: 5, active: true },
      { id: "f_p_thigh", fieldName: "Thigh / Patt", shortName: "THIGH", unit: "Inches", inputType: "Number", required: true, displayOrder: 6, active: true },
      { id: "f_p_knee", fieldName: "Knee", shortName: "KNEE", unit: "Inches", inputType: "Number", required: false, displayOrder: 7, active: true },
      { id: "f_p_bottom", fieldName: "Bottom", shortName: "BOTTOM", unit: "Inches", inputType: "Number", required: true, displayOrder: 8, active: true },
      {
        id: "f_p_legstance",
        fieldName: "Leg Stance / Body Shape",
        shortName: "LEG SHAPE",
        unit: "",
        inputType: "Visual Selector",
        required: false,
        displayOrder: 9,
        active: true,
        options: [
          { label: "Normal", value: "Normal", iconOrVisual: "🚶" },
          { label: "Knock Knees", value: "Knock Knees", iconOrVisual: "🦵" },
          { label: "Bow Legs", value: "Bow Legs", iconOrVisual: "👖" }
        ]
      },
      {
        id: "f_p_fit",
        fieldName: "Fit Preference",
        shortName: "FIT",
        unit: "",
        inputType: "Visual Selector",
        required: false,
        displayOrder: 10,
        active: true,
        options: [
          { label: "Slim Fit", value: "Slim Fit", iconOrVisual: "⚡" },
          { label: "Regular Fit", value: "Regular Fit", iconOrVisual: "👔" },
          { label: "Relaxed Fit", value: "Relaxed Fit", iconOrVisual: "✨" }
        ]
      },
      {
        id: "f_p_belt",
        fieldName: "Belt Type",
        shortName: "BELT",
        unit: "",
        inputType: "Dropdown",
        required: false,
        displayOrder: 11,
        active: true,
        options: [
          { label: "Regular Belt Loops", value: "Regular Belt Loops" },
          { label: "Extended Gurkha Belt", value: "Extended Gurkha Belt" },
          { label: "Side Adjusters (No Belt Loops)", value: "Side Adjusters" },
          { label: "Elasticated Comfort Waistband", value: "Elasticated Waistband" }
        ]
      },
      {
        id: "f_p_pleat",
        fieldName: "Pleat Style",
        shortName: "PLEAT",
        unit: "",
        inputType: "Dropdown",
        required: false,
        displayOrder: 12,
        active: true,
        options: [
          { label: "Flat Front (No Pleat)", value: "Flat Front" },
          { label: "Single Forward Pleat", value: "Single Pleat" },
          { label: "Double Reverse Pleats", value: "Double Pleats" }
        ]
      },
      {
        id: "f_p_pocket",
        fieldName: "Pocket Style",
        shortName: "POCKET",
        unit: "",
        inputType: "Dropdown",
        required: false,
        displayOrder: 13,
        active: true,
        options: [
          { label: "Cross Slant Pocket", value: "Cross Pocket" },
          { label: "Straight Seam Pocket", value: "Straight Pocket" },
          { label: "Frog Mouth Pocket", value: "Frog Mouth Pocket" }
        ]
      },
      {
        id: "f_p_backpocket",
        fieldName: "Back Pocket",
        shortName: "BACK POCKET",
        unit: "",
        inputType: "Dropdown",
        required: false,
        displayOrder: 14,
        active: true,
        options: [
          { label: "Double Bone Buttoned", value: "Double Bone" },
          { label: "Single Bone Pocket", value: "Single Bone" },
          { label: "Flap Back Pocket", value: "Flap Pocket" },
          { label: "No Back Pocket", value: "None" }
        ]
      }
    ]
  },
  {
    id: "tmpl_vest",
    name: "Vest / Waistcoat Measurements",
    description: "Detailed measurements for waistcoats, tuxedo vests & Nehru style sleeveless jackets.",
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: [
      { id: "f_v_len", fieldName: "Length", shortName: "LEN", unit: "Inches", inputType: "Number", required: true, displayOrder: 1, active: true },
      { id: "f_v_tira", fieldName: "Shoulder / Tira", shortName: "SHOULDER", unit: "Inches", inputType: "Number", required: false, displayOrder: 2, active: true },
      { id: "f_v_chest", fieldName: "Chest", shortName: "CHEST", unit: "Inches", inputType: "Number", required: true, displayOrder: 3, active: true },
      { id: "f_v_waist", fieldName: "Waist", shortName: "WAIST", unit: "Inches", inputType: "Number", required: true, displayOrder: 4, active: true },
      { id: "f_v_hip", fieldName: "Hip", shortName: "HIP", unit: "Inches", inputType: "Number", required: false, displayOrder: 5, active: true },
      { id: "f_v_neck", fieldName: "Neck", shortName: "NECK", unit: "Inches", inputType: "Number", required: false, displayOrder: 6, active: true },
      { id: "f_v_armhole", fieldName: "Armhole", shortName: "ARMHOLE", unit: "Inches", inputType: "Number", required: false, displayOrder: 7, active: true },
      { id: "f_v_frontlen", fieldName: "Front Length", shortName: "FRONT LEN", unit: "Inches", inputType: "Number", required: false, displayOrder: 8, active: true },
      { id: "f_v_backlen", fieldName: "Back Length", shortName: "BACK LEN", unit: "Inches", inputType: "Number", required: false, displayOrder: 9, active: true },
      {
        id: "f_v_style",
        fieldName: "Vest Neck & Front Style",
        shortName: "VEST STYLE",
        unit: "",
        inputType: "Dropdown",
        required: false,
        displayOrder: 10,
        active: true,
        options: [
          { label: "Single Breasted V-Neck", value: "Single Breasted V-Neck" },
          { label: "Double Breasted Square Bottom", value: "Double Breasted" },
          { label: "Horseshoe / U-Neck Tuxedo Vest", value: "U-Neck Tuxedo Vest" },
          { label: "Notch Lapel Vest", value: "Notch Lapel Vest" }
        ]
      }
    ]
  },
  {
    id: "tmpl_kurta",
    name: "Kurta / Sherwani / Indian Wear Measurements",
    description: "Comprehensive specs for traditional Kurtas, Pathanis, Sherwanis & Nehru Jackets.",
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: [
      { id: "f_k_len", fieldName: "Length", shortName: "LEN", unit: "Inches", inputType: "Number", required: true, displayOrder: 1, active: true },
      { id: "f_k_tira", fieldName: "Shoulder / Tira", shortName: "SHOULDER", unit: "Inches", inputType: "Number", required: true, displayOrder: 2, active: true },
      { id: "f_k_chest", fieldName: "Chest", shortName: "CHEST", unit: "Inches", inputType: "Number", required: true, displayOrder: 3, active: true },
      { id: "f_k_waist", fieldName: "Waist", shortName: "WAIST", unit: "Inches", inputType: "Number", required: true, displayOrder: 4, active: true },
      { id: "f_k_hip", fieldName: "Hip", shortName: "HIP", unit: "Inches", inputType: "Number", required: true, displayOrder: 5, active: true },
      { id: "f_k_arms", fieldName: "Sleeve Length", shortName: "SLEEVE", unit: "Inches", inputType: "Number", required: true, displayOrder: 6, active: true },
      { id: "f_k_bicep", fieldName: "Bicep", shortName: "BICEP", unit: "Inches", inputType: "Number", required: false, displayOrder: 7, active: true },
      { id: "f_k_neck", fieldName: "Neck", shortName: "NECK", unit: "Inches", inputType: "Number", required: true, displayOrder: 8, active: true },
      { id: "f_k_cuff", fieldName: "Cuff / Sleeve Opening", shortName: "CUFF", unit: "Inches", inputType: "Number", required: false, displayOrder: 9, active: true },
      { id: "f_k_bottom", fieldName: "Ghera / Flare Bottom", shortName: "GHERA", unit: "Inches", inputType: "Number", required: false, displayOrder: 10, active: true },
      {
        id: "f_k_collar",
        fieldName: "Collar Type",
        shortName: "COLLAR",
        unit: "",
        inputType: "Dropdown",
        required: false,
        displayOrder: 11,
        active: true,
        options: [
          { label: "Ban Collar (Mandarin)", value: "Ban Collar" },
          { label: "Shirt Collar", value: "Shirt Collar" },
          { label: "Cut Collar", value: "Cut Collar" },
          { label: "V-Neck Collarless", value: "V-Neck" }
        ]
      },
      {
        id: "f_k_placket",
        fieldName: "Front Patti / Placket",
        shortName: "PATTI",
        unit: "",
        inputType: "Dropdown",
        required: false,
        displayOrder: 12,
        active: true,
        options: [
          { label: "Concealed / Hidden Placket", value: "Hidden Placket" },
          { label: "Contrast Fabric Patti", value: "Contrast Patti" },
          { label: "Designer Metal Buttons", value: "Metal Buttons" },
          { label: "Kurta Loops & Cloth Buttons", value: "Kurta Loops" }
        ]
      }
    ]
  },
  {
    id: "tmpl_shirt",
    name: "Shirt Measurements",
    description: "Fit specifications for formal, casual & ceremonial dress shirts.",
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: [
      { id: "f_s_len", fieldName: "Length", shortName: "LEN", unit: "Inches", inputType: "Number", required: true, displayOrder: 1, active: true },
      { id: "f_s_chest", fieldName: "Chest", shortName: "CHEST", unit: "Inches", inputType: "Number", required: true, displayOrder: 2, active: true },
      { id: "f_s_waist", fieldName: "Waist", shortName: "WAIST", unit: "Inches", inputType: "Number", required: true, displayOrder: 3, active: true },
      { id: "f_s_hip", fieldName: "Hip", shortName: "HIP", unit: "Inches", inputType: "Number", required: false, displayOrder: 4, active: true },
      { id: "f_s_tira", fieldName: "Shoulder / Tira", shortName: "SHOULDER", unit: "Inches", inputType: "Number", required: true, displayOrder: 5, active: true },
      { id: "f_s_arms", fieldName: "Sleeve Length", shortName: "SLEEVE", unit: "Inches", inputType: "Number", required: true, displayOrder: 6, active: true },
      { id: "f_s_neck", fieldName: "Neck Collar Size", shortName: "NECK", unit: "Inches", inputType: "Number", required: true, displayOrder: 7, active: true },
      { id: "f_s_cuff", fieldName: "Cuff Size", shortName: "CUFF", unit: "Inches", inputType: "Number", required: false, displayOrder: 8, active: true },
      { id: "f_s_bicep", fieldName: "Bicep", shortName: "BICEP", unit: "Inches", inputType: "Number", required: false, displayOrder: 9, active: true },
      {
        id: "f_s_collar",
        fieldName: "Collar Style",
        shortName: "COLLAR",
        unit: "",
        inputType: "Dropdown",
        required: false,
        displayOrder: 10,
        active: true,
        options: [
          { label: "Italian Cutaway Collar", value: "Cutaway Collar" },
          { label: "Regular Spread Collar", value: "Regular Spread" },
          { label: "Button Down Collar", value: "Button Down" },
          { label: "Mandarin Collar", value: "Mandarin Collar" }
        ]
      },
      {
        id: "f_s_fit",
        fieldName: "Fit Style",
        shortName: "FIT",
        unit: "",
        inputType: "Visual Selector",
        required: false,
        displayOrder: 11,
        active: true,
        options: [
          { label: "Slim Fit", value: "Slim Fit", iconOrVisual: "⚡" },
          { label: "Regular Fit", value: "Regular Fit", iconOrVisual: "👔" },
          { label: "Comfort Fit", value: "Comfort Fit", iconOrVisual: "✨" }
        ]
      }
    ]
  }
];

export const defaultGarmentCatalog: GarmentCatalogItem[] = [
  { id: "g_coat", name: "Coat", categoryId: "cat_outerwear", categoryName: "Outerwear", description: "Bespoke formal suit jacket / blazer coat", defaultPrice: 4500, measurementTemplateId: "tmpl_coat", measurementTemplateName: "Coat / Blazer / Indo-Western Measurements", active: true, displayOrder: 1 },
  { id: "g_pant", name: "Trouser / Pant", categoryId: "cat_trousers", categoryName: "Trousers", description: "Custom tailored suit trousers / formal pants", defaultPrice: 2400, measurementTemplateId: "tmpl_pant", measurementTemplateName: "Pant / Trouser Measurements", active: true, displayOrder: 2 },
  { id: "g_vest", name: "Vest / Waistcoat", categoryId: "cat_accessories", categoryName: "Accessories & Vests", description: "3-piece suit vest / Nehru waistcoat", defaultPrice: 2000, measurementTemplateId: "tmpl_vest", measurementTemplateName: "Vest / Waistcoat Measurements", active: true, displayOrder: 3 },
  { id: "g_2p_suit", name: "2 Piece Suit", categoryId: "cat_suits", categoryName: "Suits", description: "Coat + Pant bespoke ensemble", defaultPrice: 6500, measurementTemplateId: "tmpl_coat", measurementTemplateName: "Coat / Blazer / Indo-Western Measurements", active: true, displayOrder: 4 },
  { id: "g_3p_suit", name: "3 Piece Suit", categoryId: "cat_suits", categoryName: "Suits", description: "Coat + Vest + Pant complete bespoke tuxedo set", defaultPrice: 8500, measurementTemplateId: "tmpl_coat", measurementTemplateName: "Coat / Blazer / Indo-Western Measurements", active: true, displayOrder: 5 },
  { id: "g_form_shirt", name: "Formal Shirt", categoryId: "cat_shirts", categoryName: "Shirts", description: "Pure cotton bespoke formal dress shirt", defaultPrice: 1500, measurementTemplateId: "tmpl_shirt", measurementTemplateName: "Shirt Measurements", active: true, displayOrder: 6 },
  { id: "g_cas_shirt", name: "Casual Shirt", categoryId: "cat_shirts", categoryName: "Shirts", description: "Custom tailored casual / linen shirt", defaultPrice: 1400, measurementTemplateId: "tmpl_shirt", measurementTemplateName: "Shirt Measurements", active: true, displayOrder: 7 },
  { id: "g_kurta", name: "Kurta", categoryId: "cat_indian", categoryName: "Indian Wear", description: "Traditional cotton / silk tailored kurta", defaultPrice: 1800, measurementTemplateId: "tmpl_kurta", measurementTemplateName: "Kurta / Sherwani / Indian Wear Measurements", active: true, displayOrder: 8 },
  { id: "g_kurta_pajama", name: "Kurta Pajama Set", categoryId: "cat_indian", categoryName: "Indian Wear", description: "Kurta + Salwar/Pajama complete suit set", defaultPrice: 2500, measurementTemplateId: "tmpl_kurta", measurementTemplateName: "Kurta / Sherwani / Indian Wear Measurements", active: true, displayOrder: 9 },
  { id: "g_sherwani", name: "Sherwani", categoryId: "cat_indian", categoryName: "Indian Wear", description: "Royal wedding sherwani with inner kurta & churidar", defaultPrice: 12000, measurementTemplateId: "tmpl_kurta", measurementTemplateName: "Kurta / Sherwani / Indian Wear Measurements", active: true, displayOrder: 10 },
  { id: "g_nehru_jkt", name: "Nehru Jacket", categoryId: "cat_indian", categoryName: "Indian Wear", description: "Sleeveless Ban-collar royal Nehru jacket", defaultPrice: 3500, measurementTemplateId: "tmpl_vest", measurementTemplateName: "Vest / Waistcoat Measurements", active: true, displayOrder: 11 },
  { id: "g_blazer", name: "Blazer", categoryId: "cat_outerwear", categoryName: "Outerwear", description: "Smart casual / formal single breasted blazer", defaultPrice: 4200, measurementTemplateId: "tmpl_coat", measurementTemplateName: "Coat / Blazer / Indo-Western Measurements", active: true, displayOrder: 12 },
  { id: "g_overcoat", name: "Overcoat", categoryId: "cat_outerwear", categoryName: "Outerwear", description: "Long woollen winter trench / overcoat", defaultPrice: 6000, measurementTemplateId: "tmpl_coat", measurementTemplateName: "Coat / Blazer / Indo-Western Measurements", active: true, displayOrder: 13 },
  { id: "g_bandhgala", name: "Bandhgala", categoryId: "cat_outerwear", categoryName: "Outerwear", description: "Jodhpuri Royal Bandhgala suit jacket", defaultPrice: 5500, measurementTemplateId: "tmpl_coat", measurementTemplateName: "Coat / Blazer / Indo-Western Measurements", active: true, displayOrder: 14 },
  { id: "g_chinos", name: "Chinos", categoryId: "cat_trousers", categoryName: "Trousers", description: "Cotton stretch smart chinos / casual trousers", defaultPrice: 2200, measurementTemplateId: "tmpl_pant", measurementTemplateName: "Pant / Trouser Measurements", active: true, displayOrder: 15 },
  { id: "g_custom", name: "Custom Garment", categoryId: "cat_custom", categoryName: "Custom", description: "Bespoke tailor-made item according to customer specs", defaultPrice: 2000, measurementTemplateId: "tmpl_coat", measurementTemplateName: "Coat / Blazer / Indo-Western Measurements", active: true, displayOrder: 16 }
];
