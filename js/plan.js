/* Clinic hotspot geometry for the medical floor plan.
 *
 * Points are pixels against the reference render (PLAN_REF_W x PLAN_REF_H) and
 * are normalised to 0..1 at load, so the plan stays clickable at any size.
 *
 * Polygons rather than rectangles: the two side wings are slanted and the top
 * row follows a shallow arc, so boxes would highlight the neighbouring room.
 * Traced from the 300dpi render (see scripts/verify-plan.js, which draws these
 * back onto the drawing to check them).
 *
 * The clinic number is also the last two digits of the unit code — clinic 13 on
 * floor 3 is C313. Floors 2 and 3 are identical layouts, so this geometry serves
 * both; only the floor digit changes.
 *
 * `area` is the m² printed on the drawing. It is NOT used for pricing — the
 * sheet is the authority — but it is cross-checked against the sheet at load so
 * a typo in either source surfaces instead of producing a wrong offer.
 */
const PLAN_REF_W = 1461;
const PLAN_REF_H = 1169;

/* Room outlines, traced by hand off the 300dpi render with scripts/make-tracer.js
 * (2026-08-13). Every room is an explicit polygon — the top row used to be
 * generated from a fitted arc, which was close but never matched the drawn
 * walls; measured corners beat a curve fitted by eye.
 *
 * Checked as a set, not by spot check: each outline's area agrees with the m²
 * printed in its room to within a few percent of the others, each contains the
 * pin the app already used, and none overlaps a neighbour. */
const POLYGONS = {
  // Bottom-right wing
  1: [[989, 986], [1071, 969], [1090, 1083], [1076, 1086], [1055, 1091], [1042, 1094], [1022, 1091], [1009, 1079], [1001, 1062]],

  // Right wing, bottom to top — slanted strip. Clinic 2 is the deep corner room.
  2: [[1055, 669], [1193, 624], [1205, 670], [1177, 710], [1174, 715], [1171, 734], [1082, 763]],
  3: [[1037, 607], [1178, 562], [1192, 618], [1054, 663]],
  4: [[1021, 546], [1159, 502], [1174, 556], [1037, 601]],
  5: [[1004, 486], [1142, 442], [1157, 496], [1019, 541]],
  6: [[988, 425], [1124, 380], [1140, 434], [1003, 478]],
  7: [[964, 341], [1108, 321], [1123, 374], [985, 417]],

  // Inner top row, below the lobby (right to left: 8, 9, 10, 11, 12)
  8: [[1018, 239], [1082, 230], [1108, 315], [1028, 326]],
  9: [[921, 249], [1012, 240], [1022, 327], [928, 339]],
  10: [[823, 254], [915, 249], [922, 340], [825, 343]],
  11: [[728, 252], [817, 254], [819, 341], [725, 342]],
  12: [[630, 245], [722, 252], [719, 342], [626, 335]],

  // Left wing, top to bottom — slanted strip
  13: [[437, 315], [581, 337], [566, 405], [425, 366]],
  14: [[423, 373], [563, 411], [551, 468], [410, 427]],
  15: [[409, 433], [548, 473], [536, 529], [395, 490]],
  16: [[394, 496], [534, 535], [522, 590], [381, 552]],
  17: [[380, 557], [519, 595], [506, 652], [367, 614]],
  18: [[364, 620], [504, 659], [484, 749], [398, 728], [355, 663]],

  // Bottom-left wing. 19 and 21 follow the building's rounded outer corners.
  19: [[269, 938], [368, 954], [382, 955], [413, 958], [412, 970], [407, 994], [406, 1009], [401, 1040], [400, 1054], [397, 1075], [350, 1067], [331, 1063], [316, 1054], [305, 1042], [295, 1021], [281, 994], [272, 976], [268, 961]],
  20: [[419, 958], [495, 964], [481, 1085], [403, 1076]],
  21: [[501, 965], [581, 970], [572, 1046], [570, 1063], [567, 1076], [560, 1086], [546, 1094], [531, 1095], [515, 1092], [487, 1088]],

  // Bottom-right wing continued
  22: [[1076, 968], [1152, 955], [1171, 1068], [1096, 1082]],
  23: [[1157, 953], [1298, 929], [1299, 944], [1298, 958], [1289, 982], [1278, 1006], [1272, 1024], [1263, 1036], [1254, 1046], [1242, 1054], [1217, 1060], [1177, 1066]],

  // Top row (24 right, 34 left), following the shallow arc of the facade
  24: [[1028, 76], [1046, 176], [1109, 169], [1100, 122], [1093, 100], [1084, 89], [1072, 79], [1060, 74], [1043, 73]],
  25: [[978, 85], [1022, 79], [1038, 181], [986, 186]],
  26: [[919, 89], [970, 85], [979, 187], [925, 191]],
  27: [[861, 94], [913, 91], [916, 193], [865, 194]],
  28: [[802, 95], [852, 94], [855, 196], [804, 196]],
  29: [[745, 94], [796, 94], [795, 196], [742, 196]],
  30: [[687, 91], [739, 94], [736, 194], [683, 193]],
  31: [[629, 86], [680, 90], [675, 193], [621, 188]],
  32: [[573, 80], [621, 85], [614, 185], [561, 181]],
  33: [[522, 71], [566, 79], [554, 179], [501, 172]],
  34: [[491, 172], [516, 70], [485, 67], [472, 70], [460, 76], [449, 88], [442, 103], [439, 115], [430, 155], [449, 163]],
};

