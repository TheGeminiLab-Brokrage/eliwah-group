/* Project definitions. Everything a non-developer might need to change is here.
 *
 * The app is multi-project: the sales agent picks a project first, then a floor,
 * then a unit. Each project carries its own inventory sheet, floors and
 * commercial terms, because those differ between Eliwah's developments.
 *
 * `CONFIG` is the *active* project. app.js reassigns it when the agent picks
 * one; every other module reads CONFIG at call time, so they follow along.
 */

/* Shared across every project. */
const GLOBAL = {
  currency: 'EGP',

  /* Status strings that mean "this unit can be sold". Matching is
   * case/space-insensitive, so a stray "available " from the ops team still
   * works — but anything unrecognised is treated as NOT available, which is the
   * safe direction to fail: better to hide a free unit than to sell a sold one. */
  availableStatuses: ['available', 'free', 'open'],
  reservedStatuses: ['reserved', 'on hold', 'hold', 'blocked'],
};

/**
 * Floors that are the same layout repeated up a tower.
 *
 * 9MC's clinic floors run third to ninth and are identical — only the floor
 * digit in the unit code changes, so MC322 and MC922 are the same room seven
 * floors apart. They therefore share one drawing and one set of pins.
 *
 * `released: false` is only the fallback label: app.js treats a floor as live
 * the moment the sheet has rows for it, so operations can open a new floor by
 * adding rows and nothing here needs editing.
 */
const repeatedFloors = (keys, plan, use = 'Medical') => keys.map((key) => ({
  key,
  label: `${key} Floor`,
  use,
  plan,
  released: false,
}));

