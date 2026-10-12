import { icon, variantWheelHatch } from '@rafime/codex';
import {
    JournalWheel, WHEEL_VIEWS, parseWheelView,
    type WheelLaneDef, type LaneMark, type WheelBandContext, type WheelViewKind,
} from '../wheel';
import type { Grow, Entry } from '../types';
import { formatPhase, getDLITarget, getGrowDLI, getDaysUntilNextPhase, getDaysUntilHarvest, calculateRequiredPPFD } from '../dli';
import { buildDiscModel, isCareEntry, hasPhoto, lastBefore, countEntries, type DiscModel, type DiscDay, type DiscFocus, type LaneId } from '../disc';
import { iconSvg, entryTypeToLog, LOG_TYPE_META } from '../icons';

export interface GrowDiscOptions {
    /** add an entry (or a reminder, for future days) on this date */
    onDayClick?: (date: Date, day: number) => void;
    onEntryClick?: (entry: Entry) => void;
    onEntryDelete?: (entry: Entry) => void;
    /** offer the calendar and timeline next to the wheel (default true) */
    views?: boolean;
    /** the view to start in (unknown / missing → the wheel) */
    view?: string;
    /** the switch over the wheel changed the view: store it */
    onViewChange?: (view: WheelViewKind) => void;
    /** wheel beside the band on wide screens (default true; off on the landing page) */
    wide?: boolean;
}

const FOCUS_LABEL: Record<DiscFocus, string> = {
    journal: 'Journal',
    water: 'Water & feed',
    light: 'Light',
    phases: 'Phases',
};

/** Phase colours on the rim, from the grow palette. */
const PHASE_COLOR: Record<DiscDay['phase'], string> = {
    germination: 'var(--grow-phase-germination)',
    seedling: 'var(--grow-phase-seedling)',
    veg: 'var(--grow-phase-veg)',
    flower: 'var(--grow-phase-flower)',
    flush: 'var(--grow-phase-flush)',
    harvest: 'var(--grow-phase-harvest)',
    complete: 'var(--grow-phase-complete)',
};

/** How the wheel hatches the phases: the Codex "grow" pen (tokens.json → variants.grow.pen.wheel). */
const GROW_HATCH = variantWheelHatch('grow');

/** Grow words for the wheel's view switch. */
const GROW_LABELS = {
    viewWheel: 'Wheel',
    viewCalendar: 'Calendar',
    viewTimeline: 'Timeline',
};

/**
 * The grow as one wheel (src/wheel): the phases on the rim, and a lane per
 * kind of information inside — journal, water & feed, light — all on the same
 * day axis, from germination to harvest. Drag, keys and the stepper come from
 * JournalWheel; this class supplies the grow's lanes and the band underneath.
 */
export class GrowDisc {
    private container: HTMLElement;
    private options: GrowDiscOptions;
    private grow: Grow | null = null;
    private model: DiscModel | null = null;
    private wheel: JournalWheel<DiscDay> | null = null;
    private current: DiscDay | null = null;
    private readonly onClick = (e: Event) => this.handleClick(e);

    constructor(container: HTMLElement, options: GrowDiscOptions = {}) {
        this.container = container;
        this.options = options;
        // the band is part of the wheel's view, so clicks on entries bubble here
        container.addEventListener('click', this.onClick);
    }

    render(grow: Grow): void {
        const isNewGrow = !this.grow || this.grow.id !== grow.id;
        this.grow = grow;
        this.model = buildDiscModel(grow);
        const model = this.model;
        const data = {
            days: model.days,
            today: model.todayIndex,
            segments: model.phases.map((p) => ({
                from: p.from,
                to: p.to,
                label: p.label,
                key: p.phase,
                color: PHASE_COLOR[p.phase],
                current: model.todayIndex !== null && model.todayIndex >= p.from && model.todayIndex <= p.to,
            })),
        };
        if (this.wheel && !isNewGrow && this.container.querySelector('.cx-wheel-view')) {
            this.wheel.update(data);
            return;
        }
        this.wheel?.destroy();
        this.wheel = new JournalWheel<DiscDay>(this.container, {
            ...data,
            hatch: GROW_HATCH,
            views: this.options.views === false ? false : WHEEL_VIEWS,
            view: parseWheelView(this.options.view),
            onViewChange: (v) => this.options.onViewChange?.(v),
            lanes: this.lanes(),
            rimLabel: FOCUS_LABEL.phases,
            rimIcon: icon('leaf'),
            initialFocus: 'journal',
            band: (ctx) => this.band(ctx),
            hub: (d, { isToday }) => ({ value: d.day, caption: isToday ? formatPhase(d.phase) : this.shortDate(d.date) }),
            title: (d) => `${grow.strain}: day ${d.day}, ${formatPhase(d.phase)}`,
            dayLine: (d, { isToday }) => `Day ${d.day} · ${this.longDate(d.date)} · ${formatPhase(d.phase)}${isToday ? ' · today' : ''}`,
            idPrefix: `disc-${grow.id}`,
            locale: 'en-US',
            viewClass: this.options.wide === false ? 'grow-disc' : 'grow-disc cx-wheel-view--wide',
            labels: GROW_LABELS,
        });
    }