/** m² printed on the drawing, used only to cross-check the sheet. */
const CLINIC_AREAS = {
  1: 31, 2: 38, 3: 26, 4: 26, 5: 26, 6: 26, 7: 29, 8: 20, 9: 26, 10: 26, 11: 26,
  12: 24, 13: 27, 14: 26, 15: 26, 16: 26, 17: 26, 18: 38, 19: 41, 20: 30, 21: 33,
  22: 29, 23: 43, 24: 21, 25: 17, 26: 18, 27: 18, 28: 18, 29: 18, 30: 18, 31: 18,
  32: 18, 33: 17, 34: 22,
};

/* Pin position for each clinic.
 *
 * Rooms are now drawn as outlines, but the pin is still what a hover card
 * hangs off and what the PDF falls back to, so every room keeps one.
 *
 * Area-weighted centroid, so the chamfered rooms (2 and 18) pin inside
 * themselves rather than drifting toward the cut corner.
 */
function polygonCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  a *= 0.5;
  if (!a) { // degenerate: fall back to the vertex average
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length,
            pts.reduce((s, p) => s + p[1], 0) / pts.length];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

const CLINIC_PINS = Object.fromEntries(
  Object.entries(POLYGONS).map(([n, pts]) => {
    const [x, y] = polygonCentroid(pts);
    return [n, { n: Number(n), x, y, area: CLINIC_AREAS[n] }];
  })
);

/** Hotspots keyed by clinic number, points normalised to 0..1. */
const CLINIC_HOTSPOTS = Object.fromEntries(
  Object.entries(POLYGONS).map(([n, pts]) => [n, {
    n: Number(n),
    area: CLINIC_AREAS[n],
    points: pts.map(([x, y]) => [x / PLAN_REF_W, y / PLAN_REF_H]),
  }])
);

/* ========================================================================
 * 9MC — ninth-floor medical clinics, 37 rooms.
 *
 * Pin centres read off the 300dpi render of the layout, against a reference of
 * 2100 x 1182 (assets/plan-9mc.jpg). No polygons here: since the plan is shown
 * as pins, one point per room is all that is needed — which is also why adding
 * a building is now cheap.
 *
 * Codes are MC + floor + clinic, so clinic 15 on floor 9 is MC915.
 * ===================================================================== */
/* The published layout is mostly landscaping, with the clinics in one corner.
 * The shipped images are cropped to the building (box x640 y450 w1210 h550 of
 * the full 2100x1182 render) so the pins are big enough to hit comfortably;
 * these coordinates are already relative to that crop. */
const MC9_REF_W = 1210, MC9_REF_H = 550;

const MC9_PINS_RAW = {
  // Right-hand column, top to bottom
  1: [1009, 166], 2: [1088, 152], 3: [1085, 224], 4: [1064, 278],
  5: [1056, 329], 6: [1051, 380], 7: [1027, 450],
  // Long bottom row, right to left
  8: [960, 461], 9: [917, 461], 10: [874, 461], 11: [830, 461],
  12: [787, 461], 13: [743, 461], 14: [700, 461], 15: [655, 461],
  16: [612, 461], 17: [568, 461], 18: [525, 461], 19: [481, 461],
  20: [437, 461], 21: [391, 461], 22: [343, 461], 23: [296, 461],
  // Left group
  24: [149, 434], 25: [158, 321], 26: [233, 313], 27: [288, 313], 28: [340, 309],
  // Upper middle row, right to left
  29: [874, 322], 30: [830, 322], 31: [787, 322], 32: [742, 322],
  33: [698, 322], 34: [655, 322], 35: [610, 322], 36: [567, 322],
  37: [508, 320],
};

