/**
 * Landing page: loads the Codex design system and puts two live pieces of the
 * app on the page — the grow disc with a demo grow, and a row of grow seals.
 * The demo grow is built relative to today, so the needle is always "now".
 */
import '@rafime/codex/fonts.css';
import '@rafime/codex/codex.css';
import '@rafime/codex/variants/grow.css';
import '@rafime/codex/palettes/grow.css';
import './wheel/wheel.css';
import type { Grow, Entry, EntryType } from './types';
import { getPhase, getDaysSinceSprout } from './dli';
import { GrowDisc } from './components/GrowDisc';
import { growSeal } from './seal';
import { installInk } from '@rafime/codex';

const DAY = 24 * 60 * 60 * 1000;

function iso(daysFromToday: number): string {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return new Date(d.getTime() + daysFromToday * DAY).toISOString().slice(0, 10);
}

/** A photoperiod grow on day 48 of 100: mid-flower, with a believable diary. */
export function demoGrow(id = 'demo-northern-lights'): Grow {
    const start = -52; // germination, relative to today
    const grow: Grow = {
        id,
        name: 'Tent A · 4 plants',
        strain: 'Northern Lights',
        plantCount: 4,
        plants: [],
        type: 'photo',
        dates: {
            germStart: iso(start),
            sprout: iso(start + 4),
            vegStart: iso(start + 11),
            flowerStart: iso(start + 39),
            flushStart: iso(start + 92),
            harvest: iso(start + 102),
        },
        light: { ppfd: 750, vegHours: 18, flowerHours: 12 },
        entries: [],
        createdAt: iso(start),
        updatedAt: iso(0),
    };

    const add = (offset: number, type: EntryType, title: string, extra: Partial<Entry> = {}) => {
        if (start + offset > 6) return; // the diary ends a few days ahead (reminders only)
        const date = iso(start + offset);
        const at = new Date(`${date}T12:00:00Z`);
        grow.entries.push({
            id: `${id}-${offset}-${type}`,
            date,
            day: getDaysSinceSprout(grow, at),
            phase: getPhase(grow, at),
            type,
            title,
            createdAt: date,
            updatedAt: date,
            ...extra,
        });
    };

    add(0, 'note', 'Seeds in paper towel');
    add(4, 'milestone', 'Sprouted', { content: 'All four up, cotyledons open.' });
    add(9, 'note', 'First true leaves', { photoIds: ['demo'] });
    for (let d = 8; d < 52; d += 3) add(d, 'watering', 'Watered', { content: '1.2 L each, runoff pH 6.4' });
    for (let d = 14; d < 52; d += 6) add(d, 'feeding', 'Fed', { content: d < 39 ? 'Bio-Grow 2 ml/L' : 'Bio-Bloom 2 ml/L, Top-Max 1 ml/L' });
    add(20, 'milestone', 'Transplant', { content: 'Into 11 L fabric pots.' });
    add(27, 'milestone', 'Topped');
    add(30, 'note', 'LST started', { photoIds: ['demo'] });
    add(34, 'milestone', 'Defoliation');
    add(39, 'milestone', 'Flip to 12/12');
    add(44, 'issue', 'Fungus gnats', { content: 'Yellow sticky traps set, top layer dried out.' });
    add(47, 'milestone', 'First Pistils', { photoIds: ['demo'] });
    add(52, 'note', 'Stretch is on', { content: 'About 30 % taller than at flip.', photoIds: ['demo'] });
    add(55, 'reminder', 'Check trichomes on the top cola');
    add(58, 'reminder', 'Raise the lamp one notch');
    grow.entries.sort((a, b) => b.date.localeCompare(a.date));
    return grow;
}

function mountDisc(): void {
    const el = document.getElementById('landing-disc');
    if (!el) return;
    const disc = new GrowDisc(el, {
        wide: false,
        // in the demo, "add entry" leads into the real app
        onDayClick: () => { window.location.href = 'app.html'; },
    });
    disc.render(demoGrow());
}

function mountSeals(): void {
    const row = document.getElementById('landing-seals');
    if (!row) return;
    const names = ['Northern Lights', 'Blue Dream', 'Amnesia Haze', 'White Widow', 'Durban Poison', 'Gorilla Glue'];
    row.innerHTML = names.map((name, i) => {
        const g = demoGrow(`seal-${name}`);
        g.dates.harvest = iso(-52 + 102 - i * 14);
        return `<figure class="seal-figure">${growSeal(g, 64)}<figcaption>${name}</figcaption></figure>`;
    }).join('');
}

// borders drawn in trembling ink, like the app
installInk(document);
mountDisc();
mountSeals();
