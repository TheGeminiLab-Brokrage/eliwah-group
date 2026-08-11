/* Renders a real offer PDF outside the browser so the export can be checked
 * without clicking through the UI. Run: node scripts/test-pdf.js [UNITCODE] [PLANID]
 *
 * jsPDF is browser-shaped, so this stubs the few DOM bits pdf.js touches:
 * Image (dimensions + data URL) and doc.save (write to disk).
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const isPng = (buf) => buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47;

/** Width/height of a JPEG (SOFn marker) or a PNG (IHDR). */
function imageSize(buf) {
  // PNG: IHDR is always the first chunk, width/height at a fixed offset.
  if (isPng(buf)) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };

  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('no SOF marker');
}

const g = globalThis;
g.window = g;
g.navigator = { userAgent: 'node', appVersion: '5.0' };
g.document = {
  createElementNS: () => ({ setAttribute() {}, appendChild() {}, style: {} }),
  createElement: () => ({ style: {}, getContext: () => null, setAttribute() {} }),
  documentElement: { style: {} },
};
/* pdf.js reads images via fetch -> blob -> FileReader -> data URL, then measures
 * them with an <img>. Stub exactly that chain so the test drives the same path
 * the browser does. */
g.fetch = async (p) => {
  const buf = fs.readFileSync(path.join(root, p));
  // The real Blob carries a MIME type and pdf.js uses it to pick the format it
  // hands jsPDF, so the stub has to report one too — the brand logo is a PNG.
  const type = isPng(buf) ? 'image/png' : 'image/jpeg';
  return { ok: true, status: 200, blob: async () => ({ _buf: buf, type }) };
};
g.FileReader = class {
  readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,` + blob._buf.toString('base64');
    queueMicrotask(() => this.onload && this.onload());
  }
};
g.Image = class {
  set src(v) {
    this._src = v;
    const buf = v.startsWith('data:')
      ? Buffer.from(v.slice(v.indexOf(',') + 1), 'base64')
      : fs.readFileSync(path.join(root, v));
    Object.assign(this, imageSize(buf));
    queueMicrotask(() => this.onload && this.onload());
  }
  get src() { return this._src; }
};

// The UMD build prefers module.exports under Node, so wire it onto the fake
// window that pdf.js reads from.
g.jspdf = require(path.join(root, 'vendor/jspdf.umd.min.js'));

const load = (...files) => files.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n');
const scope = new Function(`${load('js/config.js', 'js/plan.js', 'js/data.js', 'js/sheet.js', 'js/engine.js', 'js/pdf.js')}
  return { cfg: () => CONFIG, setProject, PLANS, SNAPSHOTS, parseCSV, normalizeRows, buildOfferPDF, offerFilename };`)();

/* Usage: node scripts/test-pdf.js [projectId] [unitCode] [planId]
 *   node scripts/test-pdf.js emc C319 dp25
 *   node scripts/test-pdf.js mc9 MC924 dp20 */
(async () => {
  const wantProject = process.argv[2] || 'emc';
  const wantCode = (process.argv[3] || 'C319').toUpperCase();

  scope.setProject(wantProject);
  const CONFIG = scope.cfg();
  if (CONFIG.id !== wantProject) throw new Error(`unknown project "${wantProject}"`);
  if (!CONFIG.plans.length) throw new Error(`${CONFIG.name} has no payment plans configured`);

  // Default to the longest schedule, which is the layout most likely to break.
  const wantPlan = process.argv[4] || CONFIG.plans[CONFIG.plans.length - 1].id;

  const snap = scope.SNAPSHOTS[CONFIG.id];
  if (!snap) throw new Error(`no snapshot for ${CONFIG.id} — run scripts/snapshot.js`);
  const areas = scope.PLANS[CONFIG.planKey].areas;

  const { units } = scope.normalizeRows(scope.parseCSV(snap.csv), areas);
  const unit = units.find((u) => u.code === wantCode);
  if (!unit) throw new Error(`no unit ${wantCode} in the ${CONFIG.id} snapshot`);
  const plan = CONFIG.plans.find((p) => p.id === wantPlan);
  if (!plan) throw new Error(`no plan "${wantPlan}" for ${CONFIG.name}`);
  const floor = CONFIG.floors.find((f) => f.key === unit.floorKey)
    || CONFIG.floors[CONFIG.floors.length - 1];

  // buildOfferPDF hands back the document and the name it should be saved
  // under; in the browser deliverOffer decides between the share sheet and a
  // download, but here we just write it to disk.
  const { doc, filename } = await scope.buildOfferPDF(unit, plan, floor);
  const out = path.join(root, 'raw', filename);
  fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
  console.log(`wrote ${path.relative(root, out)}  (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
})().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
