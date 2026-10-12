// @vitest-environment jsdom
// The grow tool's wheel (src/wheel), ported from @rafime/wheel's tests without the 3D flight.
import { describe, it, expect, vi } from 'vitest';
import { wheelLayout, wheelHit, slotAngle, slotEdge, polar, angleToIndex } from '../src/wheel/geometry';
import { renderWheel, wheelHand, wheelHatch, labelRadius } from '../src/wheel/render';
import { buildDays, indexOfKey, runs, clipRange, addDays, dateKey, type WheelDay } from '../src/wheel/model';
import { JournalWheel } from '../src/wheel/JournalWheel';
import { spanRange, addMonths, rangeError, parseSpan, spanName, spanDates, sameSpan, spanPresetKey, spanFromPresetKey, DEFAULT_SPAN, SPAN_LABELS_DE } from '../src/wheel/span';
import { WHEEL_LABELS_DE } from '../src/wheel/JournalWheel';

const ids = ['journal', 'water', 'light'];

describe('geometry', () => {
    it('stacks lanes inward between rim and hub', () => {
        const L = wheelLayout(90, ids);
        expect(L.lanes[0].outer).toBeLessThan(L.rim.inner);
        for (let i = 1; i < 3; i++) expect(L.lanes[i].outer).toBeLessThan(L.lanes[i - 1].inner);
        expect(L.lanes[2].inner).toBeGreaterThan(L.hub);
        expect(() => wheelLayout(0, ids)).toThrow(RangeError);
    });

    it('fills the circle minus the gap', () => {
        const L = wheelLayout(10, ids, { gapDeg: 40 });
        expect(slotEdge(L, 0)).toBe(20);
        expect(slotEdge(L, 10)).toBe(340);
        expect(slotAngle(L, 0)).toBe(36);
    });

    it('finds lane and day under a point, by angle only when dragging', () => {
        const L = wheelLayout(83, ids);
        for (const [i, lane] of [[0, 'journal'], [40, 'water'], [82, 'light']] as const) {
            const g = L.lanes.find((l) => l.id === lane)!;
            const p = polar(L.c, L.c, g.mid, slotAngle(L, i));
            expect(wheelHit(L, p.x, p.y)).toEqual({ lane, index: i });
        }
        expect(wheelHit(L, L.c, L.c).lane).toBe('hub');
        const far = polar(L.c, L.c, 1000, slotAngle(L, 30));
        expect(wheelHit(L, far.x, far.y)).toEqual({ lane: null, index: null });
        expect(angleToIndex(L, far.x, far.y)).toBe(30);
        const gap = polar(L.c, L.c, 100, 0);
        expect(angleToIndex(L, gap.x, gap.y)).toBeNull();
    });
});

