/**
 * JournalWheel — the grow tool's own, slim copy of the journal wheel from
 * @rafime/wheel: the same 2D wheel, calendar and timeline, without the 3D
 * ride along the ring (no three.js). Part of the grow tool and open source with it.
 *
 * The interactive wheel: a cycle of days on one circle, periods
 * on the rim, a lane per kind of information inside, and a band underneath that
 * answers for the selected day and lane.
 *
 * The component owns: drawing, dragging (mouse / pen / finger), keyboard,
 * the day stepper and the lane chips. The app owns: the days, what each lane
 * shows, and the band's HTML. Clicks on the app's own band content bubble to
 * the container as usual — listen there.
 *
 *   const wheel = new JournalWheel(el, {
 *     days, today, segments,
 *     lanes: [{ id: 'journal', label: 'Journal', marks: (d) => d.notes.map(() => ({ kind: 'dot' })) }],
 *     band: ({ day, focus }) => `<p>${day.key}</p>`,
 *   });
 */
import { installInk } from '@rafime/codex';
import { renderWheel, wheelHand, wheelHubCaption, esc, type WheelMark, type WheelSegment, type WheelHatch } from './render';
import { wheelLayout, wheelHit, angleToIndex, clientToWheel, type WheelLayout, type WheelGeometryOptions } from './geometry';
import { todayKey, type WheelDay } from './model';
import { renderCalendar, renderTimeline, timelineCursor, WHEEL_VIEWS, type WheelViewKind, type FlatViewOptions } from './views';
import { spanName, spanDates, spanRange, rangeError, sameSpan, presetSpan, spanPresetKey, spanFromPresetKey, SPAN_PRESETS, DEFAULT_SPAN_LABELS, SPAN_LABELS_DE, type WheelSpan, type SpanLabels, type SpanPreset } from './span';

/** A mark without its slot: the component fills in the day's index. */
export type LaneMark = Omit<WheelMark, 'i'> & { i?: number };

export interface WheelLaneDef<D extends WheelDay> {
    id: string;
    /** name in the chips */
    label: string;
    /** name written in the wheel's gap (short), defaults to label */
    short?: string;
    /** trusted HTML shown before the label in its chip, e.g. icon('flag') from @rafime/codex */
    icon?: string;
    /** marks of this lane for one day */
    marks: (day: D, ctx: { today: number | null }) => LaneMark[] | LaneMark | null | undefined;
}

export interface WheelBandContext<D extends WheelDay> {
    day: D;
    days: D[];
    /** a lane id or 'rim' */
    focus: string;
    focusLabel: string;
    today: number | null;
    isToday: boolean;
    isFuture: boolean;
}

export interface JournalWheelLabels extends SpanLabels {
    today: string;
    previous: string;
    next: string;
    lanes: string;
    day: string;
    /** the span picker under the wheel */
    spanChange: string;
    spanTitle: string;
    spanOwn: string;
    spanFrom: string;
    spanTo: string;
    spanApply: string;
    /** the view switch over the wheel */
    views: string;
    viewWheel: string;
    viewCalendar: string;
    viewTimeline: string;
}

