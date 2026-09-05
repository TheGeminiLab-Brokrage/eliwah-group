/* UI wiring: floor -> clinic -> payment plan -> PDF. */

const state = {
  projectId: null,
  units: [],
  live: false,
  fetchedAt: null,
  warnings: [],
  errors: [],
  floorKey: null,
  /* The clinics in the offer being built. Usually one, but brokers sell two
   * adjacent clinics as a single larger suite, so this is a list and the offer
   * is built from combineUnits(). Always on one floor: it is cleared whenever
   * the floor or project changes. */
  picked: [],
  planId: CONFIG.plans[0] ? CONFIG.plans[0].id : null,
  sortBy: 'clinic',
  contractDate: new Date(),   // proposal date: every due date is derived from it
};

/** The single priced thing the schedule and the PDF are built from. */
const offerUnit = () => (state.picked.length ? combineUnits(state.picked) : null);
const isPicked = (u) => state.picked.some((p) => p.code === u.code);

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
  state.picked = [];
  setProject(id);
  state.planId = CONFIG.plans[0] ? CONFIG.plans[0].id : null;

  $('planStep').classList.add('hidden');
  $('detailStep').classList.add('hidden');
  $('floorStep').classList.remove('hidden');
  // Search by budget becomes available once there is a project to search in.
  $('budgetStep').classList.remove('hidden');
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
  // Clinics in one offer must be on one floor, so changing floor starts over
  // rather than silently carrying a selection the offer could not include.
  state.picked = [];
  renderFloors();
  renderPlan();
  renderUnits();
  renderPicked();
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

  /* Identical floors share one drawing, so the floor name printed on it is only
   * correct for one of them. Cover it and write the floor being viewed, so the
   * screen matches the PDF. */
  if (P.floorLabel) {
    const L = P.floorLabel;
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', L.x); bg.setAttribute('y', L.y);
    bg.setAttribute('width', L.w); bg.setAttribute('height', L.h);
    bg.setAttribute('fill', L.fill ? `rgb(${L.fill.join(',')})` : '#ffffff');
    svg.appendChild(bg);

    const line = (text, dy, size) => {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', L.x + L.w / 2);
      t.setAttribute('y', L.y + L.h * dy);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', size);
      t.setAttribute('fill', '#464646');
      t.setAttribute('font-family', 'Segoe UI, Helvetica, Arial, sans-serif');
      t.textContent = text;
      svg.appendChild(t);
    };
    line('MEDICAL FLOOR', 0.42, 27);
    line(floorOrdinal(floor.key), 0.88, 37);
  }

  const byClinic = new Map(unitsOnFloor(state.floorKey).map((u) => [u.clinic, u]));

  /* Rooms are drawn as their traced outlines where the geometry has been
   * verified, and as pins where it hasn't. Outlines are what let a customer see
   * that two clinics adjoin, which is the point of a combined offer; a pin can
   * only say "here". Drawn in state order so available rooms sit above the
   * greyed ones and keep their full outline. */
  const order = { unreleased: 0, sold: 1, held: 1, reserved: 2, available: 3 };
  const entries = Object.entries(P.pins)
    .map(([n, pin]) => ({ n: Number(n), pin, unit: byClinic.get(Number(n)) }))
    .map((e) => ({ ...e, cls: e.unit ? e.unit.state : 'unreleased' }))
    .sort((a, b) => order[a.cls] - order[b.cls]);

  const useOutlines = P.outlines && P.polygons;

  for (const { n, pin, unit, cls } of entries) {
    const selected = state.picked.some((p) => p.clinic === n);
    const room = useOutlines && P.polygons[n];

    let shape;
    if (room) {
      shape = document.createElementNS(SVG_NS, 'polygon');
      shape.setAttribute('points', room.map((p) => p.join(',')).join(' '));
      shape.setAttribute('class', 'room ' + cls + (selected ? ' on' : ''));
    } else {
      shape = document.createElementNS(SVG_NS, 'circle');
      shape.setAttribute('cx', pin.x);
      shape.setAttribute('cy', pin.y);
      shape.setAttribute('r', selected ? P.pinRsel : P.pinR);
      shape.setAttribute('class', 'pin ' + cls + (selected ? ' on' : ''));
    }

    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = unit
      ? `${unit.code} · Clinic ${n} · ${unit.area} m² · ${unit.state === 'available' ? fmtMoney(unit.price) : (unit.heldReason ? 'On hold' : unit.status)}`
      : `Clinic ${n} · ${P.areas[n]} m² · Not released`;
    shape.appendChild(title);

    pinEls.set(n, shape);
    if (unit) {
      shape.addEventListener('mouseenter', () => showPop(unit, pin));
      shape.addEventListener('mouseleave', schedulePopHide);
      if (unit.state === 'available') shape.onclick = () => toggleUnit(unit);
    }
    svg.appendChild(shape);

    /* A tick in the middle of a selected room. Two shaded rooms on a busy
     * render can read as one large area, and the agent needs to be able to
     * count what is in the offer at a glance. */
    if (selected && room) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', pin.x);
      dot.setAttribute('cy', pin.y);
      dot.setAttribute('r', Math.max(5, P.pinR * 0.42));
      dot.setAttribute('class', 'room-dot');
      svg.appendChild(dot);
    }
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
    /* The label has to say what the click will do. Once one clinic is in the
     * offer the same button is how a second gets added, which is the only cue
     * an agent gets that combining is possible at all. */
    const on = isPicked(unit);
    const btn = el('button', on ? 'remove' : null,
      on ? 'Remove from offer' : state.picked.length ? 'Add to this offer' : 'Select this clinic');
    btn.onclick = () => { hidePop(); toggleUnit(unit); };
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
    const btn = el('button', 'unit' + (isPicked(u) ? ' on' : ''));
    const left = el('div');
    left.appendChild(el('div', 'unit-code', u.code));
    left.appendChild(el('div', 'unit-sub',
      `Clinic ${u.clinic} · ${u.area} m²${u.meterPrice ? ` · ${fmt(u.meterPrice)}/m²` : ''}`));
    btn.appendChild(left);
    btn.appendChild(el('div', 'unit-price', fmtMoney(u.price)));
    btn.onclick = () => toggleUnit(u);
    // Scanning the list rings the matching pin, so the agent never has to hunt
    // for a code on the drawing.
    btn.addEventListener('mouseenter', () => highlightPin(u.clinic, true));
    btn.addEventListener('mouseleave', () => highlightPin(u.clinic, false));
    box.appendChild(btn);
  }
}