describe('render', () => {
    it('draws rim, lanes, marks, needle, hand and hub', () => {
        const svg = renderWheel({
            count: 30, today: 12, selected: 20, selectedLane: 'water',
            rim: [{ from: 0, to: 9, label: 'Low' }, { from: 14, to: 29, label: 'Stable & <b>', current: true, color: 'var(--cx-moss)' }],
            lanes: [
                { id: 'journal', label: 'Journal', marks: [{ i: 5, kind: 'square' }, { i: 99, kind: 'dot' }] },
                { id: 'water', label: 'Water', marks: [{ i: 4, kind: 'dot', color: 'var(--cx-slate)', title: 'Watered' }, { i: 2, to: 8, kind: 'span', value: 0.4 }] },
                { id: 'light', label: 'Light', marks: [{ i: 3, kind: 'bar', value: 0.75 }] },
            ],
            hub: { value: 13, caption: 'Stable' },
        });
        expect(svg.startsWith('<svg class="cx-diagram cx-wheel cx-wheel--inked"')).toBe(true);
        expect(svg.match(/class="cx-wheel__segment/g)).toHaveLength(2);
        expect(svg).toContain('cx-wheel__lane is-selected" data-lane="water"');
        expect(svg).toContain('cx-wheel__mark--span');
        expect(svg.match(/cx-wheel__mark--dot/g)).toHaveLength(1);
        expect(svg).toContain('data-role="selection"><line ');
        expect(svg).toContain('data-role="hub-value">13<');
        expect(svg).toContain('Stable &amp; &lt;b&gt;');
        // a gap on the rim between day 9 and 14 is marked on both sides
        expect(svg.match(/class="cx-wheel__boundary"/g)!.length).toBeGreaterThanOrEqual(2);
    });

    it('draws no hand for today and no filter when not inked', () => {
        const L = wheelLayout(5, ids);
        expect(wheelHand(L, 2, 2)).toBe('');
        expect(renderWheel({ count: 5, today: 2, selected: 2, lanes: [], inked: false })).not.toContain('filter="url');
    });
});

describe('day model', () => {
    it('builds one slot per day with app data', () => {
        const days = buildDays<WheelDay & { n: number }>('2026-01-30', '2026-02-02', (d) => ({ n: d.index * 2 }));
        expect(days.map((d) => d.key)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
        expect(days[3].n).toBe(6);
        expect(indexOfKey(days, '2026-02-01')).toBe(2);
        expect(indexOfKey(days, '2026-03-01')).toBeNull();
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(dateKey(new Date('2026-05-05T23:59:00Z'))).toBe('2026-05-05');
    });

    it('turns values into runs and clips ranges', () => {
        const days = buildDays('2026-01-01', '2026-01-10');
        const phase = (d: { index: number }) => (d.index < 3 ? 'a' : d.index < 5 ? null : 'b');
        expect(runs(days, phase)).toEqual([{ value: 'a', from: 0, to: 2 }, { value: 'b', from: 5, to: 9 }]);
        expect(clipRange(days, '2025-12-20', '2026-01-03')).toEqual({ from: 0, to: 2 });
        expect(clipRange(days, '2026-01-08', null)).toEqual({ from: 7, to: 9 });
        expect(clipRange(days, '2026-02-01', null)).toBeNull();
    });
});

describe('JournalWheel', () => {
    const setup = () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const days = buildDays<WheelDay & { note: boolean }>('2026-01-01', '2026-01-31', (d) => ({ note: d.index % 5 === 0 }));
        const onChange = vi.fn();
        const wheel = new JournalWheel(el, {
            days,
            today: 10,
            segments: [{ from: 0, to: 15, label: 'Stable' }],
            lanes: [
                { id: 'journal', label: 'Journal', marks: (d) => (d.note ? { kind: 'dot' } : null) },
                { id: 'mood', label: 'Mood', marks: () => ({ kind: 'bar', value: 0.5 }) },
            ],
            band: ({ day, focus }) => `<p class="probe">${focus}:${day.key}</p>`,
            hub: (d) => ({ value: d.index + 1 }),
            onChange,
        });
        return { el, wheel, onChange };
    };

    it('renders wheel, chips and the app band for today', () => {
        const { el, onChange } = setup();
        expect(el.querySelectorAll('.cx-wheel__mark--dot')).toHaveLength(7);
        expect(el.querySelectorAll('[data-wheel-focus]')).toHaveLength(3);
        expect(el.querySelector('.probe')!.textContent).toBe('journal:2026-01-11');
        expect(onChange).toHaveBeenCalled();
        expect(document.documentElement.classList.contains('cx-inked')).toBe(true);
    });

    it('steps days and switches lanes from its own controls', () => {
        const { el, wheel } = setup();
        (el.querySelector('[data-wheel-step="next"]') as HTMLElement).click();
        expect(wheel.selected.key).toBe('2026-01-12');
        (el.querySelector('[data-wheel-focus="mood"]') as HTMLElement).click();
        expect(el.querySelector('.probe')!.textContent).toBe('mood:2026-01-12');
        (el.querySelector('[data-wheel-step="today"]') as HTMLElement).click();
        expect(wheel.selected.index).toBe(10);
    });

    it('keeps the selected day across data updates', () => {
        const { wheel } = setup();
        wheel.selectKey('2026-01-20');
        wheel.update({ days: buildDays('2026-01-05', '2026-02-05'), today: 6 });
        expect(wheel.selected.key).toBe('2026-01-20');
    });
});

describe('span', () => {
    const now = new Date('2026-09-24T10:00:00Z');

    it('rolls back whole calendar months to today', () => {
        expect(spanRange({ kind: 'last', months: 3 }, now)).toEqual({ from: '2026-06-25', to: '2026-09-24' });
        expect(spanRange({ kind: 'last', months: 12 }, now)).toEqual({ from: '2025-09-25', to: '2026-09-24' });
        expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    });

    it('keeps fixed ranges and rejects bad ones', () => {
        expect(spanRange({ kind: 'range', from: '2026-03-01', to: '2026-05-31' }, now)).toEqual({ from: '2026-03-01', to: '2026-05-31' });
        expect(rangeError('2026-05-01', '2026-04-01')).toMatch(/before/);
        expect(rangeError('2025-01-01', '2026-06-01')).toMatch(/one year/);
        expect(rangeError('', '2026-06-01')).toMatch(/both/);
        expect(rangeError('2026-01-01', '2026-12-31')).toBeNull();
    });

    it('parses stored spans with a fallback', () => {
        expect(parseSpan(undefined)).toEqual(DEFAULT_SPAN);
        expect(parseSpan({ kind: 'last', months: 6 })).toEqual({ kind: 'last', months: 6 });
        expect(parseSpan({ kind: 'range', from: '2026-05-01', to: '2026-04-01' })).toEqual(DEFAULT_SPAN);
        expect(parseSpan('nonsense', { kind: 'last', months: 1 })).toEqual({ kind: 'last', months: 1 });
    });

    it('names spans', () => {
        expect(spanName({ kind: 'last', months: 3 })).toBe('Last 3 months');
        expect(spanName({ kind: 'last', months: 12 })).toBe('Last year');
        expect(spanDates({ kind: 'last', months: 3 }, now, 'en-US')).toBe('Jun 25 – Sep 24');
        expect(spanDates({ kind: 'range', from: '2025-12-01', to: '2026-02-01' }, now, 'en-US')).toBe('Dec 1, 2025 – Feb 1, 2026');
    });

    it('looks ahead from today with next-month spans', () => {
        expect(spanRange({ kind: 'next', months: 3 }, now)).toEqual({ from: '2026-09-24', to: '2026-12-23' });
        expect(spanRange({ kind: 'next', months: 12 }, now)).toEqual({ from: '2026-09-24', to: '2027-09-23' });
        expect(spanName({ kind: 'next', months: 6 })).toBe('Next 6 months');
        expect(spanName({ kind: 'next', months: 12 })).toBe('Next year');
        expect(parseSpan({ kind: 'next', months: 6 })).toEqual({ kind: 'next', months: 6 });
        expect(sameSpan({ kind: 'next', months: 6 }, { kind: 'last', months: 6 })).toBe(false);
        expect(spanPresetKey({ kind: 'next', months: 6 })).toBe('next:6');
        expect(spanFromPresetKey('next:6')).toEqual({ kind: 'next', months: 6 });
        expect(spanFromPresetKey('3')).toEqual({ kind: 'last', months: 3 });
        expect(spanFromPresetKey('next:40')).toBeNull();
    });

    it('offers look-ahead presets and future dates when asked', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const onSpanChange = vi.fn();
        const days = buildDays('2026-09-24', '2027-03-23');
        new JournalWheel(el, {
            days, today: 0, now,
            lanes: [{ id: 'goals', label: 'Goals', marks: () => null }],
            band: () => '',
            span: { kind: 'next', months: 6 },
            spanPresets: [{ kind: 'last', months: 3 }, { kind: 'next', months: 3 }, { kind: 'next', months: 6 }],
            onSpanChange,
        });
        const toggle = el.querySelector('[data-wheel-span-toggle]') as HTMLElement;
        expect(toggle.textContent).toContain('Next 6 months');
        toggle.click();
        expect(el.querySelector('[data-wheel-span-preset="next:6"]')!.getAttribute('aria-pressed')).toBe('true');
        expect((el.querySelector('input[name="from"]') as HTMLInputElement).hasAttribute('max')).toBe(false);
        (el.querySelector('[data-wheel-span-preset="next:3"]') as HTMLElement).click();
        expect(onSpanChange).toHaveBeenLastCalledWith({ kind: 'next', months: 3 });
    });

    it('speaks German when asked', () => {
        expect(spanName({ kind: 'next', months: 6 }, SPAN_LABELS_DE)).toBe('Nächste 6 Monate');
        expect(spanName({ kind: 'last', months: 12 }, SPAN_LABELS_DE)).toBe('Letztes Jahr');
        expect(rangeError('2026-05-01', '2026-04-01', SPAN_LABELS_DE)).toMatch(/vor dem Anfang/);
        const el = document.createElement('div');
        const days = buildDays('2026-09-24', '2026-10-23');
        new JournalWheel(el, {
            days, today: 0, now, locale: 'de-DE', labels: WHEEL_LABELS_DE,
            lanes: [{ id: 'goals', label: 'Ziele', icon: '<svg class="i"></svg>', marks: () => null }],
            band: () => '', span: { kind: 'next', months: 1 }, onSpanChange: () => {},
        });
        expect(el.querySelector('[data-wheel-step="today"]')!.textContent).toBe('Heute');
        expect(el.querySelector('[data-wheel-span-toggle]')!.textContent).toContain('Nächster Monat');
        expect(el.querySelector('[data-wheel-focus="goals"]')!.innerHTML).toBe('<svg class="i"></svg>Ziele');
    });

    it('lets people pick a preset or their own dates under the wheel', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const onSpanChange = vi.fn();
        const days = buildDays('2026-06-25', '2026-09-24');
        const wheel = new JournalWheel(el, {
            days, today: days.length - 1, now,
            lanes: [{ id: 'mood', label: 'Mood', marks: () => null }],
            band: () => '',
            span: { kind: 'last', months: 3 },
            onSpanChange,
        });
        const toggle = () => el.querySelector('[data-wheel-span-toggle]') as HTMLElement;
        expect(toggle().textContent).toContain('Last 3 months');
        expect(el.querySelector('.cx-wheel-span__panel')).toBeNull();
        toggle().click();
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
        expect(el.querySelector('[data-wheel-span-preset="3"]')!.getAttribute('aria-pressed')).toBe('true');
        (el.querySelector('[data-wheel-span-preset="6"]') as HTMLElement).click();
        expect(onSpanChange).toHaveBeenLastCalledWith({ kind: 'last', months: 6 });
        expect(el.querySelector('.cx-wheel-span__panel')).toBeNull();

        toggle().click();
        const form = el.querySelector('form') as HTMLFormElement;
        (form.elements.namedItem('from') as HTMLInputElement).value = '2026-05-01';
        (form.elements.namedItem('to') as HTMLInputElement).value = '2026-04-01';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(el.querySelector('.cx-wheel-span__error')!.textContent).toMatch(/before/);
        (form.elements.namedItem('to') as HTMLInputElement).value = '2026-06-30';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(onSpanChange).toHaveBeenLastCalledWith({ kind: 'range', from: '2026-05-01', to: '2026-06-30' });

        wheel.update({ span: { kind: 'range', from: '2026-05-01', to: '2026-06-30' }, days: buildDays('2026-05-01', '2026-06-30'), today: null });
        expect(toggle().textContent).toContain('May 1 – Jun 30');
        expect((el.querySelector('[data-wheel-step="today"]') as HTMLButtonElement).disabled).toBe(true);
    });
});