    /** Select a day by "Day N" (days since sprout). */
    selectDay(day: number): void {
        const idx = this.model?.days.findIndex((d) => d.day === day) ?? -1;
        if (idx >= 0) this.wheel?.select(idx);
    }

    /** The view on screen: wheel, calendar or timeline. */
    get view(): WheelViewKind | null {
        return this.wheel?.view ?? null;
    }

    /** Switch to the wheel, the calendar or the timeline. */
    setView(view: WheelViewKind): void {
        this.wheel?.setView(view);
    }

    destroy(): void {
        this.container.removeEventListener('click', this.onClick);
        this.wheel?.destroy();
        this.wheel = null;
    }

    private handleClick(e: Event): void {
        const target = e.target as HTMLElement;
        if (!this.grow || !this.model || !this.wheel) return;

        const deleteBtn = target.closest<HTMLElement>('[data-delete-entry]');
        if (deleteBtn) {
            e.stopPropagation();
            const entry = this.grow.entries.find((x) => x.id === deleteBtn.dataset.deleteEntry);
            if (entry) this.options.onEntryDelete?.(entry);
            return;
        }

        const entryEl = target.closest<HTMLElement>('[data-entry-id]');
        if (entryEl) {
            const entry = this.grow.entries.find((x) => x.id === entryEl.dataset.entryId);
            if (entry) this.options.onEntryClick?.(entry);
            return;
        }

        if (target.closest('[data-action="disc-add"]')) {
            const d = this.day();
            this.options.onDayClick?.(new Date(d.date), d.day);
        }
    }

    /** The day the band is drawn for (set before JournalWheel exists, during its first render). */
    private day(): DiscDay {
        return this.current ?? this.wheel!.selected;
    }

    private index(): number {
        return this.day().index;
    }

    // ---- lanes -------------------------------------------------------------

    /** Outside → inside. The journal holds the most marks, the outer ring has the most room. */
    private lanes(): WheelLaneDef<DiscDay>[] {
        const faintAfter = (d: DiscDay, today: number | null) => d.index > (today ?? this.model!.days.length);
        return [
            {
                id: 'journal' satisfies LaneId,
                label: FOCUS_LABEL.journal,
                icon: icon('book'),
                marks: (d, { today }) => {
                    const faint = faintAfter(d, today);
                    const out: LaneMark[] = [];
                    for (const e of d.entries) {
                        const title = `Day ${d.day}: ${e.title}`;
                        const eFaint = faint || e.reminderDone === true;
                        switch (e.type) {
                            case 'watering':
                            case 'feeding':
                                continue;
                            case 'milestone':
                                out.push({ kind: 'dot', pos: 0.5, color: 'var(--cx-ink)', faint: eFaint, title });
                                break;
                            case 'issue':
                                out.push({ kind: 'dot', pos: 0.78, color: 'var(--cx-rust)', faint: eFaint, title });
                                break;
                            case 'reminder':
                                out.push({ kind: 'ring', pos: 0.78, color: 'var(--cx-rust)', faint: e.reminderDone === true, title: `Reminder · ${title}` });
                                break;
                            default:
                                out.push({ kind: 'ring', pos: 0.22, color: 'var(--cx-ink)', faint: eFaint, title });
                        }
                        if (hasPhoto(e)) out.push({ kind: 'square', pos: 0.5, color: 'var(--cx-ochre)', faint: eFaint, title: `${title} (photo)` });
                    }
                    return out;
                },
            },
            {
                id: 'water' satisfies LaneId,
                label: FOCUS_LABEL.water,
                short: 'Water',
                icon: iconSvg('water', 16),
                marks: (d, { today }) => {
                    const faint = faintAfter(d, today);
                    return d.entries.filter(isCareEntry).map((e): LaneMark => e.type === 'watering'
                        ? { kind: 'dot', pos: 0.3, color: 'var(--color-water)', faint: faint || e.reminderDone === true, title: `Day ${d.day}: ${e.title}` }
                        : { kind: 'square', pos: 0.72, color: 'var(--grow-nutrient-bio-grow)', faint: faint || e.reminderDone === true, title: `Day ${d.day}: ${e.title}` });
                },
            },
            {
                id: 'light' satisfies LaneId,
                label: FOCUS_LABEL.light,
                icon: icon('sun'),
                marks: (d, { today }) => d.lightHours > 0
                    ? { kind: 'bar', value: d.lightHours / 24, color: 'var(--grow-light-day)', faint: faintAfter(d, today), title: `Day ${d.day}: ${d.lightHours} h light` }
                    : null,
            },
        ];
    }