/** m² printed on the 9MC drawing — cross-checked against the sheet at load. */
const MC9_AREAS = {
  1: 38, 2: 61, 3: 27, 4: 21, 5: 21, 6: 21, 7: 49,
  8: 23, 9: 23, 10: 23, 11: 23, 12: 23, 13: 23, 14: 23, 15: 23, 16: 23, 17: 23,
  18: 23, 19: 23, 20: 23, 21: 23, 22: 19, 23: 19,
  24: 80, 25: 45, 26: 19, 27: 28, 28: 29,
  29: 18, 30: 17, 31: 19, 32: 19, 33: 19, 34: 19, 35: 19, 36: 19, 37: 34,
};

/* Room outlines, traced by hand with scripts/make-tracer.js (2026-08-13).
 * 9MC had never had any — it shipped with pins only.
 *
 * Validated as a set: every outline contains the pin that was placed
 * independently off the drawing, and no two overlap.
 *
 * Clinics 22 and 23 trace about a third larger than the 19 m² printed on the
 * drawing, landing near 25 m². That is not a tracing error — operations have
 * separately said those rooms are 23 m² and that the drawing is wrong (see the
 * README). The traced geometry is now a third, independent piece of evidence
 * that the DRAWING is the thing needing correction. MC9_AREAS still records
 * what the drawing prints, so the sheet cross-check keeps flagging it. */
const MC9_POLYGONS = {
  // Right-hand column, top to bottom
  1: [[978, 138], [1055, 113], [1038, 201], [967, 183]],
  2: [[1055, 113], [1107, 97], [1119, 97], [1129, 103], [1137, 110], [1141, 120], [1138, 137], [1126, 203], [1070, 189], [1062, 211], [1038, 201]],
  3: [[1060, 243], [1113, 258], [1123, 205], [1071, 191]],
  4: [[1041, 242], [1031, 290], [1103, 311], [1112, 262]],
  5: [[1020, 340], [1091, 360], [1101, 316], [1030, 297]],
  6: [[1019, 347], [1009, 390], [1081, 411], [1089, 367]],
  7: [[980, 429], [980, 530], [1058, 531], [1080, 420], [1007, 398], [1007, 402]],

  // Long bottom row, right to left
  8: [[976, 429], [977, 530], [939, 529], [939, 417], [959, 417]],
  9: [[897, 417], [897, 530], [933, 532], [931, 418]],
  10: [[854, 417], [854, 532], [893, 532], [893, 417]],
  11: [[812, 417], [849, 417], [851, 532], [812, 532]],
  12: [[767, 417], [808, 417], [808, 532], [767, 532]],
  13: [[724, 417], [724, 530], [764, 530], [765, 417]],
  14: [[681, 417], [681, 530], [720, 531], [720, 417]],
  15: [[635, 417], [635, 531], [676, 531], [676, 417]],
  16: [[592, 417], [592, 531], [631, 531], [632, 416]],
  17: [[549, 416], [549, 531], [588, 531], [588, 416]],
  18: [[505, 417], [505, 531], [543, 530], [544, 417]],
  19: [[461, 416], [460, 531], [500, 530], [501, 416]],
  20: [[416, 417], [416, 530], [454, 531], [455, 417]],
  21: [[369, 417], [410, 417], [409, 531], [369, 531]],
  22: [[322, 417], [322, 530], [364, 530], [365, 417]],
  23: [[273, 416], [317, 416], [317, 530], [273, 530]],

  // Left group — 24 and 25 wrap the building's rounded south-west corner
  24: [[172, 369], [95, 369], [92, 493], [97, 505], [105, 515], [113, 521], [122, 524], [137, 526], [149, 526], [220, 526], [222, 408], [211, 408], [172, 408]],
  25: [[206, 273], [143, 295], [128, 301], [118, 307], [108, 314], [101, 325], [98, 333], [95, 346], [95, 362], [174, 365], [176, 353], [207, 353]],
  26: [[258, 352], [242, 262], [209, 273], [210, 352]],
  27: [[247, 261], [290, 246], [314, 352], [262, 352]],
  28: [[295, 245], [346, 227], [378, 351], [318, 352]],

  // Upper middle row, right to left
  29: [[894, 275], [854, 275], [853, 368], [895, 368]],
  30: [[810, 275], [811, 368], [850, 368], [850, 275]],
  31: [[766, 275], [806, 275], [807, 367], [766, 367]],
  32: [[720, 275], [722, 367], [763, 368], [761, 275]],
  33: [[678, 275], [717, 275], [717, 368], [679, 367]],
  34: [[635, 275], [635, 368], [675, 368], [674, 275]],
  35: [[590, 275], [630, 275], [630, 367], [590, 367]],
  36: [[546, 275], [584, 275], [584, 367], [546, 367]],
  37: [[466, 296], [525, 274], [541, 274], [541, 367], [485, 366]],
};

