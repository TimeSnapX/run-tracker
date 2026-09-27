# Run Tracker

A mobile-first GPS run tracker that runs in the browser and installs as a PWA. Dark theme with an amber (`#ffbf00`) accent, big tap targets, metric units (km, min/km). Everything stays on your phone: no accounts, no backend.

Live: https://timesnapx.github.io/run-tracker/

## What it does

- **Record**: Start → Pause/Resume → Finish (save, keep going, or discard with a confirm).
  - Uses `navigator.geolocation.watchPosition` with `enableHighAccuracy: true, maximumAge: 0`.
  - Waits for a decent first fix (±20 m) before the clock and distance start. You can "Start anyway" once accuracy is within ±30 m.
- **GPS filtering** (`src/lib/filter.ts`):
  - Ignores fixes with accuracy worse than 30 m.
  - Ignores jumps that imply more than 8 m/s (~29 km/h). After 5 rejected jumps in a row it re-anchors, in case the old anchor was the bad fix.
  - Ignores jitter under 3 m.
- **GPS indicator**: Searching / Weak / OK / Good, with ± metres.
- **Live stats**: moving time (pauses excluded), distance (km, 2 dp), current pace (rolling window of about 30 s or 100 m), average pace, and km splits. Optional vibration on each km (Android only; iPhone Safari has no vibration API).
- **Live map**: Leaflet + OpenStreetMap. It draws the route (one line per segment, so pauses don't draw connecting lines) and a position marker with an accuracy circle. Auto-follow has a toggle; dragging the map turns follow off.
- **Screen Wake Lock** while recording, re-acquired on `visibilitychange`. If it's unsupported or refused, a note tells you to keep the screen on. If GPS stopped while you were away from the app, a banner shows how long the gap was.
- **Crash safety**: the in-progress run is saved to `localStorage` every 5 s, and also on pause and when the page is hidden. After a reload you can Resume, Save or Discard it.
- **History**: date, distance, time and average pace for each run, plus totals for this week (from Monday) and all-time. Run detail shows the route map, stats, elevation gain (if the device gives altitude), splits including a partial last km, GPX download or share, and delete with a confirm.
- **Export**:
  - GPX 1.1 per run (`trkpt` lat/lon/time, plus `ele` when available, one `trkseg` per segment). Validated against the official XSD.
  - Full JSON backup and import. Import merges by run id.
- **PWA**: manifest, icons, `display: standalone`, and a Workbox service worker (`vite-plugin-pwa`) that precaches the app shell, so it opens offline. The first view of map tiles needs network. Tiles you've already seen are cached (up to 600 tiles for 14 days).
- **Permissions UX**: if location is denied, the app explains how to re-enable it on iPhone Safari and Android Chrome.

## Local development

```bash
npm install
npm run dev       # http://localhost:5173/run-tracker/
npm test          # vitest unit tests for src/lib
npm run build     # tsc -b && vite build → dist/
npm run preview   # serve dist at http://localhost:4173/run-tracker/
npm run icons     # regenerate PNG icons (no dependencies)
```

Geolocation needs a secure context: `https://` or `localhost`. To test on a phone on your LAN, use an HTTPS tunnel, or deploy to Pages.

## Project layout

```
src/lib/        pure logic, framework-free and unit tested
  geo.ts        haversine, metre offsets
  filter.ts     GPS fix filter
  recorder.ts   recording state machine (status, moving clock, segments, splits)
  stats.ts      splits, rolling/avg pace, weekly totals
  gpx.ts        GPX 1.1 builder
  storage.ts    localStorage runs, live snapshot, settings, backup/import
  lib.test.ts   vitest tests on synthetic tracks
src/RecorderContext.tsx   geolocation watch, wake lock, persistence
src/pages/      Record, History, Run detail, More (settings/backup)
src/components/ Leaflet map, GPS indicator, splits table, location help
```

## Deploy (GitHub Pages)

- Vite `base` is `/run-tracker/`, routing uses `HashRouter` (no 404 rewrites needed), and `public/.nojekyll` is copied into `dist/`.
- Build with `npm run build`, then publish the **contents of `dist/`** to Pages. You can use a `gh-pages` branch, or the "GitHub Actions" Pages source with `actions/upload-pages-artifact` pointing at `dist`.
- After a new deploy, the service worker updates automatically (`registerType: 'autoUpdate'`). An open tab picks up the new version on its next load.

## Limitations: GPS and the lock screen

**Browsers stop delivering GPS when the phone is locked or the app is in the background.** That applies to iOS Safari, installed PWAs on iOS, and in practice Android Chrome as well. A web app cannot record with the screen off the way a native app can.

- The app asks for a **Screen Wake Lock** while recording, so the screen stays on by itself. Don't press the lock button. Pocket is fine if the screen stays on. On iOS, Wake Lock needs a recent Safari; older versions show a "keep the screen on" note instead.
- If GPS stops anyway (phone locked, app switched), the missing stretch is joined with a straight line when fixes come back. The moving timer keeps running, because it's a stopwatch. A banner tells you how long the gap was.
- There's no auto-pause. Use Pause yourself.
- Data lives in this browser's `localStorage` (roughly 5 MB, which is many hours of runs). Clearing site data deletes your runs, so use **More → Export all (JSON)** now and then. If storage fills up, the run isn't lost: it stays as the unfinished run until you free space.
- Map tiles come from openstreetmap.org and need a connection. The app itself works offline.