export interface JournalWheelOptions<D extends WheelDay> {
    days: D[];
    /** slot of today, or null when today is outside the range */
    today: number | null;
    /** periods / phases on the rim */
    segments?: WheelSegment[];
    /** outside → inside */
    lanes: WheelLaneDef<D>[];
    /** chip label for the rim; null hides the chip. Default "Periods" */
    rimLabel?: string | null;
    /** trusted HTML before the rim chip's label (an icon) */
    rimIcon?: string;
    /** band HTML for the selection */
    band: (ctx: WheelBandContext<D>) => string;
    /** big number + caption in the hub */
    hub?: (day: D, ctx: { isToday: boolean }) => { value: string | number; caption?: string };
    /** accessible name of the wheel */
    title?: (day: D) => string;
    /** eyebrow line in the band head, right side */
    dayLine?: (day: D, ctx: { isToday: boolean }) => string;
    /** unique per page; defaults to a counter */
    idPrefix?: string;
    initialFocus?: string;
    initialIndex?: number;
    labels?: Partial<JournalWheelLabels>;
    geometry?: WheelGeometryOptions;
    /** trembling ink lines, default true */
    inked?: boolean;
    /**
     * Hatching of the current period (and hatched spans, `rim: 'all'` for every
     * period) and how the lines tremble (`tremble`): Codex pen styles — `variantWheelHatch('<variant>')` from
     * @rafime/codex gives the variant's. Default WHEEL_HATCH_DEFAULTS.
     */
    hatch?: WheelHatch;
    /** extra class on the view, e.g. 'cx-wheel-view--wide' (wheel beside the band on wide screens) */
    viewClass?: string;
    onChange?: (ctx: WheelBandContext<D>) => void;
    /**
     * The stretch of days on the wheel. With `onSpanChange` the wheel shows it
     * under the circle and lets people pick another one (presets or dates);
     * the app stores it and calls `update()` with the new days.
     */
    span?: WheelSpan;
    onSpanChange?: (span: WheelSpan) => void;
    /**
     * Presets in the picker (default the last 1, 3, 6, 12 months). Numbers are
     * "last N months"; pass spans like `{ kind: 'next', months: 6 }` to look
     * ahead. Once a preset looks ahead, the own-dates fields allow future starts.
     */
    spanPresets?: readonly SpanPreset[];
    /** "now" for the span label (tests) */
    now?: Date;
    /** BCP 47 locale for dates on the wheel, e.g. 'de-DE'; default: the browser's */
    locale?: string;
    /**
     * Other views of the same days, offered by a switch over the wheel:
     * 'wheel', 'calendar' (months as week grids) and 'timeline' (a row per
     * lane). Default: all three. `false` or a single view hides the switch.
     */
    views?: readonly WheelViewKind[] | false;
    /** the view to show (default the first of `views`); store it with `onViewChange` */
    view?: WheelViewKind;
    onViewChange?: (view: WheelViewKind) => void;
}

const DEFAULT_LABELS: JournalWheelLabels = {
    today: 'Today',
    previous: 'Previous day',
    next: 'Next day',
    lanes: 'Lanes',
    day: 'Day',
    spanChange: 'Change what the wheel shows',
    spanTitle: 'Show on the wheel',
    spanOwn: 'Or pick your own dates',
    spanFrom: 'From',
    spanTo: 'Until',
    spanApply: 'Show',
    views: 'View',
    viewWheel: 'Wheel',
    viewCalendar: 'Calendar',
    viewTimeline: 'Timeline',
    ...DEFAULT_SPAN_LABELS,
};

/** German labels: `new JournalWheel(el, { …, labels: WHEEL_LABELS_DE, locale: 'de-DE' })`. */
export const WHEEL_LABELS_DE: JournalWheelLabels = {
    today: 'Heute',
    previous: 'Vorheriger Tag',
    next: 'Nächster Tag',
    lanes: 'Spuren',
    day: 'Tag',
    spanChange: 'Ändern, was das Rad zeigt',
    spanTitle: 'Auf dem Rad zeigen',
    spanOwn: 'Oder eigene Daten wählen',
    spanFrom: 'Von',
    spanTo: 'Bis',
    spanApply: 'Zeigen',
    views: 'Ansicht',
    viewWheel: 'Rad',
    viewCalendar: 'Kalender',
    viewTimeline: 'Zeitleiste',
    ...SPAN_LABELS_DE,
};

let counter = 0;

const VIEW_ICONS: Record<WheelViewKind, string> = {
    wheel: '<svg class="cx-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 12V3.5"/></svg>',
    calendar: '<svg class="cx-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01"/></svg>',
    timeline: '<svg class="cx-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3.5 6.5h9M7 12h13M3.5 17.5h6M15 4v16"/></svg>',
};

