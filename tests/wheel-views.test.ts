// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildDays } from '../src/wheel/model';
import { renderCalendar, renderTimeline, marksByDay, monthRuns, weekdayColumn, timelineCursor, WHEEL_VIEWS, type FlatViewOptions } from '../src/wheel/views';
import { JournalWheel, WHEEL_LABELS_DE } from '../src/wheel/JournalWheel';

// 2026-01-28 (Wed) … 2026-02-10 (Tue): two months, 14 days
const days = buildDays('2026-01-28', '2026-02-10');

const opts = (o: Partial<FlatViewOptions> = {}): FlatViewOptions => ({
    days,
    today: 5,
    selected: 3,
    focus: 'mood',
    lanes: [
        { id: 'journal', label: 'Journal', marks: [{ i: 1, kind: 'dot', title: 'wrote' }, { i: 2, kind: 'span', to: 4 }] },
        { id: 'mood', label: 'Mood', marks: [{ i: 3, kind: 'bar', value: 0.5, color: 'var(--cx-moss)' }] },
    ],
    segments: [{ from: 0, to: 6, label: 'Winter <3', current: true }],
    rimLabel: 'Periods',
    locale: 'en-GB',
    title: 'Days',
    ...o,
});

describe('views: helpers', () => {
    it('spreads spans over their days and groups days into months', () => {
        const per = marksByDay(14, [{ i: 2, kind: 'span', to: 4 }, { i: 9, kind: 'dot' }, { i: 20, kind: 'dot' }]);
        expect(per.map((m) => m.length)).toEqual([0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
        expect(monthRuns(days).map((r) => [r.from, r.to])).toEqual([[0, 3], [4, 13]]);
        expect(weekdayColumn(days[0].date)).toBe(2); // Wednesday, Monday first
        expect(timelineCursor(7, 14)).toBe('50%');
        expect(WHEEL_VIEWS).toEqual(['wheel', 'calendar', 'timeline']);
    });
});

describe('views: calendar', () => {
    it('lays months out as week grids with the lane in focus as heat', () => {
        const html = renderCalendar(opts());
        const el = document.createElement('div');
        el.innerHTML = html;
        expect(el.querySelectorAll('.cx-cal__month')).toHaveLength(2);
        expect(el.querySelectorAll('[data-wheel-day]')).toHaveLength(14);
        // January starts on a Wednesday: two blanks; February 1st is a Sunday: six
        const [jan, feb] = [...el.querySelectorAll('.cx-cal__grid')];
        expect(jan.querySelectorAll('.cx-cal__pad')).toHaveLength(2);
        expect(feb.querySelectorAll('.cx-cal__pad')).toHaveLength(6);
        const sel = el.querySelector('[data-wheel-day="3"]')!;
        expect(sel.classList.contains('is-selected')).toBe(true);
        expect(sel.classList.contains('has-heat')).toBe(true);
        expect(sel.getAttribute('style')).toContain('--mark:var(--cx-moss)');
        expect(el.querySelector('[data-wheel-day="5"]')!.classList.contains('is-today')).toBe(true);
        expect(el.querySelector('[data-wheel-day="8"]')!.classList.contains('is-ahead')).toBe(true);
        // the other lane shows as pips; labels are escaped
        expect(el.querySelector('[data-wheel-day="1"] .cx-cal__pip')).not.toBeNull();
        expect(sel.getAttribute('aria-label')).toContain('Winter <3');
        expect(html).not.toContain('Winter <3');
    });
});

describe('views: timeline', () => {
    it('draws a row per lane, the periods first, and the cursor as a custom property', () => {
        const el = document.createElement('div');
        el.innerHTML = renderTimeline(opts({ focus: 'journal' }));
        const rows = [...el.querySelectorAll<HTMLElement>('[data-wheel-row]')].map((r) => r.dataset.wheelRow);
        expect(rows).toEqual(['rim', 'journal', 'mood']);
        expect(el.querySelector('.cx-line__row.is-selected')!.getAttribute('data-wheel-row')).toBe('journal');
        expect(el.querySelectorAll('.cx-line__period')).toHaveLength(1);
        expect(el.querySelector('.cx-flat__mark--span')!.getAttribute('style')).toContain('width:21.4%'); // 3 of 14 days
        expect((el.firstElementChild as HTMLElement).style.getPropertyValue('--sel')).toBe('21.4%');
        expect(el.querySelectorAll('.cx-line__month')).toHaveLength(2);
        el.innerHTML = renderTimeline(opts({ rimLabel: null }));
        expect(el.querySelector('[data-wheel-row="rim"]')).toBeNull();
    });
});

describe('JournalWheel views', () => {
    const setup = (extra: Record<string, unknown> = {}) => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const onViewChange = vi.fn();
        const wheel = new JournalWheel(el, {
            days: buildDays('2026-01-01', '2026-01-31', (d) => ({ n: d.index })),
            today: 10,
            lanes: [
                { id: 'journal', label: 'Journal', marks: (d) => (d.index % 5 === 0 ? { kind: 'dot' } : null) },
                { id: 'mood', label: 'Mood', marks: () => ({ kind: 'bar', value: 0.5 }) },
            ],
            band: ({ day, focus }) => `<p class="probe">${focus}:${day.key}</p>`,
            onViewChange,
            ...extra,
        });
        return { el, wheel, onViewChange };
    };

    it('switches views and keeps selection, focus and band', () => {
        const { el, wheel, onViewChange } = setup();
        expect(el.querySelectorAll('[data-wheel-view]')).toHaveLength(3);
        (el.querySelector('[data-wheel-view="calendar"]') as HTMLElement).click();
        expect(wheel.view).toBe('calendar');
        expect(onViewChange).toHaveBeenCalledWith('calendar');
        expect(el.querySelector('svg.cx-wheel')).toBeNull();
        (el.querySelector('[data-wheel-day="20"]') as HTMLElement).click();
        expect(el.querySelector('.probe')!.textContent).toBe('journal:2026-01-21');
        // up and down go by weeks in the calendar
        el.querySelector('[data-wheel-surface]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(wheel.selected.index).toBe(13);
        expect(el.querySelector('.cx-cal__day.is-selected')!.getAttribute('data-wheel-day')).toBe('13');
        // …and through the rows in the timeline
        wheel.setView('timeline');
        el.querySelector('[data-wheel-surface]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(wheel.focus).toBe('mood');
        expect(el.querySelector('.probe')!.textContent).toBe('mood:2026-01-14');
        wheel.setView('wheel');
        expect(el.querySelector('svg.cx-wheel')).not.toBeNull();
        expect(onViewChange).toHaveBeenCalledTimes(3);
    });

    it('offers only the views asked for', () => {
        expect(setup({ views: false }).el.querySelector('.cx-wheel-views')).toBeNull();
        const { el, wheel } = setup({ views: ['timeline', 'wheel'], view: 'calendar' });
        expect(wheel.view).toBe('timeline'); // calendar isn't offered: the first one
        expect([...el.querySelectorAll<HTMLElement>('[data-wheel-view]')].map((b) => b.dataset.wheelView)).toEqual(['timeline', 'wheel']);
    });

    it('has German words for the switch', () => {
        expect(WHEEL_LABELS_DE.views).toBe('Ansicht');
        expect([WHEEL_LABELS_DE.viewWheel, WHEEL_LABELS_DE.viewCalendar, WHEEL_LABELS_DE.viewTimeline]).toEqual(['Rad', 'Kalender', 'Zeitleiste']);
    });
});
