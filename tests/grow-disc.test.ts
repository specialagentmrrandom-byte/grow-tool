// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GrowDisc } from '../src/components/GrowDisc';
import type { Grow } from '../src/types';

function grow(): Grow {
    return {
        id: 'g1', name: 'Test', strain: 'Test Kush', plantCount: 1, plants: [], type: 'photo',
        dates: { germStart: '2026-01-01', sprout: '2026-01-05', vegStart: '2026-01-12', flowerStart: '2026-02-01', flushStart: '2026-02-20', harvest: '2026-03-01' },
        light: { ppfd: 600, vegHours: 18, flowerHours: 12 },
        entries: [
            { id: 'e1', date: '2026-01-10', day: 5, phase: 'seedling', type: 'watering', title: 'Water', createdAt: '2026-01-10', updatedAt: '2026-01-10' },
            { id: 'e2', date: '2026-01-14', day: 9, phase: 'veg', type: 'milestone', title: 'Topped', createdAt: '2026-01-14', updatedAt: '2026-01-14' },
        ],
        createdAt: '2026-01-01', updatedAt: '2026-01-01',
    };
}

function mount(opts: ConstructorParameters<typeof GrowDisc>[1] = {}) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const disc = new GrowDisc(el, opts);
    disc.render(grow());
    return { el, disc };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('grow disc views', () => {
    it('offers wheel, calendar and timeline and starts on the wheel', () => {
        const { el, disc } = mount();
        const chips = [...el.querySelectorAll<HTMLElement>('[data-wheel-view]')].map((b) => b.dataset.wheelView);
        expect(chips).toEqual(['wheel', 'calendar', 'timeline']);
        expect(disc.view).toBe('wheel');
        expect(el.querySelector('[data-wheel-view="wheel"]')!.getAttribute('aria-pressed')).toBe('true');
        disc.destroy();
    });

    it('starts in the stored view and ignores unknown ones', () => {
        expect(mount({ view: 'timeline' }).disc.view).toBe('timeline');
        expect(mount({ view: 'banana' }).disc.view).toBe('wheel');
    });

    it('switches views from the chips and reports the choice', () => {
        const onViewChange = vi.fn();
        const { el, disc } = mount({ onViewChange });
        el.querySelector<HTMLElement>('[data-wheel-view="calendar"]')!.click();
        expect(disc.view).toBe('calendar');
        expect(onViewChange).toHaveBeenLastCalledWith('calendar');
        expect(el.querySelector('.is-calendar')).not.toBeNull();
        disc.setView('timeline');
        expect(el.querySelector('.is-timeline')).not.toBeNull();
        expect(onViewChange).toHaveBeenLastCalledWith('timeline');
    });

    it('keeps the view when the grow is re-rendered', () => {
        const { disc } = mount({ view: 'calendar' });
        disc.render(grow());
        expect(disc.view).toBe('calendar');
    });

    it('hides the switch with views: false', () => {
        const { el } = mount({ views: false });
        expect(el.querySelector('[data-wheel-view]')).toBeNull();
    });

    it('has no 3D flight (the slim wheel is 2D only)', () => {
        expect(mount().el.querySelector('[data-wheel-fly]')).toBeNull();
    });
});