export class JournalWheel<D extends WheelDay = WheelDay> {
    private container: HTMLElement;
    private o: JournalWheelOptions<D>;
    private layout!: WheelLayout;
    private selectedIndex = 0;
    private focusId: string;
    private viewKind: WheelViewKind;
    private scrub: { pointerId: number; track: HTMLElement } | null = null;
    /** the lane the calendar's heat map was drawn for */
    private flatFocus = '';
    private drag: { pointerId: number; svg: SVGSVGElement } | null = null;
    private spanOpen = false;
    private spanError = '';
    private frame = 0;
    private readonly id: string;
    private readonly listeners: [string, EventListener][] = [];

    constructor(container: HTMLElement, options: JournalWheelOptions<D>) {
        this.container = container;
        this.o = options;
        this.id = options.idPrefix ?? `cx-wheel-${++counter}`;
        this.focusId = options.initialFocus ?? options.lanes[0]?.id ?? 'rim';
        this.selectedIndex = this.clamp(options.initialIndex ?? options.today ?? options.days.length - 1);
        this.viewKind = this.pickView(options.view);
        installInk(document);
        this.bind();
        this.render();
    }

    // ---- public API ------------------------------------------------------

    get selected(): D {
        return this.o.days[this.selectedIndex];
    }

    get focus(): string {
        return this.focusId;
    }

    /** Replace data (new days, marks, segments …). Keeps the selection when it still exists. */
    update(options: Partial<JournalWheelOptions<D>>): void {
        const key = this.selected?.key;
        this.o = { ...this.o, ...options };
        if (options.view !== undefined || options.views !== undefined) this.viewKind = this.pickView(options.view ?? this.viewKind);
        const same = key ? this.o.days.findIndex((d) => d.key === key) : -1;
        this.selectedIndex = this.clamp(same >= 0 ? same : this.o.today ?? this.o.days.length - 1);
        this.render();
    }

    select(index: number): void {
        this.selectedIndex = this.clamp(index);
        this.render();
    }

    selectKey(key: string): void {
        const i = this.o.days.findIndex((d) => d.key === key);
        if (i >= 0) this.select(i);
    }

    setFocus(focus: string): void {
        this.focusId = focus;
        this.render();
    }

    /** The view on screen: 'wheel', 'calendar' or 'timeline'. */
    get view(): WheelViewKind {
        return this.viewKind;
    }

    /** Switch the view (one of `views`); calls `onViewChange`. */
    setView(view: WheelViewKind): void {
        const next = this.pickView(view);
        if (next === this.viewKind) return;
        this.viewKind = next;
        this.render();
        this.surface()?.focus({ preventScroll: true });
        this.o.onViewChange?.(next);
    }

    private offeredViews(): WheelViewKind[] {
        const v = this.o.views;
        if (v === false) return ['wheel'];
        const list = (v ?? WHEEL_VIEWS).filter((x, i, a) => WHEEL_VIEWS.includes(x) && a.indexOf(x) === i);
        return list.length ? list : ['wheel'];
    }

    private pickView(view: WheelViewKind | undefined): WheelViewKind {
        const offered = this.offeredViews();
        return view && offered.includes(view) ? view : offered[0];
    }

    /** Re-render only the band (e.g. after the app changed data shown there). */
    refreshBand(): void {
        const band = this.container.querySelector('.cx-wheel-band');
        if (band) band.innerHTML = this.bandInner();
    }

    destroy(): void {
        for (const [type, fn] of this.listeners) this.container.removeEventListener(type, fn);
        this.listeners.length = 0;
        this.container.innerHTML = '';
    }

    // ---- rendering -------------------------------------------------------

    private ctx(): WheelBandContext<D> {
        const day = this.selected;
        const today = this.o.today;
        return {
            day,
            days: this.o.days,
            focus: this.focusId,
            focusLabel: this.focusLabel(this.focusId),
            today,
            isToday: this.selectedIndex === today,
            isFuture: today !== null ? this.selectedIndex > today : day.date.getTime() > Date.now(),
        };
    }

