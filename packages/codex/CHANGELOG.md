# Changelog

## Unveröffentlicht

- **Feder: ruhige Hand beim Neuzeichnen.** Die Hand eines Elements hängt
  jetzt an seinem Platz unter der Wurzel statt an der Reihenfolge, in der es
  gefunden wurde: neu gerenderte Knöpfe, Chips und Listen behalten ihre
  Linien (vorher sprang jede Kante bei jedem Klick). Neue Elemente werden
  sofort gezeichnet (kein Bild ohne Kante), bestehende nicht mehr bei jeder
  DOM-Änderung neu. `data-pen-seed` legt die Hand fest.
- **Feder: `shadows`-Option** – `createPen(root, s, { shadows: '.btn, .card' })`
  zeichnet auch die schraffierten Schatten der eigenen erhabenen Elemente
  einer App (Fläche und Kante bleiben CSS). Das SVG der Feder bekommt seine
  Größe inline (App-Regeln wie `.chip svg { width: 16px }` schnitten es ab),
  und mit `installInk()` zugleich werden die Tinten-Kanten in `::after` unter
  `.cx-pen` ausgeblendet (vorher doppelte Kanten).
- Grow: die Feder schraffiert diagonal (statt Schraffe) mit Pinsel-Kanten,
  Wackeln 0,8 – ruhige, gut lesbare Schatten, organische Tinte.
- Grow: die Phasen des Rads sind jetzt als Kupferstich schraffiert (engrave,
  Dichte 1, −35°, ruhige Feder statt Pinsel) – wie eine botanische Tafel.
- Specimen: die Variante bringt ihre Feder (`variantPen`) mit, bis man sie von
  Hand ändert – danach bleibt die eigene Einstellung beim Variantenwechsel;
  „Reset“ lädt das Preset der Variante.
- **Eine Feder pro Variante.** `tokens.json → pen` (Standard) und
  `variants.<name>.pen` (Schraffur, Zittern, Wackeln, Dichte, Winkel, Seed,
  dazu `width`, `lift`, `liftSm`); `variantPen(name)` liefert die
  `createPen()`-Einstellungen, die Varianten-CSS setzt passend
  `--cx-hatch-*` und `--cx-size-shadow*`. Tide: Wellen + Feder; Compass:
  Kupferstich + Skizze; Grow: Schraffe + Pinsel; Atelier: Kreuz + Skizze;
  Launchpad: punktiert + Zittern. `compile`: `variantPen()`, `penEntries()`.
- **Schraffur fürs Rad:** `pen.wheel` / `variants.<name>.pen.wheel` (Stil,
  Dichte, Winkel, Wackeln, `rim: current | all`), `variantWheelHatch()`
  für `@rafime/wheel`s Option `hatch`; `tremble` zeichnet auch die Linien
  des Rads von Hand. `strokeSvg()` in `pen`: jede Linie (Bögen, Kreise)
  in einem Zitter-Stil.
- **Die Feder (`@rafime/codex/pen`, `pen.css`).** Eine Hand mit Seed zeichnet
  jede Kante und jeden schraffierten Schatten als SVG: acht Schraffuren
  (diagonal, Kreuz, punktiert, Gekritzel, Kupferstich, Kontur, Schraffe,
  Wellen, dazu „gemischt“) und sechs Arten zu zittern (ruhig, Feder, Skizze,
  Zittern, Pinsel, trocken, „gemischt“); Wackeln, Dichte, Winkel, Seed,
  „Kochen“. `createPen(root, settings)` läuft über `.cx-pen`, beobachtet
  Größe und neue Elemente; ohne JavaScript bleibt die CSS-Schraffur. Aus der
  Codex-Specimen-Seite übernommen, das Beispiel zeigt sie jetzt.
- **Schraffur als Tokens:** `--cx-hatch-angle`, `--cx-hatch-width`,
  `--cx-hatch-gap` (Gruppe `hatch` in `tokens.json`) statt fester Werte.
- **`@rafime/codex/compile`:** die reinen Funktionen, mit denen der Build
  `tokens.css` und Varianten erzeugt (auch im Browser nutzbar), `contrast()`.
- Farbvariante `atelier` (Aprikosenpapier, violettbraune Tinte, Ultramarin;
  Fraunces + Literata) und Palette `atelier`; Symbole `palette`, `brush`,
  `swatch`; Export `typefaces/*.css`.
- Farbvariante `launchpad` (Sternkarten-Blau, Indigotinte, Blattgold; nachts
  Nachtblau; EB Garamond + Hanken Grotesk) und Palette `launchpad`; Symbole
  `rocket`, `search`.

- **Schrift pro App.** Zwei Schriftrollen `--cx-font-display` (Titel, große
  Zahlen, `cx-diagram`/das Rad) und `--cx-font-text` (Text, Knöpfe, Chips,
  Eingaben); beide folgen ohne Variante `--cx-font-serif`. Varianten wählen
  ihre Schriften (`variants.<name>.font`) aus `typefaces` und importieren
  `dist/typefaces/<name>.css`. `--cx-font-adjust` (`font-size-adjust`) gleicht
  die x-Höhe an. Neue Schriften, selbst gehostet (OFL): Literata (tide),
  Newsreader (compass), Fraunces + Hanken Grotesk (grow).