/**
 * Put a clinic in the offer, or take it out again.
 *
 * Clicking is a toggle rather than a replace, because that is the only way to
 * build a two-clinic offer without a separate mode to explain to the sales
 * team. The running selection is shown above the plan so nobody issues a
 * two-clinic offer thinking they picked one.
 */
function toggleUnit(unit) {
  if (isPicked(unit)) {
    state.picked = state.picked.filter((p) => p.code !== unit.code);
  } else {
    if (state.picked.length && state.picked[0].floor !== unit.floor) return;
    state.picked = [...state.picked, unit].sort((a, b) => a.clinic - b.clinic);
  }

  renderPlan();
  renderUnits();
  renderPicked();

  if (!state.picked.length) {
    $('detailStep').classList.add('hidden');
    return;
  }
  const firstPick = state.picked.length === 1;
  renderDetail();
  $('detailStep').classList.remove('hidden');
  // Only jump down on the first pick. Scrolling away mid-selection would take
  // the plan off screen just as the agent reaches for the second clinic.
  if (firstPick) $('detailStep').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** The running selection above the plan: what is in the offer, and its totals. */
function renderPicked() {
  const box = $('picked');
  if (!state.picked.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }

  const o = offerUnit();
  box.innerHTML = '';
  box.classList.remove('hidden');

  const chips = el('div', 'picked-chips');
  for (const u of state.picked) {
    const chip = el('span', 'chip');
    chip.appendChild(el('b', null, u.code));
    chip.appendChild(el('span', null, `${u.area} m²`));
    const x = el('button', 'chip-x');
    x.textContent = '×';
    x.title = `Remove ${u.code} from this offer`;
    x.setAttribute('aria-label', `Remove ${u.code} from this offer`);
    x.onclick = () => toggleUnit(u);
    chip.appendChild(x);
    chips.appendChild(chip);
  }
  box.appendChild(chips);

  const sum = el('div', 'picked-sum');
  sum.appendChild(el('span', 'picked-count',
    o.combined ? `${o.count} clinics combined` : '1 clinic'));
  sum.appendChild(el('span', 'picked-area', `${o.area} m²`));
  sum.appendChild(el('b', 'picked-price', fmtMoney(o.price)));
  box.appendChild(sum);

  const clear = el('button', 'picked-clear', 'Clear');
  clear.onclick = () => {
    state.picked = [];
    renderPlan(); renderUnits(); renderPicked();
    $('detailStep').classList.add('hidden');
  };
  box.appendChild(clear);
}

/* ---------------- step 3: plan + schedule ---------------- */
function renderDetail() {
  const u = offerUnit();
  if (!u) return;
  const top = $('detailTop');
  top.innerHTML = '';
  const kv = (label, value, brand, sub) => {
    const d = el('div');
    d.appendChild(el('div', 'kv-label', label));
    d.appendChild(el('div', 'kv-value' + (brand ? ' brand' : ''), value));
    if (sub) d.appendChild(el('div', 'kv-sub', sub));
    top.appendChild(d);
  };
  kv(u.combined ? 'Units' : 'Unit', u.code);
  kv(u.combined ? 'Clinics' : 'Clinic', `No${u.combined ? 's' : ''}. ${listAnd(u.clinics)}`);
  kv('Floor', CONFIG.floors.find((f) => f.key === state.floorKey).label);
  kv(u.combined ? 'Combined area' : 'Area', `${u.area} m²`,
    false, u.combined ? u.units.map((x) => `${x.area}`).join(' + ') + ' m²' : null);
  kv('Price per m²', u.meterPrice ? fmtMoney(u.meterPrice) : '—',
    false, u.blendedRate ? 'blended across the clinics' : null);
  kv(u.combined ? 'Combined price' : 'Unit price', fmtMoney(u.price), true);

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
    /* The post survives where the PDF cannot. It quotes a price and a plan
       image, both of which are known; only the payment terms are missing, and
       js/post.js drops that line when there is no plan to compute it from. A
       project with no terms yet is exactly the one an agent most wants to
       start posting about. */
    $('postBtn').classList.toggle('hidden', !CONFIG.post);
    $('downloadNote').textContent = '';
    return;
  }
  $('download').classList.remove('hidden');
  if (SHARE_FILES) $('share').classList.remove('hidden');
  $('postBtn').classList.toggle('hidden', !CONFIG.post);

  for (const p of CONFIG.plans) {
    const btn = el('button', 'planbtn' + (state.planId === p.id ? ' on' : ''));
    btn.appendChild(el('b', null, p.label));
    btn.appendChild(el('span', null, p.cash ? `${pctLabel(p.discount)} discount` : `Rest over ${p.years} years, quarterly`));
    btn.onclick = () => { state.planId = p.id; renderDetail(); };
    box.appendChild(btn);
  }

  renderSchedule();
  $('downloadNote').textContent = `${u.code} · ${CONFIG.plans.find((p) => p.id === state.planId).label}`
    + (u.combined ? ` · ${u.count} clinics combined` : '');
}

