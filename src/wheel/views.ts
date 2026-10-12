/**
 * Other ways to look at the same days: a calendar and a timeline.
 *
 * The wheel is good at "where am I in the cycle"; these two answer what the
 * wheel is weak at:
 *
 * - **calendar** – months as week grids. Which weekday, which date, what
 *   happened around it: the familiar paper calendar, the lane in focus as a
 *   heat map, the other lanes as small pips.
 * - **timeline** – one row per lane, days left to right. Compare lanes day by
 *   day (does sleep follow mood?) and read long spans at a glance.
 *
 * Pure string renderers (HTML, no DOM): JournalWheel wires them up; the same
 * selection, focus and band serve every view.
 */
import { esc, type WheelMark, type WheelSegment } from './render';

export type WheelViewKind = 'wheel' | 'calendar' | 'timeline';

/** Every view, in the order of the switch. */
export const WHEEL_VIEWS: readonly WheelViewKind[] = ['wheel', 'calendar', 'timeline'];

export interface FlatLane {
    id: string;
    label: string;
    marks: WheelMark[];
}

export interface FlatViewOptions {
    days: { index: number; key: string; date: Date }[];
    today: number | null;
    selected: number;
    /** lane id or 'rim' */
    focus: string;
    lanes: FlatLane[];
    segments: WheelSegment[];
    /** name of the rim row; null: no periods row */
    rimLabel: string | null;
    /** BCP 47 locale for dates */
    locale?: string;
    /** accessible name of the view */
    title: string;
}

/** Marks per day (spans cover every day they span). */
export function marksByDay(count: number, marks: WheelMark[]): WheelMark[][] {
    const out: WheelMark[][] = Array.from({ length: count }, () => []);
    for (const m of marks) {
        const to = m.kind === 'span' ? Math.min(count - 1, Math.max(m.i, m.to ?? m.i)) : m.i;
        for (let i = Math.max(0, m.i); i <= to && i < count; i++) out[i].push(m);
    }
    return out;
}

/** Segment (period) per day, or null. */
export function segmentByDay(count: number, segments: WheelSegment[]): (WheelSegment | null)[] {
    const out = new Array<WheelSegment | null>(count).fill(null);
    for (const seg of segments) for (let i = Math.max(0, seg.from); i <= seg.to && i < count; i++) out[i] = seg;
    return out;
}

/** Monday-first weekday column (0 … 6) of a UTC date. */
export function weekdayColumn(date: Date): number {
    return (date.getUTCDay() + 6) % 7;
}

/** Consecutive runs of days in the same calendar month: [from, to] slots. */
export function monthRuns(days: { date: Date }[]): { from: number; to: number; date: Date }[] {
    const runs: { from: number; to: number; date: Date }[] = [];
    days.forEach((d, i) => {
        const last = runs[runs.length - 1];
        if (last && last.date.getUTCMonth() === d.date.getUTCMonth() && last.date.getUTCFullYear() === d.date.getUTCFullYear()) last.to = i;
        else runs.push({ from: i, to: i, date: d.date });
    });
    return runs;
}

