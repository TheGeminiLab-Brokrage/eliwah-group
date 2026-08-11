/* Payment schedule maths.
 *
 * Terms supplied by Eliwah Group:
 *   - four instalment plans: 10%/7yr, 15%/8yr, 20%/9yr, 25%/10yr
 *   - instalments are QUARTERLY over the plan term
 *   - cash: 35% discount on the unit price
 *   - maintenance: 10% of the ORIGINAL (pre-discount) price, due one year
 *     before delivery; delivery is 30 months from contract
 *
 * !! NOT YET VERIFIED against a signed offer. The Ion generator's maths was
 * checked to the pound against a real customer offer before release; this one
 * has not been, because no sample offer has been provided yet. The assumptions
 * that a sample would settle are:
 *
 *   1. the first quarterly instalment falls 3 months after contract (not on the
 *      contract date, and not 1 month after)
 *   2. maintenance is a single payment at month 18, not spread
 *   3. rounding: instalments are whole pounds, with the remainder absorbed by
 *      the FINAL instalment so the schedule sums to the price exactly
 *   4. there is no club / parking / delivery fee on top
 *
 * Change these here if the sample offer says otherwise — nothing downstream
 * hard-codes them.
 */

const round = (n) => Math.round(n);

/** Add whole months, clamping to the last day when the target month is shorter
 *  (31 Jan + 1 month -> 28/29 Feb, not 2/3 March). */
function addMonths(date, months) {
  const d = new Date(date.getTime());
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDay));
  return d;
}

const fmtDate = (d) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Build the full payment schedule for a unit under a plan.
 *
 * `contractDate` anchors the calendar: it is the date the proposal is made, so
 * every due date is derived from it (first instalment three months later, then
 * quarterly). Defaults to today.
 *
 * @returns {{rows: Array, summary: Object}}
 */
function buildSchedule(unit, plan, contractDate = new Date()) {
  const price = unit.price;
  const maintenance = round(price * CONFIG.maintenanceRate);
  const rows = [];
  const at = (month) => addMonths(contractDate, month);

  const maintenanceRow = () => ({
    month: CONFIG.maintenanceDueMonth,
    label: `Maintenance (${Math.round(CONFIG.maintenanceRate * 100)}%)`,
    when: monthLabel(CONFIG.maintenanceDueMonth),
    date: at(CONFIG.maintenanceDueMonth),
    amount: maintenance,
    note: 'One year before delivery',
  });

  if (plan.cash) {
    const net = round(price * (1 - plan.discount));
    rows.push({ month: 0, label: 'Cash payment', when: 'On contract', date: at(0), amount: net });
    rows.push({ ...maintenanceRow(), note: 'Calculated on the original price' });
    return {
      rows,
      summary: {
        planLabel: plan.label,
        contractDate,
        originalPrice: price,
        discount: round(price * plan.discount),
        netPrice: net,
        downPayment: net,
        instalmentAmount: 0,
        instalmentCount: 0,
        years: 0,
        maintenance,
        totalPayable: net + maintenance,
      },
    };
  }

  /* Down payment may come in parts — 9MC's 20% plan is 10% on contract and 10%
   * a year later. Single-payment plans are just the one-part case. */
  const downParts = plan.downSchedule || [{ pct: plan.down, month: 0, label: 'Down payment' }];
  const downAmounts = downParts.map((p) => round(price * p.pct));
  const downTotal = downAmounts.reduce((s, n) => s + n, 0);

  const remaining = price - downTotal;
  const count = plan.years * (12 / CONFIG.instalmentEveryMonths);
  const per = round(remaining / count);
  // Absorb rounding drift in the last instalment so the rows sum to `price`.
  const last = remaining - per * (count - 1);

  downParts.forEach((p, i) => {
    rows.push({
      month: p.month,
      label: p.label || 'Down payment',
      when: monthLabel(p.month),
      date: at(p.month),
      amount: downAmounts[i],
      down: true,
    });
  });

  for (let i = 1; i <= count; i++) {
    const month = i * CONFIG.instalmentEveryMonths;
    rows.push({
      month,
      label: `Instalment ${i} of ${count}`,
      when: monthLabel(month),
      date: at(month),
      amount: i === count ? last : per,
      instalment: true,
    });
  }
  rows.push(maintenanceRow());
  // Same-month ties: down payments first, then instalments, then maintenance.
  const rank = (r) => (r.down ? 0 : r.instalment ? 1 : 2);
  rows.sort((a, b) => a.month - b.month || rank(a) - rank(b));

  return {
    rows,
    summary: {
      planLabel: plan.label,
      contractDate,
      originalPrice: price,
      discount: 0,
      netPrice: price,
      downPayment: downTotal,
      downParts: downParts.map((p, i) => ({ ...p, amount: downAmounts[i], date: at(p.month) })),
      downPct: plan.down,
      instalmentAmount: per,
      instalmentCount: count,
      years: plan.years,
      maintenance,
      totalPayable: price + maintenance,
    },
  };
}

