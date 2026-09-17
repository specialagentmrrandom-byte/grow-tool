/**
 * Pure merge logic for cross-device sync — no network, no storage, fully unit-tested.
 *
 * Rules:
 * - Grows and entries merge by id. For the same id, the copy with the newer
 *   `updatedAt` wins (last write wins), so edits on two devices to *different*
 *   entries of one grow both survive.
 * - Deletions are tombstones (id → time). A deletion wins over any copy that
 *   was last edited before it; an edit made *after* the deletion brings it back.
 * - Strains are a union.
 */
import type { Entry, Grow } from '../types';

/** Payload of a tombstone row: when the grow was deleted. */
export interface GrowTombstone {
    deletedAt: string;
}

export interface RemoteGrowRow {
    id: string;
    data: Grow | GrowTombstone | null;
    deleted: boolean;
    updated_at?: string;
}

export interface LocalSyncState {
    grows: Grow[];
    deletedGrows: Record<string, string>;
    strains: string[];
}

export interface MergeResult {
    local: LocalSyncState;
    /** Rows that must be written to the server so it matches the merged state. */
    push: Array<{ id: string; data: Grow | GrowTombstone; deleted: boolean }>;
    /** True when the merged state differs from the local input. */
    localChanged: boolean;
}

const time = (iso?: string): number => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(t) ? 0 : t;
};

const newer = <T extends { updatedAt: string }>(a: T, b: T): T =>
    time(b.updatedAt) > time(a.updatedAt) ? b : a;

/** Merge tombstone maps, keeping the latest deletion time per id. */
export function mergeTombstones(
    a: Record<string, string> = {},
    b: Record<string, string> = {},
): Record<string, string> {
    const out: Record<string, string> = { ...a };
    for (const [id, at] of Object.entries(b)) {
        if (!out[id] || time(at) > time(out[id])) out[id] = at;
    }
    return out;
}

/** Stable JSON (sorted keys) so equal data compares equal regardless of key order. */
export function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        return `{${Object.keys(obj)
            .filter(k => obj[k] !== undefined)
            .sort()
            .map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

const sortEntries = (entries: Entry[]): Entry[] =>
    [...entries].sort((a, b) => time(b.date) - time(a.date) || a.id.localeCompare(b.id));

/** Merge two copies of the same grow. */
export function mergeGrow(a: Grow, b: Grow): Grow {
    const base = newer(a, b);
    const deletedEntries = mergeTombstones(a.deletedEntries, b.deletedEntries);

    const byId = new Map<string, Entry>();
    for (const entry of [...a.entries, ...b.entries]) {
        const existing = byId.get(entry.id);
        byId.set(entry.id, existing ? newer(existing, entry) : entry);
    }

    const entries: Entry[] = [];
    for (const [id, entry] of byId) {
        const deletedAt = deletedEntries[id];
        if (deletedAt && time(deletedAt) >= time(entry.updatedAt)) continue;
        if (deletedAt) delete deletedEntries[id]; // edited after deletion → restored
        entries.push(entry);
    }

    const merged: Grow = {
        ...base,
        entries: sortEntries(entries),
        updatedAt: time(a.updatedAt) >= time(b.updatedAt) ? a.updatedAt : b.updatedAt,
    };
    if (Object.keys(deletedEntries).length > 0) merged.deletedEntries = deletedEntries;
    else delete merged.deletedEntries;
    return merged;
}

/** Merge the whole local state with every row the server has for this user. */
export function mergeAll(local: LocalSyncState, remoteRows: RemoteGrowRow[], remoteStrains: string[] = []): MergeResult {
    const remoteById = new Map(remoteRows.map(r => [r.id, r]));
    const localById = new Map(local.grows.map(g => [g.id, g]));

    // Deletions known on the server are tombstone rows; their time is the deleted grow's last known state.
    const remoteTombstones: Record<string, string> = {};
    for (const row of remoteRows) {
        if (!row.deleted) continue;
        const at = row.data && 'deletedAt' in row.data ? row.data.deletedAt : row.updated_at;
        remoteTombstones[row.id] = at ?? new Date(0).toISOString();
    }
    const deletedGrows = mergeTombstones(local.deletedGrows, remoteTombstones);

    const ids = new Set([...localById.keys(), ...remoteById.keys(), ...Object.keys(deletedGrows)]);
    const grows: Grow[] = [];
    const push: MergeResult['push'] = [];

    for (const id of ids) {
        const localGrow = localById.get(id);
        const row = remoteById.get(id);
        const remoteGrow = row && !row.deleted && row.data && !('deletedAt' in row.data) ? row.data : undefined;

        let merged: Grow | undefined =
            localGrow && remoteGrow ? mergeGrow(localGrow, remoteGrow) : localGrow ?? remoteGrow;

        const deletedAt = deletedGrows[id];
        if (merged && deletedAt) {
            if (time(deletedAt) >= time(merged.updatedAt)) merged = undefined;
            else delete deletedGrows[id]; // edited after deletion → restored
        }

        if (merged) {
            grows.push(merged);
            if (!row || row.deleted || stableStringify(row.data) !== stableStringify(merged)) {
                push.push({ id, data: merged, deleted: false });
            }
        } else if (deletedAt) {
            const remoteDeletedAt = row?.deleted && row.data && 'deletedAt' in row.data ? row.data.deletedAt : undefined;
            if (!row?.deleted || remoteDeletedAt !== deletedAt) {
                // Tell the server (and other devices) about the deletion
                push.push({ id, data: { deletedAt }, deleted: true });
            }
        }
    }

    // Keep the local order for existing grows, append new ones
    const order = new Map(local.grows.map((g, i) => [g.id, i]));
    grows.sort((x, y) => (order.get(x.id) ?? Infinity) - (order.get(y.id) ?? Infinity) || time(x.createdAt) - time(y.createdAt));

    const strains = [...new Set([...local.strains, ...remoteStrains])];
    const mergedLocal: LocalSyncState = { grows, deletedGrows, strains };

    return {
        local: mergedLocal,
        push,
        localChanged: stableStringify(mergedLocal) !== stableStringify({
            grows: local.grows,
            deletedGrows: local.deletedGrows,
            strains: local.strains,
        }),
    };
}
