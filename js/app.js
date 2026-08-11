/* UI wiring: floor -> clinic -> payment plan -> PDF. */

const state = {
  projectId: null,
  units: [],
  live: false,
  fetchedAt: null,
  warnings: [],
  errors: [],
  floorKey: null,
  unit: null,
  planId: CONFIG.plans[0] ? CONFIG.plans[0].id : null,
  sortBy: 'clinic',
  contractDate: new Date(),   // proposal date: every due date is derived from it
};

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const FLOOR_ORDINALS = ['ground', 'first', 'second', 'third', 'fourth', 'fifth',
  'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const floorNumber = (key) => {
  const i = FLOOR_ORDINALS.indexOf(String(key).toLowerCase());
  return i === -1 ? NaN : i;
};
/** Geometry for the active project's building. */
const activePlan = () => PLANS[CONFIG.planKey];

/** A floor is live if the config says so OR the sheet has rows for it.
 * The sheet wins, so releasing a new floor needs no code change. */
function unitsOnFloor(key) {
  return state.units.filter((u) => u.floor === floorNumber(key));
}
function isReleased(floor) {
  return floor.released || unitsOnFloor(floor.key).length > 0;
}

/* ---------------- sync bar ---------------- */
function renderSync() {
  const bar = $('sync'), text = $('syncText');
  bar.classList.remove('stale', 'err');

  if (state.live) {
    const t = state.fetchedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    text.textContent = `Live inventory · updated ${t}`;
  } else if (state.units.length) {
    bar.classList.add('stale');
    const d = state.fetchedAt ? state.fetchedAt.toLocaleDateString() : 'unknown date';
    text.textContent = `Offline — showing saved data from ${d}`;
  } else {
    bar.classList.add('err');
    text.textContent = 'Could not load inventory';
  }
  $('refresh').disabled = false;
}

function renderWarnings() {
  const box = $('warnings');
  const msgs = [...state.warnings];
  if (!state.live && state.units.length) {
    msgs.unshift('Could not reach the live inventory sheet, so these prices may be out of date. Check availability before issuing an offer.');
  }
  if (!msgs.length) { box.classList.add('hidden'); return; }

  box.innerHTML = '';
  box.appendChild(el('strong', null, msgs.length === 1 ? 'Please note' : `${msgs.length} things to check`));
  const ul = el('ul');
  msgs.forEach((m) => ul.appendChild(el('li', null, m)));
  box.appendChild(ul);
  box.classList.remove('hidden');
}

/* ---------------- step 1: projects ---------------- */
function renderProjects() {
  const box = $('projects');
  box.innerHTML = '';

  for (const p of PROJECTS) {
    const btn = el('button', 'project' + (p.live ? '' : ' locked') + (state.projectId === p.id ? ' on' : ''));

    const imgBox = el('div', 'project-img');
    if (p.card) {
      const img = el('img');
      img.src = p.card;
      img.alt = p.name;
      imgBox.appendChild(img);
    } else {
      // No render supplied yet — show the name on the brand gradient instead of
      // a broken image.
      imgBox.appendChild(el('div', 'ph', p.name));
    }
    imgBox.appendChild(el('span', 'stamp', p.live ? 'Live inventory' : 'Coming soon'));
    btn.appendChild(imgBox);

    const body = el('div', 'project-body');
    body.appendChild(el('div', 'project-name', p.name));
    body.appendChild(el('div', 'project-sub', `${p.subtitle} · ${p.location}`));
    body.appendChild(el('div', 'project-blurb', p.live ? p.blurb : (p.note || p.blurb)));
    btn.appendChild(body);

    if (p.live) btn.onclick = () => selectProject(p.id);
    else btn.disabled = true;
    box.appendChild(btn);
  }
}

