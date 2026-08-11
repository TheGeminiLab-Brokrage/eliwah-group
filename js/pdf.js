/* Branded A4-landscape PDF offer.
 *
 * Layout mirrors the Ion and Butterfly generators: cover, project, plan with the
 * chosen room highlighted, unit summary, full payment schedule, terms.
 */

const PW = 297, PH = 210;                 // A4 landscape, mm
const M = 16;                             // page margin
const BRAND = [18, 168, 203];
const BRAND_DARK = [11, 126, 153];
const INK = [16, 34, 43];
const MUTED = [91, 114, 128];
const LINE = [219, 230, 236];

function imageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

/**
 * Load an image ready for jsPDF.
 *
 * Preferred path: read the file and hand jsPDF a data: URL. jsPDF embeds those
 * JPEG bytes as-is, so the plan stays sharp and the PDF stays small. Passing an
 * <img> element instead sends jsPDF through its canvas path, which re-encodes
 * the whole 4382px render and bloats the file.
 *
 * fetch() is blocked on file:// though, so if someone opens index.html by
 * double-clicking it we fall back to the element and accept the larger output.
 *
 * @returns {Promise<{data: string|HTMLImageElement, format: string, width: number, height: number}>}
 */
async function loadImage(src) {
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('could not read blob'));
      fr.readAsDataURL(blob);
    });
    const el = await imageElement(dataUrl);
    return { data: dataUrl, format: imageFormat(src, blob.type), width: el.width, height: el.height };
  } catch {
    const el = await imageElement(src);
    return { data: el, format: imageFormat(src), width: el.width, height: el.height };
  }
}

/**
 * Which format to tell jsPDF an image is.
 *
 * It matters: jsPDF takes the format as an argument and does not sniff the
 * bytes, so labelling the logo PNG as 'JPEG' produces a corrupt page rather
 * than an error. The logo has to be a PNG because it is the only format here
 * that carries an alpha channel, and the logo has to be transparent to sit on
 * the header bar.
 */