/** The four headline numbers above the schedule — what the customer asks first. */
function renderScheduleCards(plan, summary) {
  const box = $('schedCards');
  box.innerHTML = '';
  const o = offerUnit();
  const sizeNote = o.combined ? `${o.area} m² · ${o.count} clinics` : `${o.area} m² clinic`;

  const cards = plan.cash
    ? [['Cash price', fmt(summary.netPrice), `after ${pctLabel(plan.discount)} discount`],
       ['You save', fmt(summary.discount), `off ${fmt(summary.originalPrice)} ${CONFIG.currency}`],
       ['Maintenance', fmt(summary.maintenance), `${pctLabel(CONFIG.maintenanceRate)} of the unit price`],
       ['Total payable', fmt(summary.totalPayable), CONFIG.currency, true]]
    : [['Contract price', fmt(summary.netPrice), sizeNote],
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
  const { rows, summary } = buildSchedule(offerUnit(), plan, state.contractDate);
  renderScheduleCards(plan, summary);

  const t = $('sched');
  t.innerHTML = '';
  $('schedNote').textContent =
    `Dates run from the contract date, ${fmtDate(summary.contractDate)} — the day this proposal is made. `
    + `Delivery ${CONFIG.deliveryMonths / 12} years from contract. `
    + `Percentages are of the ${fmt(summary.originalPrice)} ${CONFIG.currency} `
    + `${offerUnit().combined ? 'combined price' : 'unit price'}.`;

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

/* ---------------- inventory prefetch ----------------
 *
 * The sheets are fetched the moment the app opens, for every live project,
 * instead of waiting for one to be picked. Choosing a project takes an agent a
 * few seconds; without this, that time is dead and the whole wait lands after
 * the click. It is the same request either way, just started earlier — nothing
 * is cached between page loads and the inventory is no less live.
 *
 * Only the raw CSV is prefetched. Parsing reads CONFIG for holds, overrides and
 * status lists, so it has to happen with CONFIG pointing at the project being
 * parsed — hence fetchSheetCSV taking URLs and returning text and nothing else.
 */
const SHEET_PREFETCH_MAX_AGE_MS = 45000;
const sheetPrefetch = new Map();

function prefetchSheets() {
  for (const p of PROJECTS) {
    if (!p.live || !p.sheetUrls) continue;
    sheetPrefetch.set(p.id, fetchSheetCSV(p.sheetUrls).catch(() => null));
  }
}

/**
 * The prefetched CSV for a project, if it is still recent enough to trust.
 *
 * Consumed once: a later load (the Refresh button, or coming back to a project)
 * must go to the network, or an agent could be shown availability from when the
 * page was opened rather than from now. Stale availability sells a sold clinic,
 * which is the one failure this app exists to prevent.
 */
async function takePrefetchedSheet(projectId) {
  const pending = sheetPrefetch.get(projectId);
  if (!pending) return null;
  sheetPrefetch.delete(projectId);
  const res = await pending;
  if (!res) return null;

  /* A prefetch that FAILED is still an answer, and it is returned rather than
   * discarded. Returning null here made load() go and fetch the same dead sheet
   * a second time, and each attempt is capped at SHEET_BUDGET_MS — so a stalled
   * Google meant 14 seconds of waiting, then 14 more, before the saved copy
   * appeared. Measured at 28 seconds of blank screen; it was 40 before the
   * budget existed.
   *
   * Handing the failure straight through cuts that in half: the app shows the
   * saved copy as soon as the first attempt gives up. Nothing is lost, because
   * a retry is already guaranteed from two directions — the 60-second poll, and
   * the Refresh button, which passes `fresh` and skips the prefetch entirely. */
  if (!res.text) return res;

  if (Date.now() - res.at > SHEET_PREFETCH_MAX_AGE_MS) return null;
  return res;
}

/* ---------------- boot ---------------- */
/**
 * @param {boolean} fresh  Skip the prefetch and go to the network.
 * @param {boolean} quiet  A background poll: leave the controls alone.
 */
async function load({ fresh = false, quiet = false } = {}) {
  if (!quiet) {
    $('refresh').disabled = true;
    $('syncText').textContent = 'Loading inventory…';
  }

  const pre = fresh ? null : await takePrefetchedSheet(state.projectId);
  const res = await loadInventory(activePlan().areas, pre);
  Object.assign(state, res);

  /* Keep each picked clinic only if it is still available in the new data, and
   * say which ones went. Silently dropping one would leave the agent looking at
   * a total that no longer matches what they think they are selling. */
  if (state.picked.length) {
    const kept = [], lost = [];
    for (const p of state.picked) {
      const again = state.units.find((u) => u.code === p.code && u.state === 'available');
      (again ? kept : lost).push(again || p);
    }
    state.picked = kept;
    if (lost.length) {
      state.warnings = [`${lost.map((u) => u.code).join(', ')} `
        + `${lost.length === 1 ? 'is' : 'are'} no longer available and `
        + `${lost.length === 1 ? 'has' : 'have'} been removed from this offer.`,
        ...state.warnings];
    }
    if (!kept.length) $('detailStep').classList.add('hidden');
  }

  renderSync();
  renderWarnings();
  renderFloors();
  /* The budget search prices every available clinic, so it has to be re-priced
     from the same read that redraws everything else — otherwise a clinic sold
     in the sheet would go on being offered here after it vanished from the
     plan, which is the one failure this app exists to prevent. */
  afford.rebuild();
  if (state.floorKey) { renderPlan(); renderUnits(); }
  renderPicked();
  if (state.picked.length) renderDetail();

  /* NOT on a background poll. openFromHash() re-applies whatever unit the URL
     names, and scrolls to it. On the deliberate paths that is the point; fired
     every sixty seconds it would be a trap — an agent who opened a shared link
     to C313 and then picked C319 to compare would be yanked back to C313, and
     the page scrolled, in the middle of talking to a customer. */
  if (!quiet) openFromHash();
}

/**
 * Split "#mc9/MC924" or "#C313" into { project, codes }.
 *
 * Codes may be joined with "+" — "#C313+C314" is the combined offer for both,
 * so a two-clinic proposal can be shared as one link the same as a single one.
 */
function parseHash() {
  const raw = decodeURIComponent(location.hash.replace('#', '')).trim();
  if (!raw) return {};
  const [a, b] = raw.split('/');
  const byId = (v) => PROJECTS.find((p) => p.live && p.id.toLowerCase() === String(v).toLowerCase());
  const codesIn = (v) => v.split('+').map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (b !== undefined) return { project: byId(a), codes: codesIn(b) };
  const asProject = byId(a);
  return asProject ? { project: asProject } : { codes: codesIn(a) };
}

/** #mc9/MC924 opens straight to that unit, so an offer can be shared as a link. */
function openFromHash() {
  const { codes } = parseHash();
  if (!codes || !codes.length) return;
  const already = state.picked.map((u) => u.code).join('+');
  if (already === codes.join('+')) return;

  const found = [], missing = [];
  for (const code of codes) {
    const unit = state.units.find((u) => u.code === code && u.state === 'available');
    if (unit) found.push(unit);
    else {
      // A shared link can outlive the unit — say so rather than silently doing
      // nothing, which reads as the link being broken.
      const known = state.units.find((u) => u.code === code);
      missing.push(known
        ? `${code} is no longer available (${known.status}).`
        : `${code} is not in the current inventory.`);
    }
  }
  if (missing.length) {
    state.warnings = [`${missing.join(' ')} Pick a clinic below.`, ...state.warnings];
    renderWarnings();
  }
  if (!found.length) return;

  // A link naming clinics on two floors cannot be one offer; keep the first
  // floor's and say so, rather than dropping the lot.
  const floorOf = found[0].floor;
  const offFloor = found.filter((u) => u.floor !== floorOf);
  if (offFloor.length) {
    state.warnings = [`${offFloor.map((u) => u.code).join(', ')} `
      + `${offFloor.length === 1 ? 'is' : 'are'} on another floor, so `
      + `${offFloor.length === 1 ? 'it was' : 'they were'} left out — `
      + 'clinics in one offer must share a floor.', ...state.warnings];
    renderWarnings();
  }
  const picks = found.filter((u) => u.floor === floorOf);

  const floor = CONFIG.floors.find((f) => floorNumber(f.key) === floorOf);
  if (!floor || !floor.plan) return;
  state.floorKey = floor.key;
  state.picked = [...picks].sort((a, b) => a.clinic - b.clinic);
  renderFloors();
  renderPlan();
  renderUnits();
  renderPicked();
  renderDetail();
  $('planStep').classList.remove('hidden');
  $('detailStep').classList.remove('hidden');
  $('detailStep').scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Opening a shared link should show what was shared, not just move the map.
  showPop(picks[0], activePlan().pins[picks[0].clinic]);
}

window.addEventListener('hashchange', () => {
  if (!state.projectId) return;
  /* A hash pointing at another project has to switch project first. Changing
   * only the hash does not reload the page, so without this a link to
   * #mc9/MC924 pasted into an already-open EMC session looked up a 9MC code in
   * EMC's inventory and reported it missing. selectProject re-reads the hash
   * once that project's inventory has loaded. */
  const { project } = parseHash();
  if (project && project.id !== state.projectId) { selectProject(project.id); return; }
  openFromHash();
});

$('sortBy').onchange = (e) => { state.sortBy = e.target.value; renderUnits(); };
// Refresh always goes to the network — its whole purpose is "tell me what is
// true right now", so it must never be answered from a prefetch.
$('refresh').onclick = () => { if (state.projectId) load({ fresh: true }); };

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
    if (share) await deliverOffer(offerUnit(), plan, floor, state.contractDate);
    else {
      const { doc, filename } = await buildOfferPDF(offerUnit(), plan, floor, state.contractDate);
      doc.save(filename);
    }

    /* Record the offer. AFTER the await, so only an offer that actually reached
       the agent is counted — a failed export throws to the catch below and is
       never logged, which keeps "offers sent" honest. Not awaited and unable to
       throw, so a dead endpoint cannot cost a sale.

       CONFIG.id, not a constant: one app serves EMC and 9MC, and CONFIG is
       swapped by selectProject(). state.picked is passed whole because an
       Eliwah offer can combine several clinics, and counting only the merged
       unit would under-report every one of them. */
    if (typeof logOffer === 'function') {
      logOffer(offerRow(CONFIG.id, offerUnit(), state.picked, plan,
                        buildSchedule(offerUnit(), plan, state.contractDate).summary,
                        { delivery: share ? 'shared' : 'downloaded' }));
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

/* ---- the WhatsApp post ----
 * The second delivery path, for broker groups rather than a single customer.
 * Everything it does lives in js/post.js; this is only the wiring. */
$('postBtn').onclick = openPostSheet;
for (const b of document.querySelectorAll('[data-post-close]')) b.onclick = closePostSheet;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('postSheet').classList.contains('hidden')) closePostSheet();
});
$('postModes').onclick = (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b || b.dataset.mode === postState.mode) return;
  postState.mode = b.dataset.mode;
  renderPostPreview();
};
$('postTerms').onchange = (e) => { postState.terms = e.target.checked; $('postText').value = buildPostText(); };
$('postSend').onclick = postShare;
$('postCopy').onclick = async () => {
  const ok = await postCopyText();
  if (ok) postLog(`post-${postState.mode}-copied`);
  postFlash(ok ? 'Copied. Paste it into WhatsApp.' : 'Could not copy — select the text and copy it.', !ok);
};

