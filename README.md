# Eliwah Group — Offer Generator

Sales-offer generator for Eliwah Group's projects. Static web app, no server or
database. Agent picks a **project → floor → unit on the floor plan → payment
plan**, then downloads a branded 7-page A4-landscape PDF offer:

1. Cover — exterior render, unit code
2. The Project — description, key advantages, two renders
3. Location — map from the fact sheet
4. Floor plan — the chosen clinic highlighted
5. Your Unit — details and headline price
6. Payment Schedule — every instalment
7. Terms

Built the same way as the Ion and Butterfly generators, with one important
difference: **the inventory is live**.

Two projects are connected, both reading their own published Google Sheet:

| Project | Building | Inventory | Offers |
|---|---|---|---|
| **EMC** — Eliwah Medical Center, El Yasmeen, New Cairo | G+3; 34 clinics per medical floor, second and third | live | yes |
| **9MC** — 99 Medical Center, MU23, New Capital | 37 clinics per floor, third to ninth | live | yes |

Note they are in **different cities**. Every piece of project content in the PDF —
description, advantages, renders, location map, contact details — is per project
in `js/config.js` under `story`, `place` and `contact`. None of it is hardcoded
in `js/pdf.js`, because it was, and the 9MC offer went out showing EMC's renders
and a map of New Cairo. `scripts/test.js` now fails if two projects share an
image or if a live project is missing its own content.

### Payment plans

| Project | Plans |
|---|---|
| EMC | 10%/7yr · 15%/8yr · 20%/9yr · 25%/10yr · Cash (**25%** off) |
| 9MC | 7%/7yr · 10%/8yr · 15%/9yr · **20%/10yr split 10% on contract + 10% after one year** · Cash (**30%** off) |

Instalments are quarterly for both. The cash discount differs per project, and
either way maintenance is charged on the **original** price, not the discounted
one. The two rates are pinned by name in `scripts/test.js`, so changing one in
`js/config.js` without meaning to will fail the suite.

### Delivery and maintenance

| Project | Delivery | Maintenance |
|---|---|---|
| EMC | 2.5 years (30 months) | 10%, month 18 |
| 9MC | 3.5 years (42 months) | 10%, month 30 |

Maintenance is a single payment **one year before delivery**, calculated on the
original (pre-discount) price.

⚠️ **9MC's maintenance rate is assumed, not supplied.** The payment plans and the
3.5-year delivery came from the client; the 10% rate is carried over from EMC.
It is visible money on the customer's PDF — confirm it before 9MC goes to the
sales team.

### The schedule table

The app and page 6 of the PDF show the same thing: four headline cards (contract
price, down payment, quarterly instalment, total payable) over a table grouped
into **year blocks** — `Year | Installment | Date | Amount | % | Yearly %`.

Percentages are shares of the **original** unit price. On a 9MC cash plan that
makes the payment read 70% and maintenance 10%, matching how they were quoted,
instead of measuring both against the discounted price.

### Dates

Every schedule is anchored to a **contract date**, which is the day the proposal
is generated. The first instalment falls three months later, then quarterly, and
the schedule shows real calendar dates (`11 Nov 2026`) with the relative point
underneath. Month-ends clamp correctly — 30 Nov + 3 months is 28 Feb, not 2 Mar.

### Held units

`excludedUnits` in a project's config withholds specific units from sale
whatever the sheet says. They still show on the plan — greyed, dashed, with the
reason on hover — so nobody wonders where they went, but they cannot be selected
and `buildOfferPDF` refuses them outright as a second line of defence.

Nothing is currently held on either project.

### Corrections to the sheet

`unitOverrides` corrects a unit where the sheet and the architectural drawing
disagree and the drawing has been accepted as right:

```js
unitOverrides: {
  MC930: { area: 20, reason: 'why the sheet is wrong' },
}
```

An override replaces the **area** and re-derives the price per m² from the total
price, so the offer still foots: area × meter price = the price ops set. The
total price is never overridden — that number belongs to the sheet. The
correction shows in the app's warning banner rather than being applied silently.

Delete the entry once ops fix the sheet; the app then just uses the sheet.

**Currently empty, on purpose.** MC922 was overridden here to force the
drawing's 19 m² over the sheet's 23 m². Operations later confirmed **23 m² is
correct** and withdrew the unit, so the override was wrong and has been removed.
Note the drawing still prints 19 m² for clinic 22 — if that unit ever returns to
the sheet at 23 m², the app will flag the mismatch again, which is the right
behaviour: one of the two sources needs correcting.

## Adding a project

Everything for a project lives in one object in [`js/config.js`](js/config.js).
To bring another project online:

