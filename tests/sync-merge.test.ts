import { describe, it, expect } from 'vitest';
import { mergeAll, mergeGrow, mergeTombstones, stableStringify, type RemoteGrowRow } from '../src/sync/merge';
import { canUseSync, daysLeft } from '../src/sync/engine';
import type { Entry, Grow } from '../src/types';

const entry = (id: string, updatedAt: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  date: '2026-05-01',
  day: 1,
  phase: 'veg',
  type: 'note',
  title: id,
  createdAt: '2026-05-01T08:00:00.000Z',
  updatedAt,
  ...extra,
});

const grow = (id: string, updatedAt: string, entries: Entry[] = [], extra: Partial<Grow> = {}): Grow => ({
  id,
  name: id,
  strain: 'Test',
  plantCount: 1,
  plants: [],
  type: 'auto',
  dates: { germStart: '2026-04-01' },
  light: { ppfd: 500, vegHours: 18, flowerHours: 12 },
  entries,
  createdAt: '2026-04-01T08:00:00.000Z',
  updatedAt,
  ...extra,
});

const row = (g: Grow): RemoteGrowRow => ({ id: g.id, data: structuredClone(g), deleted: false });

describe('sync merge', () => {
  it('keeps entries added on two devices to the same grow', () => {
    const a = grow('g1', '2026-05-02T10:00:00Z', [entry('e1', '2026-05-02T10:00:00Z')]);
    const b = grow('g1', '2026-05-02T11:00:00Z', [entry('e2', '2026-05-02T11:00:00Z')]);
    const merged = mergeGrow(a, b);
    expect(merged.entries.map(e => e.id).sort()).toEqual(['e1', 'e2']);
    expect(merged.updatedAt).toBe('2026-05-02T11:00:00Z');
  });

  it('newer edit of the same entry wins', () => {
    const a = grow('g1', '2026-05-02T10:00:00Z', [entry('e1', '2026-05-02T10:00:00Z', { title: 'old' })]);
    const b = grow('g1', '2026-05-02T12:00:00Z', [entry('e1', '2026-05-02T12:00:00Z', { title: 'new' })]);
    expect(mergeGrow(a, b).entries[0].title).toBe('new');
    expect(mergeGrow(b, a).entries[0].title).toBe('new');
  });

  it('newer grow-level fields win', () => {
    const a = grow('g1', '2026-05-02T10:00:00Z', [], { name: 'Old name' });
    const b = grow('g1', '2026-05-03T10:00:00Z', [], { name: 'New name' });
    expect(mergeGrow(a, b).name).toBe('New name');
  });

  it('an entry deleted on one device disappears on the other', () => {
    const local = grow('g1', '2026-05-03T10:00:00Z', [], { deletedEntries: { e1: '2026-05-03T10:00:00Z' } });
    const remote = grow('g1', '2026-05-02T10:00:00Z', [entry('e1', '2026-05-02T10:00:00Z')]);
    const merged = mergeGrow(local, remote);
    expect(merged.entries).toHaveLength(0);
    expect(merged.deletedEntries).toEqual({ e1: '2026-05-03T10:00:00Z' });
  });

  it('an entry edited after its deletion is restored', () => {
    const local = grow('g1', '2026-05-03T10:00:00Z', [], { deletedEntries: { e1: '2026-05-03T10:00:00Z' } });
    const remote = grow('g1', '2026-05-04T10:00:00Z', [entry('e1', '2026-05-04T10:00:00Z')]);
    const merged = mergeGrow(local, remote);
    expect(merged.entries.map(e => e.id)).toEqual(['e1']);
    expect(merged.deletedEntries).toBeUndefined();
  });

  it('uploads new local grows and downloads new remote ones', () => {
    const localOnly = grow('local', '2026-05-01T10:00:00Z');
    const remoteOnly = grow('remote', '2026-05-01T10:00:00Z');
    const result = mergeAll({ grows: [localOnly], deletedGrows: {}, strains: [] }, [row(remoteOnly)]);
    expect(result.local.grows.map(g => g.id)).toEqual(['local', 'remote']);
    expect(result.push.map(p => p.id)).toEqual(['local']);
    expect(result.localChanged).toBe(true);
  });

  it('is a no-op when both sides are equal', () => {
    const g = grow('g1', '2026-05-01T10:00:00Z', [entry('e1', '2026-05-01T10:00:00Z')]);
    const result = mergeAll({ grows: [g], deletedGrows: {}, strains: ['A'] }, [row(g)], ['A']);
    expect(result.push).toEqual([]);
    expect(result.localChanged).toBe(false);
  });

  it('a second merge after applying the result is stable', () => {
    const a = grow('g1', '2026-05-02T10:00:00Z', [entry('e1', '2026-05-02T10:00:00Z')]);
    const b = grow('g1', '2026-05-02T11:00:00Z', [entry('e2', '2026-05-02T11:00:00Z')]);
    const first = mergeAll({ grows: [a], deletedGrows: {}, strains: [] }, [row(b)]);
    const serverAfterPush: RemoteGrowRow[] = first.push.map(p => ({ id: p.id, data: p.data, deleted: p.deleted }));
    const second = mergeAll(first.local, serverAfterPush);
    expect(second.push).toEqual([]);
    expect(second.localChanged).toBe(false);
  });

  it('pushes a tombstone for a grow deleted locally', () => {
    const g = grow('g1', '2026-05-01T10:00:00Z');
    const result = mergeAll({ grows: [], deletedGrows: { g1: '2026-05-02T10:00:00Z' }, strains: [] }, [row(g)]);
    expect(result.local.grows).toEqual([]);
    expect(result.push).toEqual([{ id: 'g1', data: { deletedAt: '2026-05-02T10:00:00Z' }, deleted: true }]);
  });

  it('applies a remote grow deletion locally and does not re-push it', () => {
    const g = grow('g1', '2026-05-01T10:00:00Z');
    const tomb: RemoteGrowRow = { id: 'g1', data: { deletedAt: '2026-05-02T10:00:00Z' }, deleted: true };
    const result = mergeAll({ grows: [g], deletedGrows: {}, strains: [] }, [tomb]);
    expect(result.local.grows).toEqual([]);
    expect(result.local.deletedGrows).toEqual({ g1: '2026-05-02T10:00:00Z' });
    expect(result.push).toEqual([]);
  });

  it('a grow edited after a remote deletion comes back', () => {
    const g = grow('g1', '2026-05-03T10:00:00Z');
    const tomb: RemoteGrowRow = { id: 'g1', data: { deletedAt: '2026-05-02T10:00:00Z' }, deleted: true };
    const result = mergeAll({ grows: [g], deletedGrows: {}, strains: [] }, [tomb]);
    expect(result.local.grows.map(x => x.id)).toEqual(['g1']);
    expect(result.push).toEqual([{ id: 'g1', data: g, deleted: false }]);
  });

  it('unions strains', () => {
    const result = mergeAll({ grows: [], deletedGrows: {}, strains: ['A', 'B'] }, [], ['B', 'C']);
    expect(result.local.strains).toEqual(['A', 'B', 'C']);
  });

  it('mergeTombstones keeps the latest deletion', () => {
    expect(mergeTombstones({ x: '2026-01-01T00:00:00Z' }, { x: '2026-02-01T00:00:00Z', y: '2026-01-05T00:00:00Z' }))
      .toEqual({ x: '2026-02-01T00:00:00Z', y: '2026-01-05T00:00:00Z' });
  });

  it('stableStringify ignores key order', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(stableStringify({ a: [1, { c: 3, d: 2 }], b: 1 }));
  });
});

describe('entitlement helpers', () => {
  const base = {
    plan_id: 'free', plan_name: 'Free', sync_enabled: false, photo_quota_mb: 0, status: 'free' as const,
    current_period_end: null, cancel_at_period_end: false, provider: null, sync_consent_at: null,
  };
  it('sync follows the server-computed plan', () => {
    expect(canUseSync(null)).toBe(false);
    expect(canUseSync(base)).toBe(false);
    expect(canUseSync({ ...base, plan_id: 'premium', sync_enabled: true, status: 'active' })).toBe(true);
  });
  it('daysLeft counts to the period end', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    expect(daysLeft(base, now)).toBeNull();
    expect(daysLeft({ ...base, current_period_end: '2026-06-11T00:00:00Z' }, now)).toBe(10);
    expect(daysLeft({ ...base, current_period_end: '2026-05-30T00:00:00Z' }, now)).toBe(-2);
  });
});
