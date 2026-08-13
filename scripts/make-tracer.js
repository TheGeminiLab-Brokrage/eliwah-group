/* Builds the click-to-trace tool for the floor plans.
 *
 *   node scripts/make-tracer.js     ->  raw/trace.html
 *
 * The output is one self-contained HTML file with the plan images embedded as
 * data URIs, so it can be opened straight off disk with no server and no
 * missing-asset surprises. It writes coordinates in the SAME reference space
 * js/plan.js uses, so the result pastes in with no conversion step — which is
 * where errors would otherwise creep back in.
 *
 * Why trace at all, when pins already work: pins cannot show a customer that
 * two clinics sit side by side, which is the whole point of a combined offer.
 * Outlines can. The polygons EMC already has were traced against a lower-res
 * render and are close but not exact, so both plans get done properly here.
 *
 * raw/ is gitignored; re-run this whenever the drawings change.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { PLANS } = require(path.join(root, 'js/plan.js'));

/* The highest-resolution copy of each drawing, so the loupe has real detail to
 * magnify. Framing must match the reference space — both of these are the same
 * crop as the web image, just larger (checked: identical aspect ratios). */
const SOURCES = {
  emc: 'assets/pdf/plan-3rd.jpg',
  mc9: 'assets/pdf/plan-9mc.jpg',
};

const dataUri = (rel) => {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) throw new Error('missing image: ' + rel);
  const ext = path.extname(rel).slice(1).replace('jpg', 'jpeg');
  return `data:image/${ext};base64,` + fs.readFileSync(abs).toString('base64');
};

/** Clinic numbers in drawing order, low to high. */
const numbersOf = (areas) => Object.keys(areas).map(Number).sort((a, b) => a - b);

const plans = {
  emc: {
    label: 'EMC — medical floor (34 clinics)',
    varName: 'POLYGONS',
    refW: PLANS.emc.refW,
    refH: PLANS.emc.refH,
    areas: PLANS.emc.areas,
    numbers: numbersOf(PLANS.emc.areas),
    /* Seeded with the outlines already in plan.js: correcting a shape that is
     * nearly right is much faster than starting from nothing. */
    seed: PLANS.emc.polygons || {},
    /* EMC's pins are the centroids of those same polygons, so they are shown
     * as an anchor but prove nothing about correctness. */
    pins: Object.fromEntries(Object.entries(PLANS.emc.pins).map(([n, p]) => [n, [p.x, p.y]])),
    pinsVerified: false,
    img: dataUri(SOURCES.emc),
  },
  mc9: {
    label: '9MC — clinic floor (37 clinics)',
    varName: 'MC9_POLYGONS',
    refW: PLANS.mc9.refW,
    refH: PLANS.mc9.refH,
    areas: PLANS.mc9.areas,
    numbers: numbersOf(PLANS.mc9.areas),
    seed: PLANS.mc9.polygons || {},
    /* These WERE placed independently off the drawing, so a finished outline
     * that does not contain its pin means the wrong room was traced. */
    pins: Object.fromEntries(Object.entries(PLANS.mc9.pins).map(([n, p]) => [n, [p.x, p.y]])),
    pinsVerified: true,
    img: dataUri(SOURCES.mc9),
  },
};

const template = fs.readFileSync(path.join(__dirname, 'tracer-template.html'), 'utf8');
const payload = JSON.stringify({ project: 'eliwah', plans });

const html = template.replace(
  '<script>\n/* ---',
  '<script>window.TRACER_DATA = ' + payload + ';</script>\n<script>\n/* ---'
);
if (html === template) {
  console.error('could not find the injection point in tracer-template.html');
  process.exit(1);
}

const out = path.join(root, 'raw/trace.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`wrote raw/trace.html (${mb} MB)`);
for (const [k, p] of Object.entries(plans)) {
  const seeded = Object.keys(p.seed).length;
  console.log(`  ${k}: ${p.numbers.length} rooms, ${seeded} seeded, ` +
              `reference ${p.refW}x${p.refH}`);
}