    private labels(): JournalWheelLabels {
        return { ...DEFAULT_LABELS, ...this.o.labels };
    }

    private focusLabel(id: string): string {
        if (id === 'rim') return this.o.rimLabel ?? 'Periods';
        return this.o.lanes.find((l) => l.id === id)?.label ?? id;
    }

    private render(): void {
        const o = this.o;
        if (!o.days.length) {
            this.container.innerHTML = '';
            return;
        }
        this.layout = wheelLayout(o.days.length, o.lanes.map((l) => l.id), o.geometry);
        const ctx = this.ctx();
        const active = document.activeElement;
        const hadFocus = active instanceof Element && !!active.closest('[data-wheel-surface]') && this.container.contains(active);
        const hub = o.hub?.(ctx.day, { isToday: ctx.isToday }) ?? { value: ctx.day.index + 1 };

        const title = o.title?.(ctx.day) ?? `Day ${ctx.day.key}`;
        const flat = (): FlatViewOptions => ({
            days: o.days,
            today: o.today,
            selected: this.selectedIndex,
            focus: this.focusId,
            lanes: o.lanes.map((lane) => ({ id: lane.id, label: lane.label, marks: this.marksOf(lane) })),
            segments: o.segments ?? [],
            rimLabel: o.rimLabel === null ? null : this.focusLabel('rim'),
            locale: o.locale,
            title,
        });
        const figure = this.viewKind === 'calendar' ? renderCalendar(flat()) : this.viewKind === 'timeline' ? renderTimeline(flat()) : renderWheel({
            ...o.geometry,
            count: o.days.length,
            today: o.today,
            selected: this.selectedIndex,
            selectedLane: this.focusId,
            rim: o.segments ?? [],
            lanes: o.lanes.map((lane) => ({ id: lane.id, label: lane.short ?? lane.label, marks: this.marksOf(lane) })),
            hub,
            title,
            idPrefix: this.id,
            inked: o.inked ?? true,
            hatch: o.hatch,
        }).replace('<svg ', '<svg tabindex="0" data-wheel-surface="wheel" ');
        const offered = this.offeredViews();
        this.flatFocus = this.focusId;

        const L = this.labels();
        const chips = [...o.lanes.map((l) => ({ id: l.id, label: l.label, icon: l.icon ?? '' })), ...(o.rimLabel === null ? [] : [{ id: 'rim', label: this.focusLabel('rim'), icon: o.rimIcon ?? '' }])];
        this.container.innerHTML = `
          <div class="cx-wheel-view cx is-${this.viewKind}${o.viewClass ? ` ${esc(o.viewClass)}` : ''}">
            <div class="cx-wheel-figure">${offered.length > 1 ? `<div class="cx-chips cx-wheel-views" role="group" aria-label="${esc(L.views)}">${offered.map((v) => `<button type="button" class="cx-chip" data-wheel-view="${v}" aria-pressed="${v === this.viewKind}">${VIEW_ICONS[v]}${esc(L[v === 'wheel' ? 'viewWheel' : v === 'calendar' ? 'viewCalendar' : 'viewTimeline'])}</button>`).join('')}</div>` : ''}${figure}${this.spanHtml()}</div>
            <div class="cx-wheel-controls">
              <div class="cx-wheel-stepper" role="group" aria-label="${esc(L.day)}">
                <button type="button" class="cx-btn" data-wheel-step="prev" aria-label="${esc(L.previous)}">‹</button>
                <button type="button" class="cx-btn${ctx.isToday ? ' is-current' : ''}" data-wheel-step="today"${o.today === null ? ' disabled' : ''}>${esc(L.today)}</button>
                <button type="button" class="cx-btn" data-wheel-step="next" aria-label="${esc(L.next)}">›</button>
              </div>
              <div class="cx-chips cx-wheel-lanes" role="group" aria-label="${esc(L.lanes)}">
                ${chips.map((c) => `<button type="button" class="cx-chip" data-wheel-focus="${esc(c.id)}" aria-pressed="${this.focusId === c.id}">${c.icon}${esc(c.label)}</button>`).join('')}
              </div>
            </div>
            <section class="cx-wheel-band cx-sheet" aria-live="polite">${this.bandInner()}</section>
          </div>`;
        if (hadFocus) this.surface()?.focus({ preventScroll: true });
        if (this.viewKind === 'calendar') this.revealSelected();
        o.onChange?.(ctx);
    }

