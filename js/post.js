/* The WhatsApp post — the second way an offer leaves this app.
 *
 * WHY THIS EXISTS. The PDF offer is a one-to-one document: it is addressed to a
 * customer, it carries a payment schedule, and it lands in a chat as an
 * attachment. That is exactly wrong for the way most of a sale actually starts.
 * Agents work broker groups — hundreds of them — and in a group a PDF reads as
 * a formal offer nobody opens, while a formatted post with a plan image and a
 * price reads as a listing and gets forwarded. So the team stopped using the
 * app for that step and started retyping the post by hand for every unit
 * (observed 2026-08-22), which is slow, drifts off-message, and puts the price
 * back in the hands of whoever is typing.
 *
 * This module hands them the post instead: the header assembled from the same
 * live inventory row the PDF uses, the project copy from CONFIG.post, and the
 * floor plan rendered with the unit pinned.
 *
 * TWO LENGTHS, because the two jobs are different:
 *   short — plan image + the unit and its price. For a broker group, where the
 *           post competes with fifty others and only has to earn a reply.
 *   long  — the same, plus the location map and the full project story. For a
 *           customer who already asked, or a group where the project is unknown.
 *
 * WHAT THE IMAGE MUST NOT SHOW. The on-screen plan colours every room by
 * status: green available, red sold. That is for the agent. This image goes to
 * strangers, so it is drawn from the clean print plan with ONLY the offered
 * rooms marked — a post must never publish which units are already gone.
 *
 * WHAT THE TEXT MUST NOT CARRY. No deep link back into the app. The #emc/C313
 * links are how one agent sends another to a unit, but the app is a public
 * static site: anyone holding that link has the whole inventory, every price
 * and the offer generator itself. It stays out of anything broker-facing.
 */

const POST_MAX_W = 1600;          // enough for WhatsApp, small enough to send
const POST_JPEG_Q = 0.9;

/* Arabic floor names, keyed by the floor keys used in CONFIG.floors. The post
 * is Arabic and "Third Floor" in the middle of it reads as a machine wrote it,
 * which is the whole thing this feature is trying to avoid. */
const AR_FLOOR = {
  Ground: 'الأرضي', First: 'الأول', Second: 'الثاني', Third: 'الثالث',
  Fourth: 'الرابع', Fifth: 'الخامس', Sixth: 'السادس', Seventh: 'السابع',
  Eighth: 'الثامن', Ninth: 'التاسع',
};

/* Western digits throughout, deliberately. The sales team's own posts use them,
 * and Arabic-Indic digits with Arabic separators are a known way to get a
 * number read back wrong once it has been copied out of the message. */
const postNum = (n) => Math.round(n).toLocaleString('en-US');

/**
 * Unicode isolates — LEFT-TO-RIGHT ISOLATE … POP DIRECTIONAL ISOLATE.
 *
 * The post is Arabic, and the bidirectional algorithm has no way to know that
 * "10%" is one atom: left to itself it renders "%10". Wrapping the value says
 * so. Arabic values are skipped, because forcing one left-to-right is the very
 * reordering this exists to stop.
 */
function iso(v) {
  const s = String(v);
  if (/[؀-ۿ]/.test(s) || !/[0-9A-Za-z]/.test(s)) return s;
  return `⁦${s}⁩`;
}

/** What the agent has chosen in the sheet. Survives reopening, not reloading. */
const postState = { mode: 'short', terms: true };

/* ------------------------------------------------------------------ text -- */

/**
 * The unit block — the only part that changes per post, and the only part
 * whose numbers must never be typed by a human.
 */
