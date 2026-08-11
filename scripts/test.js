/* Checks the payment maths and the sheet parser. Run: node scripts/test.js
 *
 * The browser files are plain scripts sharing one global scope, so load them
 * the same way the page does rather than as modules.
 */
const fs = require('fs');
const path = require('path');

const load = (...files) => {
  const src = files.map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n');
  return new Function(`${src}
    return { CONFIG, cfg: () => CONFIG, setProject, addMonths, SNAPSHOTS, parseCSV, normalizeRows, parseUnitCode, parseNumber,
             buildSchedule, scheduleTotal, CLINIC_AREAS, CLINIC_HOTSPOTS, POLYGONS, CLINIC_PINS, PROJECTS, PLANS, floorOrdinal };`)();
};

const G = load('js/config.js', 'js/plan.js', 'js/data.js', 'js/sheet.js', 'js/engine.js');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

/* ---- geometry ---------------------------------------------------------- */
console.log('\nFloor plan');
check('34 clinic hotspots', Object.keys(G.POLYGONS).length === 34, `got ${Object.keys(G.POLYGONS).length}`);
check('clinic numbers are 1..34',
  [...Array(34)].every((_, i) => G.POLYGONS[i + 1]),
  'missing: ' + [...Array(34)].map((_, i) => i + 1).filter((n) => !G.POLYGONS[n]).join(','));
for (const [n, h] of Object.entries(G.CLINIC_HOTSPOTS)) {
  check(`clinic ${n} inside the image`,
    h.points.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
}
/* Pins are what the agent actually clicks, so each one must sit inside its own
 * room — a centroid that escapes the polygon would put the pin in a neighbour. */
const pointInPolygon = ([x, y], pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
check('34 pins', Object.keys(G.CLINIC_PINS).length === 34);
for (const [n, pin] of Object.entries(G.CLINIC_PINS)) {
  check(`clinic ${n} pin sits inside its room`, pointInPolygon([pin.x, pin.y], G.POLYGONS[n]));
}
// And no two pins should collide at the on-screen radius (17 + a little slack).
const pins = Object.values(G.CLINIC_PINS);
for (let i = 0; i < pins.length; i++) {
  for (let j = i + 1; j < pins.length; j++) {
    const d = Math.hypot(pins[i].x - pins[j].x, pins[i].y - pins[j].y);
    check(`pins ${pins[i].n} and ${pins[j].n} do not overlap`, d > 36, `${d.toFixed(0)}px apart`);
  }
}

/* every registered building */
console.log('\nAll plans');
for (const [key, plan] of Object.entries(G.PLANS)) {
  const nums = Object.keys(plan.pins).map(Number).sort((a, b) => a - b);
  check(`${key}: pins are numbered 1..n with no gaps`,
    nums.every((n, i) => n === i + 1), `got ${nums.join(',')}`);
  check(`${key}: every pin has an area`, nums.every((n) => plan.areas[n] > 0));
  check(`${key}: every pin is inside the image`,
    Object.values(plan.pins).every((p) => p.x >= 0 && p.x <= plan.refW && p.y >= 0 && p.y <= plan.refH));
  // Pins must not collide at the radius they are actually drawn at.
  const ps = Object.values(plan.pins);
  let closest = Infinity;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      closest = Math.min(closest, Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y));
    }
  }
  check(`${key}: no two pins overlap at r=${plan.pinR}`, closest > plan.pinR * 2,
    `closest pair is ${closest.toFixed(0)}px apart`);
  console.log(`  ${key}: ${nums.length} rooms, closest pins ${closest.toFixed(0)}px, r=${plan.pinR}`);
}

check('plan areas sum to the drawing total',
  Object.values(G.CLINIC_AREAS).reduce((a, b) => a + b, 0) === 872,
  `got ${Object.values(G.CLINIC_AREAS).reduce((a, b) => a + b, 0)}`);