async function selectProject(id) {
  if (state.projectId === id) return;
  state.projectId = id;
  state.floorKey = null;
  state.unit = null;
  setProject(id);
  state.planId = CONFIG.plans[0] ? CONFIG.plans[0].id : null;

  $('planStep').classList.add('hidden');
  $('detailStep').classList.add('hidden');
  $('floorStep').classList.remove('hidden');
  $('floorHint').textContent = CONFIG.floors.some((f) => f.use === 'Retail')
    ? 'Ground & First are retail; Second & Third are medical.' : '';

  $('headTitle').textContent = `${CONFIG.name} — Offer Generator`;
  $('headSub').textContent = `${CONFIG.subtitle} · ${CONFIG.location}`;

  renderProjects();
  await load();                       // pull this project's inventory
  $('floorStep').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- step 2: floors ---------------- */
function renderFloors() {
  const box = $('floors');
  box.innerHTML = '';

  for (const floor of CONFIG.floors) {
    const units = unitsOnFloor(floor.key);
    const open = units.filter((u) => u.state === 'available').length;
    const released = isReleased(floor);
    const usable = released && floor.plan && units.length > 0;

    const btn = el('button', 'floor' + (usable ? '' : ' locked') + (state.floorKey === floor.key ? ' on' : ''));
    btn.appendChild(el('div', 'floor-use', floor.use));
    btn.appendChild(el('div', 'floor-name', floor.label));

    if (!released) {
      btn.appendChild(el('span', 'pill soon', 'Coming soon'));
    } else if (!floor.plan) {
      btn.appendChild(el('span', 'pill soon', 'Plan not available yet'));
    } else if (open > 0) {
      btn.appendChild(el('span', 'pill ok', `${open} clinic${open === 1 ? '' : 's'} available`));
    } else {
      btn.appendChild(el('span', 'pill soon', 'Fully sold'));
    }

    if (usable) btn.onclick = () => selectFloor(floor.key);
    else btn.disabled = true;
    box.appendChild(btn);
  }
}

function selectFloor(key) {
  state.floorKey = key;
  state.unit = null;
  renderFloors();
  renderPlan();
  renderUnits();
  $('planStep').classList.remove('hidden');
  $('detailStep').classList.add('hidden');
  $('planStep').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- step 2: plan + list ---------------- */
function renderPlan() {
  const floor = CONFIG.floors.find((f) => f.key === state.floorKey);
  $('planImg').src = floor.plan;
  $('planImg').alt = `${floor.label} plan`;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const P = activePlan();
  const svg = $('planSvg');
  svg.setAttribute('viewBox', `0 0 ${P.refW} ${P.refH}`);
  svg.innerHTML = '';
  pinEls.clear();
  hidePop();
  const byClinic = new Map(unitsOnFloor(state.floorKey).map((u) => [u.clinic, u]));

  // Pins, not outlined rooms — see the note in js/plan.js. Drawn in state order
  // so available pins sit above the greyed ones and never get overlapped.
  const order = { unreleased: 0, sold: 1, held: 1, reserved: 2, available: 3 };
  const entries = Object.entries(P.pins)
    .map(([n, pin]) => ({ n: Number(n), pin, unit: byClinic.get(Number(n)) }))
    .map((e) => ({ ...e, cls: e.unit ? e.unit.state : 'unreleased' }))
    .sort((a, b) => order[a.cls] - order[b.cls]);

  for (const { n, pin, unit, cls } of entries) {
    const selected = state.unit && state.unit.clinic === n;
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', pin.x);
    c.setAttribute('cy', pin.y);
    c.setAttribute('r', selected ? P.pinRsel : P.pinR);
    c.setAttribute('class', 'pin ' + cls + (selected ? ' on' : ''));

    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = unit
      ? `${unit.code} · Clinic ${n} · ${unit.area} m² · ${unit.state === 'available' ? fmtMoney(unit.price) : (unit.heldReason ? 'On hold' : unit.status)}`
      : `Clinic ${n} · ${P.areas[n]} m² · Not released`;
    c.appendChild(title);

    pinEls.set(n, c);
    if (unit) {
      c.addEventListener('mouseenter', () => showPop(unit, pin));
      c.addEventListener('mouseleave', schedulePopHide);
      if (unit.state === 'available') c.onclick = () => selectUnit(unit);
    }
    svg.appendChild(c);
  }
}

/* ---- hover card on a pin ----
 * The list alone made the agent read a code and then hunt for it on the plan.
 * Hovering a room now shows what it is and costs, with one click to take it. */
const pinEls = new Map();
let popTimer = null;

function showPop(unit, pin) {
  clearTimeout(popTimer);
  const pop = $('pop');
  pop.innerHTML = '';

  pop.appendChild(el('div', 'pop-code', unit.code));
  pop.appendChild(el('div', 'pop-sub', `Clinic ${unit.clinic} · ${unit.type}`));

  const rows = el('div', 'pop-rows');
  const row = (k, v) => {
    const r = el('div', 'pop-row');
    r.appendChild(el('span', null, k));
    r.appendChild(el('b', null, v));
    rows.appendChild(r);
  };
  row('Area', `${unit.area} m²`);
  if (unit.meterPrice) row('Price / m²', fmt(unit.meterPrice));
  pop.appendChild(rows);

  if (unit.state === 'available') {
    pop.appendChild(el('div', 'pop-price', fmtMoney(unit.price)));
    const btn = el('button', null, 'Select this clinic');
    btn.onclick = () => { hidePop(); selectUnit(unit); };
    pop.appendChild(btn);
  } else {
    const label = unit.state === 'reserved' ? 'Reserved' : unit.state === 'held' ? 'On hold' : 'Sold';
    pop.appendChild(el('div', 'state', label));
    if (unit.heldReason) pop.appendChild(el('div', 'pop-sub', unit.heldReason));
  }

  const P = activePlan();
  const top = pin.y / P.refH;
  pop.style.left = `${(pin.x / P.refW) * 100}%`;
  pop.style.top = `${top * 100}%`;
  pop.classList.toggle('below', top < 0.32);   // flip under the pin near the top edge
  pop.classList.add('show');
}

function schedulePopHide() {
  clearTimeout(popTimer);
  popTimer = setTimeout(hidePop, 220);
}
function hidePop() {
  clearTimeout(popTimer);
  $('pop').classList.remove('show');
}
$('pop').addEventListener('mouseenter', () => clearTimeout(popTimer));
$('pop').addEventListener('mouseleave', schedulePopHide);

/** Ring the matching pin while the agent scans the list. */
function highlightPin(clinic, on) {
  const c = pinEls.get(clinic);
  if (c && !c.classList.contains('on')) c.classList.toggle('hl', on);
}

const SORTS = {
  clinic:    (a, b) => a.clinic - b.clinic,
  price:     (a, b) => a.price - b.price,
  priceDesc: (a, b) => b.price - a.price,
  area:      (a, b) => a.area - b.area || a.clinic - b.clinic,
  areaDesc:  (a, b) => b.area - a.area || a.clinic - b.clinic,
};

function renderUnits() {
  const box = $('units');
  box.innerHTML = '';
  const units = unitsOnFloor(state.floorKey)
    .filter((u) => u.state === 'available')
    .sort(SORTS[state.sortBy] || SORTS.clinic);

  const onFloor = unitsOnFloor(state.floorKey).length;
  $('unitsCount').textContent = units.length
    ? `${units.length} available${onFloor > units.length ? ` of ${onFloor}` : ''}`
    : 'None available';

  if (!units.length) {
    box.appendChild(el('div', 'empty', 'No clinics currently available on this floor.'));
    return;
  }

  for (const u of units) {
    const btn = el('button', 'unit' + (state.unit && state.unit.code === u.code ? ' on' : ''));
    const left = el('div');
    left.appendChild(el('div', 'unit-code', u.code));
    left.appendChild(el('div', 'unit-sub',
      `Clinic ${u.clinic} · ${u.area} m²${u.meterPrice ? ` · ${fmt(u.meterPrice)}/m²` : ''}`));
    btn.appendChild(left);
    btn.appendChild(el('div', 'unit-price', fmtMoney(u.price)));
    btn.onclick = () => selectUnit(u);
    // Scanning the list rings the matching pin, so the agent never has to hunt
    // for a code on the drawing.
    btn.addEventListener('mouseenter', () => highlightPin(u.clinic, true));
    btn.addEventListener('mouseleave', () => highlightPin(u.clinic, false));
    box.appendChild(btn);
  }
}

function selectUnit(unit) {
  state.unit = unit;
  renderPlan();
  renderUnits();
  renderDetail();
  $('detailStep').classList.remove('hidden');
  $('detailStep').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- step 3: plan + schedule ---------------- */
function renderDetail() {
  const u = state.unit;
  const top = $('detailTop');
  top.innerHTML = '';
  const kv = (label, value, brand) => {
    const d = el('div');
    d.appendChild(el('div', 'kv-label', label));
    d.appendChild(el('div', 'kv-value' + (brand ? ' brand' : ''), value));
    top.appendChild(d);
  };
  kv('Unit', u.code);
  kv('Clinic', `No. ${u.clinic}`);
  kv('Floor', CONFIG.floors.find((f) => f.key === state.floorKey).label);
  kv('Area', `${u.area} m²`);
  kv('Price per m²', u.meterPrice ? fmtMoney(u.meterPrice) : '—');
  kv('Unit price', fmtMoney(u.price), true);

  const box = $('plans');
  box.innerHTML = '';

  // A project whose payment terms haven't been supplied can still be browsed —
  // inventory, plan and prices are all live — but it must not produce an offer,
  // because the only numbers available would be another project's.
  if (!CONFIG.plans.length) {
    const note = el('div', 'banner');
    note.style.margin = '0';
    note.textContent = CONFIG.plansNote || 'Payment plans have not been supplied for this project yet.';
    box.appendChild(note);
    $('sched').innerHTML = '';
    $('download').classList.add('hidden');
    $('share').classList.add('hidden');
    $('downloadNote').textContent = '';
    return;
  }
  $('download').classList.remove('hidden');
  if (SHARE_FILES) $('share').classList.remove('hidden');

  for (const p of CONFIG.plans) {
    const btn = el('button', 'planbtn' + (state.planId === p.id ? ' on' : ''));
    btn.appendChild(el('b', null, p.label));
    btn.appendChild(el('span', null, p.cash ? `${pctLabel(p.discount)} discount` : `Rest over ${p.years} years, quarterly`));
    btn.onclick = () => { state.planId = p.id; renderDetail(); };
    box.appendChild(btn);
  }

  renderSchedule();
  $('downloadNote').textContent = `${u.code} · ${CONFIG.plans.find((p) => p.id === state.planId).label}`;
}

/** The four headline numbers above the schedule — what the customer asks first. */
function renderScheduleCards(plan, summary) {
  const box = $('schedCards');
  box.innerHTML = '';

  const cards = plan.cash
    ? [['Cash price', fmt(summary.netPrice), `after ${pctLabel(plan.discount)} discount`],
       ['You save', fmt(summary.discount), `off ${fmt(summary.originalPrice)} ${CONFIG.currency}`],
       ['Maintenance', fmt(summary.maintenance), `${pctLabel(CONFIG.maintenanceRate)} of the unit price`],
       ['Total payable', fmt(summary.totalPayable), CONFIG.currency, true]]
    : [['Contract price', fmt(summary.netPrice), `${state.unit.area} m² clinic`],
       ['Down payment', fmt(summary.downPayment),
        summary.downParts && summary.downParts.length > 1
          ? `${pctLabel(summary.downPct)} in ${summary.downParts.length} parts`
          : `${pctLabel(summary.downPct)} on contract`],
       ['Quarterly instalment', fmt(summary.instalmentAmount),
        `${summary.instalmentCount} payments over ${summary.years} years`],
       ['Total payable', fmt(summary.totalPayable),
        `including ${pctLabel(CONFIG.maintenanceRate)} maintenance`, true]];

  for (const [label, value, sub, strong] of cards) {
    const c = el('div', 'sched-card' + (strong ? ' strong' : ''));
    c.appendChild(el('div', 'sched-card-label', label));
    c.appendChild(el('div', 'sched-card-value', value));
    c.appendChild(el('div', 'sched-card-sub', sub));
    box.appendChild(c);
  }
}

function renderSchedule() {
  const plan = CONFIG.plans.find((p) => p.id === state.planId);
  const { rows, summary } = buildSchedule(state.unit, plan, state.contractDate);
  renderScheduleCards(plan, summary);

  const t = $('sched');
  t.innerHTML = '';
  $('schedNote').textContent =
    `Dates run from the contract date, ${fmtDate(summary.contractDate)} — the day this proposal is made. `
    + `Delivery ${CONFIG.deliveryMonths / 12} years from contract. `
    + `Percentages are of the ${fmt(summary.originalPrice)} ${CONFIG.currency} unit price.`;

  const thead = el('thead');
  const hr = el('tr');
  for (const [label, cls] of [['Year'], ['Installment'], ['Date'], [`Amount (${CONFIG.currency})`, 'num'],
    ['%', 'num'], ['Yearly %', 'num']]) {
    hr.appendChild(el('th', cls, label));
  }
  thead.appendChild(hr);
  t.appendChild(thead);

  /* Year blocks. The Year and Yearly % cells span their block, which is what
   * turns a 43-row list into something a customer can read: the eye lands on
   * "Year 3 — 12.86%" rather than counting quarterly rows. */
  const tb = el('tbody');
  /* Percentages are of the ORIGINAL price, not the discounted one — on a cash
   * plan the discount and the maintenance are both quoted against list. */
  const blocks = scheduleByYear(rows, summary.originalPrice);

  for (const block of blocks) {
    block.rows.forEach((r, i) => {
      const tr = el('tr', r.down ? 'dp' : r.label.startsWith('Maintenance') ? 'maint' : null);
      if (i === 0) {
        const yr = el('td', 'yr', block.label);
        yr.rowSpan = block.rows.length;
        tr.appendChild(yr);
      }

      const first = el('td', null, r.label);
      if (r.note) first.appendChild(el('small', 'note', ` — ${r.note}`));
      tr.appendChild(first);
      /* Real calendar dates off the contract date, with the relative point
       * alongside. Both stay on one line: a 43-row schedule that wraps every
       * date onto two lines turns into a page of scrolling. */
      const due = el('td');
      due.appendChild(el('span', null, fmtDate(r.date)));
      due.appendChild(el('small', 'note', ` · ${r.when}`));
      tr.appendChild(due);

      tr.appendChild(el('td', 'num', fmt(r.amount)));
      tr.appendChild(el('td', 'num pct', fmtPct(r.pct)));

      if (i === 0) {
        const yp = el('td', 'num yr-pct', fmtPct(block.pct));
        yp.rowSpan = block.rows.length;
        tr.appendChild(yp);
      }
      tb.appendChild(tr);
    });
  }

  if (summary.discount) {
    const tr = el('tr');
    tr.appendChild(el('td', 'yr', '—'));
    tr.appendChild(el('td', null, 'Cash discount applied'));
    tr.appendChild(el('td', null, `${pctLabel(plan.discount)} off ${fmt(summary.originalPrice)}`));
    tr.appendChild(el('td', 'num', '−' + fmt(summary.discount)));
    tr.appendChild(el('td', 'num pct', ''));
    tr.appendChild(el('td', 'num', ''));
    tb.appendChild(tr);
  }

  const tr = el('tr', 'total');
  const label = el('td', null, 'Total payable');
  label.colSpan = 3;
  tr.appendChild(label);
  tr.appendChild(el('td', 'num', fmt(summary.totalPayable)));
  tr.appendChild(el('td', 'num pct', fmtPct((summary.totalPayable / summary.originalPrice) * 100)));
  tr.appendChild(el('td', 'num', ''));
  tb.appendChild(tr);

  t.appendChild(tb);
}

/* ---------------- boot ---------------- */
async function load() {
  $('refresh').disabled = true;
  $('syncText').textContent = 'Loading inventory…';

  const res = await loadInventory(activePlan().areas);
  Object.assign(state, res);

  // Keep the current selection only if it is still available in the new data.
  if (state.unit) {
    const again = state.units.find((u) => u.code === state.unit.code && u.state === 'available');
    state.unit = again || null;
    if (!again) $('detailStep').classList.add('hidden');
  }

  renderSync();
  renderWarnings();
  renderFloors();
  if (state.floorKey) { renderPlan(); renderUnits(); }
  if (state.unit) renderDetail();
  openFromHash();
}

/** Split "#mc9/MC924" or "#C313" into { projectId, code }. */
function parseHash() {
  const raw = decodeURIComponent(location.hash.replace('#', '')).trim();
  if (!raw) return {};
  const [a, b] = raw.split('/');
  const byId = (v) => PROJECTS.find((p) => p.live && p.id.toLowerCase() === String(v).toLowerCase());
  if (b !== undefined) return { project: byId(a), code: b.toUpperCase() };
  const asProject = byId(a);
  return asProject ? { project: asProject } : { code: a.toUpperCase() };
}

/** #mc9/MC924 opens straight to that unit, so an offer can be shared as a link. */
function openFromHash() {
  const { code } = parseHash();
  if (!code || (state.unit && state.unit.code === code)) return;
  const unit = state.units.find((u) => u.code === code && u.state === 'available');
  if (!unit) {
    // A shared link can outlive the unit — say so rather than silently doing
    // nothing, which reads as the link being broken.
    const known = state.units.find((u) => u.code === code);
    state.warnings = [known
      ? `${code} is no longer available (${known.status}). Pick another clinic below.`
      : `${code} is not in the current inventory. Pick a clinic below.`,
      ...state.warnings];
    renderWarnings();
    return;
  }
  const floor = CONFIG.floors.find((f) => floorNumber(f.key) === unit.floor);
  if (!floor || !floor.plan) return;
  state.floorKey = floor.key;
  renderFloors();
  renderPlan();
  renderUnits();
  selectUnit(unit);
  $('planStep').classList.remove('hidden');
  // Opening a shared link should show what was shared, not just move the map.
  showPop(unit, activePlan().pins[unit.clinic]);
}

window.addEventListener('hashchange', () => {
  if (state.projectId) openFromHash();
});

$('sortBy').onchange = (e) => { state.sortBy = e.target.value; renderUnits(); };
$('refresh').onclick = () => { if (state.projectId) load(); };

/* ---- issuing the offer ----
 * One code path, two destinations. `share: true` opens the system share sheet
 * with the PDF attached, which is how the offer reaches a customer's WhatsApp;
 * `share: false` always downloads. Both buttons are disabled while the export
 * runs, because building the PDF loads several full-size renders and a second
 * click would start a second build. */
const SHARE_FILES = typeof canShareFiles === 'function' && canShareFiles();

async function issueOffer(share) {
  const plan = CONFIG.plans.find((p) => p.id === state.planId);
  const floor = CONFIG.floors.find((f) => f.key === state.floorKey);
  const buttons = [$('share'), $('download')];
  const labels = buttons.map((b) => b.textContent);

  buttons.forEach((b) => { b.disabled = true; });
  (share ? $('share') : $('download')).textContent = 'Building PDF…';
  try {
    if (share) await deliverOffer(state.unit, plan, floor, state.contractDate);
    else {
      const { doc, filename } = await buildOfferPDF(state.unit, plan, floor, state.contractDate);
      doc.save(filename);
    }
  } catch (err) {
    alert('Could not build the PDF: ' + err.message);
  } finally {
    buttons.forEach((b, i) => { b.disabled = false; b.textContent = labels[i]; });
  }
}

if (SHARE_FILES) {
  $('share').classList.remove('hidden');
  // Sharing is the point on a phone, so it takes the primary button and
  // Download steps back to being the escape hatch.
  $('download').classList.add('ghost');
  $('download').textContent = 'Download instead';
}
$('share').onclick = () => issueOffer(true);
$('download').onclick = () => issueOffer(false);

/* ---------------- boot ---------------- */
renderProjects();
if (location.hash) {
  // Deep link — open the named project, or the first live one if the link is
  // just a unit code, so the hash can resolve against its inventory.
  const { project } = parseHash();
  const target = project || PROJECTS.find((p) => p.live);
  if (target) selectProject(target.id);
} else {
  $('syncText').textContent = 'Choose a project to load its inventory';
  $('refresh').disabled = true;
}