1. Drop the card render in `assets/projects/` and point `card` at it
2. Fill in `sheetId` / `sheetTab` for its published sheet
3. Fill in `floors` (with a plan image per floor) and `plans`
4. Fill in `story`, `place` and `contact` from **that project's own** fact sheet,
   and drop its renders and location map in `assets/pdf/` — never reuse another
   project's, and never write the copy yourself; it goes out over Eliwah's name
5. Set `live: true`

No other file needs touching. `CONFIG` is simply whichever project is selected,
and every other module reads it at call time.

Each building's geometry is an entry in `PLANS` in [`js/plan.js`](js/plan.js),
referenced by the project's `planKey`. Because the plan is drawn as pins, a new
building only needs **one point per room** — not traced outlines — so adding one
is an afternoon rather than a day. Check placement with:

```
node scripts/verify-plan.js mc9    # draws the pins back onto the drawing
```

That needs the working render at `raw/map<key>.png`; regenerate it with
`pdftoppm` from the source layout PDF if it isn't there (`raw/` isn't deployed).

## The live sheet — read this first

Inventory comes from a published Google Sheet, re-read **on every page load**. A
unit whose status changes to sold stops being offerable; a unit added to the
sheet appears. No rebuild, no redeploy, no developer involved.

- Sheets: `sheetId` per project in [`js/config.js`](js/config.js)
- Published via **File → Share → Publish to web → (tab) → CSV**
- Read through the `gviz` endpoint, which sends `Cache-Control: no-cache` and
  echoes the caller's origin, so data is always current and CORS always works.
  `/export?format=csv` is the fallback.

⚠️ **The operations team must edit the published Google Sheet.** The inventory
originally arrived as an uploaded `.xlsx`; an Excel file in Drive has no CSV
endpoint and cannot be synced. If anyone goes back to editing a `.xlsx`, the app
keeps serving old prices while looking perfectly healthy. Rename any leftover
Excel copy to `OLD — DO NOT USE`.

⚠️ **The published tab is world-readable to anyone with the URL.** Keep internal
columns (client names, broker, commission, cost) on a different tab and publish
only the clean one.

### Expected columns

`Project · Type · Floor · Unit Code · Indoor area · Indoor meter price · Total unit price · Status`

Header names are matched against a list of aliases in `js/sheet.js`, so minor
renaming is tolerated. Only `Unit Code`, `Total unit price` and `Status` are
strictly required.

### Unit codes

`C313` (EMC) and `MC915` (9MC) are letters + floor digit + two-digit clinic, so
`MC915` is clinic 15 on floor 9. The last two digits match the
number printed on the floor plan. This is what makes the plan clickable, so the
scheme must hold. Codes that don't parse are skipped and reported in the app.

### Selecting a unit

Hovering a pin opens a card with the code, area, price per m² and total, plus a
**Select this clinic** button. Hovering a row in the list rings the matching pin
on the plan, so the agent never has to hunt for a code on the drawing. The list
sorts by clinic number, price or area.

`#C319` on the URL opens straight to that unit with its card showing. If that
unit has since sold, the app says so rather than failing silently.

### Why pins, not outlined rooms

The plan shows a **coloured circle per clinic** (green available, amber reserved,
**red sold**, pale grey not released) rather than highlighting room outlines. The
room polygons were traced by hand from a rendered drawing, so they are close but
not exact, and a highlight a few pixels off a wall reads as sloppy in front of a
customer. A pin in the middle of the room is unambiguous at any zoom, and the
drawing already labels every room with its number and area.

`scripts/test.js` checks that every pin falls inside its own polygon and that no
two pins overlap at display size.

### Status handling — fails closed

Only `Available` / `Free` / `Open` (any case, any spacing) make a unit offerable.
`Reserved` / `On hold` show greyed. **Anything else — including a blank or a typo
— is treated as not available.** Hiding a free clinic costs a phone call; selling
a sold one costs a customer.

## Opening a new floor — no developer needed

**This is the handover promise: operations add rows to the sheet, the floor
appears.** Both towers repeat one clinic layout up several floors, and the unit
code carries its own floor digit, so `C219` and `C319` are the same room one
floor apart, as are `MC322` and `MC922`.

| Project | Floors set up | Rooms each |
|---|---|---|
| EMC | Second, Third | 34 |
| 9MC | Third to Ninth | 37 |

That is **68 EMC clinics and 259 9MC clinics** already wired. Any of them becomes
sellable the moment a row for it exists with a valid code, a price and the status
`Available`. `released: false` in `js/config.js` is only the fallback label —
app.js treats a floor as live as soon as the sheet has rows for it.

`scripts/test.js` proves this by generating a real offer for the first and last
room of every declared floor, so the promise is checked rather than assumed.

