/* Live inventory sync.
 *
 * Reads the published Google Sheet on every load. A unit sold in the sheet stops
 * being offerable here; a unit added appears. Nothing is cached between loads
 * beyond the browser's own no-cache handling, so the sales team never has to
 * think about refreshing.
 *
 * Design rule throughout: fail *closed*. Any row we cannot confidently read as
 * available is treated as not available. Hiding a free clinic costs a phone
 * call; selling a sold one costs a customer.
 */

/** RFC-4180-ish CSV parser: handles quoted fields, embedded commas, "" escapes. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');

/** "3,375,000.00" -> 3375000. Returns null when there is no number present. */
function parseNumber(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/* Header aliases, so renaming a column in the sheet does not break the app.
 * Matched on normalised text, longest-specific first. */
const COLUMNS = {
  project:   ['project'],
  type:      ['type', 'unit type'],
  floor:     ['floor'],
  code:      ['unit code', 'code', 'unit'],
  area:      ['indoor area', 'area', 'area m2', 'indoor area m2'],
  meterPrice:['indoor meter price', 'meter price', 'price per meter', 'floor meter price'],
  price:     ['total unit price', 'total price', 'price'],
  status:    ['status'],
};

function mapHeaders(headerRow) {
  const seen = headerRow.map(norm);
  const idx = {};
  for (const [key, aliases] of Object.entries(COLUMNS)) {
    for (const alias of aliases) {
      const at = seen.indexOf(alias);
      if (at !== -1) { idx[key] = at; break; }
    }
  }
  return idx;
}

const FLOOR_NUMBERS = {
  ground: 0, first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  nineth: 9,   // the 9MC sheet spells it this way
};

/** "C313" -> { kind: 'C', floor: 3, clinic: 13 }. Null if it doesn't fit. */
function parseUnitCode(code) {
  const m = /^([A-Za-z]+)(\d)(\d{2})$/.exec(String(code).trim());
  if (!m) return null;
  return { kind: m[1].toUpperCase(), floor: Number(m[2]), clinic: Number(m[3]) };
}

/**
 * Turn raw CSV rows into unit objects.
 * Returns { units, warnings } — warnings are surfaced in the UI rather than
 * thrown, so one bad row never takes the whole app down mid-meeting.
 */
function normalizeRows(rows, planAreas) {
  const warnings = [];
  if (!rows.length) return { units: [], warnings: ['The sheet is empty.'] };

  const idx = mapHeaders(rows[0]);
  for (const required of ['code', 'price', 'status']) {
    if (idx[required] === undefined) {
      return { units: [], warnings: [`The sheet has no "${required}" column — check the published tab.`] };
    }
  }

  const units = [], seenCodes = new Set();

  rows.slice(1).forEach((row, n) => {
    const cell = (key) => (idx[key] === undefined ? '' : (row[idx[key]] ?? '').trim());
    const code = cell('code').toUpperCase();
    if (!code) return;

    const where = `row ${n + 2} (${code})`;
    if (seenCodes.has(code)) { warnings.push(`${where}: duplicate unit code — the later row was ignored.`); return; }
    seenCodes.add(code);

    const parsed = parseUnitCode(code);
    if (!parsed) { warnings.push(`${where}: unit code is not in the expected form (e.g. C313) — skipped.`); return; }

    const price = parseNumber(cell('price'));
    if (price === null || price <= 0) { warnings.push(`${where}: no usable total price — skipped.`); return; }

    let area = parseNumber(cell('area'));
    let meterPrice = parseNumber(cell('meterPrice'));

    // Units the developer has withheld from sale, whatever the sheet says.
    const heldReason = (CONFIG.excludedUnits || {})[code];

    /* A correction recorded in config.js, where the drawing and the sheet
     * disagree and the drawing has been accepted as right. The total price is
     * left alone and the meter price re-derived from it, so the offer's own
     * arithmetic still foots. Applied before the checks below, which would
     * otherwise report a discrepancy that has already been resolved. */
    const override = (CONFIG.unitOverrides || {})[code];
    let overrideNote = null;
    if (override && override.area && override.area !== area) {
      overrideNote = `${code}: using ${override.area} m² instead of the sheet's ${area} m². ${override.reason}`;
      warnings.push(overrideNote);
      area = override.area;
      meterPrice = price / area;
    }

    // The drawing and the sheet must agree on size. If they don't, one of them
    // is wrong and the offer would be wrong too, so flag it loudly — unless the
    // unit is already on hold for that very reason, which would just be noise.
    const planArea = planAreas ? planAreas[parsed.clinic] : undefined;
    if (!heldReason && area !== null && planArea !== undefined && Math.abs(area - planArea) > 0.5) {
      warnings.push(`${where}: sheet says ${area} m² but the floor plan says ${planArea} m².`);
    }
    // Cross-foot the arithmetic the sheet already did.
    if (area && meterPrice && Math.abs(area * meterPrice - price) > 1) {
      warnings.push(`${where}: ${area} × ${meterPrice.toLocaleString()} ≠ ${price.toLocaleString()}.`);
    }

    const statusRaw = cell('status');
    const status = norm(statusRaw);
    let state = 'sold';
    if (CONFIG.availableStatuses.includes(status)) state = 'available';
    else if (CONFIG.reservedStatuses.includes(status)) state = 'reserved';
    else if (status && !CONFIG.availableStatuses.includes(status)) state = 'sold';
    if (!status) { warnings.push(`${where}: blank status — treated as not available.`); }

    // A hold overrides an "Available" status — it must not reach an offer.
    if (heldReason) {
      state = 'held';
      warnings.push(`${code} is on hold and cannot be offered: ${heldReason}`);
    }

    const floorCell = norm(cell('floor'));
    const floorKey = Object.keys(FLOOR_NUMBERS).find((f) => f === floorCell);
    if (floorKey && FLOOR_NUMBERS[floorKey] !== parsed.floor) {
      warnings.push(`${where}: floor column says "${cell('floor')}" but the code says floor ${parsed.floor}.`);
    }

    units.push({
      code,
      project: cell('project') || null,
      clinic: parsed.clinic,
      floor: parsed.floor,
      floorKey: floorKey ? floorKey[0].toUpperCase() + floorKey.slice(1) : null,
      type: cell('type') || 'Clinic',
      area: area ?? planArea ?? null,
      meterPrice,
      price,
      status: statusRaw || '—',
      heldReason: heldReason || null,
      // Set when config.js corrected this row, so the UI can say where the
      // number on screen came from rather than silently disagreeing with the sheet.
      areaNote: overrideNote ? override.reason : null,
      state,
    });
  });

  return { units, warnings };
}

/** Fetch the sheet, falling back through the URL list, then to the snapshot. */
async function loadInventory(planAreas) {
  const errors = [];

  for (const url of CONFIG.sheetUrls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { errors.push(`${res.status} from ${new URL(url).pathname}`); continue; }
      const text = await res.text();
      // A login page means the sheet stopped being published.
      if (/^\s*</.test(text)) { errors.push('the sheet is no longer published publicly'); continue; }

      const { units, warnings } = normalizeRows(parseCSV(text), planAreas);
      if (!units.length) { errors.push(warnings[0] || 'no usable rows'); continue; }
      return { units, warnings, live: true, fetchedAt: new Date(), errors };
    } catch (err) {
      errors.push(err.message);
    }
  }

  // Offline / sheet unreachable: fall back to the snapshot baked in at build
  // time so the app still opens in front of a client. Clearly marked as stale.
  //
  // Snapshots are keyed by project, so one project can never be shown another's
  // units and prices. If this project has no snapshot, say so and show nothing.
  const snap = typeof SNAPSHOTS !== 'undefined' ? SNAPSHOTS[CONFIG.id] : null;
  if (!snap) {
    return {
      units: [],
      warnings: [`Could not reach the ${CONFIG.name} inventory sheet, and there is no saved copy for this project. Check your connection and press Refresh.`],
      live: false,
      fetchedAt: null,
      errors,
    };
  }

  const { units, warnings } = normalizeRows(parseCSV(snap.csv), planAreas);
  return {
    units,
    warnings,
    live: false,
    fetchedAt: snap.takenAt ? new Date(snap.takenAt) : null,
    errors,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { parseCSV, parseNumber, normalizeRows, parseUnitCode, mapHeaders };
}