    private spanHtml(): string {
        const { span, onSpanChange } = this.o;
        if (!span || !onSpanChange) return '';
        const L = this.labels();
        const now = this.o.now ?? new Date();
        const panelId = `${this.id}-span`;
        const dates = spanDates(span, now, this.o.locale);
        const name = span.kind !== 'range' ? `<span class="cx-wheel-span__name">${esc(spanName(span, L))}</span><span class="cx-wheel-span__dates">${esc(dates)}</span>` : `<span class="cx-wheel-span__name">${esc(dates)}</span>`;
        const toggle = `<button type="button" class="cx-wheel-span__toggle" data-wheel-span-toggle aria-expanded="${this.spanOpen}" aria-controls="${panelId}" title="${esc(L.spanChange)}">${name}<span class="cx-wheel-span__caret" aria-hidden="true"></span></button>`;
        if (!this.spanOpen) return `<div class="cx-wheel-span">${toggle}</div>`;
        const range = spanRange(span, now);
        const today = todayKey(now);
        const offered = (this.o.spanPresets ?? SPAN_PRESETS).map(presetSpan);
        const future = span.kind === 'next' || offered.some((s) => s.kind === 'next');
        const presets = offered.map((s) =>
            `<button type="button" class="cx-chip" data-wheel-span-preset="${spanPresetKey(s)}" aria-pressed="${sameSpan(s, span)}">${esc(spanName(s, L))}</button>`,
        ).join('');
        return `<div class="cx-wheel-span is-open">${toggle}
          <div class="cx-wheel-span__panel cx-sheet" id="${panelId}" role="group" aria-label="${esc(L.spanTitle)}">
            <span class="cx-eyebrow">${esc(L.spanTitle)}</span>
            <div class="cx-chips">${presets}</div>
            <form class="cx-wheel-span__range" data-wheel-span-form novalidate>
              <span class="cx-eyebrow">${esc(L.spanOwn)}</span>
              <div class="cx-wheel-span__fields">
                <label class="cx-field"><span class="cx-field__label">${esc(L.spanFrom)}</span><input class="cx-input" type="date" name="from" value="${range.from}"${future ? '' : ` max="${today}"`} required></label>
                <label class="cx-field"><span class="cx-field__label">${esc(L.spanTo)}</span><input class="cx-input" type="date" name="to" value="${range.to}" required></label>
                <button type="submit" class="cx-btn cx-btn--solid">${esc(L.spanApply)}</button>
              </div>
              <p class="cx-wheel-span__error" role="alert">${esc(this.spanError)}</p>
            </form>
          </div>
        </div>`;
    }

    /** Open or close the span picker. */
    toggleSpan(open = !this.spanOpen): void {
        this.spanOpen = open;
        this.spanError = '';
        this.render();
        const target = open
            ? this.container.querySelector<HTMLElement>('[data-wheel-span-preset][aria-pressed="true"], [data-wheel-span-preset]')
            : this.container.querySelector<HTMLElement>('[data-wheel-span-toggle]');
        target?.focus();
    }

    private chooseSpan(span: WheelSpan): void {
        this.spanOpen = false;
        this.spanError = '';
        if (this.o.span && sameSpan(span, this.o.span)) return this.toggleSpan(false);
        this.render();
        this.o.onSpanChange?.(span);
        this.container.querySelector<HTMLElement>('[data-wheel-span-toggle]')?.focus();
    }