/** "Second" -> "2ND", "Ninth" -> "9TH". Used to reprint a shared drawing's
 *  floor label with the floor actually being sold. */
function floorOrdinal(key) {
  const n = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth',
    'Seventh', 'Eighth', 'Ninth', 'Tenth'].indexOf(key);
  if (n < 1) return String(key).toUpperCase();
  const suffix = n % 10 === 1 && n !== 11 ? 'ST' : n % 10 === 2 && n !== 12 ? 'ND'
    : n % 10 === 3 && n !== 13 ? 'RD' : 'TH';
  return `${n}${suffix}`;
}

/* ---- registry -----------------------------------------------------------
 * Each project points at one of these by `planKey` in js/config.js. */
const PLANS = {
  emc: {
    refW: PLAN_REF_W,
    refH: PLAN_REF_H,
    areas: CLINIC_AREAS,
    pins: CLINIC_PINS,
    pinR: 17, pinRsel: 23,
    polygons: POLYGONS,

    /* Whether `polygons` may be used to SHOW a room, in the app and in the PDF,
     * instead of dropping a pin in it.
     *
     * The earlier outlines were traced against a low-resolution render and were
     * close but not exact, so the app dropped a pin in the middle of the room
     * instead — a highlight a few pixels off a wall reads as sloppy in front of
     * a customer. Both plans were retraced against the 300dpi renders on
     * 2026-08-13 and checked with verify-plan.js, so the rooms are now drawn.
     *
     * This matters more than it did: a combined offer has to show a customer
     * that two clinics adjoin, which two dots cannot do. */
    outlines: true,

    /* The supplied drawing has "MEDICAL FLOOR / 3ND" printed in the courtyard.
     * The second floor is the same layout, so it reuses this drawing — and that
     * label would then be wrong on a second-floor offer. This box covers it and
     * the correct floor is printed back in its place, which also fixes the
     * drawing's own "3ND" typo on the third floor.
     *
     * Reference-space coordinates. `fill` is sampled from the courtyard around
     * the label, not pure white, so the patch does not show as a box.
     *
     * Delete this once a real drawing is supplied per floor. */
    floorLabel: { x: 668, y: 596, w: 248, h: 104, fill: [239, 238, 237] },
  },
  mc9: {
    refW: MC9_REF_W,
    refH: MC9_REF_H,
    areas: MC9_AREAS,
    pinR: 13, pinRsel: 18,
    pins: Object.fromEntries(Object.entries(MC9_PINS_RAW).map(([n, [x, y]]) => [
      n, { n: Number(n), x, y, area: MC9_AREAS[n] },
    ])),
    polygons: MC9_POLYGONS,
    outlines: true,

    /* Rooms whose traced outline disagrees with the m² printed inside it by
     * more than a quarter. Listed so the test suite guards against a NEW
     * mismatch appearing without failing on the five already understood.
     *
     *  22, 23 — trace to about 25 m² against a printed 19 m². Operations have
     *     already said these rooms are 23 m² and the drawing is wrong, so the
     *     geometry is a third, independent witness for that.
     *  1, 2, 3 — trace 29-44% SMALLER than their printed 38 / 61 / 27 m². The
     *     outlines follow the drawn walls, so either those three labels are
     *     wrong in the same way, or the rooms extend past what is drawn.
     *     UNRESOLVED — needs MNHD/Eliwah to confirm. It does not affect any
     *     price: the sheet is the authority for area and cost, and these
     *     numbers are only ever cross-checked against it.
     *
     * Delete an entry once the drawing is corrected. */
    areaMismatches: [1, 2, 3, 22, 23],
    // The 9MC drawing prints no floor name, so floors three to nine share it
    // as-is with nothing to correct.
    floorLabel: null,
  },
};

if (typeof module !== 'undefined') {
  module.exports = {
    PLANS, POLYGONS, CLINIC_HOTSPOTS, CLINIC_PINS, CLINIC_AREAS,
    PLAN_REF_W, PLAN_REF_H, polygonCentroid, floorOrdinal,
  };
}