function postUnitBlock(unit, plan, floor) {
  const P = CONFIG.post || {};
  const lines = [];

  /* Arabic counts two of a thing differently from three, and "2 عيادات" is
   * how a machine writes it. The dual form is a separate string in CONFIG for
   * that reason — a combined offer is usually two units, so this is the case
   * that gets seen. */
  if (unit.combined) {
    const noun = unit.count === 2
      ? (P.unitNounDual || P.unitNounPlural)
      : `${unit.count} ${P.unitNounPlural || 'وحدات'}`;
    lines.push(`${noun} · ${iso(unit.area)} متر`);
    // The individual areas, so a combined offer does not read as one big room.
    lines.push(iso(unit.units.map((u) => `${u.area}`).join(' + ')) + ' متر');
  } else {
    lines.push(`${P.unitNoun || 'وحدة'} ${iso(unit.area)} متر`);
  }

  const ar = AR_FLOOR[floor.key];
  lines.push(ar ? `الدور ${ar}` : floor.label);

  if (P.finish) lines.push(P.finish);
  lines.push('');
  lines.push(`📍 السعر ${iso(postNum(unit.price))} جنيه`);

  /* The terms line is computed, never written. An agent quoting "10% down" off
   * the top of their head against a plan that is actually 15% is the failure
   * this whole app exists to prevent, and it would be reintroduced the moment
   * this line became free text. */
  if (postState.terms && plan) {
    const { summary } = buildSchedule(unit, plan, state.contractDate);
    if (plan.cash) {
      /* The cash price, NOT the list price above it. A post reading "السعر
       * 7,540,000" beside "cash, 25% discount" tells a broker the discount is
       * on top of a price that already has it, and the first person to work it
       * out is the customer. Both numbers, explicitly. */
      lines.push(`💰 كاش ${iso(postNum(summary.netPrice))} جنيه · خصم ${iso(pctLabel(plan.discount))}`);
    } else {
      lines.push(`💰 مقدم ${iso(pctLabel(summary.downPct))}`
        + ` — ${iso(postNum(summary.downPayment))} جنيه`);

      /* 9MC's 20% plan is not paid up front: 10% on contract and 10% a year
       * later. A post reading "20% down" against a plan the customer only pays
       * half of on the day is a worse quote than no quote — and it is the more
       * attractive terms, so leaving it out sells the plan short as well as
       * describing it wrongly. Single-payment plans are just the one-part case
       * and say nothing extra. */
      const parts = summary.downParts || [];
      if (parts.length > 1) {
        lines.push('يُدفع على ' + parts.map((p) => `${iso(pctLabel(p.pct))}`).join(' + ')
          + '، ' + parts.map((p) => {
            if (p.month === 0) return 'عند التعاقد';
            const y = p.month / 12;
            // "بعد 1 سنة" is how a machine writes it; Arabic says "بعد سنة".
            return y === 1 ? 'بعد سنة' : `بعد ${iso(y)} سنوات`;
          }).join(' و'));
      }

      lines.push(`تقسيط ${iso(summary.years)} سنوات`
        + ` · ${iso(summary.instalmentCount)} قسط ربع سنوي ${iso(postNum(summary.instalmentAmount))} جنيه`);
    }
  }
  return lines;
}

/**
 * @param {'short'|'long'} mode
 * @returns {string} the post, ready to paste into WhatsApp.
 */