const PROJECTS = [
  {
    ...GLOBAL,
    id: 'emc',
    name: 'EMC',
    subtitle: 'Eliwah Medical Center',
    location: 'El Yasmeen, New Cairo',
    blurb: 'Multi-specialty medical center · G+3',
    card: 'assets/pdf/hero.jpg',
    live: true,
    planKey: 'emc',                   // geometry set in js/plan.js
    heroImage: 'assets/pdf/hero.jpg',
    planPrint: 'assets/pdf/plan-3rd.jpg',
    tagline: 'THE FUTURE OF HEALTHCARE',

    /* Everything the PDF prints about the project itself. All of it comes from
     * the client's own fact sheet — nothing here is written by us, because it
     * goes out over Eliwah's name. `story` is page 2, `place` is page 3. */
    story: {
      title: 'More than a medical center',
      text: 'EMC is a modern multi-specialty medical center designed to deliver comprehensive outpatient healthcare in one '
        + 'location. Professionally managed and operated to international healthcare standards, it combines an expert medical '
        + 'team, advanced medical technology and a fully digital patient journey — from online booking and electronic medical '
        + 'records through to consultation, diagnostics and follow-up care.',
      advantages: [
        'Multi-specialty medical clinic', 'Professional clinic management',
        'Patient-centered care', 'Leading insurance partnerships',
        'Digital appointment management', 'Electronic medical records',
        'Executive health checkups', "Women's & children's healthcare",
      ],
      renders: ['assets/pdf/render-street.jpg', 'assets/pdf/render-plaza.jpg'],
    },

    place: {
      heading: 'El Yasmeen, New Cairo',
      map: 'assets/pdf/map.jpg',
      // Only the landmarks actually labelled on the map itself.
      note: 'On Al Sadat Axis  ·  Manchester International School  ·  Salahaldin International School',
    },

    contact: { web: 'www.eliwahgroup.com', address: 'El Yasmeen, New Cairo' },

    /* Live inventory. Published via File > Share > Publish to web > CSV.
     * gviz is primary: it echoes the caller's Origin (so fetch works from any
     * host) and sends Cache-Control: no-cache, so every load is current.
     * The /export endpoint is the fallback — same data, one redirect. */
    sheetId: '1NBz7U_SXfGJjnPQXMvEmUmhNTv3RnjEFJc0-JUS7Wlk',
    sheetTab: 'Third',
    get sheetUrls() {
      return [
        `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(this.sheetTab)}`,
        `https://docs.google.com/spreadsheets/d/${this.sheetId}/export?format=csv`,
      ];
    },

    /* Ground and First are retail, Second and Third are medical.
     * `released: false` floors render as "Coming Soon" — but this is only the
     * fallback label. If the sheet ever contains rows for a floor, that floor
     * goes live automatically; see app.js. Nothing here needs editing for that. */
    floors: [
      { key: 'Ground', label: 'Ground Floor', use: 'Retail',  plan: null, released: false },
      { key: 'First',  label: 'First Floor',  use: 'Retail',  plan: null, released: false },
      { key: 'Second', label: 'Second Floor', use: 'Medical', plan: 'assets/plan-3rd.jpg', released: false },
      { key: 'Third',  label: 'Third Floor',  use: 'Medical', plan: 'assets/plan-3rd.jpg', released: true },
    ],

    /* Commercial terms, as given by Eliwah Group. Assumptions still on record
     * in the README — first instalment at month 3, maintenance a single payment
     * at month 18, rounding absorbed by the final instalment, no extra fees. */
    deliveryMonths: 30,               // 2.5 years
    maintenanceRate: 0.10,            // 10% of the original (pre-discount) price
    maintenanceDueMonth: 18,          // one year before delivery
    instalmentEveryMonths: 3,         // quarterly

    plans: [
      { id: 'dp10', label: '10% Down Payment', down: 0.10, years: 7 },
      { id: 'dp15', label: '15% Down Payment', down: 0.15, years: 8 },
      { id: 'dp20', label: '20% Down Payment', down: 0.20, years: 9 },
      { id: 'dp25', label: '25% Down Payment', down: 0.25, years: 10 },
      { id: 'cash', label: 'Cash', cash: true, discount: 0.35 },
    ],
  },

  {
    ...GLOBAL,
    id: 'mc9',
    name: '9MC',
    subtitle: '99 Medical Center',
    location: 'MU23, New Capital',
    blurb: '37 clinics per floor · third to ninth',
    card: 'assets/projects/9mc.jpg',
    live: true,
    planKey: 'mc9',
    /* Deliberately NOT the card render. That one has the Eliwah logo and the
     * 9MC badge baked into its corners, and the cover crops the top off a
     * 16:9 image, so both got sliced in half. This render is clean, which lets
     * the PDF place the branding itself and match EMC's cover. */
    heroImage: 'assets/pdf/render-9mc-aerial.jpg',
    planPrint: 'assets/pdf/plan-9mc.jpg',
    tagline: 'THE FUTURE OF HEALTHCARE',

    /* From the 9MC fact sheet — its own wording, not EMC's. Before this existed
     * the 9MC offer printed EMC's description, EMC's renders and a map of New
     * Cairo, which is the wrong city. */
    story: {
      title: 'A complete healthcare destination',
      text: 'A comprehensive healthcare destination that brings together medical clinics, laboratories, diagnostic imaging, '
        + 'pharmacies and a full range of healthcare services under one roof. Managed and operated by a specialized healthcare '
        + 'management company in accordance with international best practices, with a fully digital patient journey from '
        + 'appointment booking through consultation, treatment and follow-up.',
      advantages: [
        '30+ medical specialties', 'Professional healthcare operator',
        'AI-powered healthcare', 'Smart medical center',
        '9MC mobile app', 'Leading insurance network',
        'Executive health check center', 'Advanced diagnostics & imaging',
      ],
      renders: ['assets/pdf/render-9mc-street.jpg', 'assets/pdf/render-9mc-aerial.jpg'],
    },

    place: {
      heading: 'MU23, New Capital',
      map: 'assets/pdf/map-9mc.jpg',
      text: '9MC is strategically located in the heart of MU23, the main gateway to the New Administrative Capital, '
        + 'positioned between the residential districts, the Government District and the Central Business District (CBD), '
        + 'and adjacent to the International Sports City.',
      note: 'Green River  ·  Iconic Tower  ·  Medical City  ·  Knowledge City  ·  Sports City',
    },

    contact: {
      web: 'www.eliwahgroup.com',
      address: 'MU23, New Capital',
      phone: '01125553339',
      email: '9mc@eliwahgroup.com',
    },

    sheetId: '17E11ww-CyTDu8ro4xXRiEji2COiv-CpTNTRAvVb8qtY',
    sheetTab: '',                     // first tab
    get sheetUrls() {
      const tab = this.sheetTab ? `&sheet=${encodeURIComponent(this.sheetTab)}` : '';
      return [
        `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:csv${tab}`,
        `https://docs.google.com/spreadsheets/d/${this.sheetId}/export?format=csv`,
      ];
    },

    /* Third to ninth are clinic floors and all the same drawing — see
     * repeatedFloors above. Ninth is flagged released because it is the floor
     * currently selling; the rest light up on their own as soon as operations
     * put rows for them in the sheet. */
    floors: [
      ...repeatedFloors(['Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'], 'assets/plan-9mc.jpg'),
      { key: 'Ninth', label: 'Ninth Floor', use: 'Medical', plan: 'assets/plan-9mc.jpg', released: true },
    ],

    /* Delivery is 3.5 years. Maintenance is still ASSUMED, NOT SUPPLIED — it is
     * carried over from EMC at 10%, due one year before delivery. That is
     * visible money on the customer's PDF, so confirm it with the client. */
    deliveryMonths: 42,               // 3.5 years
    maintenanceRate: 0.10,
    maintenanceDueMonth: 30,          // one year before delivery
    instalmentEveryMonths: 3,

    plans: [
      { id: 'dp7',  label: '7% Down Payment',  down: 0.07, years: 7 },
      { id: 'dp10', label: '10% Down Payment', down: 0.10, years: 8 },
      { id: 'dp15', label: '15% Down Payment', down: 0.15, years: 9 },
      /* 20% is not paid up front — half on contract, half a year later. */
      { id: 'dp20', label: '20% Down Payment', down: 0.20, years: 10,
        downSchedule: [
          { pct: 0.10, month: 0,  label: 'Down payment (10%)' },
          { pct: 0.10, month: 12, label: 'Second payment (10%)' },
        ],
        blurb: '10% on contract + 10% after one year, rest over 10 years' },
    ],

    /* Units withheld from sale regardless of what the sheet says. They still
     * show on the plan (greyed, with the reason) so nobody wonders where they
     * went, but they cannot be selected or put in an offer. Add entries here as
     * `CODE: 'reason shown to the agent'`. */
    excludedUnits: {},

    /* Corrections applied on top of the sheet, per unit — `CODE: { area, reason }`.
     *
     * For when the sheet and the architectural drawing disagree and the drawing
     * has been accepted as right. An override replaces the area and re-derives
     * the meter price from the total price, so the offer still foots: area ×
     * meter price = the price operations set. The total price is never
     * overridden; that number belongs to the sheet.
     *
     * Empty on purpose. MC922 used to be here, forcing the drawing's 19 m² over
     * the sheet's 23 m². Operations have since confirmed 23 m² is correct and
     * withdrawn the unit, so the override was wrong and has been removed — the
     * app follows the sheet. Note the drawing still prints 19 m² for clinic 22,
     * so if that unit ever returns the app will flag the mismatch again. */
    unitOverrides: {},
  },
];

/** The active project. Reassigned by app.js when the agent picks one. */
let CONFIG = PROJECTS[0];

function setProject(id) {
  CONFIG = PROJECTS.find((p) => p.id === id) || PROJECTS[0];
  return CONFIG;
}

if (typeof module !== 'undefined') module.exports = { CONFIG, PROJECTS, setProject };
