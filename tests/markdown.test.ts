import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; },
    };
})();

vi.stubGlobal('localStorage', localStorageMock);

import { store } from '../src/store';

describe('Markdown Export', () => {
    beforeEach(() => {
        localStorage.clear();
        store['data'] = store['load']();
    });

    it('exports grow as Markdown with header and stats', () => {
        const grow = store.addGrow({
            name: 'Northern Lights',
            strain: 'Northern Lights Auto',
            plantCount: 2,
            plants: [],
            type: 'auto',
            dates: {
                germStart: '2025-01-01',
                sprout: '2025-01-05',
                vegStart: '2025-01-12',
                flowerStart: '2025-02-01',
                flushStart: '2025-03-20',
                harvest: '2025-03-30',
            },
            light: { ppfd: 600, vegHours: 20, flowerHours: 20 },
        });

        const markdown = store.exportMarkdown(grow.id);

        expect(markdown).toBeDefined();
        // New header format with emoji
        expect(markdown).toContain('# 🌱 Northern Lights Auto - Grow Report');
        // Quick badge with type and plant count
        expect(markdown).toContain('🌱 Autoflower');
        expect(markdown).toContain('2 plants');
        // Stats section
        expect(markdown).toContain('## 📊 By The Numbers');
        expect(markdown).toContain('| ⏱️ Days | 🏁 Milestones | ⚠️ Issues | 📷 Photos | 💧 Waterings | 🌿 Feedings |');
    });

    it('includes timeline entries grouped by week with phase labels', () => {
        const grow = store.addGrow({
            name: 'Test',
            strain: 'Test Strain',
            plantCount: 1,
            plants: [],
            type: 'photo',
            dates: {
                germStart: '2025-01-01',
                sprout: '2025-01-05',
                vegStart: '2025-01-12',
                flowerStart: '2025-02-15',
            },
            light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
        });

        // Add entries in different weeks
        store.addEntry(grow.id, {
            date: '2025-01-08',
            type: 'milestone',
            title: 'First true leaves',
        });
        store.addEntry(grow.id, {
            date: '2025-01-15',
            type: 'milestone',
            title: 'Topped',
        });

        const markdown = store.exportMarkdown(grow.id);

        expect(markdown).toContain('## 📖 Timeline');
        expect(markdown).toContain('### Week 1');
        expect(markdown).toContain('First true leaves');
        expect(markdown).toContain('### Week 2');
        expect(markdown).toContain('Topped');
    });

    it('includes entry type icons and badges', () => {
        const grow = store.addGrow({
            name: 'Test',
            strain: 'Test',
            plantCount: 1,
            plants: [],
            type: 'auto',
            dates: { germStart: '2025-01-01', sprout: '2025-01-05' },
            light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
        });

        store.addEntry(grow.id, {
            date: '2025-01-10',
            type: 'milestone',
            title: 'Milestone Entry',
        });
        store.addEntry(grow.id, {
            date: '2025-01-11',
            type: 'watering',
            title: 'Watered',
        });
        store.addEntry(grow.id, {
            date: '2025-01-12',
            type: 'issue',
            title: 'Problem',
        });

        const markdown = store.exportMarkdown(grow.id);

        expect(markdown).toContain('🏁'); // milestone
        expect(markdown).toContain('💧'); // watering
        expect(markdown).toContain('⚠️'); // issue
        // Milestone badge
        expect(markdown).toContain('**MILESTONE**');
    });

    it('generates image placeholders', () => {
        const grow = store.addGrow({
            name: 'Photo Test',
            strain: 'Test',
            plantCount: 1,
            plants: [],
            type: 'auto',
            dates: { germStart: '2025-01-01', sprout: '2025-01-05' },
            light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
        });

        // Add entries with photos (sorted chronologically in export)
        store.addEntry(grow.id, {
            date: '2025-01-10',
            type: 'note',
            title: 'Day 5 photo',
            photo: 'data:image/jpeg;base64,fake',
        });
        store.addEntry(grow.id, {
            date: '2025-01-15',
            type: 'note',
            title: 'Day 10 photo',
            photo: 'data:image/jpeg;base64,fake2',
        });

        const markdown = store.exportMarkdown(grow.id);

        // Entries are sorted chronologically now, so Day 5 comes first
        expect(markdown).toContain('![Day 5](UPLOAD_IMAGE_1)');
        expect(markdown).toContain('![Day 10](UPLOAD_IMAGE_2)');
        expect(markdown).toContain('## 📷 Image Upload Reference');
        expect(markdown).toContain('1. `UPLOAD_IMAGE_1` → Day 5 photo');
        expect(markdown).toContain('2. `UPLOAD_IMAGE_2` → Day 10 photo');
    });

    it('includes light setup information', () => {
        const grow = store.addGrow({
            name: 'DLI Test',
            strain: 'Test',
            plantCount: 1,
            plants: [],
            type: 'photo',
            dates: { germStart: '2025-01-01' },
            light: { ppfd: 600, vegHours: 18, flowerHours: 12 },
        });

        const markdown = store.exportMarkdown(grow.id);

        // New format uses Setup Details section
        expect(markdown).toContain('## 🔧 Setup Details');
        expect(markdown).toContain('| **PPFD** | 600 µmol/m²/s |');
        expect(markdown).toContain('| **Light (Veg)** | 18h |');
        expect(markdown).toContain('| **Light (Flower)** | 12h |');
    });

    it('includes journey overview with phase durations', () => {
        const grow = store.addGrow({
            name: 'Duration Test',
            strain: 'Test',
            plantCount: 1,
            plants: [],
            type: 'photo',
            dates: {
                germStart: '2025-01-01',
                vegStart: '2025-01-10',
                flowerStart: '2025-02-10', // 31 days veg
                harvest: '2025-04-10', // 59 days flower
            },
            light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
        });

        const markdown = store.exportMarkdown(grow.id);

        // New format has Journey Overview with visual bars
        expect(markdown).toContain('### 🗺️ Journey Overview');
        expect(markdown).toContain('| Phase | Duration |');
        expect(markdown).toContain('| Veg |');
        expect(markdown).toContain('| Flower |');
    });

    it('returns undefined for non-existent grow', () => {
        expect(store.exportMarkdown('non-existent')).toBeUndefined();
    });

    it('handles grow with no entries', () => {
        const grow = store.addGrow({
            name: 'Empty',
            strain: 'Test',
            plantCount: 1,
            plants: [],
            type: 'auto',
            dates: { germStart: '2025-01-01' },
            light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
        });

        const markdown = store.exportMarkdown(grow.id);

        expect(markdown).toBeDefined();
        expect(markdown).toContain('# 🌱 Test - Grow Report');
        expect(markdown).toContain('## 📖 Timeline');
        // Should not have image reference section
        expect(markdown).not.toContain('## 📷 Image Upload Reference');
    });

    it('includes content in blockquotes', () => {
        const grow = store.addGrow({
            name: 'Escape Test',
            strain: 'Test',
            plantCount: 1,
            plants: [],
            type: 'auto',
            dates: { germStart: '2025-01-01', sprout: '2025-01-05' },
            light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
        });

        store.addEntry(grow.id, {
            date: '2025-01-10',
            type: 'note',
            title: 'Entry with content',
            content: 'Added 2ml/L of CalMag',
        });

        const markdown = store.exportMarkdown(grow.id);

        expect(markdown).toContain('Entry with content');
        expect(markdown).toContain('> Added 2ml/L of CalMag');
    });

    it('includes lessons learned section for issues', () => {
        const grow = store.addGrow({
            name: 'Issues Test',
            strain: 'Test',
            plantCount: 1,
            plants: [],
            type: 'auto',
            dates: { germStart: '2025-01-01', sprout: '2025-01-05' },
            light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
        });

        store.addEntry(grow.id, {
            date: '2025-01-10',
            type: 'issue',
            title: 'Nitrogen deficiency',
            content: 'Lower leaves turning yellow',
        });

        const markdown = store.exportMarkdown(grow.id);

        expect(markdown).toContain('## 📚 Lessons Learned');
        expect(markdown).toContain('### Day 5: Nitrogen deficiency');
        expect(markdown).toContain('Lower leaves turning yellow');
    });

    it('includes milestones recap section', () => {
        const grow = store.addGrow({
            name: 'Milestones Test',
            strain: 'Test',
            plantCount: 1,
            plants: [],
            type: 'auto',
            dates: { germStart: '2025-01-01', sprout: '2025-01-05' },
            light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
        });

        store.addEntry(grow.id, {
            date: '2025-01-10',
            type: 'milestone',
            title: 'First true leaves',
        });

        const markdown = store.exportMarkdown(grow.id);

        expect(markdown).toContain('## 🏁 Milestones Achieved');
        expect(markdown).toContain('**Day 5**: First true leaves');
    });

    it('includes plants section with The Cast header', () => {
        const grow = store.addGrow({
            name: 'Plants Test',
            strain: 'Northern Lights',
            plantCount: 2,
            plants: [
                { id: 'p1', potNumber: 1, name: 'Luna', strain: 'Northern Lights', potLiters: 11, seedType: 'feminized' },
                { id: 'p2', potNumber: 2, name: 'Star', strain: 'Northern Lights', potLiters: 11, seedType: 'feminized' },
            ],
            type: 'auto',
            dates: { germStart: '2025-01-01' },
            light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
        });

        const markdown = store.exportMarkdown(grow.id);

        expect(markdown).toContain('## 🌿 The Cast');
        expect(markdown).toContain('| # | Name | Strain | Seed Type | Pot | Notes |');
        expect(markdown).toContain('**Luna**');
        expect(markdown).toContain('**Star**');
        expect(markdown).toContain('11L');
    });

    it('includes footer with generation info', () => {
        const grow = store.addGrow({
            name: 'Footer Test',
            strain: 'Test',
            plantCount: 1,
            plants: [],
            type: 'auto',
            dates: { germStart: '2025-01-01' },
            light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
        });

        const markdown = store.exportMarkdown(grow.id);

        expect(markdown).toContain('_Generated by [OG Grow Journal Assistant]');
        expect(markdown).toContain('github.com/specialagentmrrandom-byte/grow-tool');
    });
});