function buildPostText(mode = postState.mode) {
  const unit = offerUnit();
  const floor = CONFIG.floors.find((f) => f.key === state.floorKey);
  const plan = CONFIG.plans.find((p) => p.id === state.planId);
  const P = CONFIG.post || {};

  const out = [];
  if (P.title) out.push(P.title);
  if (P.place) out.push(P.place);
  out.push('');
  out.push(...postUnitBlock(unit, plan, floor));

  if (mode === 'long' && P.body) {
    out.push('');
    out.push('━━━━━━━━━━');
    out.push('');
    out.push(P.body.trim());
  }
  if (P.closing) { out.push(''); out.push(P.closing); }

  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/* ----------------------------------------------------------------- image -- */

/**
 * Decoded drawings, KEYED BY SRC. The full-size renders are worth keeping, but
 * only against the file they actually came from.
 *
 * This was a single `postPlanImg` variable, and it was a live bug (reported
 * 2026-08-22): one app serves EMC and 9MC, so the first project an agent
 * opened a post for held the cache for the whole session. Post a 9MC clinic,
 * switch to EMC, post again — and 9MC's aerial drawing came out, until the app
 * was closed and reopened.
 *
 * Worse than a stale picture. `PLANS[CONFIG.planKey]` IS re-read on every call,
 * so the second post drew EMC's traced room outlines and EMC's pins onto 9MC's
 * drawing: a wrong plan, marked in the wrong places, going to a broker group.
 * Anything cached across a project switch has to be keyed by the project, or by
 * the thing it was built from.
 */
const postImgCache = new Map();

function postLoadImage(src) {
  if (postImgCache.has(src)) return postImgCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
  // A failed decode must not be remembered as the answer forever.
  p.catch(() => postImgCache.delete(src));
  postImgCache.set(src, p);
  return p;
}

/** Ray casting, in canvas space. Used to keep pins off each other. */
function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A map pin, tip at (x, y). Drawn over the room fill so it survives a crop. */
function drawPin(ctx, x, y, r) {
  const top = y - r * 2.6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - r * 1.35, y - r * 1.5, x - r, top);
  ctx.arc(x, top, r, Math.PI, 0);
  ctx.quadraticCurveTo(x + r * 1.35, y - r * 1.5, x, y);
  ctx.closePath();
  ctx.fillStyle = '#d13c33';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, r * 0.28);
  ctx.stroke();
  ctx.fill();
  ctx.beginPath();                       // the hole
  ctx.arc(x, top, r * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

/**
 * The floor plan with this offer's rooms marked, as a JPEG blob.
 *
 * Deliberately built from CONFIG.planPrint — the clean drawing the PDF uses —
 * and NOT from the on-screen plan, which is painted with every unit's
 * availability. See the note at the top of this file.
 */
async function buildPinnedPlan(unit, floor) {
  const img = await postLoadImage(CONFIG.planPrint);
  const P = PLANS[CONFIG.planKey];

  const scale = Math.min(1, POST_MAX_W / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const sx = w / P.refW, sy = h / P.refH;

  /* One drawing serves several identical floors, so the floor name printed on
   * it is right for only one of them — the same patch the PDF applies. Without
   * it a second-floor clinic is posted on a plan captioned "3ND". */
  if (P.floorLabel) {
    const L = P.floorLabel;
    const bx = L.x * sx, by = L.y * sy, bw = L.w * sx, bh = L.h * sy;
    ctx.fillStyle = `rgb(${(L.fill || [255, 255, 255]).join(',')})`;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#464646';
    ctx.textAlign = 'center';
    ctx.font = `${Math.round(bh * 0.22)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText('MEDICAL FLOOR', bx + bw / 2, by + bh * 0.44);
    ctx.font = `600 ${Math.round(bh * 0.3)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(String(floorOrdinal(floor.key)).toUpperCase(), bx + bw / 2, by + bh * 0.86);
  }

  const pinR = Math.max(9, Math.round(w * 0.011));
  const scaled = (n) => {
    const poly = P.outlines && P.polygons && P.polygons[n];
    return poly && poly.map(([px, py]) => [px * sx, py * sy]);
  };
  const drawn = [];                      // pin anchors already placed

  for (const n of unit.clinics) {
    const room = P.outlines && P.polygons && P.polygons[n];
    if (room) {
      ctx.beginPath();
      room.forEach(([px, py], i) => (i ? ctx.lineTo(px * sx, py * sy) : ctx.moveTo(px * sx, py * sy)));
      ctx.closePath();
      ctx.save();
      ctx.globalAlpha = 0.32;            // let the drawing read through
      ctx.fillStyle = '#12a8cb';
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#0b7e99';
      ctx.lineWidth = Math.max(1.5, w * 0.0016);
      ctx.stroke();
    }
    const pin = P.pins[n];
    if (!pin) continue;

    /* The pin hangs off the TOP EDGE of the room, not its centre.
     *
     * The drawing prints "CLINIC 13 / 27 m²" at the centre of each room, and a
     * pin dropped on the centroid sits squarely on top of it — which erases the
     * one label that tells a broker which unit the post is about. Anchored to
     * the top edge, the body floats in the corridor above and the label stays
     * readable. Rooms on the top row have no corridor above them and the pin
     * would leave the image, so those hang inside from the bottom edge instead,
     * which still clears the room's name. */
    const tipX = pin.x * sx;
    let tipY = pin.y * sy;
    if (room) {
      const ys = room.map(([, py]) => py * sy);
      const top = Math.min(...ys);
      tipY = top - pinR * 3.9 < 0 ? Math.max(...ys) : top;
    }

    /* A combined offer is usually two rooms stacked in the same wing, and then
     * the lower room's pin hangs squarely over the upper one — two pins on one
     * highlighted block, the second obscuring the first. Where the anchor lands
     * inside another room in the same offer, drop it: the block is already
     * shaded as one, and the room above carries the pin for the pair. Rooms far
     * apart still get one each, which is what a pin is for. */
    const overlaps = unit.clinics.some((m) => {
      if (m === n) return false;
      const other = scaled(m);
      return other && pointInPoly(tipX, tipY - pinR * 2.6, other);
    });
    if (overlaps) continue;

    drawn.push([tipX, tipY]);
    drawPin(ctx, tipX, tipY, pinR);
  }

  // Every room suppressed above (rooms boxed in on all sides): mark the first.
  if (!drawn.length && unit.clinics.length) {
    const pin = P.pins[unit.clinics[0]];
    if (pin) drawPin(ctx, pin.x * sx, pin.y * sy, pinR);
  }

  return new Promise((resolve, reject) => cv.toBlob(
    (b) => (b ? resolve(b) : reject(new Error('could not render the plan'))),
    'image/jpeg', POST_JPEG_Q));
}

/** Turns an asset already on disk into a File, for the share sheet. */
async function postFileFromAsset(src, name) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`could not load ${src}`);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

/**
 * The images that go with the post: the pinned plan always, plus the location
 * map in long mode — a broker who does not know the project asks "where?"
 * before anything else.
 */
async function buildPostImages(mode = postState.mode) {
  const unit = offerUnit();
  const floor = CONFIG.floors.find((f) => f.key === state.floorKey);
  const files = [];

  const plan = await buildPinnedPlan(unit, floor);
  files.push(new File([plan], `${CONFIG.name}-${unit.code}-plan.jpg`, { type: 'image/jpeg' }));

  if (mode === 'long' && CONFIG.place && CONFIG.place.map) {
    // A missing map must not cost the agent the whole post.
    try {
      files.push(await postFileFromAsset(CONFIG.place.map, `${CONFIG.name}-location.jpg`));
    } catch (err) {
      console.warn('location map:', err.message);
    }
  }
  return files;
}

/* -------------------------------------------------------------- the sheet -- */

/**
 * Copy that works without a secure context or clipboard permission.
 * The textarea is the fallback and it is also the point: an agent who wants to
 * add a line of their own edits it there and copies what they edited.
 */
async function postCopyText() {
  const ta = $('postText');
  const text = ta.value;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    ta.focus();
    ta.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }
}

function postFlash(msg, bad) {
  const n = $('postNote');
  n.textContent = msg;
  n.classList.toggle('bad', !!bad);
}

/** Log the post the same way an offer is logged, so adoption is measurable. */
function postLog(delivery) {
  if (typeof logOffer !== 'function') return;
  const plan = CONFIG.plans.find((p) => p.id === state.planId);
  const unit = offerUnit();
  logOffer(offerRow(CONFIG.id, unit, state.picked, plan,
    buildSchedule(unit, plan, state.contractDate).summary, { delivery }));
}

/**
 * navigator.share, but it always settles.
 *
 * On desktop Chrome for Windows `navigator.share` opens an OS flyout and never
 * reports back — the promise neither resolves nor rejects. A `finally` that
 * re-enables the button therefore never runs and the button is dead until the
 * page is reloaded, which is the exact failure that made agents stop trusting
 * the send button. A promise that never settles is not an error anywhere, so
 * nothing catches it; it has to be raced.
 */
function shareOrTimeOut(payload, ms = 60000) {
  return Promise.race([
    navigator.share(payload),
    new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('share timed out'), { name: 'TimeoutError' })), ms)),
  ]);
}

