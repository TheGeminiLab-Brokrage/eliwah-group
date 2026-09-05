/* Search by budget — the step before choosing a floor.
 *
 * The app asks which project, which floor, which clinic, then what it costs.
 * Customers arrive with the answer to the last question and nothing else — "I
 * have a million and I can do forty a month". This searches in that direction:
 * every available clinic against every instalment plan, keeping what the budget
 * covers.
 *
 * It OWNS NOTHING. Picking a result calls the same selectProject / selectFloor /
 * toggleUnit the floor plan and the clinic list call, so the offer, the
 * schedule, the PDF and the WhatsApp post are reached by one path.
 *
 * THREE THINGS ARE DIFFERENT HERE FROM THE QOMOR BUILD THIS IDEA CAME FROM, and
 * each one is a trap if it is copied across rather than thought about:
 *
 * 1. TWO PROJECTS. EMC and 9MC are separate inventories with separate plans and
 *    separate terms, and the app holds only the chosen one in memory. The scope
 *    switch searches the current project or both; "both" pulls the other sheet
 *    on demand rather than at boot, so opening the app costs nothing extra.
 *
 * 2. buildSchedule() READS THE GLOBAL CONFIG. Pricing a 9MC clinic while CONFIG
 *    still points at EMC silently uses EMC's terms — maintenance falls at month
 *    18 for EMC and month 30 for 9MC, so the customer's schedule would carry the
 *    wrong date and nothing would error. Every combination is therefore priced
 *    inside withProject(), which swaps CONFIG and always puts it back. This is
 *    the same class of mistake as 9MC once shipping with EMC's renders.
 *
 * 3. NO MILESTONE PAYMENTS. Qomor asks whether the +5/+5/+10% quarters count
 *    against the monthly budget; these plans have none, so there is nothing to
 *    ask and no question is shown. That is DERIVED from the plans rather than
 *    assumed, so a plan that gains milestones later brings the question back.
 *
 * The Cash plan is left out of the search: it has no instalment, so there is
 * nothing for a monthly budget to test. A cash buyer is a different conversation
 * and the plan is still there on the offer once a clinic is chosen.
 */
