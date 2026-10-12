<div align="center">

# 🌱 OG Grow Journal Assistant

**A free, offline-first grow diary for cannabis growers — track a plant's life from seed to harvest.**

Part of the [Overgrow](https://overgrow.com) growing community.

</div>

---

## About this repository

This is the **public source** of OG Grow Journal Assistant: the app, its assets and its tests. It is updated automatically whenever the app changes, so what you see here is what runs on [grow.rafime.de](https://grow.rafime.de). The first version of the app stays available as **Grow Classic** at [grow.classic.rafime.de](https://grow.classic.rafime.de/app.html); its source is the tag [`v1`](https://github.com/specialagentmrrandom-byte/grow-tool/tree/v1) in this repository.

It is a working copy, not just a read-only dump — clone it and it runs:

```bash
npm install
npm run dev          # http://localhost:5173  (landing page → /app.html)
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright, needs `npx playwright install`)
npm run build        # production build into dist/
```

No configuration is needed. The app is offline-first and keeps everything on the
device, so it works with no server at all. Only the optional sync talks to one:
copy `.env.example` to `.env.local` and point it at your own Supabase project if
you want to work on that part — see `src/sync/` and the account dialog.

What is *not* here: the deployment workflows and the hosting config of the live
site, and the database migrations behind the optional sync. The live site is
built from exactly the code in this repository — nothing is added on top.
(`src/accountAddon.ts` is an extension point for optional add-ons to the
account dialog; no build currently uses it.)

## What the app does

OG Grow Journal Assistant is a Progressive Web App for documenting a grow day by day. It runs entirely in the browser, works offline, and keeps data on the user's own device — no account needed, no tracking. An optional, end-to-end encrypted sync keeps a diary on several devices.

- **📅 Grow diary** — dated entries with notes, photos and milestones; color-coded phases from seed to harvest
- **🎡 Grow disc** — the whole grow on one wheel: phases on the rim, journal, water & feed and light as lanes inside, plus calendar and timeline views of the same days
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
  disc.ts           the grow disc's model: days, phases and lanes of one grow
  wheel/            the journal wheel: SVG wheel, calendar and timeline views, drag & keys
  seal.ts           the generated seal that tells grows apart
  pen.ts            the hand-drawn ink look (Codex pen) over the whole app
  overgrow.ts       Overgrow links and forum-topic builder
  sync/             optional sync: auth, encryption, merge rules, photo upload
  theme.ts          light/dark theming
  components/       UI components (Dashboard, GrowDisc, GrowForm, EntryForm, TentPlanner, …)
packages/codex/     the Codex design system: tokens, cx- components, icons, the "grow" colours
tests/              Vitest unit tests (DLI math, store, wheel, disc, Markdown export, Overgrow)
e2e/                Playwright tests (landing, grow creation, diary & disc, modals, reminders)
```

Good places to start:

- **`src/dli.ts`** — how phases are detected and light targets are calculated
- **`src/components/GrowDisc.ts`** + **`src/wheel/`** — how a grow becomes one wheel
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