/* ---- per-project PDF content --------------------------------------------
 *
 * The 9MC offer once printed EMC's description, EMC's renders and a map of New
 * Cairo — the wrong city — because that content was hardcoded in pdf.js. It now
 * lives per project in config.js, so guard the thing that actually went wrong:
 * no live project may be missing its own content, and no two may share an asset.
 */
console.log('\nProject content');
const liveProjects = G.PROJECTS.filter((p) => p.live);
for (const p of liveProjects) {
  check(`${p.id}: has a location that isn't a placeholder`,
    !!p.location && p.location !== 'Eliwah Group', `got "${p.location}"`);
  check(`${p.id}: has its own project description`, !!(p.story && p.story.text));
  check(`${p.id}: description mentions the project or its city, not another's`,
    !!p.story && (p.story.text.includes(p.name) || p.story.text.includes(p.location.split(',')[0])
      || !liveProjects.some((q) => q.id !== p.id && p.story.text.includes(q.name))),
    p.story && p.story.text.slice(0, 60));
  check(`${p.id}: has key advantages`, !!(p.story && p.story.advantages && p.story.advantages.length));
  check(`${p.id}: has at least one render`, !!(p.story && p.story.renders && p.story.renders.length));
  check(`${p.id}: has a location map`, !!(p.place && p.place.map));
  check(`${p.id}: has a location heading`, !!(p.place && p.place.heading));
  check(`${p.id}: has contact details`, !!(p.contact && p.contact.web));
}

/* Every image path any project prints, checked for cross-project reuse. */
const assetsOf = (p) => [
  p.heroImage, p.planPrint, p.card, p.place && p.place.map,
  ...((p.story && p.story.renders) || []),
].filter(Boolean);

for (const p of liveProjects) {
  for (const q of liveProjects) {
    if (p.id >= q.id) continue;
    const shared = assetsOf(p).filter((a) => assetsOf(q).includes(a));
    check(`${p.id} and ${q.id} share no images`, shared.length === 0, shared.join(', '));
  }
}

/* And every one of those files must exist, or the page silently prints
 * "unavailable" in front of a customer. */
for (const p of liveProjects) {
  for (const a of assetsOf(p)) {
    check(`${p.id}: ${a} exists`, fs.existsSync(path.join(__dirname, '..', a)));
  }
}

/* Brand artwork, built by scripts/make-brand.js. The PDF degrades to type if
 * these are missing, so the failure is quiet — check for it here instead. */
const BRAND_FILES = [
  'assets/logo-eliwah.png', 'assets/logo-eliwah-dark.png', 'assets/logo-mark.png',
  'assets/icons/icon-512.png', 'assets/icons/icon-192.png', 'assets/icons/icon-180.png',
  'site.webmanifest',
];
for (const f of BRAND_FILES) {
  check(`brand asset ${f} exists`, fs.existsSync(path.join(__dirname, '..', f)));
}

/* The service worker's precache list is a hand-written array of paths, so it
 * drifts the moment a file is renamed — and a wrong entry fails silently,
 * leaving the app with no offline support. Check every entry resolves, and that
 * the worker still refuses to touch anything off-origin. */
const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const shell = (/const SHELL = \[([^\]]+)\]/.exec(swSrc) || [, ''])[1]
  .split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
check('the service worker declares a shell to precache', shell.length > 5, `got ${shell.length}`);
for (const entry of shell) {
  if (entry === './') continue;
  check(`sw precaches a real file: ${entry}`, fs.existsSync(path.join(__dirname, '..', entry)));
}
check('the service worker never intercepts off-origin requests',
  /url\.origin !== self\.location\.origin\) return;/.test(swSrc));
check('every script index.html loads is in the service worker shell',
  (fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
    .match(/<script src="([^"]+)"/g) || [])
    .map((s) => /"([^"]+)"/.exec(s)[1])
    .every((src) => shell.includes(src)));
/* A logo the cover crop would slice in half is worse than no logo. The card
 * render has Eliwah's own branding baked into its corners, so it must not be
 * reused as the PDF hero, which gets cropped to a 2.28 aspect. */