/* Capability is not device: desktop Chrome answers yes to canShare({files}) and
 * then hangs. maxTouchPoints cannot answer it either — a touchscreen laptop
 * reports 10. telemetryDevice() already asks this question correctly. */
const postOnMobile = () =>
  typeof telemetryDevice !== 'function' || telemetryDevice() !== 'desktop';

async function postShare() {
  const btn = $('postSend');
  const was = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const files = await buildPostImages();
    const text = $('postText').value;

    /* Text and image together, where the browser will take both — Android
     * WhatsApp turns the text into the image caption, which is exactly the
     * post. Where it will not, the text is copied and the images are shared on
     * their own, and the agent pastes one caption. Copying FIRST, because once
     * the share sheet is open the page no longer has focus and the clipboard
     * write is refused. */
    const payload = { files, text };
    const bothOk = typeof navigator.canShare === 'function' && navigator.canShare(payload);
    const copied = await postCopyText();

    if (typeof navigator.share === 'function' && postOnMobile()) {
      try {
        await shareOrTimeOut(bothOk ? payload : { files });
        postLog(`post-${postState.mode}`);
        postFlash(bothOk
          ? 'Sent. The text went with the image as its caption.'
          : 'Image sent — the text is on your clipboard, paste it as the caption.');
        return;
      } catch (err) {
        // Dismissing the sheet is a decision, not a failure: do not then dump
        // a file into their downloads that they just declined to send.
        if (err && err.name === 'AbortError') { postFlash('Cancelled.'); return; }
        console.warn('share failed, saving instead:', err && err.message);
        // A timeout means the sheet may still be open behind us; saving as well
        // is the safe direction — a duplicate file beats a lost post.
      }
    }

    for (const f of files) postSaveFile(f);
    postLog(`post-${postState.mode}`);
    postFlash(copied
      ? 'Image saved and the text copied — attach it in WhatsApp and paste.'
      : 'Image saved. Copy the text above, then attach the image in WhatsApp.');
  } catch (err) {
    postFlash('Could not build the post: ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = was;
  }
}