describe('wheel hatching', () => {
    const rim = [
        { from: 0, to: 9, label: 'Before', color: 'var(--cx-slate)' },
        { from: 10, to: 29, label: 'Now', current: true },
    ];
    const hatchGroups = (svg: string) => svg.match(/<g class="cx-wheel__hatch[^"]*"/g) ?? [];

    it('hatches the current period by default, clipped into it', () => {
        const svg = renderWheel({ count: 30, rim });
        expect(hatchGroups(svg)).toEqual(['<g class="cx-wheel__hatch is-current"']);
        expect(svg).toMatch(/clip-path="url\(#cx-wheel-rh1\)"><clipPath id="cx-wheel-rh1">/);
        expect(svg).not.toContain('<pattern');
    });

    it('draws every Codex hatching style', () => {
        for (const hatch of ['diagonal', 'cross', 'stipple', 'scribble', 'engrave', 'contour', 'hachure', 'waves', 'mixed'] as const) {
            expect(renderWheel({ count: 30, rim, hatch: { hatch } }), hatch).toMatch(/cx-wheel__hatch is-current"[^>]*><clipPath[^]*class="ph-[sf]"/);
        }
    });

    it("rim: 'all' hatches every period; hatched spans get their own clip", () => {
        const svg = renderWheel({
            count: 30, rim, hatch: { hatch: 'waves', rim: 'all' },
            lanes: [{ id: 'a', label: 'A', marks: [{ i: 2, to: 12, kind: 'span', hatched: true, color: 'var(--cx-moss)' }] }],
        });
        expect(hatchGroups(svg)).toHaveLength(3);
        expect(svg).toContain('--wheel-hatch:var(--cx-moss)');
        expect(svg).toContain('cx-wheel__mark--span is-hatched');
    });

    it('the same settings draw the same wheel; clamps odd numbers', () => {
        expect(renderWheel({ count: 30, rim, hatch: { hatch: 'cross', seed: 5 } })).toBe(renderWheel({ count: 30, rim, hatch: { hatch: 'cross', seed: 5 } }));
        expect(wheelHatch({ density: 99, angle: -400, rim: 'x' as never })).toMatchObject({ density: 2.2, angle: -90, rim: 'current' });
    });
});

describe('wheel lines drawn by a pen hand', () => {
    const rim = [{ from: 0, to: 9, label: 'Before' }, { from: 10, to: 29, label: 'Now', current: true, color: 'var(--cx-moss)' }];
    it("keeps the ink filter by default ('filter')", () => {
        const svg = renderWheel({ count: 30, rim, lanes: [{ id: 'a', label: 'A' }] });
        expect(svg).toContain('filter="url(#cx-wheel-ink)"');
        expect(svg).not.toContain('cx-wheel__pen');
    });
    it('draws rim, guides, boundaries, hub and needle in every trembling style, without the filter', () => {
        for (const tremble of ['steady', 'quill', 'sketch', 'tremor', 'brush', 'dry', 'mixed'] as const) {
            const svg = renderWheel({ count: 30, today: 12, rim, lanes: [{ id: 'a', label: 'A' }], hatch: { tremble } });
            expect(svg, tremble).toContain('cx-wheel--pen');
            expect(svg, tremble).not.toContain('filter="url(#cx-wheel-ink)"');
            for (const cls of ['rim-edge', 'guide', 'boundary', 'edge', 'hub-line', 'needle-line', 'segment-line']) expect(svg, `${tremble} ${cls}`).toContain(`class="cx-wheel__${cls} cx-wheel__pen"`);
            expect(svg, tremble).not.toContain('NaN');
        }
    });
    it('a line keeps its drawing when other lines come or go (new period, more lanes)', () => {
        const rimEdge = (svg: string) => svg.match(/<g class="cx-wheel__rim-edge cx-wheel__pen">.*?<\/g>/)![0];
        const one = renderWheel({ count: 30, rim, lanes: [{ id: 'a', label: 'A' }], hatch: { tremble: 'sketch' } });
        const more = renderWheel({ count: 30, rim: [{ from: 0, to: 4, label: 'X' }, ...rim.map((r) => ({ ...r, from: Math.max(5, r.from) }))], lanes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], hatch: { tremble: 'sketch' } });
        expect(rimEdge(more)).toBe(rimEdge(one));
    });
    it('unknown hatching or trembling styles fall back to the defaults', () => {
        expect(wheelHatch({ hatch: 'nope' as never, tremble: 'wobbly' as never })).toMatchObject({ hatch: 'diagonal', tremble: 'filter' });
        expect(renderWheel({ count: 30, rim, hatch: { hatch: 'nope' as never } })).toContain('<g class="ph-');
    });
    it('inked: false stays plain', () => {
        expect(renderWheel({ count: 30, rim, inked: false, hatch: { tremble: 'sketch' } })).not.toContain('cx-wheel__pen');
    });
});

describe('rim labels', () => {
    it('sit centred in the ring on both halves (bottom ones flipped to read upright)', () => {
        expect(labelRadius(180, -40, 40, 3.3)).toBeCloseTo(176.7);   // top: baseline inside, letters grow out
        expect(labelRadius(180, 140, 220, 3.3)).toBeCloseTo(183.3);  // bottom: baseline outside, letters grow in
        expect(labelRadius(180, 60, 120, 3.3)).toBeCloseTo(176.7);   // centred on 90°: not flipped
        expect(labelRadius(180, 0, 360, 3.3)).toBeCloseTo(176.7);
    });
});
