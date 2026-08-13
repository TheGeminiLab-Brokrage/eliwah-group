/* Service worker: makes the app open without a connection, and makes the
 * browser treat it as installable rather than as a bookmark.
 *
 * THE ONE RULE THAT MATTERS: this must never cache the inventory.
 *
 * The whole point of the app is that a unit sold in the Google Sheet stops
 * being offerable immediately. A service worker that served a cached sheet
 * would break that silently and an agent would sell a sold clinic. So anything
 * not on our own origin is passed straight through and never touched — the
 * sheet lives on docs.google.com, so it can never be served from here.
 *
 * Bump CACHE when the app shell changes, or returning phones keep the old one.
 */
/* v4 — jsPDF deferred so it stops delaying the inventory fetch on a cold visit.
 * v3 — inventory prefetched at boot, and a timeout on the sheet fetch.
 * v2 — combined offers, traced room outlines, no phone on the offer (2026-08-13). */
const CACHE = 'eliwah-offers-v4';

/* The shell: enough to boot and render, kept small so the first visit on mobile
 * data is quick. The heavy print assets are deliberately NOT here — they are
 * cached on first use instead, see below.
 *
 * Keep this array free of comments: scripts/test.js parses it by splitting on
 * commas, so a comment in here reads as several bogus paths and fails the run.
 *
 * jsPDF is here even though index.html also loads it with a <script> tag, so
 * 420KB is fetched twice on a cold visit. Dropping it was tried and put back:
 * the worker does not reliably control the very FIRST page load, so the script
 * tag alone would leave an agent who goes offline right after their first visit
 * unable to produce a PDF — and producing an offer offline in front of a client
 * is the point. The cold-start wait was fixed by prefetching the inventory in
 * app.js instead, which costs nothing. */
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/config.js',
  'js/plan.js',
  'js/data.js',
  'js/sheet.js',
  'js/engine.js',
  'js/pdf.js',
  'js/app.js',
  'vendor/jspdf.umd.min.js',
  'site.webmanifest',
  'assets/logo-eliwah.png',
  'assets/logo-eliwah-dark.png',
  'assets/logo-mark.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Individually, not addAll: one 404 in the list would otherwise abort the
    // whole install and leave the app with no offline support at all.
    await Promise.all(SHELL.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Off-origin: the Google Sheet, and nothing else. Never intercepted, so the
  // inventory is always live and always the browser's own request.
  if (url.origin !== self.location.origin) return;

  /* Navigations go network-first so a deployed update is picked up as soon as
   * there is a connection, falling back to the cached page when there isn't. */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req))
          || (await caches.match('index.html'))
          || (await caches.match('./'))
          || Response.error();
      }
    })());
    return;
  }

  /* Everything else — code, styles, renders, floor plans — cache-first. These
   * are versioned by deploy, and the renders are big enough that re-fetching
   * them for every PDF would be wasteful on mobile data. A miss is fetched and
   * kept, which is how the print assets end up available offline after the
   * first offer has been generated. */
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      return Response.error();
    }
  })());
});