function imageFormat(src, mime) {
  if (mime && /png/i.test(mime)) return 'PNG';
  if (/\.png(\?|#|$)/i.test(String(src))) return 'PNG';
  return 'JPEG';
}

/** Cover-fit an image into a box, cropping the overflow like CSS object-fit:cover. */
function coverRect(img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  return { x: x - (dw - w) / 2, y: y - (dh - h) / 2, w: dw, h: dh };
}

/** Contain-fit — the whole image visible, centred. */
function containRect(img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
}

const setFill = (doc, c) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc, c) => doc.setDrawColor(c[0], c[1], c[2]);
const setText = (doc, c) => doc.setTextColor(c[0], c[1], c[2]);

/* The Eliwah lockup, loaded once per document and reused on every page.
 *
 * header() is called seven times and is synchronous, so the image has to be in
 * hand before the first page is drawn; buildOfferPDF fills these in. Kept as
 * module state rather than threaded through every call because this file
 * already reads the active project from the CONFIG global in the same way.
 *
 * Two inks: white for the teal header bar, dark for the cover's white band. */
let LOGO_DARK = null;    // full lockup, brand ink on transparent
let MARK = null;         // monogram only, white on transparent

/* Aspect ratios reported by scripts/make-brand.js. They come from the measured
 * artwork, so re-run that script if the source logo is ever replaced. */
const LOCKUP_ASPECT = 1.758;
const MARK_ASPECT = 0.783;

/** Place transparent artwork at a given height, returning the width it took. */
function drawArt(doc, art, aspect, x, y, h) {
  if (!art) return 0;
  const w = h * aspect;
  doc.addImage(art.data, art.format, x, y, w, h, undefined, 'FAST');
  return w;
}

function header(doc, title, sub) {
  setFill(doc, BRAND_DARK);
  doc.rect(0, 0, PW, 20, 'F');

  /* The monogram as artwork, "ELIWAH GROUP" as type. The full lockup's wordmark
   * is only about 2mm tall inside a 20mm bar, which renders as grey mush —
   * vector type at that size stays crisp. */
  setText(doc, [255, 255, 255]);
  if (MARK) {
    const w = drawArt(doc, MARK, MARK_ASPECT, M, 5.2, 9.6);
    doc.setFont('helvetica', 'normal').setFontSize(8);
    doc.text('ELIWAH GROUP', M + w + 3.5, 12.6);
  } else {
    // Never leave the header blank if the artwork is missing.
    doc.setFont('helvetica', 'bold').setFontSize(11);
    doc.text('EG', M, 12.5);
    doc.setFont('helvetica', 'normal').setFontSize(8);
    doc.text('ELIWAH GROUP', M + 9, 12.5);
  }

  doc.setFont('helvetica', 'bold').setFontSize(11);
  doc.text(title, PW / 2, 12.5, { align: 'center' });
  if (sub) {
    doc.setFont('helvetica', 'normal').setFontSize(8.5);
    doc.text(sub, PW - M, 12.5, { align: 'right' });
  }
}

function footer(doc, unit, page) {
  setDraw(doc, LINE);
  doc.setLineWidth(0.2);
  doc.line(M, PH - 12, PW - M, PH - 12);
  doc.setFont('helvetica', 'normal').setFontSize(7.5);
  setText(doc, MUTED);
  doc.text(`${CONFIG.name} · ${CONFIG.location} · Unit ${unit.code}`, M, PH - 7.5);
  doc.text('This offer is indicative and subject to availability at the time of contract.', PW / 2, PH - 7.5, { align: 'center' });
  doc.text(String(page), PW - M, PH - 7.5, { align: 'right' });
}

function sectionTitle(doc, text, y) {
  doc.setFont('helvetica', 'bold').setFontSize(15);
  setText(doc, INK);
  doc.text(text, M, y);
  setFill(doc, BRAND);
  doc.rect(M, y + 2.5, 22, 1.1, 'F');
  return y + 12;
}

/**
 * The name the sales team asked for: "EMC - 22m clinic offer Third Floor.pdf".
 *
 * It describes what the customer is looking at rather than identifying the
 * unit, which is deliberate — it is the name that shows up in a WhatsApp chat.
 * Two clinics of the same size on the same floor therefore produce the same
 * name; the browser appends "(1)" on download, and in a chat the unit code is
 * on the cover anyway.
 */
function offerFilename(unit, floor) {
  const name = `${CONFIG.name} - ${unit.area}m clinic offer ${floor.label}.pdf`;
  return name.replace(/[\\/:*?"<>|]/g, '-');
}

/** Draw a polygon given reference-space points and an image placement rect. */
function drawPolygon(doc, pts, rect, style) {
  const P = PLANS[CONFIG.planKey];
  const sx = rect.w / P.refW, sy = rect.h / P.refH;
  const p = pts.map(([x, y]) => [rect.x + x * sx, rect.y + y * sy]);
  const deltas = p.slice(1).map(([x, y], i) => [x - p[i][0], y - p[i][1]]);
  doc.lines(deltas, p[0][0], p[0][1], [1, 1], style, true);
}

async function buildOfferPDF(unit, plan, floor, contractDate = new Date()) {
  /* Last line of defence. The UI already refuses to select anything that isn't
   * available, but an offer is the document a customer acts on, so the export
   * refuses too rather than trusting the caller. */
  if (!unit || unit.state !== 'available') {
    throw new Error(unit && unit.heldReason
      ? `${unit.code} is on hold and cannot be offered — ${unit.heldReason}`
      : `${unit ? unit.code : 'This unit'} is not available, so no offer can be generated.`);
  }
  if (!plan) throw new Error('No payment plan selected.');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { rows, summary } = buildSchedule(unit, plan, contractDate);
  const today = contractDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  let page = 1;

  /* Load the brand marks before any page is drawn — header() is synchronous.
   * A missing file is not fatal: each drawing site falls back to type. */
  MARK = await loadImage('assets/logo-mark.png').catch((err) => {
    console.warn('brand mark:', err.message);
    return null;
  });
  LOGO_DARK = await loadImage('assets/logo-eliwah-dark.png').catch(() => null);

  /* ---------- 1. cover ---------- */
  try {
    const hero = await loadImage(CONFIG.heroImage);
    const r = coverRect(hero, 0, 0, PW, PH * 0.62);
    doc.addImage(hero.data, hero.format, r.x, r.y, r.w, r.h, undefined, 'FAST');
  } catch (err) { console.warn('cover image:', err.message); }

  setFill(doc, [255, 255, 255]);
  doc.rect(0, PH * 0.62, PW, PH * 0.38, 'F');
  // Dark lockup, top-right of the white band. It cannot go over the render:
  // the top of both heroes is bright sky, where a white logo disappears.
  drawArt(doc, LOGO_DARK, LOCKUP_ASPECT, PW - M - 15 * LOCKUP_ASPECT, PH * 0.62 + 8, 15);
  doc.setFont('helvetica', 'bold').setFontSize(34);
  setText(doc, INK);
  doc.text(CONFIG.name, M, PH * 0.62 + 20);
  doc.setFont('helvetica', 'normal').setFontSize(12);
  setText(doc, MUTED);
  doc.text(`${CONFIG.subtitle}  ·  ${CONFIG.location}`, M, PH * 0.62 + 29);
  setFill(doc, BRAND);
  doc.rect(M, PH * 0.62 + 34, 40, 1.2, 'F');

  doc.setFont('helvetica', 'bold').setFontSize(13);
  setText(doc, BRAND_DARK);
  doc.text(`Offer for Unit ${unit.code}  ·  Clinic ${unit.clinic}  ·  ${floor.label}`, M, PH * 0.62 + 48);
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  setText(doc, MUTED);
  doc.text(`Prepared ${today}`, M, PH * 0.62 + 56);
  if (CONFIG.tagline) doc.text(CONFIG.tagline, PW - M, PH * 0.62 + 56, { align: 'right' });

  /* ---------- 2. the project ---------- */
  const story = CONFIG.story || {};
  doc.addPage(); page++;
  header(doc, 'The Project', CONFIG.location);
  let y = sectionTitle(doc, story.title || CONFIG.subtitle, 34);
  const hasRenders = (story.renders || []).length > 0;
  // Text runs full width when there is no render column to sit beside.
  const textW = hasRenders ? 150 : PW - 2 * M;
  doc.setFont('helvetica', 'normal').setFontSize(10);
  setText(doc, INK);
  const storyLines = doc.splitTextToSize(story.text || '', textW);
  doc.text(storyLines, M, y);

  y += Math.max(34, storyLines.length * 5 + 10);
  if ((story.advantages || []).length) {
    doc.setFont('helvetica', 'bold').setFontSize(10.5);
    setText(doc, BRAND_DARK);
    doc.text('Key advantages', M, y);
    y += 7;
    doc.setFont('helvetica', 'normal').setFontSize(9.5);
    setText(doc, INK);
    story.advantages.forEach((a, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      setFill(doc, BRAND);
      doc.circle(M + 1.4 + col * 76, y + row * 8 - 1.2, 1, 'F');
      doc.text(a, M + 5 + col * 76, y + row * 8);
    });
  }

  // Renders stacked down the right column rather than repeating the cover.
  const RENDER_BOXES = [{ y: 34, h: 62 }, { y: 100, h: 52 }];
  for (const [i, src] of (story.renders || []).entries()) {
    const slot = RENDER_BOXES[i];
    if (!slot) break;
    try {
      const img = await loadImage(src);
      const box = { x: PW - M - 105, y: slot.y, w: 105, h: slot.h };
      const r = coverRect(img, box.x, box.y, box.w, box.h);
      // Clip to the box so cover-cropping doesn't spill over the page.
      doc.saveGraphicsState();
      doc.rect(box.x, box.y, box.w, box.h, null);
      doc.clip(); doc.discardPath();
      doc.addImage(img.data, img.format, r.x, r.y, r.w, r.h, undefined, 'FAST');
      doc.restoreGraphicsState();
      setDraw(doc, LINE); doc.setLineWidth(0.3);
      doc.rect(box.x, box.y, box.w, box.h);
    } catch (err) { console.warn('project image:', err.message); }
  }
  footer(doc, unit, page);

  /* ---------- 3. location ---------- */
  const place = CONFIG.place || {};
  doc.addPage(); page++;
  header(doc, 'Location', CONFIG.location);
  y = sectionTitle(doc, place.heading || CONFIG.location, 34);

  // An optional paragraph above the map, where the project supplies one.
  if (place.text) {
    doc.setFont('helvetica', 'normal').setFontSize(9.5);
    setText(doc, INK);
    const lines = doc.splitTextToSize(place.text, PW - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 5 + 4;
  }

  try {
    if (!place.map) throw new Error('no map configured for this project');
    const map = await loadImage(place.map);
    const r = containRect(map, M, y - 2, PW - 2 * M, PH - y - 30);
    doc.addImage(map.data, map.format, r.x, r.y, r.w, r.h, undefined, 'FAST');
    if (place.note) {
      doc.setFont('helvetica', 'normal').setFontSize(9);
      setText(doc, MUTED);
      doc.text(place.note, PW / 2, r.y + r.h + 8, { align: 'center' });
    }
  } catch (err) {
    console.warn('map image:', err.message);
    doc.setFont('helvetica', 'normal').setFontSize(10);
    setText(doc, MUTED);
    doc.text('Location map unavailable.', M, y + 10);
  }
  footer(doc, unit, page);

  /* ---------- 4. floor plan ---------- */
  doc.addPage(); page++;
  header(doc, floor.label, `${floor.use} floor`);
  y = sectionTitle(doc, `Clinic ${unit.clinic} on the ${floor.label.toLowerCase()}`, 34);
  try {
    const planImg = await loadImage(CONFIG.planPrint);
    const r = containRect(planImg, M, y - 4, PW - 2 * M, PH - y - 18);
    doc.addImage(planImg.data, planImg.format, r.x, r.y, r.w, r.h, undefined, 'FAST');

    // Mark the selected room with a pin, matching the on-screen plan. A pin
    // reads unambiguously even though the traced room outlines are approximate.
    const P = PLANS[CONFIG.planKey];
    const pin = P.pins[unit.clinic];
    const px = r.x + (pin.x / P.refW) * r.w;
    const py = r.y + (pin.y / P.refH) * r.h;
    // No text label: the drawing already prints "CLINIC n" in the room and the
    // page heading names it, so a caption here would sit on top of both.
    setFill(doc, [255, 255, 255]);
    doc.circle(px, py, 3.9, 'F');            // white ring for contrast
    setFill(doc, BRAND);
    doc.circle(px, py, 3.1, 'F');
  } catch (err) {
    console.warn('plan image:', err.message);
    doc.setFont('helvetica', 'normal').setFontSize(10);
    setText(doc, MUTED);
    doc.text('Floor plan unavailable.', M, y + 10);
  }
  footer(doc, unit, page);

  /* ---------- 5. the unit ---------- */
  doc.addPage(); page++;
  header(doc, 'Your Unit', `Unit ${unit.code}`);
  y = sectionTitle(doc, 'Unit details', 34);

  const facts = [
    ['Unit code', unit.code],
    ['Clinic number', String(unit.clinic)],
    ['Floor', floor.label],
    ['Type', unit.type],
    ['Indoor area', `${unit.area} m²`],
    ['Price per m²', unit.meterPrice ? fmtMoney(unit.meterPrice) : '—'],
  ];
  facts.forEach(([k, v], i) => {
    const yy = y + i * 11;
    doc.setFont('helvetica', 'normal').setFontSize(9);
    setText(doc, MUTED);
    doc.text(k.toUpperCase(), M, yy);
    doc.setFont('helvetica', 'bold').setFontSize(12);
    setText(doc, INK);
    doc.text(v, M + 52, yy);
    setDraw(doc, LINE); doc.setLineWidth(0.2);
    doc.line(M, yy + 3.6, M + 118, yy + 3.6);
  });

  // Headline price block
  const bx = PW - M - 118;
  setFill(doc, BRAND_DARK);
  doc.roundedRect(bx, y - 8, 118, 46, 3, 3, 'F');
  doc.setFont('helvetica', 'normal').setFontSize(9);
  setText(doc, [255, 255, 255]);
  doc.text(plan.cash ? 'PRICE AFTER CASH DISCOUNT' : 'TOTAL UNIT PRICE', bx + 10, y + 2);
  doc.setFont('helvetica', 'bold').setFontSize(22);
  const headline = fmt(summary.netPrice);
  doc.text(headline, bx + 10, y + 15);
  // Measure while the 22pt bold face is still selected — getTextWidth reports
  // the width at the *current* size, so measuring after switching to 10pt put
  // "EGP" on top of the number.
  const headlineW = doc.getTextWidth(headline);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(CONFIG.currency, bx + 10 + headlineW + 3, y + 15);
  doc.setFontSize(8.5);
  doc.text(plan.cash
    ? `${pctLabel(plan.discount)} discount on ${fmt(summary.originalPrice)} ${CONFIG.currency}`
    : `${unit.area} m² × ${fmt(unit.meterPrice || 0)} ${CONFIG.currency}/m²`, bx + 10, y + 24);
  doc.text(`Delivery ${CONFIG.deliveryMonths / 12} years from contract`, bx + 10, y + 31);

  // Plan summary strip
  y += 74;
  doc.setFont('helvetica', 'bold').setFontSize(11);
  setText(doc, BRAND_DARK);
  doc.text(`Selected plan — ${plan.label}`, M, y);
  y += 8;
  const strip = plan.cash
    ? [['Cash payment', fmtMoney(summary.netPrice)], ['Maintenance (10%)', fmtMoney(summary.maintenance)], ['Total payable', fmtMoney(summary.totalPayable)]]
    : [['Down payment', fmtMoney(summary.downPayment)],
       [`${summary.instalmentCount} quarterly instalments`, fmtMoney(summary.instalmentAmount)],
       ['Maintenance (10%)', fmtMoney(summary.maintenance)],
       ['Total payable', fmtMoney(summary.totalPayable)]];
  const cw = (PW - 2 * M) / strip.length;
  strip.forEach(([k, v], i) => {
    setDraw(doc, LINE); doc.setLineWidth(0.3);
    doc.rect(M + i * cw, y, cw, 22);
    doc.setFont('helvetica', 'normal').setFontSize(8.5);
    setText(doc, MUTED);
    doc.text(k, M + i * cw + 6, y + 8);
    doc.setFont('helvetica', 'bold').setFontSize(12);
    setText(doc, i === strip.length - 1 ? BRAND_DARK : INK);
    doc.text(v, M + i * cw + 6, y + 17);
  });
  footer(doc, unit, page);

  /* ---------- 6. payment schedule ---------- */
  doc.addPage(); page++;
  header(doc, 'Payment Schedule', `${plan.label} · from ${fmtDate(contractDate)}`);
  sectionTitle(doc, 'Full schedule', 34);

  /* Headline figures first, then the detail — the same order as the app, and
   * the order a customer asks the questions in. */
  const cards = plan.cash
    ? [['CASH PRICE', fmt(summary.netPrice), `after ${pctLabel(plan.discount)} discount`],
       ['YOU SAVE', fmt(summary.discount), `off ${fmt(summary.originalPrice)}`],
       ['MAINTENANCE', fmt(summary.maintenance), `${pctLabel(CONFIG.maintenanceRate)} of the unit price`],
       ['TOTAL PAYABLE', fmt(summary.totalPayable), CONFIG.currency, true]]
    : [['CONTRACT PRICE', fmt(summary.netPrice), `${unit.area} m² clinic`],
       ['DOWN PAYMENT', fmt(summary.downPayment),
        summary.downParts.length > 1
          ? `${pctLabel(summary.downPct)} in ${summary.downParts.length} parts`
          : `${pctLabel(summary.downPct)} on contract`],
       ['QUARTERLY INSTALMENT', fmt(summary.instalmentAmount),
        `${summary.instalmentCount} payments over ${summary.years} years`],
       ['TOTAL PAYABLE', fmt(summary.totalPayable),
        `incl. ${pctLabel(CONFIG.maintenanceRate)} maintenance`, true]];

  const CARD_H = 17, CARD_GAP = 3;
  const cardW = (PW - 2 * M - CARD_GAP * (cards.length - 1)) / cards.length;
  cards.forEach(([label, value, sub, strong], i) => {
    const cx = M + i * (cardW + CARD_GAP);
    if (strong) {
      setFill(doc, BRAND_DARK);
      doc.roundedRect(cx, 42, cardW, CARD_H, 2, 2, 'F');
    } else {
      setFill(doc, [250, 253, 254]); setDraw(doc, LINE); doc.setLineWidth(0.3);
      doc.roundedRect(cx, 42, cardW, CARD_H, 2, 2, 'FD');
    }
    doc.setFont('helvetica', 'bold').setFontSize(6.5);
    setText(doc, strong ? [205, 232, 240] : MUTED);
    doc.text(label, cx + 5, 48);
    doc.setFont('helvetica', 'bold').setFontSize(13);
    setText(doc, strong ? [255, 255, 255] : INK);
    doc.text(value, cx + 5, 54.5);
    doc.setFont('helvetica', 'normal').setFontSize(6.5);
    setText(doc, strong ? [205, 232, 240] : MUTED);
    doc.text(sub, cx + 5, 58.5);
  });

  /* Two tables side by side: the longest plan is 40 quarterly instalments plus
   * a two-part down payment and maintenance = 43 rows, which will not fit in
   * one column. Widths are sized so BOTH tables plus the gutter fit inside the
   * margins — 2 x TABLE_W + GUTTER must stay under PW - 2M (265mm), or the
   * right-hand percentages fall off the page. */
  const COLS = [
    { w: 12, label: 'Year' },
    { w: 33, label: 'Installment' },
    { w: 25, label: 'Date' },
    { w: 26, label: `Amount (${CONFIG.currency})`, num: true },
    { w: 12, label: '%', num: true },
    { w: 15, label: 'Yearly %', num: true },
  ];
  const TABLE_W = COLS.reduce((s, c) => s + c.w, 0);   // 123
  const GUTTER = 17;
  const ROW_H = 5.2;
  const HEAD_H = 6;
  const colX = [M, M + TABLE_W + GUTTER];
  let headY = 65;
  // Leave the footer rule clear; nothing may run under it.
  let maxRows = Math.floor((PH - 18 - (headY + HEAD_H)) / ROW_H);

  /** x of a column's left edge, and of its right edge for the numeric ones. */
  const cellX = (x, i) => x + COLS.slice(0, i).reduce((s, c) => s + c.w, 0);

  const drawHead = (x, yy) => {
    setFill(doc, [10, 58, 72]);                       // --brand-ink
    doc.roundedRect(x, yy, TABLE_W, HEAD_H, 1, 1, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(6.2);
    setText(doc, [255, 255, 255]);
    COLS.forEach((c, i) => {
      const left = cellX(x, i);
      doc.text(c.label.toUpperCase(), c.num ? left + c.w - 2 : left + 2, yy + 4,
        { align: c.num ? 'right' : 'left' });
    });
  };

  /* Flatten the year blocks into rows, remembering where each block starts and
   * ends so the Year and Yearly % cells can be printed once per block. jsPDF
   * has no rowspan, so a block that straddles the column break reprints its
   * label at the top of the next column and prints its total wherever it ends. */
  /* Percentages are of the ORIGINAL price, not the discounted one. On a cash
   * plan the discount and the maintenance are both quoted against the list
   * price, so basing the column on the net price would print maintenance as
   * 15.38% two lines under a card that calls it 10%. */
  const blocks = scheduleByYear(rows, summary.originalPrice);
  const flat = [];
  for (const b of blocks) {
    b.rows.forEach((r, i) => flat.push({
      ...r, block: b, first: i === 0, last: i === b.rows.length - 1,
    }));
  }

  let col = 0, rowIdx = 0, yy = headY + HEAD_H + 3.8;
  drawHead(colX[0], headY);
  for (const r of flat) {
    if (rowIdx >= maxRows) {
      col++; rowIdx = 0; yy = headY + HEAD_H + 3.8;
      if (col >= colX.length) {
        footer(doc, unit, page);
        doc.addPage(); page++;
        header(doc, 'Payment Schedule (continued)', plan.label);
        sectionTitle(doc, 'Full schedule', 34);
        headY = 46;
        maxRows = Math.floor((PH - 18 - (headY + HEAD_H)) / ROW_H);
        col = 0; yy = headY + HEAD_H + 3.8;
      }
      drawHead(colX[col], headY);
    }
    const x = colX[col];
    const isMaint = r.label.startsWith('Maintenance');

    // Tint the rows that are not routine instalments, so the eye finds them.
    if (r.down || isMaint) {
      setFill(doc, r.down ? [234, 248, 251] : [253, 249, 236]);
      doc.rect(x, yy - 3.6, TABLE_W, ROW_H, 'F');
    }

    // Year label: on the block's first row, or at the top of a fresh column.
    if (r.first || rowIdx === 0) {
      doc.setFont('helvetica', 'bold').setFontSize(6.4);
      setText(doc, [10, 58, 72]);
      doc.text(r.block.label.replace('On contract', 'Contract'), cellX(x, 0) + 2, yy);
    }

    doc.setFont('helvetica', r.down || isMaint ? 'bold' : 'normal').setFontSize(7.2);
    setText(doc, isMaint ? BRAND_DARK : INK);
    doc.text(r.label, cellX(x, 1) + 2, yy);

    doc.setFont('helvetica', 'normal').setFontSize(7.2);
    setText(doc, MUTED);
    doc.text(fmtDate(r.date), cellX(x, 2) + 2, yy);

    doc.setFont('helvetica', r.down || isMaint ? 'bold' : 'normal');
    setText(doc, INK);
    doc.text(fmt(r.amount), cellX(x, 3) + COLS[3].w - 2, yy, { align: 'right' });

    doc.setFont('helvetica', 'normal').setFontSize(6.8);
    setText(doc, MUTED);
    doc.text(fmtPct(r.pct), cellX(x, 4) + COLS[4].w - 2, yy, { align: 'right' });

    if (r.last) {
      doc.setFont('helvetica', 'bold').setFontSize(6.8);
      setText(doc, BRAND_DARK);
      doc.text(fmtPct(r.block.pct), cellX(x, 5) + COLS[5].w - 2, yy, { align: 'right' });
    }

    setDraw(doc, [238, 243, 246]); doc.setLineWidth(0.15);
    doc.line(x, yy + 1.6, x + TABLE_W, yy + 1.6);
    yy += ROW_H; rowIdx++;
  }
  footer(doc, unit, page);

  /* ---------- 7. terms ---------- */
  doc.addPage(); page++;
  header(doc, 'Terms & Notes', `Unit ${unit.code}`);
  y = sectionTitle(doc, 'Terms', 34);
  const terms = [
    `Delivery is ${CONFIG.deliveryMonths / 12} years from the date of contract.`,
    `Maintenance is ${pctLabel(CONFIG.maintenanceRate)} of the original unit price, payable one year before delivery.`,
    `Instalments are payable quarterly, beginning three months after the contract date of ${fmtDate(contractDate)}.`,
    plan.cash
      ? `The cash price reflects a ${pctLabel(plan.discount)} discount on the original unit price. Maintenance is calculated on the original price.`
      : (plan.blurb
        ? `This plan is ${plan.blurb}.`
        : `This plan is ${pctLabel(plan.down)} down payment with the balance over ${plan.years} years.`),
    'Prices are quoted in Egyptian Pounds and exclude any government fees or taxes payable on transfer.',
    'Unit availability is live at the time this offer was generated and is not a reservation. Availability is confirmed only on signature of a reservation form.',
    'This document is an indicative offer for discussion and does not constitute a contract.',
  ];
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  terms.forEach((t) => {
    setFill(doc, BRAND);
    doc.circle(M + 1.4, y - 1.2, 1, 'F');
    setText(doc, INK);
    const lines = doc.splitTextToSize(t, PW - 2 * M - 8);
    doc.text(lines, M + 5, y);
    y += lines.length * 5 + 3.5;
  });

  y += 6;
  doc.setFont('helvetica', 'bold').setFontSize(10.5);
  setText(doc, BRAND_DARK);
  doc.text(`Eliwah Group  ·  ${CONFIG.name}`, M, y);
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  setText(doc, MUTED);
  // Only the contact details this project actually supplied.
  const c = CONFIG.contact || {};
  const contactLine = [c.web, c.address, c.phone, c.email].filter(Boolean).join('   ·   ');
  if (contactLine) doc.text(contactLine, M, y + 6);
  footer(doc, unit, page);

  return { doc, filename: offerFilename(unit, floor) };
}

/**
 * Build the offer and hand it to the agent.
 *
 * On a phone the point of this app is to get a PDF into a WhatsApp chat, so the
 * share sheet is the primary path: it passes the actual file, which lands in
 * the conversation as an attachment the customer can open. Desktop browsers
 * mostly cannot share files, so they fall through to a download — as does an
 * agent who dismisses the share sheet without picking anything.
 *
 * @returns {Promise<'shared'|'downloaded'>}
 */
async function deliverOffer(unit, plan, floor, contractDate = new Date()) {
  const { doc, filename } = await buildOfferPDF(unit, plan, floor, contractDate);
  const file = new File([doc.output('blob')], filename, { type: 'application/pdf' });

  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      // The agent closing the sheet is a decision, not a failure — don't then
      // download a file they just declined to send.
      if (err && err.name === 'AbortError') return 'shared';
      console.warn('share failed, downloading instead:', err && err.message);
    }
  }
  doc.save(filename);
  return 'downloaded';
}

/** Whether this browser can put a PDF into the system share sheet. */
function canShareFiles() {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [new File([new Blob()], 'probe.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}