    private marksOf(lane: WheelLaneDef<D>): WheelMark[] {
        const out: WheelMark[] = [];
        for (const day of this.o.days) {
            const m = lane.marks(day, { today: this.o.today });
            if (!m) continue;
            for (const mark of Array.isArray(m) ? m : [m]) out.push({ ...mark, i: mark.i ?? day.index });
        }
        return out;
    }

    private bandInner(): string {
        const ctx = this.ctx();
        const line = this.o.dayLine?.(ctx.day, { isToday: ctx.isToday })
            ?? `${ctx.day.date.toLocaleDateString(this.o.locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}${ctx.isToday ? ` · ${this.labels().today.toLowerCase()}` : ''}`;
        return `
          <div class="cx-sheet__head">
            <span class="cx-eyebrow cx-eyebrow--accent">${esc(ctx.focusLabel)}</span>
            <span class="cx-meta cx-wheel-day">${esc(line)}</span>
          </div>
          ${this.o.band(ctx)}`;
    }

    private svg(): SVGSVGElement | null {
        return this.container.querySelector<SVGSVGElement>('svg.cx-wheel');
    }

    /** What the view draws on (the wheel's svg, the calendar, the timeline): keyboard focus lives here. */
    private surface(): HTMLElement | SVGSVGElement | null {
        return this.container.querySelector<HTMLElement>('[data-wheel-surface]');
    }

    /** Keep the selected day of a long calendar in view (only inside the calendar's own scroll box). */
    private revealSelected(): void {
        const box = this.container.querySelector<HTMLElement>('.cx-cal');
        const day = box?.querySelector<HTMLElement>('.cx-cal__day.is-selected');
        if (!box || !day || box.scrollHeight <= box.clientHeight + 1) return;
        const b = box.getBoundingClientRect();
        const d = day.getBoundingClientRect();
        if (d.top < b.top || d.bottom > b.bottom) box.scrollTop += d.top - b.top - (b.height - d.height) / 2;
    }