const afford = (function () {

  const $ = (id) => document.getElementById(id);

  const S = {
    down: 0,
    monthly: 0,
    scope: 'this',        // 'this' | 'both'
    floor: '',
    sort: 'area-desc',
    open: false,
    combos: [],
    available: 0,
    hits: [],
    picked: {},           // unit code -> the plan the agent tapped on that card
    shown: 3,
    /* Units per project, so switching scope does not refetch what is already
       here. Keyed by project id; the current project's entry is refreshed from
       state.units on every inventory read, so a sold clinic leaves the search
       at the same moment it leaves the floor plan. */
    unitsByProject: new Map(),
    loading: false,
  };

  const PAGE = 3;

  const group = (n) => new Intl.NumberFormat('en-EG').format(Math.round(n));
  const area = (n) => new Intl.NumberFormat('en-EG', { maximumFractionDigits: 2 }).format(n);
  const roundUpTo = (n, step) => Math.ceil(n / step) * step;

  /** Read a typed budget: anything that is not a digit is ignored, so
   *  "1,500,000", "1 500 000" and "1500000" are the same number. */
  function readMoney(input) {
    const n = Number(String(input.value).replace(/[^\d]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  const reprint = (input, value) => { input.value = value ? group(value) : ''; };

  /** Run `fn` with CONFIG pointing at `id`, and always put it back.
   *  Synchronous by contract — never await inside, or another project's terms
   *  would be live while the app carries on rendering. See note 2 above. */
  function withProject(id, fn) {
    const before = CONFIG.id;
    if (before === id) return fn();
    setProject(id);
    try { return fn(); } finally { setProject(before); }
  }

  const projectById = (id) => PROJECTS.find((p) => p.id === id);

  /* The floor key the REST OF THE APP uses, which is not always the one on the
     unit. A unit's floorKey is whatever the sheet's floor column said, and the
     9MC sheet spells the ninth floor "Nineth" — js/sheet.js knowingly maps that
     to floor 9 but keeps the raw wording. Everything downstream of a selection
     looks the floor up with CONFIG.floors.find(f => f.key === state.floorKey),
     so handing it "Nineth" finds nothing and renderPlan() throws on floor.plan.
     The number is the reliable link between the two, so resolve through it.
     Call inside withProject(): the floor list belongs to the project. */
  const configFloorKey = (unit) => {
    const f = CONFIG.floors.find((x) => floorNumber(x.key) === unit.floor);
    return f ? f.key : unit.floorKey;
  };

  const inScope = () => (S.scope === 'both'
    ? PROJECTS.filter((p) => p.live)
    : PROJECTS.filter((p) => p.id === state.projectId));

  /* -------------------------------------------------------------- pricing -- */

  function priceCombo(unit, plan, project, contractDate) {
    const built = buildSchedule(unit, plan, contractDate);
    const s = built.summary;
    let instalment = 0;
    for (const r of built.rows) {
      /* The instalment rows are the level ones. A plan can also carry a second
         down payment a year in (9MC's 20% is 10% + 10%), which is a lump on a
         known date like the maintenance — it is disclosed on the card, not
         tested against a monthly budget. */
      if (r.instalment && r.amount > instalment) instalment = r.amount;
    }
    /* THE BUDGET TEST IS WHAT IS DUE ON CONTRACT, NOT THE WHOLE DOWN PAYMENT.
       summary.downPayment sums every part, and 9MC's 20% plan is 10% on
       contract and 10% a year later — so testing the total against "cash
       available now" would demand money the customer does not need yet and
       quietly hide clinics they can afford today. The later part is a lump on a
       known date, like the maintenance, and is printed on the card instead. */
    const parts = s.downParts || [{ pct: plan.down, month: 0, amount: s.downPayment }];
    const onContract = parts.filter((p) => p.month === 0);
    const later = parts.filter((p) => p.month > 0);
    const downNow = onContract.reduce((t, p) => t + p.amount, 0);

    return {
      unit,
      floorKey: configFloorKey(unit),
      projectId: project.id,
      projectName: project.name,
      planId: plan.id,
      planLabel: plan.label,
      years: plan.years,
      down: downNow,
      downPct: onContract.reduce((t, p) => t + p.pct, 0),
      downLater: later.map((p) => ({ amount: p.amount, month: p.month })),
      instalment,
      maintenance: s.maintenance,
      maintenanceMonth: CONFIG.maintenanceDueMonth,
      price: unit.price,
    };
  }

  /** Re-price everything in scope. Called on every inventory read. */
  function rebuild() {
    if (state.projectId) S.unitsByProject.set(state.projectId, state.units);

    const contractDate = new Date();
    const combos = [];
    let available = 0;

    for (const project of inScope()) {
      const units = S.unitsByProject.get(project.id);
      if (!units) continue;
      const pool = units.filter((u) => u.state === 'available' && u.price > 0);
      available += pool.length;
      withProject(project.id, () => {
        for (const u of pool) {
          for (const plan of CONFIG.plans) {
            if (plan.cash) continue;          // no instalment to test — see header
            combos.push(priceCombo(u, plan, project, contractDate));
          }
        }
      });
    }

    S.combos = combos;
    S.available = available;
    fillFilters();
    if (S.open) draw();
  }

  /** Pull the other project's inventory, once, when "both" is first chosen. */
  async function loadOtherProjects() {
    const missing = inScope().filter((p) => !S.unitsByProject.has(p.id));
    if (!missing.length) return;

    S.loading = true;
    draw();
    for (const p of missing) {
      try {
        const { text } = await fetchSheetCSV(p.sheetUrls);
        if (!text) continue;
        /* Normalised under that project's own plan geometry — the areas come
           from its floor plan, and using the wrong project's would quietly
           mis-size every clinic. */
        const areas = (PLANS[p.planKey] || {}).areas;
        const { units } = normalizeRows(parseCSV(text), areas);
        S.unitsByProject.set(p.id, units);
      } catch { /* leave it missing; the note below says which is absent */ }
    }
    S.loading = false;
    rebuild();
  }

  /* --------------------------------------------------------------- search -- */

  const quarterly = () => S.monthly * 3;
  const passesFilters = (c) => !S.floor || c.floorKey === S.floor;
  const fitsBudget = (c, down, quarter) => c.down <= down && c.instalment <= quarter;

  function search() {
    const down = S.down, quarter = quarterly();
    const byUnit = new Map();

    for (const c of S.combos) {
      if (!passesFilters(c) || !fitsBudget(c, down, quarter)) continue;
      const key = `${c.projectId}/${c.unit.code}`;
      if (!byUnit.has(key)) byUnit.set(key, { unit: c.unit, projectId: c.projectId, fits: [] });
      byUnit.get(key).fits.push(c);
    }

    const hits = [...byUnit.values()];
    for (const h of hits) {
      h.fits.sort((a, b) => a.instalment - b.instalment || a.down - b.down);
      h.best = h.fits[0];
    }

    const key = {
      'area-desc':  (h) => -(h.unit.area || 0),
      'monthly':    (h) => h.best.instalment,
      'price':      (h) => h.unit.price,
      'price-desc': (h) => -h.unit.price,
    }[S.sort];
    hits.sort((a, b) => key(a) - key(b) || a.unit.code.localeCompare(b.unit.code));

    S.hits = hits;
  }

  function countAt(down, quarter) {
    const seen = new Set();
    for (const c of S.combos) {
      if (passesFilters(c) && fitsBudget(c, down, quarter)) seen.add(`${c.projectId}/${c.unit.code}`);
    }
    return seen.size;
  }

  /** The cheapest increase that brings at least one more clinic into reach.
   *  Two levers, because the plans are gated by both the instalment and the down
   *  payment, and they are not the same ask in a sales conversation. */
  function nextUnlock() {
    const have = new Set(S.hits.map((h) => `${h.projectId}/${h.unit.code}`));
    const quarter = quarterly();
    let needQuarter = null, needDown = null;

    for (const c of S.combos) {
      if (!passesFilters(c) || have.has(`${c.projectId}/${c.unit.code}`)) continue;
      if (c.down <= S.down && c.instalment > quarter
          && (needQuarter === null || c.instalment < needQuarter)) needQuarter = c.instalment;
      if (c.instalment <= quarter && c.down > S.down
          && (needDown === null || c.down < needDown)) needDown = c.down;
    }

    const options = [];
    if (needQuarter !== null) {
      const monthly = roundUpTo(needQuarter / 3, 500);
      const n = countAt(S.down, monthly * 3) - S.hits.length;
      if (n > 0) options.push({ kind: 'monthly', value: monthly, n, rise: (monthly - S.monthly) / (S.monthly || 1) });
    }
    if (needDown !== null) {
      const cash = roundUpTo(needDown, 10000);
      const n = countAt(cash, quarter) - S.hits.length;
      if (n > 0) options.push({ kind: 'cash', value: cash, n, rise: (cash - S.down) / (S.down || 1) });
    }
    if (!options.length) return null;
    options.sort((a, b) => a.rise - b.rise);
    return options[0];
  }

  function nearestMiss() {
    let best = null, bestScore = Infinity;
    for (const c of S.combos) {
      if (!passesFilters(c)) continue;
      const score = Math.max(c.down / (S.down || 1), c.instalment / (quarterly() || 1));
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  /* --------------------------------------------------------------- render -- */

  function card(hit) {
    const u = hit.unit;
    const c = hit.fits.find((f) => f.planId === S.picked[u.code]) || hit.best;

    const n = el('article', 'hit');

    const top = el('div', 'top');
    top.appendChild(el('span', 'id', u.code));
    /* The project is named only when both are in scope. With one project it is
       noise on every card; with two, leaving it off would be a card that does
       not say which building the clinic is in. */
    if (S.scope === 'both') top.appendChild(el('span', 'proj', c.projectName));
    top.appendChild(el('span', 'where', `${c.floorKey} Floor`));
    n.appendChild(top);

    const head = el('div', 'headline');
    const money = (big, unit, small) => {
      const d = el('div');
      const b = el('div', 'n', big);
      if (unit) b.appendChild(el('small', null, ' ' + unit));
      d.appendChild(b);
      d.appendChild(el('div', 'k', small));
      return d;
    };
    /* The monthly figure is a division — instalments are quarterly — so it
       carries a ~ and the real quarterly amount sits directly under it. Never
       one without the other: the customer is billed the quarterly one. */
    head.appendChild(money('~' + group(c.instalment / 3), '/ month',
                           `${group(c.instalment)} every 3 months`));
    head.appendChild(money(group(c.down), null,
                           `down · ${Math.round(c.downPct * 100)}%`));
    n.appendChild(head);

    const facts = el('div', 'facts');
    const fact = (html) => { const s = el('span'); s.innerHTML = html; facts.appendChild(s); };
    if (u.area) fact(`<b>${area(u.area)}</b> m²`);
    fact(`Price <b>${group(c.price)}</b> ${CONFIG.currency}`);
    fact(`On the <b>${c.planLabel}</b> plan · ${c.years} years`);
    n.appendChild(facts);

    if (hit.fits.length > 1) {
      const row = el('div', 'planrow');
      for (const f of hit.fits) {
        const b = el('button', 'planchip' + (f.planId === c.planId ? ' on' : ''), f.planLabel);
        b.type = 'button';
        b.onclick = () => { S.picked[u.code] = f.planId; draw(); };
        row.appendChild(b);
      }
      n.appendChild(row);
    }

    /* What the monthly figure does not include. Both are real payments on known
       dates, and the second down payment is easy to forget because it looks
       like part of the down payment rather than a separate one. */
    const items = [];
    for (const d of c.downLater) items.push(`${group(d.amount)} at month ${d.month}`);
    items.push(`maintenance ${group(c.maintenance)} at month ${c.maintenanceMonth}`);
    n.appendChild(el('div', 'spike', 'Also due: ' + items.join(' · ')));

    const foot = el('div', 'foot');
    const go = el('button', 'cta', 'Build this offer');
    go.type = 'button';
    go.onclick = () => pick(c);
    foot.appendChild(go);
    n.appendChild(foot);
    return n;
  }

  function draw() {
    const hits = $('hits'), nothing = $('nothing'), stretch = $('stretch'),
          more = $('btnMore'), tally = $('tally'), note = $('scopeNote');

    $('qHint').textContent =
      `Instalments are quarterly — that is ${group(quarterly())} every 3 months.`;

    if (S.loading) {
      note.hidden = false;
      note.textContent = 'Loading the other project…';
    } else {
      note.hidden = true;
    }

    search();
    hits.innerHTML = '';
    tally.hidden = false;
    $('tallyBig').textContent = S.hits.length;
    $('tallyOf').textContent =
      `of ${S.available} available clinics fit ${group(S.down)} down and ${group(S.monthly)} a month`;

    if (!S.hits.length) {
      nothing.hidden = false;
      stretch.hidden = more.hidden = true;
      renderNothing(nothing);
      return;
    }

    nothing.hidden = true;
    const frag = document.createDocumentFragment();
    for (const h of S.hits.slice(0, S.shown)) frag.appendChild(card(h));
    hits.appendChild(frag);

    more.hidden = S.hits.length <= S.shown;
    more.textContent = `Show ${Math.min(PAGE, S.hits.length - S.shown)} more of ${S.hits.length}`;

    renderUnlock(stretch);
  }

  function renderUnlock(box) {
    const next = nextUnlock();
    if (!next) { box.hidden = true; return; }
    const monthly = next.kind === 'monthly';

    box.hidden = false;
    box.textContent = (monthly
      ? `Raise the monthly budget to ${group(next.value)}`
      : `Raise the cash to ${group(next.value)}`)
      + ` and ${next.n === 1 ? 'one more clinic comes' : `${next.n} more clinics come`} into reach. `;

    const apply = el('button', null, 'Apply');
    apply.type = 'button';
    apply.onclick = () => {
      if (monthly) { S.monthly = next.value; reprint($('inMonthly'), S.monthly); }
      else { S.down = next.value; reprint($('inDown'), S.down); }
      S.shown = PAGE;
      draw();
    };
    box.appendChild(apply);
  }

  function renderNothing(box) {
    const near = nearestMiss();
    box.textContent = '';
    if (!near) {
      box.textContent = 'No available clinics match those filters at all.';
      return;
    }

    const needMonthly = Math.ceil(near.instalment / 3);
    let line = `Nothing fits that budget. The closest is ${near.unit.code}`
      + (near.unit.area ? ` (${area(near.unit.area)} m²)` : '')
      + (S.scope === 'both' ? ` in ${near.projectName}` : '')
      + ` on the ${near.planLabel} plan: ${group(near.down)} down and ~${group(needMonthly)} a month.`;
    if (near.down > S.down) line += ` That is ${group(near.down - S.down)} more cash than entered.`;
    if (needMonthly > S.monthly) line += ` That is ${group(needMonthly - S.monthly)} more a month.`;
    box.appendChild(el('p', null, line));

    /* Selectable, not just named. The agent is standing in front of someone
       asking about that clinic; making them go and find it by hand is where
       this screen would stop being useful. */
    const b = el('button', 'cta small', `Open ${near.unit.code} · ${near.planLabel}`);
    b.type = 'button';
    b.onclick = () => pick(near);
    const p = el('p', 'act');
    p.appendChild(b);
    box.appendChild(p);
  }

  /* --------------------------------------------------------------- wiring -- */

  /** Hand a chosen clinic to the normal flow and step out of the way. */
  async function pick(combo) {
    if (combo.projectId !== state.projectId) {
      /* Crossing projects reloads that project's inventory, so the unit object
         held here is from a different read. Re-resolve it afterwards rather
         than passing this one through — it is the availability check that
         matters, and a clinic can sell between a search and a tap. */
      await selectProject(combo.projectId);
    }
    const fresh = state.units.find((u) => u.code === combo.unit.code);
    if (!fresh || fresh.state !== 'available') {
      state.warnings = [`${combo.unit.code} is no longer available.`, ...state.warnings];
      renderWarnings();
      rebuild();
      return;
    }
    if (CONFIG.plans.some((p) => p.id === combo.planId)) state.planId = combo.planId;
    selectFloor(configFloorKey(fresh));
    toggleUnit(fresh);
    toggle(false);
  }

  function toggle(open) {
    S.open = open;
    $('budgetBody').hidden = !open;
    $('budgetOpen').setAttribute('aria-expanded', String(open));
    $('budgetStep').classList.toggle('open', open);
    if (open) draw();
  }

  function fillFilters() {
    const sel = $('inFloorSel');
    const keys = new Set(S.combos.map((c) => c.floorKey).filter(Boolean));
    sel.innerHTML = '';
    const any = el('option', null, 'Any floor');
    any.value = '';
    sel.appendChild(any);
    for (const k of [...keys].sort((a, b) => floorNumber(a) - floorNumber(b))) {
      const o = el('option', null, `${k} Floor`);
      o.value = k;
      sel.appendChild(o);
    }
    sel.value = S.floor;
    S.floor = sel.value;
  }

  function init() {
    const inDown = $('inDown'), inMonthly = $('inMonthly');
    S.down = readMoney(inDown);
    S.monthly = readMoney(inMonthly);

    $('budgetOpen').onclick = () => toggle(!S.open);

    inDown.oninput = () => { S.down = readMoney(inDown); S.shown = PAGE; draw(); };
    inMonthly.oninput = () => { S.monthly = readMoney(inMonthly); S.shown = PAGE; draw(); };
    inDown.onblur = () => reprint(inDown, S.down);
    inMonthly.onblur = () => reprint(inMonthly, S.monthly);

    /* One tap to replace the amount. The field arrives holding a number, and
       leaving the caret at the end of it means nine backspaces on a phone
       keypad. On focus only, so a second tap still places a caret; a frame
       late, because iOS discards a selection made inside the focus handler. */
    for (const input of [inDown, inMonthly]) {
      input.addEventListener('focus', () => {
        requestAnimationFrame(() => {
          try { input.setSelectionRange(0, input.value.length); } catch { /* ignore */ }
        });
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    }

    $('inFloorSel').onchange = (e) => { S.floor = e.target.value; S.shown = PAGE; draw(); };
    $('inSort').onchange = (e) => { S.sort = e.target.value; draw(); };
    $('btnMore').onclick = () => { S.shown += PAGE; draw(); };

    const seg = $('scopeSeg');
    seg.onclick = async (e) => {
      const btn = e.target.closest('button[data-scope]');
      if (!btn || btn.dataset.scope === S.scope) return;
      S.scope = btn.dataset.scope;
      for (const b of seg.children) b.classList.toggle('on', b === btn);
      S.shown = PAGE;
      S.floor = '';
      if (S.scope === 'both') await loadOtherProjects();
      else rebuild();
    };
  }

  return { init, rebuild, toggle };
})();
