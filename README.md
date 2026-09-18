<div align="center">

# 🌱 OG Grow Journal Assistant

**A free, offline-first grow diary for cannabis growers — track a plant's life from seed to harvest.**

Part of the [Overgrow](https://overgrow.com) growing community.

</div>

---

## About this repository

This is the **public source** of OG Grow Journal Assistant: the app code plus its unit and end-to-end tests. It is updated automatically whenever the app changes, so what you see here is what runs in the app.

It contains the source only — build tooling, assets and hosting config aren't included, so this repo is meant for reading, reviewing and reusing code rather than running the app as-is.

## What the app does

OG Grow Journal Assistant is a Progressive Web App for documenting a grow day by day. It runs entirely in the browser, works offline, and keeps data on the user's own device — no account needed, no tracking. An optional, end-to-end encrypted sync keeps a diary on several devices.

- **📅 Grow diary** — dated entries with notes, photos and milestones; color-coded phases from seed to harvest
- **📊 Visual timeline** — every phase at a glance, collapsible weeks, a "today" marker
- **☀️ DLI calculator** — Daily Light Integral math with week-by-week targets for autos and photoperiods
- **⏰ Smart reminders** — watering/feeding reminders with buffer days
- **🏕️ Tent planner** — top-down pot layout with drag & drop and bin-packing auto-arrange
- **🖼️ Photo gallery** — slideshow with day/week/phase labels
- **📄 Reports & export** — standalone HTML report, Markdown for forums, post to Overgrow, JSON backup & restore
- **☁️ Sync across devices (optional)** — grows and compressed photos in step across devices, encrypted on the device before upload (`src/sync/`)

## Privacy by design

- Grow data is stored in `localStorage`, photos in `IndexedDB` — nothing leaves the device unless the user exports, shares, or turns on sync after giving consent.
- A service worker caches the app so it works with no connection.
- No account needed, no analytics, no ads.

## Tech stack

Vanilla **TypeScript** built with **Vite** as a PWA. No UI framework — the interface is hand-written component classes. Unit tests use **Vitest** (jsdom); end-to-end tests use **Playwright** on desktop and mobile viewports.

## Code tour

```
src/
  types.ts          domain model: Grow, Plant, Entry, Phase, constants, date math
  dli.ts            phase detection and light / DLI calculations
  store.ts          localStorage store: grows, entries, settings, export/import
  photoStore.ts     IndexedDB store for photo blobs
  app.ts            app controller: hash routing and view switching
  timeline.ts       timeline renderer
  overgrow.ts       Overgrow links and forum-topic builder
  sync/             optional sync: auth, encryption, merge rules, photo upload
  theme.ts          light/dark theming
  components/       UI components (Dashboard, GrowForm, EntryForm, TentPlanner, …)
tests/              Vitest unit tests (DLI math, store, Markdown export, Overgrow)
e2e/                Playwright tests (landing, grow creation, diary, modals, reminders)
```

Good places to start:

- **`src/dli.ts`** — how phases are detected and light targets are calculated
- **`src/store.ts`** — the data model in practice, including JSON import validation and Markdown export
- **`src/components/TentPlanner.ts`** — pot layout and auto-arrange

## Contributing

Issues are welcome — bug reports, ideas, and questions about the code. Because this repo is a mirror that is overwritten on every update, pull requests can't be merged directly here; if you open one, the change will be carried over into the app by hand and credited.

When suggesting changes, please keep to the app's conventions:

- read and write data through `store` / `photoStore`, never `localStorage` or IndexedDB directly
- keep new data fields optional so existing diaries keep loading
- keep it offline-first and friendly for amateur growers

## Sync is optional

The diary and all its tools work with no account at all. Sync is something you
switch on: grows and photos are encrypted on the device first, so the server
only ever holds blocks nobody there can read. No ads, and user data is never
sold.

## License

[MIT](LICENSE) — free to use, modify and share.

<div align="center">

Made with 🌱 for growers everywhere · Part of the [Overgrow](https://overgrow.com) community

</div>