- Farbvariante `grow` („Hanfpapier & Chlorophyll“) für Grow Journal; Palette
  `grow` mit Rollen für Eintragsarten (`log-*`), `health-ok`, `health-watch`,
  `pot-overflow`.
- Neue Symbole: `drop`, `flask`, `scissors`, `camera`, `ruler`, `bell`,
  `sprout`, `pot`, `tent`, `flower`, `image`, `play`, `pause`, `share`,
  `grid`, `help`.

## 0.5.0 — 2026-09-24

- **Gezeichnete Schatten.** Knöpfe, Chips und klickbare Karten
  (`a.cx-entry`, `button.cx-entry`) werfen Schraffur statt weicher Schatten.
  Überfahren hebt den Knopf, Drücken setzt ihn in den Schatten; gedrückte
  Chips (`aria-pressed`) liegen flach. `cx-hatched` gibt jedem Element den
  Schatten.
- Knöpfe haben jetzt eine deckende Fläche (`--cx-paper-raised`). Farben pro
  Element über `--cx-fill`, `--cx-hatch`, `--cx-lift` (neben `--cx-edge`).
  Im Tintenmodus werden Fläche und Rand zusammen gezeichnet — keine eckige
  Füllung mehr in einem zitternden Rand.
- Neue Tokens: Farben `shade`, `shade-strong` (je Thema und Variante),
  `--cx-paper-raised`, `--cx-size-shadow` (4 px), `--cx-size-shadow-sm` (2 px).
- Neu: `cx-btn--quiet` (ohne Fläche und Schatten). `span.cx-chip` ist eine
  Marke ohne Schatten und Hover.
- Tintenlinie ruhiger (`#cx-ink-line`: langwelliger, weniger Treppen), Vignette
  der Blätter leichter.
- `cx-btn-row`, `cx-btn-grid`, `cx-chips` lassen Platz für die Schatten.
- Referenzseite: Abschnitt „Knöpfe“, `renderDisc`-Rest entfernt (lief seit
  0.4.0 nicht mehr).

## 0.4.0 — 2026-09-24

- Farbvarianten: `tokens.json → variants`, erzeugt `dist/variants/<name>.css`
  (Import nach `codex.css`). Erste Variante `tide`: kühles Leinen,
  blauschwarze Tinte, Maulbeere statt Rost. `color()` und `paletteColor()`
  nehmen die Variante als drittes/viertes Argument.
- Palette `tide` (Stimmung, Schlaf, Auslöser, Perioden).
- **Breaking:** die Scheibe ist nach `@rafime/wheel` umgezogen
  (`renderDisc` → `renderWheel`, CSS in `@rafime/wheel/wheel.css`).

## 0.3.0 — 2026-09-24

- Gezeichnete Linien: `installInk()` setzt `cx-inked` auf `<html>` und legt die
  Tinten-Filter in die Seite. Rahmen von Blatt, Knöpfen, Chips, Kacheln,
  Bändern, Hinweisen und Messkarten zittern dann wie Tinte (`#cx-ink-line`).
  Randfarbe pro Baustein in `--cx-edge`; `.cx-drawn` macht jedes Element mit
  Rahmen zum gezeichneten.
- Scheibe: eigene `<defs>` (Tinte + Schraffur) in jedem `<svg>`, Linien
  standardmäßig gezittert (`inked: false` schaltet es ab). Die Hand für den
  gewählten Tag steckt immer in `g[data-role="selection"]`, `discSelection()`
  liefert ihr Markup — so lässt sie sich beim Ziehen verschieben, ohne die
  Scheibe neu zu zeichnen. `discHubCaption()` für die Nabe.
- Scheibe: kein Fokusrahmen, keine Textauswahl, `touch-action: none` zum Ziehen
  mit dem Finger; Tastaturfokus zeigt ein rostroter Nabenring.

## 0.2.0 — 2026-09-24

- Die Scheibe: `renderDisc()`, `discLayout()`, `discHit()`, `clientToDisc()`,
  `slotAngle()`, `slotEdge()` (Export `@rafime/codex/disc`) und die
  `cx-disc__*`-Styles. Phasenkranz außen, Bahnen innen, eine Tagesachse.
- Palette `grow`: acht Pflanzenfarben `plant-1` … `plant-8`, `on-pigment`.

## 0.1.0 — 2026-09-24

Erste Fassung, abgeleitet aus den Claude-Design-Dateien „Grow Dashboard“
(Durchgänge 8–11) und „ISO Coach“ (Durchgang 1).

- Tokens in `src/tokens.json`: Papier- und Nachtthema, 13 Pigmente,
  Tintenstärken, Rollen, Schriftgrade, Abstände, Bewegung.
- Komponenten mit `cx-`-Präfix: Blatt, Kopfzeile, Anzeige, Werte, Kacheln,
  Punktlinien, Zustandskästen, Hinweise, römische Schritte, Knöpfe,
  Fortschritt, Filter, Journal, Messkarten, Legende, Tabelle, Eingaben.
- Paletten `grow` und `iso`.
- EB Garamond selbst gehostet (variable, latin + latin-ext).
- JS: `color()`, `paletteColor()`, `cssVar()`, `inkSprite()`, `arcPath()`,
  `labelArcPath()`, `ringSegmentPath()`, `valueToAngle()`, `roman()`,
  `formatNumber()`.
