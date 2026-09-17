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

// Import after mocking localStorage
import { store } from '../src/store';
import type { Grow, GrowType } from '../src/types';

describe('Store', () => {
  beforeEach(() => {
    localStorage.clear();
    store['data'] = store['load'](); // Reset store
  });

  describe('Grows CRUD', () => {
    it('returns empty array initially', () => {
      expect(store.getGrows()).toEqual([]);
    });

    it('adds a new grow', () => {
      const grow = store.addGrow({
        name: 'Northern Lights',
        strain: 'Northern Lights Auto',
        plantCount: 2,
        plants: [],
        type: 'auto' as GrowType,
        dates: { germStart: '2025-01-01' },
        light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
      });

      expect(grow.id).toBeDefined();
      expect(grow.strain).toBe('Northern Lights Auto');
      expect(grow.entries).toEqual([]);
      expect(store.getGrows()).toHaveLength(1);
    });

    it('retrieves grow by id', () => {
      const added = store.addGrow({
        name: 'Test',
        strain: 'Test Strain',
        plantCount: 1,
        plants: [],
        type: 'photo',
        dates: { germStart: '2025-01-01' },
        light: { ppfd: 600, vegHours: 18, flowerHours: 12 },
      });

      const retrieved = store.getGrow(added.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.strain).toBe('Test Strain');
    });

    it('returns undefined for non-existent grow', () => {
      expect(store.getGrow('non-existent')).toBeUndefined();
    });

    it('updates a grow', () => {
      const grow = store.addGrow({
        name: 'Test',
        strain: 'Original',
        plantCount: 1,
        plants: [],
        type: 'photo',
        dates: { germStart: '2025-01-01' },
        light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
      });

      const updated = store.updateGrow(grow.id, { strain: 'Updated Strain' });

      expect(updated).toBeDefined();
      expect(updated!.strain).toBe('Updated Strain');
      expect(store.getGrow(grow.id)!.strain).toBe('Updated Strain');
    });

    it('deletes a grow', () => {
      const grow = store.addGrow({
        name: 'Test',
        strain: 'To Delete',
        plantCount: 1,
        plants: [],
        type: 'auto',
        dates: { germStart: '2025-01-01' },
        light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
      });

      expect(store.deleteGrow(grow.id)).toBe(true);
      expect(store.getGrow(grow.id)).toBeUndefined();
      expect(store.getGrows()).toHaveLength(0);
    });

    it('returns false when deleting non-existent grow', () => {
      expect(store.deleteGrow('non-existent')).toBe(false);
    });
  });

  describe('Entries CRUD', () => {
    let testGrow: Grow;

    beforeEach(() => {
      testGrow = store.addGrow({
        name: 'Entry Test',
        strain: 'Test Strain',
        plantCount: 2,
        plants: [],
        type: 'photo',
        dates: {
          germStart: '2025-01-01',
          sprout: '2025-01-05',
          vegStart: '2025-01-12',
        },
        light: { ppfd: 600, vegHours: 18, flowerHours: 12 },
      });
    });

    it('adds an entry to a grow', () => {
      const entry = store.addEntry(testGrow.id, {
        date: '2025-01-15',
        type: 'note',
        title: 'First entry',
        content: 'Looking good!',
      });

      expect(entry).toBeDefined();
      expect(entry!.title).toBe('First entry');
      expect(entry!.day).toBe(10); // 10 days since sprout
      expect(entry!.phase).toBe('veg');
    });

    it('adds milestone via addMilestone', () => {
      const entry = store.addMilestone(testGrow.id, 'Topped');

      expect(entry).toBeDefined();
      expect(entry!.type).toBe('milestone');
      expect(entry!.title).toBe('Topped');
    });

    it('updates an entry', () => {
      const entry = store.addEntry(testGrow.id, {
        date: '2025-01-15',
        type: 'note',
        title: 'Original',
      });

      const updated = store.updateEntry(testGrow.id, entry!.id, {
        title: 'Updated Title',
      });

      expect(updated!.title).toBe('Updated Title');
    });

    it('deletes an entry', () => {
      const entry = store.addEntry(testGrow.id, {
        date: '2025-01-15',
        type: 'note',
        title: 'To Delete',
      });

      expect(store.deleteEntry(testGrow.id, entry!.id)).toBe(true);
      expect(store.getGrow(testGrow.id)!.entries).toHaveLength(0);
    });

    it('sorts entries by date descending', () => {
      store.addEntry(testGrow.id, {
        date: '2025-01-15',
        type: 'note',
        title: 'Middle',
      });
      store.addEntry(testGrow.id, {
        date: '2025-01-20',
        type: 'note',
        title: 'Latest',
      });
      store.addEntry(testGrow.id, {
        date: '2025-01-10',
        type: 'note',
        title: 'Earliest',
      });

      const grow = store.getGrow(testGrow.id)!;
      expect(grow.entries[0].title).toBe('Latest');
      expect(grow.entries[1].title).toBe('Middle');
      expect(grow.entries[2].title).toBe('Earliest');
    });
  });

  describe('Strain Library', () => {
    it('automatically adds strain when creating grow', () => {
      store.addGrow({
        name: 'Test',
        strain: 'Blue Dream',
        plantCount: 1,
        plants: [],
        type: 'photo',
        dates: { germStart: '2025-01-01' },
        light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
      });

      expect(store.getStrains()).toContain('Blue Dream');
    });

    it('does not duplicate strains', () => {
      store.addGrow({
        name: 'Test 1',
        strain: 'OG Kush',
        plantCount: 1,
        plants: [],
        type: 'photo',
        dates: { germStart: '2025-01-01' },
        light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
      });
      store.addGrow({
        name: 'Test 2',
        strain: 'OG Kush',
        plantCount: 1,
        plants: [],
        type: 'photo',
        dates: { germStart: '2025-01-01' },
        light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
      });

      const strains = store.getStrains();
      expect(strains.filter(s => s === 'OG Kush')).toHaveLength(1);
    });

    it('manually adds strain', () => {
      store.addStrain('Gorilla Glue');
      expect(store.getStrains()).toContain('Gorilla Glue');
    });
  });

  describe('Export/Import', () => {
    it('exports data as JSON', () => {
      store.addGrow({
        name: 'Export Test',
        strain: 'Test Strain',
        plantCount: 1,
        plants: [],
        type: 'auto',
        dates: { germStart: '2025-01-01' },
        light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
      });

      const json = store.exportJSON();
      const parsed = JSON.parse(json);

      expect(parsed.grows).toHaveLength(1);
      expect(parsed.grows[0].strain).toBe('Test Strain');
    });

    it('imports valid JSON', () => {
      const importData = {
        grows: [{
          id: 'imported-grow',
          name: 'Imported',
          strain: 'Imported Strain',
          plantCount: 3,
          type: 'photo',
          dates: { germStart: '2025-02-01' },
          light: { ppfd: 700, vegHours: 20, flowerHours: 12 },
          entries: [],
          createdAt: '2025-02-01T00:00:00Z',
          updatedAt: '2025-02-01T00:00:00Z',
        }],
        settings: { strains: ['Imported Strain'], defaultLight: { ppfd: 500, vegHours: 18, flowerHours: 12 }, theme: 'dark' },
        version: 1,
      };

      expect(store.importJSON(JSON.stringify(importData))).toBe(true);
      expect(store.getGrows()).toHaveLength(1);
      expect(store.getGrow('imported-grow')?.strain).toBe('Imported Strain');
    });

    it('rejects invalid JSON structure', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(store.importJSON('{ "invalid": true }')).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('rejects malformed JSON', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(store.importJSON('not json at all')).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('roundtrips data correctly', () => {
      const grow = store.addGrow({
        name: 'Roundtrip',
        strain: 'Test Strain',
        plantCount: 2,
        plants: [],
        type: 'photo',
        dates: { germStart: '2025-01-01', sprout: '2025-01-05' },
        light: { ppfd: 600, vegHours: 18, flowerHours: 12 },
      });
      store.addEntry(grow.id, {
        date: '2025-01-10',
        type: 'milestone',
        title: 'Test Entry',
      });

      const exported = store.exportJSON();
      store.clear();
      store.importJSON(exported);

      const imported = store.getGrows()[0];
      expect(imported.strain).toBe('Test Strain');
      expect(imported.entries).toHaveLength(1);
      expect(imported.entries[0].title).toBe('Test Entry');
    });
  });

  describe('Storage Size', () => {
    it('reports storage size', () => {
      store.addGrow({
        name: 'Size Test',
        strain: 'Test',
        plantCount: 1,
        plants: [],
        type: 'auto',
        dates: { germStart: '2025-01-01' },
        light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
      });

      const size = store.getStorageSize();
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(1); // Should be small
    });
  });

  describe('Sync support', () => {
    const newGrow = () => store.addGrow({
      name: 'Sync', strain: 'S', plantCount: 1, plants: [], type: 'auto' as GrowType,
      dates: { germStart: '2025-01-01' }, light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
    });

    it('records a tombstone when a grow is deleted', () => {
      const grow = newGrow();
      store.deleteGrow(grow.id);
      expect(store.getSyncSnapshot().deletedGrows[grow.id]).toBeTruthy();
    });

    it('records a tombstone when an entry is deleted', () => {
      const grow = newGrow();
      const entry = store.addEntry(grow.id, { date: '2025-01-10', type: 'note', title: 'x' })!;
      store.deleteEntry(grow.id, entry.id);
      expect(store.getGrow(grow.id)!.deletedEntries?.[entry.id]).toBeTruthy();
    });

    it('notifies change listeners on save', () => {
      let calls = 0;
      const off = store.onChange(() => calls++);
      newGrow();
      off();
      newGrow();
      expect(calls).toBe(1);
    });

    it('applies a sync result without touching timestamps', () => {
      const grow = newGrow();
      const snapshot = store.getSyncSnapshot();
      snapshot.grows[0].name = 'From other device';
      store.applySyncResult({ ...snapshot, strains: ['S', 'Remote strain'] });
      expect(store.getGrow(grow.id)!.name).toBe('From other device');
      expect(store.getGrow(grow.id)!.updatedAt).toBe(grow.updatedAt);
      expect(store.getStrains()).toContain('Remote strain');
    });

    it('snapshot is a copy', () => {
      const grow = newGrow();
      store.getSyncSnapshot().grows[0].name = 'changed';
      expect(store.getGrow(grow.id)!.name).toBe('Sync');
    });
  });
});