    private band(ctx: WheelBandContext<DiscDay>): string {
        this.current = ctx.day;
        const focus: DiscFocus = ctx.focus === 'rim' ? 'phases' : (ctx.focus as DiscFocus);
        switch (focus) {
            case 'water': return this.waterBand(ctx.isFuture);
            case 'light': return this.lightBand();
            case 'phases': return this.phasesBand();
            default: return this.journalBand(ctx.isFuture);
        }
    }

    /**
     * The one "detailed entry" button: it opens the entry form for the day on
     * the disc (a reminder for future days), and says which day that is.
     * One-tap logging for today lives in the quick-log row beside the disc.
     */
    private addButton(isFuture: boolean, what = 'Entry'): string {
        const day = this.day().day;
        const label = isFuture ? `+ Reminder for Day ${day}` : `+ ${what} for Day ${day}`;
        return `<button type="button" class="cx-btn cx-btn--solid cx-btn--block disc-add" data-action="disc-add">${label}</button>`;
    }

    private entryList(entries: Entry[]): string {
        if (!entries.length) return '';
        return `<ol class="cx-log disc-entries">${entries.map((e) => {
            const log = entryTypeToLog(e.type);
            const auto = e.type === 'reminder';
            return `
              <li class="cx-log__entry disc-entry${auto ? ' cx-log__entry--auto' : ''}" data-entry-id="${this.esc(e.id)}" data-type="${e.type}">
                <span class="disc-entry-icon" style="color: var(${LOG_TYPE_META[log].colorVar})">${iconSvg(log, 18)}</span>
                <span class="cx-log__what">
                  <span class="entry-title">${this.esc(e.title)}</span>
                  ${e.content ? `<span class="disc-entry-content">${this.esc(e.content.slice(0, 140))}${e.content.length > 140 ? '…' : ''}</span>` : ''}
                  <span class="cx-log__tag">${LOG_TYPE_META[log].label}${hasPhoto(e) ? ' · photo' : ''}${e.dli ? ` · DLI ${e.dli}` : ''}</span>
                </span>
                <button type="button" class="entry-delete" data-delete-entry="${this.esc(e.id)}" aria-label="Delete ${this.esc(e.title)}">×</button>
              </li>`;
        }).join('')}</ol>`;
    }

    private journalBand(isFuture: boolean): string {
        const day = this.day();
        const entries = day.entries.filter((e) => !isCareEntry(e));
        return `
          ${entries.length ? this.entryList(entries) : `<p class="cx-note">${isFuture ? 'Nothing planned for this day yet.' : 'Nothing written on this day.'}</p>`}
          ${this.addButton(isFuture)}
        `;
    }

    private waterBand(isFuture: boolean): string {
        const model = this.model!;
        const day = model.days[this.index()];
        const entries = day.entries.filter(isCareEntry);
        const lastWater = lastBefore(model, this.index(), 'watering');
        const lastFeed = lastBefore(model, this.index(), 'feeding');
        const ago = (x: { daysAgo: number } | null) => (x === null ? 'never' : x.daysAgo === 0 ? 'this day' : x.daysAgo === 1 ? '1 day before' : `${x.daysAgo} days before`);
        return `
          <ul class="cx-leaders">
            <li class="cx-leader"><span class="cx-leader__label">Last watered</span><span class="cx-leader__value">${ago(lastWater)}</span></li>
            <li class="cx-leader"><span class="cx-leader__label">Last fed</span><span class="cx-leader__value">${ago(lastFeed)}</span></li>
            <li class="cx-leader cx-leader--muted"><span class="cx-leader__label">Up to this day</span><span class="cx-leader__value">${countEntries(model, 'watering', this.index())} × water · ${countEntries(model, 'feeding', this.index())} × feed</span></li>
          </ul>
          ${entries.length ? this.entryList(entries) : `<p class="cx-note">${isFuture ? 'Nothing planned for this day.' : 'No watering or feeding logged on this day.'}</p>`}
          ${this.addButton(isFuture, 'Water or feed')}
        `;
    }

