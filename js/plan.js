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

/* ---- top row (clinics 34..24), left to right along a shallow arc ---------- */
const TOP_ROW = [
  [34, 437, 511], [33, 512, 564], [32, 565, 620], [31, 622, 678], [30, 680, 737],
  [29, 739, 795], [28, 797, 852], [27, 854, 910], [26, 912, 967], [25, 969, 1022],
  [24, 1024, 1090],
];
const TOP_X0 = 437, TOP_X1 = 1090, TOP_Y = 76, TOP_H = 108, TOP_ARC = 9;
const topEdge = (x) => TOP_Y - TOP_ARC * Math.sin(Math.PI * (x - TOP_X0) / (TOP_X1 - TOP_X0));

/* ---- explicit polygons for everything else ------------------------------- */
const rectPoly = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

const POLYGONS = {
  // Inner top row, below the lobby (left to right: 12, 11, 10, 9, 8)
  12: rectPoly(640, 248, 84, 84),
  11: rectPoly(725, 250, 94, 84),
  10: rectPoly(820, 248, 96, 84),
  9:  rectPoly(917, 246, 94, 86),
  8:  [[1013, 243], [1101, 236], [1101, 326], [1013, 331]],

  // Left wing, top to bottom — slanted strip
  13: [[434, 315], [581, 337], [569, 400], [424, 373]],
  14: [[424, 373], [569, 400], [562, 462], [409, 433]],
  15: [[409, 433], [562, 462], [550, 525], [395, 493]],
  16: [[395, 493], [550, 525], [536, 587], [382, 555]],
  17: [[382, 555], [536, 587], [522, 649], [366, 616]],
  18: [[366, 616], [522, 649], [508, 719], [398, 730], [352, 668]],

  // Right wing, top to bottom — slanted strip
  7: [[963, 335], [1105, 324], [1126, 377], [982, 418]],
  6: [[982, 418], [1126, 377], [1140, 433], [995, 473]],
  5: [[995, 473], [1140, 433], [1155, 490], [1010, 530]],
  4: [[1010, 530], [1155, 490], [1170, 547], [1025, 587]],
  3: [[1025, 587], [1170, 547], [1185, 602], [1040, 643]],
  // Clinic 2 is the deep corner room — chamfered where it meets the lift lobby.
  2: [[1040, 643], [1185, 602], [1215, 668], [1160, 716], [1070, 742]],

  // Bottom-left wing
  19: [[270, 950], [400, 946], [404, 1078], [274, 1082]],
  20: rectPoly(404, 950, 87, 130),
  21: [[493, 952], [572, 956], [572, 1082], [493, 1080]],

  // Bottom-right wing
  1:  [[993, 962], [1076, 957], [1076, 1086], [993, 1090]],
  22: rectPoly(1078, 953, 83, 128),
  23: [[1163, 944], [1287, 936], [1287, 1068], [1163, 1077]],
};

for (const [n, x0, x1] of TOP_ROW) {
  const t0 = topEdge(x0), t1 = topEdge(x1);
  POLYGONS[n] = [[x0, t0], [x1, t1], [x1, t1 + TOP_H], [x0, t0 + TOP_H]];
}

/** m² printed on the drawing, used only to cross-check the sheet. */
const CLINIC_AREAS = {
  1: 31, 2: 38, 3: 26, 4: 26, 5: 26, 6: 26, 7: 29, 8: 20, 9: 26, 10: 26, 11: 26,
  12: 24, 13: 27, 14: 26, 15: 26, 16: 26, 17: 26, 18: 38, 19: 41, 20: 30, 21: 33,
  22: 29, 23: 43, 24: 21, 25: 17, 26: 18, 27: 18, 28: 18, 29: 18, 30: 18, 31: 18,
  32: 18, 33: 17, 34: 22,
};

/* Pin position for each clinic.
 *
 * The plan is shown as circular pins rather than outlined rooms: the traced
 * polygons are close but not exact, and a highlight that is a few pixels off a
 * wall reads as sloppy in front of a customer. A pin sitting in the middle of
 * the room is unambiguous at any zoom, and the drawing already labels every
 * room with its number and area.
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
    polygons: POLYGONS,      // kept: used by scripts/verify-plan.js

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
    polygons: null,
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