### The three things that still need a developer

1. **A clinic number that isn't on the drawing** — above 34 (EMC) or 37 (9MC).
   The unit appears in the list but gets no pin on the plan, and the plan page of
   the PDF comes out blank. Needs a pin adding to `js/plan.js`.
2. **A floor that isn't in `CONFIG.floors`** — EMC's Ground and First, or a 9MC
   floor below the third. Those units are parsed but never displayed, with no
   warning. Add the floor (and its drawing) to `js/config.js`.
3. **A different layout.** Everything here assumes the repeated floors are
   identical, which the client confirmed.

### Reused drawings and the floor name printed on them

EMC's drawing has `MEDICAL FLOOR / 3ND` printed in the courtyard, so reusing it
for the second floor would ship a second-floor clinic on paper saying third.
`PLANS.emc.floorLabel` in `js/plan.js` is a box that covers that text; the app
and the PDF both reprint the floor actually being sold, which also corrects the
drawing's own `3ND` typo. The fill colour is sampled from the courtyard so the
patch does not show as a white box.

The 9MC drawing prints no floor name, so floors three to nine share it untouched
(`floorLabel: null`).

Delete the patch as soon as a real drawing exists for each floor.

## What's live right now

Only the **third floor** has inventory (15 of 34 clinics). The other 19 are not
yet released and render as "Not released" on the plan.

Ground and First (retail) and Second (medical) show as **Coming soon**. The
second floor is the same layout as the third and already has its plan wired up.

**Floors go live from the sheet, not from code.** `released: false` in
`js/config.js` is only the fallback label — the moment the sheet contains rows
for a floor, that floor becomes selectable on its own. Ground and First will also
need their floor plans dropped into `assets/` and referenced in `CONFIG.floors`.

## Payment maths — assumptions on record

Terms given by Eliwah Group: four plans (10%/7yr, 15%/8yr, 20%/9yr, 25%/10yr),
quarterly instalments, a 25% cash discount, 10% maintenance one year before a
30-month delivery. The schedule is checked by `scripts/test.js` — every plan for
every unit sums exactly, with no drift.

Unlike the Ion generator, this has not been reconciled against a signed customer
offer; the client reviewed that and chose to proceed. Recording the assumptions
here so they can be corrected in one place if a real offer later disagrees. They
live in `js/config.js` / `js/engine.js`:

1. the first quarterly instalment falls **3 months** after contract
2. maintenance is a **single payment at month 18**, not spread
3. instalments are whole pounds, with the remainder absorbed by the **final**
   instalment so the schedule sums to the price exactly
4. there is **no club / parking / delivery fee** on top
5. cash buyers pay maintenance on the **original** price, not the discounted one

Each is a visible number on the customer's PDF, so if a signed offer or
reservation form turns up later, check it against these five points first.

## Structure

| Path | Purpose |
|---|---|
| `index.html`, `css/styles.css` | The app |
| `js/config.js` | **All projects** — sheet URLs, floors, payment plans, terms, and all PDF copy/assets |
| `js/sheet.js` | Live sync: fetch, CSV parse, normalise, validate |
| `js/plan.js` | Clinic polygons + pin positions for the clickable plan |
| `js/engine.js` | Payment schedule maths |
| `js/pdf.js` | 7-page PDF export (jsPDF) |
| `js/app.js` | UI wiring |
| `js/data.js` | **Generated** — offline fallback snapshots, keyed by project |
| `assets/` | Floor plan (web + print), renders, location map |
| `scripts/` | Tooling, see below |
| `raw/` | Working files and test output — not deployed |

## Scripts

```
node scripts/test.js                        # 1308 checks: geometry, pins, parser,
                                            # status, dates, schedules, and that
                                            # each project has its own PDF content
node scripts/test-pdf.js mc9 MC924 dp20     # render a real PDF outside the browser
node scripts/verify-plan.js mc9             # draw the pins onto the plan to check them
node scripts/snapshot.js                    # refresh the offline fallbacks
node scripts/make-brand.js                  # rebuild logos + home-screen icons
```

Run `snapshot.js` before deploying so the offline fallback isn't stale.

## Sending the offer

The finished PDF is named for what it is, not for the unit:

```
EMC - 22m clinic offer Third Floor.pdf
```

That is the name a customer sees in their WhatsApp chat, so it reads as a
document rather than a reference code. Two clinics of the same size on the same
floor therefore produce the same name — the browser appends `(1)` on download,
and the unit code is on the cover of the PDF either way.

**Send on WhatsApp** uses the Web Share API with the PDF attached, so the file
goes straight into a conversation with no download-then-attach step. The button
only appears where the browser can actually share a file — in practice Android
Chrome and iOS Safari. Everywhere else, and if the agent dismisses the share
sheet, it falls back to a plain download.