for (const p of liveProjects) {
  check(`${p.id}: PDF hero is not the branded card render`,
    p.heroImage !== p.card || !/projects\//.test(String(p.card)),
    `hero and card are both ${p.heroImage}`);
}

/* ---- handover: can operations open a floor without a developer? ----------
 *
 * The whole point of the live sheet is that adding a row is enough. That only
 * holds if the floor is declared with a drawing and the clinic number exists in
 * the pin registry, so assert both for every floor the codes can reach. */
console.log('\nFloors operations can open unaided');
const ORDINALS = ['ground', 'first', 'second', 'third', 'fourth', 'fifth',
  'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

for (const p of liveProjects) {
  const plan = G.PLANS[p.planKey];
  const rooms = Object.keys(plan.pins).map(Number);
  const clinicFloors = p.floors.filter((f) => f.use === 'Medical');

  check(`${p.id}: every medical floor has a drawing`,
    clinicFloors.every((f) => !!f.plan),
    clinicFloors.filter((f) => !f.plan).map((f) => f.key).join(', ') || '');
  check(`${p.id}: every floor key is a known ordinal`,
    p.floors.every((f) => ORDINALS.includes(f.key.toLowerCase())),
    p.floors.filter((f) => !ORDINALS.includes(f.key.toLowerCase())).map((f) => f.key).join(', '));
  check(`${p.id}: floor keys are unique`,
    new Set(p.floors.map((f) => f.key)).size === p.floors.length);

  /* A unit code carries its own floor digit, so simulate a row on each declared
   * floor for the first and last room and confirm it comes out sellable. */
  const prefix = p.id === 'emc' ? 'C' : 'MC';
  const HDR = 'PROJECT,Type,Floor,Unit Code,Indoor area,Indoor meter price,Total unit price,Status\n';
  for (const f of clinicFloors) {
    const digit = ORDINALS.indexOf(f.key.toLowerCase());
    for (const room of [Math.min(...rooms), Math.max(...rooms)]) {
      const code = `${prefix}${digit}${String(room).padStart(2, '0')}`;
      const area = plan.areas[room];
      const csv = `${HDR}X,CLINIC,${f.key},${code},${area},"80,000.00","${area * 80000}",Available`;
      const { units: u } = G.normalizeRows(G.parseCSV(csv), plan.areas);
      check(`${p.id}: a new row for ${code} (${f.label}) becomes sellable`,
        u.length === 1 && u[0].state === 'available' && u[0].floor === digit && !!plan.pins[u[0].clinic],
        u.length ? `state=${u[0].state} floor=${u[0].floor} pin=${!!plan.pins[u[0].clinic]}` : 'skipped');
    }
  }
  console.log(`  ${p.id}: ${clinicFloors.length} clinic floor(s) ` +
    `(${clinicFloors.map((f) => f.key).join(', ')}) x ${rooms.length} rooms`);
}

/* A shared drawing must have its printed floor name covered, or a second-floor
 * clinic ships on paper that says third. */
for (const p of liveProjects) {
  const plan = G.PLANS[p.planKey];
  const shared = p.floors.filter((f) => f.use === 'Medical' && f.plan).map((f) => f.plan);
  const reused = new Set(shared).size < shared.length;
  if (!reused) continue;
  check(`${p.id}: reuses one drawing across floors, so it must patch the printed floor name`,
    plan.floorLabel === null || (plan.floorLabel && plan.floorLabel.w > 0),
    'floorLabel is not declared');
}
check('EMC patches the "3ND" printed on its shared drawing', !!G.PLANS.emc.floorLabel);
check('9MC needs no patch — its drawing prints no floor name', G.PLANS.mc9.floorLabel === null);
check('Second -> 2ND', G.floorOrdinal('Second') === '2ND');
check('Third -> 3RD', G.floorOrdinal('Third') === '3RD');
check('Ninth -> 9TH', G.floorOrdinal('Ninth') === '9TH');

/* ---- sheet parsing ------------------------------------------------------ */
console.log('\nSheet parsing');
const snapshotRows = G.parseCSV(G.SNAPSHOTS.emc.csv);
const { units, warnings } = G.normalizeRows(snapshotRows, G.CLINIC_AREAS);
// Compare against the CSV itself rather than a hardcoded count, so the suite
// doesn't break every time the ops team adds or sells a unit.
check('every data row parsed into a unit', units.length === snapshotRows.length - 1,
  `${units.length} units from ${snapshotRows.length - 1} rows`);
check('no parser warnings', warnings.length === 0, warnings.join(' | '));
check('all units are floor 3', units.every((u) => u.floor === 3));
check('every unit has a known state',
  units.every((u) => ['available', 'reserved', 'sold'].includes(u.state)));
const mix = units.reduce((m, u) => ({ ...m, [u.state]: (m[u.state] || 0) + 1 }), {});
console.log(`  snapshot mix: ${Object.entries(mix).map(([k, v]) => `${v} ${k}`).join(', ')}`);
check('C313 -> clinic 13', G.parseUnitCode('C313').clinic === 13);
check('C301 -> clinic 1', G.parseUnitCode('C301').clinic === 1);
check('C234 -> floor 2, clinic 34', G.parseUnitCode('C234').floor === 2 && G.parseUnitCode('C234').clinic === 34);
check('junk code rejected', G.parseUnitCode('HELLO') === null);
check('"125,000.00" -> 125000', G.parseNumber('125,000.00') === 125000);
check('area matches the drawing for every unit',
  units.every((u) => u.area === G.CLINIC_AREAS[u.clinic]),
  units.filter((u) => u.area !== G.CLINIC_AREAS[u.clinic]).map((u) => u.code).join(','));
check('price = area x meter price for every unit',
  units.every((u) => Math.abs(u.area * u.meterPrice - u.price) < 1));

/* 9MC parses against its own building, and the area cross-check earns its keep.
 *
 * Deliberately parsed with EMC active, i.e. with no hold list applied, so this
 * exercises the raw sheet-vs-drawing check. The block below re-parses under
 * 9MC's own config, where MC922 is held and the warning is suppressed instead. */
G.setProject('emc');
console.log('\n9MC sheet (no hold list applied)');
const mc9 = G.PLANS.mc9;
const mc9Rows = G.parseCSV(G.SNAPSHOTS.mc9.csv);
const r9 = G.normalizeRows(mc9Rows, mc9.areas);
check('9MC rows all parsed', r9.units.length === mc9Rows.length - 1,
  `${r9.units.length} of ${mc9Rows.length - 1}`);
check('9MC codes resolve to floor 9', r9.units.every((u) => u.floor === 9));
check('MC915 -> floor 9, clinic 15',
  G.parseUnitCode('MC915').clinic === 15 && G.parseUnitCode('MC915').floor === 9);
check('9MC prices foot to area x meter price',
  r9.units.every((u) => Math.abs(u.area * u.meterPrice - u.price) < 1));
check('every 9MC clinic number exists on the plan',
  r9.units.every((u) => mc9.pins[u.clinic]),
  r9.units.filter((u) => !mc9.pins[u.clinic]).map((u) => u.code).join(','));
console.log(`  9MC warnings: ${r9.warnings.length ? r9.warnings.join(' | ') : 'none'}`);

/* The sheet-versus-drawing area check.
 *
 * This used to assert against MC922, which really did disagree with the drawing.
 * Operations then withdrew that unit and the test started failing for the wrong
 * reason — a green suite is not supposed to depend on one unit staying broken.
 * Driven by a synthetic row instead, so it keeps testing the checker itself. */
{
  const HDR = 'PROJECT,Type,Floor,Unit Code,Indoor area,Indoor meter price,Total unit price,Status\n';
  const drawn = G.PLANS.mc9.areas[15];                    // clinic 15 per the drawing
  const wrong = drawn + 4;
  const bad = G.normalizeRows(G.parseCSV(
    `${HDR}9MC,CLINIC,Nineth,MC915,${wrong},"80,000.00","${wrong * 80000}",Available`), G.PLANS.mc9.areas);
  check('an area that disagrees with the drawing is reported',
    bad.warnings.some((w) => w.includes('MC915') && w.includes(String(drawn))),
    bad.warnings.join(' | ') || 'no warnings raised');
  const ok = G.normalizeRows(G.parseCSV(
    `${HDR}9MC,CLINIC,Nineth,MC915,${drawn},"80,000.00","${drawn * 80000}",Available`), G.PLANS.mc9.areas);
  check('an area that matches the drawing is not reported', ok.warnings.length === 0,
    ok.warnings.join(' | '));
  // And the arithmetic cross-foot: area x meter price must equal the total.
  const off = G.normalizeRows(G.parseCSV(
    `${HDR}9MC,CLINIC,Nineth,MC915,${drawn},"80,000.00","999,999.00",Available`), G.PLANS.mc9.areas);
  check('a total that does not foot to area x meter price is reported',
    off.warnings.some((w) => w.includes('≠')), off.warnings.join(' | ') || 'no warnings raised');
}

/* ---- 9MC payment plans, held units and calendar dates ------------------- */
console.log('\n9MC payment plans');
G.setProject('mc9');
const C9 = G.cfg();
const r9b = G.normalizeRows(G.parseCSV(G.SNAPSHOTS.mc9.csv), G.PLANS.mc9.areas);
const u9 = r9b.units.find((u) => u.code === 'MC924');   // 80 m², 6,400,000
const CONTRACT = new Date(2026, 7, 11);                 // 11 Aug 2026

check('no 9MC unit is on hold', r9b.units.filter((u) => u.state === 'held').length === 0);
check('no unit override is in force', Object.keys(C9.unitOverrides || {}).length === 0,
  `still overriding ${Object.keys(C9.unitOverrides || {}).join(', ')}`);

/* The override mechanism itself still has to work — the next disagreement
 * between a sheet and a drawing will use it. Exercised synthetically rather than
 * against a real unit, so retiring an override never silently retires the test. */
{
  const HDR = 'PROJECT,Type,Floor,Unit Code,Indoor area,Indoor meter price,Total unit price,Status\n';
  const saved = C9.unitOverrides;
  C9.unitOverrides = { MC930: { area: 20, reason: 'drawing wins' } };
  const { units: ov, warnings: ovw } = G.normalizeRows(
    G.parseCSV(`${HDR}9MC,CLINIC,Nineth,MC930,25,"80,000.00","2,000,000.00",Available`), G.PLANS.mc9.areas);
  check('an override replaces the sheet area', ov[0].area === 20, `got ${ov[0].area}`);
  check('an override re-derives the meter price so the offer foots',
    Math.abs(ov[0].area * ov[0].meterPrice - ov[0].price) < 1);
  check('an override leaves the total price alone', ov[0].price === 2000000);
  check('an override is reported to the agent', ovw.some((w) => w.includes('MC930')));
  C9.unitOverrides = saved;
}

check('9MC delivers in 3.5 years', C9.deliveryMonths === 42, `got ${C9.deliveryMonths}`);
check('9MC maintenance falls one year before delivery',
  C9.maintenanceDueMonth === C9.deliveryMonths - 12, `${C9.maintenanceDueMonth} vs ${C9.deliveryMonths - 12}`);

const expected = { dp7: [0.07, 7], dp10: [0.10, 8], dp15: [0.15, 9], dp20: [0.20, 10] };
// Cash has no down payment or term, so it is checked separately below.
for (const plan of C9.plans.filter((p) => !p.cash)) {
  const [pct, years] = expected[plan.id];
  const { rows, summary } = G.buildSchedule(u9, plan, CONTRACT);
  const inst = rows.filter((r) => r.instalment);
  const down = rows.filter((r) => r.down);

  check(`${plan.id}: ${pct * 100}% down`, summary.downPayment === Math.round(u9.price * pct));
  check(`${plan.id}: ${years * 4} quarterly instalments`, inst.length === years * 4, `got ${inst.length}`);
  check(`${plan.id}: down + instalments = price`,
    summary.downPayment + inst.reduce((s, r) => s + r.amount, 0) === u9.price);
  check(`${plan.id}: rows sum to total payable`,
    G.scheduleTotal(rows) === summary.totalPayable);

  // Dates: contract, then every 3 months.
  check(`${plan.id}: first payment is on the contract date`,
    rows[0].date.getTime() === CONTRACT.getTime());
  check(`${plan.id}: instalments fall every 3 months from contract`,
    inst.every((r, i) => r.date.getTime() === G.addMonths(CONTRACT, (i + 1) * 3).getTime()));
  check(`${plan.id}: maintenance at month 30`,
    rows.some((r) => r.month === 30 && r.label.startsWith('Maintenance')));

  if (plan.id === 'dp20') {
    check('dp20: down payment comes in two parts', down.length === 2, `got ${down.length}`);
    check('dp20: 10% on contract', down[0].amount === Math.round(u9.price * 0.10));
    check('dp20: 10% one year later', down[1].amount === Math.round(u9.price * 0.10));
    check('dp20: second part is dated exactly one year on',
      down[1].date.getTime() === G.addMonths(CONTRACT, 12).getTime());
  } else {
    check(`${plan.id}: single down payment`, down.length === 1);
  }
}

/* Cash, both projects. The rates differ per project and are money on the
 * customer's PDF, so they are pinned here deliberately — if someone edits
 * config.js, this is the test that should stop them. */
console.log('\nCash plans');
const CASH_RATES = { emc: 0.25, mc9: 0.30 };
for (const [id, rate] of Object.entries(CASH_RATES)) {
  const proj = G.PROJECTS.find((p) => p.id === id);
  const cash = proj.plans.find((p) => p.cash);
  check(`${id}: has a cash option`, !!cash);
  check(`${id}: cash discount is ${rate * 100}%`, cash && cash.discount === rate,
    cash ? `got ${cash.discount * 100}%` : 'no cash plan');
}
{
  G.setProject('mc9');
  const cash9 = G.cfg().plans.find((p) => p.cash);
  const { rows, summary } = G.buildSchedule(u9, cash9, CONTRACT);
  check('9MC cash: price is 70% of list',
    summary.netPrice === Math.round(u9.price * 0.70), `got ${summary.netPrice}`);
  check('9MC cash: saving is 30% of list',
    summary.discount === Math.round(u9.price * 0.30));
  check('9MC cash: maintenance is on the ORIGINAL price, not the discounted one',
    summary.maintenance === Math.round(u9.price * G.cfg().maintenanceRate));
  check('9MC cash: just the payment and the maintenance', rows.length === 2, `got ${rows.length} rows`);
  check('9MC cash: rows sum to total payable', G.scheduleTotal(rows) === summary.totalPayable);
  check('9MC cash: maintenance still falls at month 30',
    rows.some((r) => r.month === 30 && r.label.startsWith('Maintenance')));
  console.log(`  9MC cash on ${u9.code}: ${summary.netPrice.toLocaleString()} `
    + `(saves ${summary.discount.toLocaleString()}) + ${summary.maintenance.toLocaleString()} maintenance`);
  G.setProject('emc');
}

console.log('\nDate handling');
check('month-end clamps (31 Jan + 1 month -> 28 Feb 2027)',
  G.addMonths(new Date(2027, 0, 31), 1).getTime() === new Date(2027, 1, 28).getTime());
check('leap year (31 Jan + 1 month -> 29 Feb 2028)',
  G.addMonths(new Date(2028, 0, 31), 1).getTime() === new Date(2028, 1, 29).getTime());
check('30 Nov + 3 months -> 28 Feb',
  G.addMonths(new Date(2026, 10, 30), 3).getTime() === new Date(2027, 1, 28).getTime());
check('quarterly steps stay on the same day of month',
  G.addMonths(new Date(2026, 7, 11), 3).getDate() === 11);

G.setProject('emc');   // leave the harness on EMC for anything after this

/* fail-closed behaviour */
const hdr = 'PROJECT,Type,Floor,Unit Code,Indoor area,Indoor meter price,Total unit price,Status\n';
const one = (status) => G.normalizeRows(G.parseCSV(hdr + `EMC,CLINIC,Third,C313,27,"125,000.00","3,375,000.00",${status}`), G.CLINIC_AREAS).units[0];
console.log('\nStatus handling');
check('"Available" -> available', one('Available').state === 'available');
check('" available " -> available', one('" available "').state === 'available');
check('"AVAILABLE" -> available', one('AVAILABLE').state === 'available');
check('"Sold" -> sold', one('Sold').state === 'sold');
check('"Reserved" -> reserved', one('Reserved').state === 'reserved');
check('unknown status is NOT available', one('Whatever').state === 'sold');
check('blank status is NOT available', one('').state === 'sold');

/* ---- payment maths ------------------------------------------------------ */
console.log('\nPayment schedules');
for (const unit of units) {
  for (const plan of G.CONFIG.plans) {
    const { rows, summary } = G.buildSchedule(unit, plan);
    const total = G.scheduleTotal(rows);
    check(`${unit.code} / ${plan.id}: rows sum to total payable`,
      total === summary.totalPayable, `${total} vs ${summary.totalPayable}`);
    check(`${unit.code} / ${plan.id}: no negative or zero payments`,
      rows.every((r) => r.amount > 0));

    if (plan.cash) {
      // Read the rate from the plan rather than pinning a number here: the
      // discount is a commercial term that changes, and a test that hardcodes it
      // fails for the wrong reason when it does.
      check(`${unit.code} / cash: ${plan.discount * 100}% off`,
        summary.netPrice === Math.round(unit.price * (1 - plan.discount)),
        `${summary.netPrice} vs ${Math.round(unit.price * (1 - plan.discount))}`);
      check(`${unit.code} / cash: maintenance on ORIGINAL price`,
        summary.maintenance === Math.round(unit.price * 0.10));
    } else {
      const instalments = rows.filter((r) => r.instalment);
      check(`${unit.code} / ${plan.id}: ${plan.years * 4} quarterly instalments`,
        instalments.length === plan.years * 4, `got ${instalments.length}`);
      check(`${unit.code} / ${plan.id}: down + instalments = price`,
        summary.downPayment + instalments.reduce((s, r) => s + r.amount, 0) === unit.price);
      check(`${unit.code} / ${plan.id}: last instalment absorbs rounding`,
        Math.abs(instalments.at(-1).amount - summary.instalmentAmount) < instalments.length);
      check(`${unit.code} / ${plan.id}: instalments every 3 months`,
        instalments.every((r, i) => r.month === (i + 1) * 3));
    }
    check(`${unit.code} / ${plan.id}: maintenance at month 18`,
      rows.some((r) => r.month === 18 && r.label.startsWith('Maintenance')));
  }
}

/* worked example, printed so it can be eyeballed against a real offer */
const sample = units.find((u) => u.code === 'C313');
const plan = G.CONFIG.plans.find((p) => p.id === 'dp10');
const { summary } = G.buildSchedule(sample, plan);
console.log(`\nWorked example — C313, ${plan.label}`);
console.log(`  unit price      ${summary.originalPrice.toLocaleString()}`);
console.log(`  down payment    ${summary.downPayment.toLocaleString()}  (10%)`);
console.log(`  ${summary.instalmentCount} quarterly x  ${summary.instalmentAmount.toLocaleString()}  over ${summary.years} years`);
console.log(`  maintenance     ${summary.maintenance.toLocaleString()}  (10%, month 18)`);
console.log(`  total payable   ${summary.totalPayable.toLocaleString()}`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