const pct = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 1000) / 10}%`;
const mark = (m: WheelMark) => (m.color ? `--mark:${esc(m.color)};` : '');

/** Short summary of a day's marks for screen readers and tooltips. */
function says(marks: WheelMark[]): string {
    return marks.map((m) => m.title).filter(Boolean).join(', ');
}

/** One mark as a small glyph (calendar cell, timeline row). */
function glyph(m: WheelMark, extra = ''): string {
    const faint = m.faint ? ' is-faint' : '';
    const pos = `--p:${pct(m.pos ?? 0.5)};`;
    switch (m.kind) {
        case 'bar':
            return `<i class="cx-flat__mark cx-flat__mark--bar${faint}" style="${mark(m)}--v:${pct(m.value ?? 1)};${extra}"></i>`;
        case 'span':
            return `<i class="cx-flat__mark cx-flat__mark--span${faint}" style="${mark(m)}${pos}--v:${pct(m.value ?? 0.3)};${extra}"></i>`;
        default:
            return `<i class="cx-flat__mark cx-flat__mark--${m.kind}${faint}" style="${mark(m)}${pos}${extra}"></i>`;
    }
}

function segmentStyle(seg: WheelSegment | null): string {
    if (!seg) return '';
    return `--seg:${esc(seg.color ?? 'var(--cx-ochre)')};`;
}

// ---- calendar ------------------------------------------------------------------

/** Months as week grids. Day buttons carry `data-wheel-day`. */
export function renderCalendar(o: FlatViewOptions): string {
    const n = o.days.length;
    const segs = segmentByDay(n, o.segments);
    const focusLane = o.lanes.find((l) => l.id === o.focus) ?? null;
    const focusMarks = focusLane ? marksByDay(n, focusLane.marks) : null;
    const others = o.lanes.filter((l) => l !== focusLane).map((l) => ({ lane: l, days: marksByDay(n, l.marks) }));
    const monday = new Date(Date.UTC(2024, 0, 1)); // a Monday
    const heads = Array.from({ length: 7 }, (_, k) => new Date(monday.getTime() + k * 86400000)
        .toLocaleDateString(o.locale, { weekday: 'narrow', timeZone: 'UTC' }));
    const years = new Set(o.days.map((d) => d.date.getUTCFullYear())).size > 1;

    const months = monthRuns(o.days).map((run) => {
        const title = run.date.toLocaleDateString(o.locale, { month: 'long', ...(years ? { year: 'numeric' } : {}), timeZone: 'UTC' });
        const cells: string[] = heads.map((h) => `<span class="cx-cal__head" aria-hidden="true">${esc(h)}</span>`);
        const lead = weekdayColumn(o.days[run.from].date);
        for (let k = 0; k < lead; k++) cells.push('<span class="cx-cal__pad" aria-hidden="true"></span>');
        for (let i = run.from; i <= run.to; i++) {
            const d = o.days[i];
            const seg = segs[i];
            const own = focusMarks?.[i] ?? [];
            const heat = own.filter((m) => m.kind === 'bar').reduce((a, m) => Math.max(a, m.value ?? 1), -1);
            const heatColor = own.find((m) => m.kind === 'bar')?.color;
            const glyphs = own.filter((m) => m.kind !== 'bar').slice(0, 4).map((m) => glyph(m)).join('');
            const pips = others.map(({ lane, days }) => {
                const m = days[i][0];
                return m ? `<i class="cx-cal__pip${m.faint ? ' is-faint' : ''}" style="${mark(m)}" title="${esc(lane.label)}"></i>` : '';
            }).join('');
            const cls = [
                'cx-cal__day',
                i === o.selected ? 'is-selected' : '',
                i === o.today ? 'is-today' : '',
                o.today !== null && i > o.today ? 'is-ahead' : '',
                seg ? 'has-period' : '',
                seg?.current ? 'is-current-period' : '',
                o.focus === 'rim' && seg ? 'is-period-focus' : '',
                heat >= 0 ? 'has-heat' : '',
            ].filter(Boolean).join(' ');
            const style = `${segmentStyle(seg)}${heat >= 0 ? `--v:${pct(0.18 + heat * 0.62)};${heatColor ? `--mark:${esc(heatColor)};` : ''}` : ''}`;
            const date = d.date.toLocaleDateString(o.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
            const said = [seg?.label, says(own)].filter(Boolean).join(' · ');
            cells.push(`<button type="button" tabindex="-1" class="${cls}" data-wheel-day="${i}" aria-pressed="${i === o.selected}" aria-label="${esc(said ? `${date}: ${said}` : date)}"${style ? ` style="${style}"` : ''}>`
                + `<span class="cx-cal__num">${d.date.getUTCDate()}</span>`
                + (glyphs ? `<span class="cx-cal__glyphs" aria-hidden="true">${glyphs}</span>` : '')
                + (pips ? `<span class="cx-cal__pips" aria-hidden="true">${pips}</span>` : '')
                + '</button>');
        }
        return `<section class="cx-cal__month"><h3 class="cx-eyebrow cx-cal__title">${esc(title)}</h3><div class="cx-cal__grid">${cells.join('')}</div></section>`;
    });
    return `<div class="cx-cal cx-flat" data-wheel-surface="calendar" tabindex="0" role="group" aria-label="${esc(o.title)}">${months.join('')}</div>`;
}

// ---- timeline -------------------------------------------------------------------

/** One row per lane (periods first), days left to right. Rows carry `data-wheel-row`, tracks `data-wheel-track`. */
export function renderTimeline(o: FlatViewOptions): string {
    const n = Math.max(1, o.days.length);
    const at = (i: number) => pct(i / n);
    const wide = (a: number, b: number) => pct((b - a + 1) / n);
    const years = new Set(o.days.map((d) => d.date.getUTCFullYear())).size > 1;
    const runs = monthRuns(o.days);
    const edges = runs.slice(1).map((r) => `<i class="cx-line__edge" style="left:${at(r.from)}"></i>`).join('');
    const today = o.today !== null && o.today >= 0 && o.today < n
        ? `<i class="cx-line__today" style="left:${at(o.today + 0.5)}"></i>${o.today < n - 1 ? `<i class="cx-line__ahead" style="left:${at(o.today + 1)}"></i>` : ''}`
        : '';
    const cursor = '<i class="cx-line__cursor"></i>';
    const months = runs.map((r) => {
        const long = r.to - r.from + 1 >= n / 14;
        const name = r.date.toLocaleDateString(o.locale, { month: long ? 'short' : 'narrow', ...(years && long ? { year: '2-digit' } : {}), timeZone: 'UTC' });
        return `<span class="cx-line__month" style="left:${at(r.from)};width:${wide(r.from, r.to)}">${esc(name)}</span>`;
    }).join('');

    const row = (id: string, label: string, body: string) => {
        const sel = o.focus === id ? ' is-selected' : '';
        return `<div class="cx-line__row${sel}" data-wheel-row="${esc(id)}">`
            + `<button type="button" tabindex="-1" class="cx-line__label" data-wheel-focus="${esc(id)}" aria-pressed="${o.focus === id}">${esc(label)}</button>`
            + `<div class="cx-line__track" data-wheel-track>${edges}${body}${today}${cursor}</div></div>`;
    };

    const rows: string[] = [];
    if (o.rimLabel !== null) {
        const body = o.segments.map((seg) => {
            const from = Math.max(0, seg.from);
            const to = Math.min(n - 1, seg.to);
            if (to < from) return '';
            return `<span class="cx-line__period${seg.current ? ' is-current' : ''}" style="left:${at(from)};width:${wide(from, to)};${segmentStyle(seg)}" title="${esc(seg.label)}"><span>${esc(seg.label)}</span></span>`;
        }).join('');
        rows.push(row('rim', o.rimLabel, body));
    }
    for (const lane of o.lanes) {
        const body = lane.marks.filter((m) => m.i >= 0 && m.i < n).map((m) => {
            const to = m.kind === 'span' ? Math.min(n - 1, Math.max(m.i, m.to ?? m.i)) : m.i;
            const tip = m.title ? ` title="${esc(m.title)}"` : '';
            return glyph(m, `left:${at(m.i)};width:${wide(m.i, to)};`).replace('></i>', `${tip}></i>`);
        }).join('');
        rows.push(row(lane.id, lane.label, body));
    }
    return `<div class="cx-line cx-flat" data-wheel-surface="timeline" tabindex="0" role="group" aria-label="${esc(o.title)}" style="--sel:${at(o.selected)};--day:${pct(1 / n)}">`
        + `<div class="cx-line__row cx-line__row--months" aria-hidden="true"><span class="cx-line__label"></span><div class="cx-line__track">${months}</div></div>`
        + rows.join('')
        + '</div>';
}

/** A stored view (e.g. from app settings) or undefined when it isn't one. */
export function parseWheelView(value: unknown): WheelViewKind | undefined {
    return typeof value === 'string' && (WHEEL_VIEWS as readonly string[]).includes(value) ? (value as WheelViewKind) : undefined;
}

/** Where the timeline's cursor sits for a selection (the `--sel` custom property). */
export function timelineCursor(selected: number, count: number): string {
    return pct(selected / Math.max(1, count));
}