    /** Hand, hub, lane highlight and band in place — keeps the <svg> (and pointer capture) alive. */
    private updateLive(): void {
        if (this.viewKind !== 'wheel') return this.updateFlat();
        const svg = this.svg();
        if (!svg) return this.render();
        const ctx = this.ctx();
        const hub = this.o.hub?.(ctx.day, { isToday: ctx.isToday }) ?? { value: ctx.day.index + 1 };
        const hand = svg.querySelector('[data-role="selection"]');
        if (hand) hand.innerHTML = wheelHand(this.layout, this.selectedIndex, this.o.today);
        const value = svg.querySelector('[data-role="hub-value"]');
        if (value) value.textContent = String(hub.value);
        const caption = svg.querySelector('[data-role="hub-caption"]');
        if (caption) caption.textContent = wheelHubCaption(this.layout, hub.caption ?? '');
        svg.querySelectorAll<SVGElement>('[data-lane]').forEach((g) => g.classList.toggle('is-selected', g.dataset.lane === this.focusId));
        svg.querySelectorAll<SVGElement>('[data-lane-label]').forEach((t) => t.classList.toggle('is-selected', t.dataset.laneLabel === this.focusId));
        this.container.querySelector('[data-wheel-step="today"]')?.classList.toggle('is-current', ctx.isToday);
        this.container.querySelectorAll<HTMLElement>('[data-wheel-focus]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wheelFocus === this.focusId)));
        this.refreshBand();
        this.o.onChange?.(ctx);
    }

    /** Calendar / timeline: move the selection and focus in place (keeps scroll and pointer capture). */
    private updateFlat(): void {
        const root = this.surface();
        if (!root) return this.render();
        const ctx = this.ctx();
        if (this.viewKind === 'calendar') {
            root.querySelectorAll<HTMLElement>('.cx-cal__day').forEach((b) => {
                const on = Number(b.dataset.wheelDay) === this.selectedIndex;
                b.classList.toggle('is-selected', on);
                b.setAttribute('aria-pressed', String(on));
            });
            // the heat map shows the lane in focus: a new focus needs a new drawing
            if (this.flatFocus !== this.focusId) return this.render();
            this.revealSelected();
        } else {
            (root as HTMLElement).style.setProperty('--sel', timelineCursor(this.selectedIndex, this.o.days.length));
            root.querySelectorAll<HTMLElement>('[data-wheel-row]').forEach((r) => {
                const on = r.dataset.wheelRow === this.focusId;
                r.classList.toggle('is-selected', on);
                r.querySelector('.cx-line__label')?.setAttribute('aria-pressed', String(on));
            });
        }
        this.container.querySelector('[data-wheel-step="today"]')?.classList.toggle('is-current', ctx.isToday);
        this.container.querySelectorAll<HTMLElement>('[data-wheel-focus]:not(.cx-line__label)').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wheelFocus === this.focusId)));
        this.refreshBand();
        this.o.onChange?.(ctx);
    }

    /** Day under a pointer on a timeline track. */
    private trackIndex(track: HTMLElement, clientX: number): number {
        const box = track.getBoundingClientRect();
        return this.clamp(Math.floor(((clientX - box.left) / Math.max(1, box.width)) * this.o.days.length));
    }

    // ---- interaction -----------------------------------------------------

    private on(type: string, fn: EventListener): void {
        this.container.addEventListener(type, fn);
        this.listeners.push([type, fn]);
    }

    private bind(): void {
        this.on('click', (e) => {
            const target = e.target as HTMLElement;
            const view = target.closest<HTMLElement>('[data-wheel-view]');
            if (view) return this.setView(view.dataset.wheelView as WheelViewKind);
            const day = target.closest<HTMLElement>('[data-wheel-day]');
            if (day) {
                this.selectedIndex = this.clamp(Number(day.dataset.wheelDay));
                return this.updateLive();
            }
            const step = target.closest<HTMLElement>('[data-wheel-step]');
            if (step) return this.step(step.dataset.wheelStep!);
            const focus = target.closest<HTMLElement>('[data-wheel-focus]');
            if (focus) return this.setFocus(focus.dataset.wheelFocus!);
            if (target.closest('[data-wheel-span-toggle]')) return this.toggleSpan();
            const preset = target.closest<HTMLElement>('[data-wheel-span-preset]');
            const chosen = preset && spanFromPresetKey(preset.dataset.wheelSpanPreset ?? '');
            if (chosen) this.chooseSpan(chosen);
        });

        this.on('submit', (e) => {
            const form = (e.target as HTMLElement).closest<HTMLFormElement>('[data-wheel-span-form]');
            if (!form) return;
            e.preventDefault();
            const from = (form.elements.namedItem('from') as HTMLInputElement).value;
            const to = (form.elements.namedItem('to') as HTMLInputElement).value;
            const error = rangeError(from, to, this.labels());
            if (error) {
                this.spanError = error;
                const p = form.querySelector('.cx-wheel-span__error');
                if (p) p.textContent = error;
                return;
            }
            this.chooseSpan({ kind: 'range', from, to });
        });

        this.on('keydown', (e) => {
            const ev = e as KeyboardEvent;
            if (ev.key === 'Escape' && this.spanOpen) {
                ev.preventDefault();
                ev.stopPropagation();
                return this.toggleSpan(false);
            }
            if (!(ev.target as Element).closest?.('[data-wheel-surface]')) return;
            if (this.viewKind === 'timeline' && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
                // timeline: up and down go through the rows
                ev.preventDefault();
                const rows = [...(this.o.rimLabel === null ? [] : ['rim']), ...this.o.lanes.map((l) => l.id)];
                const at = rows.indexOf(this.focusId);
                if (rows.length) this.focusId = rows[(at + (ev.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length];
                return this.updateLive();
            }
            const map: Record<string, string> = this.viewKind === 'calendar'
                ? { ArrowRight: 'next', ArrowDown: 'next-week', ArrowLeft: 'prev', ArrowUp: 'prev-week', Home: 'today', PageDown: 'next-week', PageUp: 'prev-week' }
                : { ArrowRight: 'next', ArrowDown: 'next', ArrowLeft: 'prev', ArrowUp: 'prev', Home: 'today', PageDown: 'next-week', PageUp: 'prev-week' };
            const action = map[ev.key];
            if (action) {
                ev.preventDefault();
                this.step(action);
                this.surface()?.focus({ preventScroll: true });
            }
        });

        this.on('pointerdown', (e) => {
            const ev = e as PointerEvent;
            // timeline: press on a row and slide along the days
            const track = (ev.target as Element).closest?.<HTMLElement>('[data-wheel-track]');
            if (track && ev.button <= 0) {
                ev.preventDefault();
                track.setPointerCapture?.(ev.pointerId);
                this.scrub = { pointerId: ev.pointerId, track };
                const row = track.closest<HTMLElement>('[data-wheel-row]')?.dataset.wheelRow;
                if (row) this.focusId = row;
                this.selectedIndex = this.trackIndex(track, ev.clientX);
                this.surface()?.focus({ preventScroll: true });
                return this.updateLive();
            }
            const svg = (ev.target as Element).closest?.<SVGSVGElement>('svg.cx-wheel');
            if (!svg || ev.button > 0) return;
            const { x, y } = clientToWheel(svg, this.layout, ev.clientX, ev.clientY);
            const hit = wheelHit(this.layout, x, y);
            if (hit.lane === 'hub') {
                if (this.o.today !== null) this.select(this.o.today);
                return;
            }
            if (!hit.lane) return;
            ev.preventDefault();
            svg.setPointerCapture?.(ev.pointerId);
            svg.classList.add('is-dragging');
            this.drag = { pointerId: ev.pointerId, svg };
            this.focusId = hit.lane;
            if (hit.index !== null) this.selectedIndex = hit.index;
            this.updateLive();
        });

        this.on('pointermove', (e) => {
            const ev = e as PointerEvent;
            if (this.scrub && ev.pointerId === this.scrub.pointerId) {
                const i = this.trackIndex(this.scrub.track, ev.clientX);
                if (i !== this.selectedIndex) {
                    this.selectedIndex = i;
                    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.updateLive(); });
                }
                return;
            }
            if (!this.drag || ev.pointerId !== this.drag.pointerId) return;
            const { x, y } = clientToWheel(this.drag.svg, this.layout, ev.clientX, ev.clientY);
            if (Math.hypot(x - this.layout.c, y - this.layout.c) < 4) return;
            const index = angleToIndex(this.layout, x, y);
            if (index !== null && index !== this.selectedIndex) {
                this.selectedIndex = index;
                if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.updateLive(); });
            }
        });

        const end = (e: Event) => {
            const ev = e as PointerEvent;
            if (this.scrub && ev.pointerId === this.scrub.pointerId) {
                this.scrub.track.releasePointerCapture?.(ev.pointerId);
                this.scrub = null;
                return;
            }
            if (!this.drag || ev.pointerId !== this.drag.pointerId) return;
            this.drag.svg.releasePointerCapture?.(ev.pointerId);
            this.drag = null;
            if (this.frame) cancelAnimationFrame(this.frame);
            this.frame = 0;
            this.render();
        };
        this.on('pointerup', end);
        this.on('pointercancel', end);
    }

    private step(action: string): void {
        const moves: Record<string, number> = { next: 1, prev: -1, 'next-week': 7, 'prev-week': -7 };
        if (action === 'today') this.selectedIndex = this.o.today ?? this.selectedIndex;
        else this.selectedIndex = this.clamp(this.selectedIndex + (moves[action] ?? 0));
        if (this.viewKind === 'wheel') this.render();
        else this.updateLive();
    }

    private clamp(i: number): number {
        return Math.min(Math.max(0, this.o.days.length - 1), Math.max(0, Math.round(i)));
    }
}