/**
 * Group a schedule into year blocks, the way the payment tables present it.
 *
 * Year 1 is the first twelve months after contract, so the quarterly payments
 * at months 3/6/9/12 all belong to it. Anything falling on the contract date
 * itself sits in its own block ahead of them — a down payment is not part of
 * "year one" in the way the sales team reads these tables.
 *
 * Percentages are shares of `base`, the unit price. The instalment rows
 * therefore add up to 100% and maintenance shows as the extra that it is,
 * rather than being folded into a denominator nobody quoted.
 *
 * @returns {Array<{year: number, label: string, rows: Array, total: number, pct: number}>}
 */
function scheduleByYear(rows, base) {
  const yearOf = (m) => (m === 0 ? 0 : Math.ceil(m / 12));
  const blocks = [];

  for (const r of rows) {
    const year = yearOf(r.month);
    let block = blocks.find((b) => b.year === year);
    if (!block) {
      block = { year, label: year === 0 ? 'On contract' : `Year ${year}`, rows: [], total: 0 };
      blocks.push(block);
    }
    block.rows.push({ ...r, pct: base ? (r.amount / base) * 100 : 0 });
    block.total += r.amount;
  }

  blocks.sort((a, b) => a.year - b.year);
  for (const b of blocks) b.pct = base ? (b.total / base) * 100 : 0;
  return blocks;
}

/** "3.21%" — two decimals throughout so the column stays a readable stack. */
const fmtPct = (n) => `${(n || 0).toFixed(2)}%`;

/**
 * A rate held as a fraction, written as a percentage: 0.07 -> "7%".
 *
 * Not just `frac * 100`: in floating point that gives 7.000000000000001, which
 * had been reaching the offer PDF. Rounding to four decimals kills the noise
 * while leaving room for a real fractional rate like 12.5%.
 */
const pctLabel = (frac) => `${+(frac * 100).toFixed(4)}%`;

/** 0 -> "On contract", 3 -> "Month 3", 12 -> "Year 1", 18 -> "Year 1 + 6 months". */
function monthLabel(m) {
  if (m === 0) return 'On contract';
  if (m % 12 === 0) return `Year ${m / 12}`;
  if (m < 12) return `Month ${m}`;
  const y = Math.floor(m / 12), r = m % 12;
  return `Year ${y} + ${r} month${r === 1 ? '' : 's'}`;
}

const fmt = (n) =>
  new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(Math.round(n));

const fmtMoney = (n) => `${fmt(n)} ${CONFIG.currency}`;

/** Sanity check used by the tests and at load: every schedule must sum correctly. */
function scheduleTotal(rows) {
  return rows.reduce((s, r) => s + r.amount, 0);
}

if (typeof module !== 'undefined') {
  module.exports = { buildSchedule, monthLabel, scheduleTotal, scheduleByYear, fmt, fmtMoney, fmtPct, pctLabel, addMonths, fmtDate };
}