    private lightBand(): string {
        const grow = this.grow!;
        const day = this.day();
        const hours = day.lightHours;
        if (hours === 0) {
            return `<div class="cx-display"><span class="cx-display__value">0</span><span class="cx-display__unit">hours of light<br>${day.phase === 'germination' ? 'seeds germinate in the dark' : 'the lamp is off after harvest'}</span></div>`;
        }
        const target = getDLITarget(grow, day.date);
        const dli = Math.round(getGrowDLI(grow, day.date) * 10) / 10;
        const inRange = dli >= target.min && dli <= target.max;
        const measured = day.entries.find((e) => typeof e.dli === 'number');
        const flip = grow.dates.flowerStart ? this.model!.byKey.get(grow.dates.flowerStart.slice(0, 10)) : undefined;
        const flipDay = flip !== undefined ? this.model!.days[flip].day : null;
        return `
          <div class="cx-display">
            <span class="cx-display__value">${hours}/${24 - hours}</span>
            <span class="cx-display__unit">hours light / dark<br>${grow.light.ppfd} µmol/m²/s at the canopy</span>
          </div>
          <ul class="cx-leaders">
            <li class="cx-leader${inRange ? '' : ' cx-leader--attention'}"><span class="cx-leader__label">DLI from your light</span><span class="cx-leader__value">${dli} mol</span></li>
            <li class="cx-leader"><span class="cx-leader__label">Target this week</span><span class="cx-leader__value">${target.min}–${target.max} mol</span></li>
            ${measured ? `<li class="cx-leader"><span class="cx-leader__label">Measured that day</span><span class="cx-leader__value">${measured.dli} mol</span></li>` : ''}
            <li class="cx-leader cx-leader--muted"><span class="cx-leader__label">Vegetative / flower</span><span class="cx-leader__value">${grow.light.vegHours} h / ${grow.light.flowerHours} h</span></li>
            ${flipDay !== null ? `<li class="cx-leader cx-leader--muted"><span class="cx-leader__label">Switch to ${grow.light.flowerHours} h</span><span class="cx-leader__value">Day ${flipDay}</span></li>` : ''}
          </ul>
          <p class="cx-note">${inRange ? this.esc(target.description) : `${dli < target.min ? 'Below' : 'Above'} the target. At ${hours} h, about ${Math.round(calculateRequiredPPFD(dli < target.min ? target.min : target.max, hours))} µmol/m²/s would reach it.`}</p>
        `;
    }

    private phasesBand(): string {
        const model = this.model!;
        const grow = this.grow!;
        const today = model.todayIndex;
        const next = getDaysUntilNextPhase(grow);
        const harvest = getDaysUntilHarvest(grow);
        return `
          <ol class="cx-leaders disc-phases">
            ${model.phases.map((p) => {
                const current = today !== null && today >= p.from && today <= p.to;
                const selected = this.index() >= p.from && this.index() <= p.to;
                const range = p.fromDay === p.toDay ? `Day ${p.fromDay}` : `Day ${p.fromDay}–${p.toDay}`;
                return `<li class="cx-leader${current ? ' cx-leader--attention' : ''}${selected && !current ? ' is-selected' : ''}" data-phase="${p.phase}">
                  <span class="cx-leader__label">${p.label}${current ? ' · now' : ''}</span>
                  <span class="cx-leader__value">${range}</span>
                </li>`;
            }).join('')}
          </ol>
          <p class="cx-note">${next !== null ? `Next phase in ${next} ${next === 1 ? 'day' : 'days'}.` : ''} ${harvest !== null ? `Harvest in ${harvest} ${harvest === 1 ? 'day' : 'days'}.` : ''} The dashed lines carry each phase change through every lane.</p>
        `;
    }

    // ---- helpers -----------------------------------------------------------

    private shortDate(date: Date): string {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    }

    private longDate(date: Date): string {
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    }

    private esc(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