/* Offline support and installability. Registered late and failure-tolerant:
 * a service worker is a bonus, never a requirement, and it is unavailable on
 * file:// and on plain http:// beyond localhost.
 *
 * It never caches the inventory sheet — see the note at the top of sw.js. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .catch((err) => console.warn('service worker not registered:', err.message));
  });
}

/* ---- keeping the inventory current ----
 *
 * This app used to fetch the sheet ONCE per project and never again. Combined
 * with the 6-second timeout in js/sheet.js, that made a brief stall permanent:
 * Google was slow for a moment on 2026-08-23, the fetch was aborted, the app
 * fell back to the snapshot baked in at build time — and then sat on those
 * stale prices for the rest of the session, because nothing ever retried. The
 * agent's only way out was closing the app and reopening it, which is exactly
 * what was reported.
 *
 * A short timeout is the right call on its own; giving up and never trying
 * again is not. Both halves are needed, and the sibling Qomor build already had
 * this half.
 *
 * `quiet: true` refreshes without putting the button into its loading state, so
 * a background poll cannot make the app look busy while someone is reading a
 * payment schedule off it. */
const REFRESH_MS = 60 * 1000;

// Coming back to the tab is the moment an agent is about to quote a price.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.projectId) load({ fresh: true, quiet: true });
});
setInterval(() => {
  if (!document.hidden && state.projectId) load({ fresh: true, quiet: true });
}, REFRESH_MS);

/* ---------------- boot ---------------- */
renderProjects();
// Before anything else: get both sheets moving while the agent reads the cards.
prefetchSheets();
/* Bound before the deep-link branch below: selectProject() runs load(), which
   calls afford.rebuild(), and rebuild draws into controls that init() is what
   wires up. Binding after would leave a first search with dead inputs. */
afford.init();
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