## Installing it on a phone

`site.webmanifest` plus an `apple-touch-icon` make the app installable: **Add to
Home Screen** gives it the EG monogram and opens it full-screen without browser
chrome eating half the floor plan. Icons are in `assets/icons/`, rebuilt with
`node scripts/make-brand.js`.

Installing needs the app served over **HTTPS** (or `localhost`) — it will not
offer to install from a plain `http://` address on the LAN.

## Offline behaviour

If the sheet can't be reached, the app loads the baked-in snapshot, shows an
amber "Offline — showing saved data from …" pill and a banner telling the agent
to check availability before issuing an offer. It never silently serves stale
data as if it were live.

## Run locally

```
node scripts/snapshot.js      # optional, refresh fallback
python -m http.server 8000    # or any static server
```

Then open `http://localhost:8000`. Opening `index.html` directly by
double-clicking also works, but PDFs come out larger — `file://` blocks `fetch`,
so images route through jsPDF's canvas path and get re-encoded.

`#C313` on the URL opens straight to that unit, so a specific offer can be
shared as a link.

## Closed: the MC922 area

`MC922` was listed as 23 m² in the sheet while the drawing labels clinic 22 as
19 m². It was briefly forced to 19 m² through `unitOverrides`. **Operations
confirmed 23 m² is correct and withdrew the unit from sale**, so the override was
removed and the row is gone from the sheet — the app reports no warnings.

One loose end: the **drawing still prints 19 m²** for clinic 22 (and for clinic
23). If MC922 ever returns to the sheet at 23 m², the area check will flag it
again. That is deliberate — it means the drawing needs correcting, not the app.

Every other unit across both projects matches its drawing, and every total foots
to area × meter price.

## Still needed

- Confirm 9MC's maintenance rate (delivery is confirmed at 3.5 years)
- Correct the 9MC drawing, which prints 19 m² for clinics 22 and 23 where
  operations say 23 m²
- EMC Ground / First floor plans, and a real per-floor drawing for each medical
  floor so the `floorLabel` patch can be deleted
- An EMC-specific logo, if one exists. The Eliwah Group lockup is now used
  throughout; there is no separate EMC or 9MC mark in the supplied artwork.
- Arabic, if wanted later. Text is centralised, but jsPDF needs an embedded
  RTL-capable font, which is a real piece of work — decide before launch.

## Asset provenance

- **Logos and icons**: there is no transparent original, only a square JPEG of
  the logo on a teal gradient. `scripts/make-brand.js` isolates the artwork by
  thresholding its luminance — the marks are pure white on mid-teal, and the ECG
  line behind them is *darker* than the ground, so one cut at 0.6 lifts exactly
  the glyphs. It then measures what it found and lays that out, which is what
  makes everything centred. Four outputs:

  | File | What | Used on |
  |---|---|---|
  | `assets/logo-eliwah.png` | full lockup, white | the page header |
  | `assets/logo-eliwah-dark.png` | full lockup, brand ink | the PDF cover's white band |
  | `assets/logo-mark.png` | monogram only, white | the PDF's 20mm header bar |
  | `assets/icons/icon-*.png` | monogram on the brand gradient | home screen |

  The header bar gets the monogram alone beside vector type, because the full
  lockup's wordmark is only about 2mm tall there and renders as grey mush.

  Two traps if you edit this script. Chrome refuses to open a window narrower
  than a few hundred pixels and silently widens the viewport instead, so small
  outputs have to be rendered large and scaled down with
  `--force-device-scale-factor` — otherwise the screenshot is a slice of a
  bigger layout. And `--screenshot` needs an absolute path on Windows or it
  writes nothing and still exits 0.

  Re-run it if the source logo is replaced, then check the two aspect ratios it
  prints against the constants at the top of `js/pdf.js`.
- Floor plans and cover/project renders: supplied by Eliwah Group
- EMC location map: cropped from page 16 of `_Fact Sheet (EMC).pdf`
- 9MC renders and location map: extracted from `_Fact Sheet (9MC).pdf` —
  `pdfimages -j -p` for the renders (pages 18 and 20, embedded JPEGs pulled at
  full resolution), and `pdftoppm -jpeg -r 250 -x 222 -y 1295 -W 1406 -H 1403`
  for the map on page 17, which is stored as Flate and so has no JPEG to extract
- 9MC copy: the description and key advantages are the client's own wording from
  pages 5, 6 and 16 of the same fact sheet
- The supplied aerial render was left out — a neighbouring building in it carries
  a real bank's signage, which does not belong in a client-facing offer.