/** Desktop path: put the file in the downloads folder. */
function postSaveFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function renderPostPreview() {
  /* A project with no payment terms supplied can still be posted about — it
     just cannot carry the terms line, so the toggle goes away rather than
     sitting there doing nothing. */
  const hasPlans = !!(CONFIG.plans && CONFIG.plans.length);
  if (!hasPlans) postState.terms = false;
  $('postTerms').checked = postState.terms;
  $('postTerms').disabled = !hasPlans;
  $('postTerms').closest('.post-toggle').classList.toggle('hidden', !hasPlans);

  $('postText').value = buildPostText();
  for (const b of document.querySelectorAll('#postModes button')) {
    b.classList.toggle('on', b.dataset.mode === postState.mode);
  }

  const shots = $('postShots');
  shots.innerHTML = '';
  try {
    for (const f of await buildPostImages()) {
      const im = el('img');
      im.src = URL.createObjectURL(f);
      im.onload = () => setTimeout(() => URL.revokeObjectURL(im.src), 30000);
      shots.appendChild(im);
    }
  } catch (err) {
    shots.appendChild(el('div', 'note', 'Plan image unavailable: ' + err.message));
  }
}

function openPostSheet() {
  $('postSheet').classList.remove('hidden');
  document.body.classList.add('noscroll');
  postFlash('');
  renderPostPreview();
  warnIfStale();
}

/**
 * A post must not quietly carry a price the app is unsure about.
 *
 * This is the one delivery path where a wrong number cannot be taken back. A
 * PDF goes to one customer, who can be sent a corrected one; a post goes into
 * broker groups and is forwarded, screenshotted and quoted for weeks. And the
 * app IS sometimes unsure: when the sheet cannot be reached it falls back to
 * prices baked in at build time and marks itself stale — which is easy to miss
 * in a header bar while the unit card in front of you looks perfectly normal.
 *
 * Not a hard block. The agent may have good reason — an old price beats a
 * missed post on a unit that has not moved in months, and they can see the date
 * and judge for themselves. But it has to be a decision rather than an
 * accident, so the warning sits inside the sheet beside the Send button
 * instead of up in the header where it was already being missed.
 */
function warnIfStale() {
  if (state.live) return;
  const when = state.fetchedAt ? state.fetchedAt.toLocaleDateString() : 'an unknown date';
  postFlash(`⚠ These are SAVED prices from ${when}, not live — the inventory sheet `
    + 'could not be reached. Press Refresh before posting this to a group.', true);
}

function closePostSheet() {
  $('postSheet').classList.add('hidden');
  document.body.classList.remove('noscroll');
}
