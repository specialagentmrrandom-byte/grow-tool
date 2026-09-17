import {
    type Grow,
    type Entry,
    type StoreData,
    type Settings,
    type EntryType,
    type Phase,
    type GrowPreset,
    type FlowerPreset,
    GROW_PRESETS,
    FLOWER_PRESETS,
    DEFAULT_STORE_DATA,
    generateId,
    calculateGrowDates,
} from './types';
import { getPhase, getDaysSinceSprout } from './dli';
import { photoStore } from './photoStore';

const STORAGE_KEY = 'grow-tool-data';
const MAX_LOCALSTORAGE_MB = 5;      // localStorage limit (metadata only now)
const MAX_INDEXEDDB_MB = 50;         // Conservative IndexedDB limit for photos
const WARNING_THRESHOLD = 0.8;       // 80%
const CRITICAL_THRESHOLD = 0.95;     // 95%

// Storage event types
export type StorageEventType = 'save-error' | 'quota-warning' | 'quota-critical';

export interface StorageEvent {
    type: StorageEventType;
    message: string;
    details?: string;
}

// Callback type for storage events
type StorageEventCallback = (event: StorageEvent) => void;

// Storage class with localStorage persistence
class Store {
    private data: StoreData;
    private eventCallbacks: StorageEventCallback[] = [];

    constructor() {
        this.data = this.load();
    }

    // Subscribe to storage events
    onStorageEvent(callback: StorageEventCallback): () => void {
        this.eventCallbacks.push(callback);
        return () => {
            this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
        };
    }

    // Emit storage event
    private emitEvent(event: StorageEvent): void {
        this.eventCallbacks.forEach(cb => cb(event));
    }

    // Load from localStorage or return defaults
    private load(): StoreData {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return structuredClone(DEFAULT_STORE_DATA);

            const parsed = JSON.parse(stored) as StoreData;
            // Merge with defaults for any missing fields
            return {
                ...DEFAULT_STORE_DATA,
                ...parsed,
                settings: { ...DEFAULT_STORE_DATA.settings, ...parsed.settings },
            };
        } catch {
            console.warn('Failed to load store, using defaults');
            return structuredClone(DEFAULT_STORE_DATA);
        }
    }

    // Check if we can save (with optional additional size)
    // Note: This only checks localStorage. Photos go to IndexedDB which has much more space.
    canSave(additionalBytes: number = 0): { canSave: boolean; usagePercent: number; message?: string } {
        const json = JSON.stringify(this.data);
        const currentBytes = new Blob([json]).size;
        const totalBytes = currentBytes + additionalBytes;
        const maxBytes = MAX_LOCALSTORAGE_MB * 1024 * 1024;
        const usagePercent = totalBytes / maxBytes;

        if (usagePercent >= 1) {
            return {
                canSave: false,
                usagePercent,
                message: 'Metadata storage is full. Please export your data and delete old grows.',
            };
        }

        if (usagePercent >= CRITICAL_THRESHOLD) {
            return {
                canSave: true,
                usagePercent,
                message: 'Metadata storage almost full! Export your data now.',
            };
        }

        if (usagePercent >= WARNING_THRESHOLD) {
            return {
                canSave: true,
                usagePercent,
                message: 'Metadata storage is getting full. Consider exporting a backup.',
            };
        }

        return { canSave: true, usagePercent };
    }

    // Get localStorage usage info (metadata only)
    getStorageInfo(): { usedMB: number; maxMB: number; usagePercent: number; status: 'ok' | 'warning' | 'critical' } {
        const json = JSON.stringify(this.data);
        const usedMB = new Blob([json]).size / (1024 * 1024);
        const usagePercent = usedMB / MAX_LOCALSTORAGE_MB;

        let status: 'ok' | 'warning' | 'critical' = 'ok';
        if (usagePercent >= CRITICAL_THRESHOLD) {
            status = 'critical';
        } else if (usagePercent >= WARNING_THRESHOLD) {
            status = 'warning';
        }

        return { usedMB, maxMB: MAX_LOCALSTORAGE_MB, usagePercent, status };
    }

    // Get combined storage info including IndexedDB photos
    async getCombinedStorageInfo(): Promise<{
        localStorage: { usedMB: number; maxMB: number; usagePercent: number; status: 'ok' | 'warning' | 'critical' };
        indexedDB: { usedMB: number; maxMB: number; usagePercent: number; status: 'ok' | 'warning' | 'critical' };
        total: { usedMB: number; maxMB: number; usagePercent: number; status: 'ok' | 'warning' | 'critical' };
    }> {
        const localInfo = this.getStorageInfo();

        // Get IndexedDB usage from browser storage API
        const idbEstimate = await photoStore.getStorageEstimate();
        const idbUsedMB = idbEstimate.used / (1024 * 1024);
        const idbUsagePercent = idbUsedMB / MAX_INDEXEDDB_MB;

        let idbStatus: 'ok' | 'warning' | 'critical' = 'ok';
        if (idbUsagePercent >= CRITICAL_THRESHOLD) {
            idbStatus = 'critical';
        } else if (idbUsagePercent >= WARNING_THRESHOLD) {
            idbStatus = 'warning';
        }

        const totalUsedMB = localInfo.usedMB + idbUsedMB;
        const totalMaxMB = MAX_LOCALSTORAGE_MB + MAX_INDEXEDDB_MB;
        const totalUsagePercent = totalUsedMB / totalMaxMB;

        let totalStatus: 'ok' | 'warning' | 'critical' = 'ok';
        if (localInfo.status === 'critical' || idbStatus === 'critical') {
            totalStatus = 'critical';
        } else if (localInfo.status === 'warning' || idbStatus === 'warning') {
            totalStatus = 'warning';
        }

        return {
            localStorage: localInfo,
            indexedDB: { usedMB: idbUsedMB, maxMB: MAX_INDEXEDDB_MB, usagePercent: idbUsagePercent, status: idbStatus },
            total: { usedMB: totalUsedMB, maxMB: totalMaxMB, usagePercent: totalUsagePercent, status: totalStatus },
        };
    }

    // Save to localStorage
    save(): boolean {
        try {
            const json = JSON.stringify(this.data);
            const sizeMB = new Blob([json]).size / (1024 * 1024);
            const usagePercent = sizeMB / MAX_LOCALSTORAGE_MB;

            // Check for quota warnings (for metadata storage)
            if (usagePercent >= CRITICAL_THRESHOLD) {
                this.emitEvent({
                    type: 'quota-critical',
                    message: 'Metadata storage almost full!',
                    details: 'Export your data now. Photos are stored separately with more space.',
                });
            } else if (usagePercent >= WARNING_THRESHOLD) {
                this.emitEvent({
                    type: 'quota-warning',
                    message: 'Metadata storage getting full',
                    details: `${(usagePercent * 100).toFixed(0)}% used. Consider exporting a backup.`,
                });
            }

            localStorage.setItem(STORAGE_KEY, json);
            return true;
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            console.error('Failed to save store:', e);

            this.emitEvent({
                type: 'save-error',
                message: 'Failed to save data',
                details: errorMessage.includes('quota')
                    ? 'Storage is full. Export your data and delete old entries.'
                    : 'Please try again or export your data as backup.',
            });

            return false;
        }
    }

    // Get storage size in MB (legacy method)
    getStorageSize(): number {
        return this.getStorageInfo().usedMB;
    }

    // === Grows ===

    getGrows(): Grow[] {
        return this.data.grows;
    }

    getGrow(id: string): Grow | undefined {
        return this.data.grows.find(g => g.id === id);
    }

    addGrow(grow: Omit<Grow, 'id' | 'entries' | 'createdAt' | 'updatedAt'>): Grow {
        const now = new Date().toISOString();
        const newGrow: Grow = {
            ...grow,
            id: generateId('grow'),
            plants: grow.plants ?? [],
            entries: [],
            createdAt: now,
            updatedAt: now,
        };

        this.data.grows.push(newGrow);

        // Add strain to library if new
        if (grow.strain && !this.data.settings.strains.includes(grow.strain)) {
            this.data.settings.strains.push(grow.strain);
        }

        // Add any unique plant strains to library
        for (const plant of newGrow.plants) {
            if (plant.strain && !this.data.settings.strains.includes(plant.strain)) {
                this.data.settings.strains.push(plant.strain);
            }
        }

        this.save();
        return newGrow;
    }

    updateGrow(id: string, updates: Partial<Omit<Grow, 'id' | 'createdAt'>>): Grow | undefined {
        const grow = this.data.grows.find(g => g.id === id);
        if (!grow) return undefined;

        Object.assign(grow, updates, { updatedAt: new Date().toISOString() });
        this.save();
        return grow;
    }

    deleteGrow(id: string): boolean {
        const index = this.data.grows.findIndex(g => g.id === id);
        if (index === -1) return false;

        // Collect all photo IDs from this grow's entries
        const grow = this.data.grows[index];
        const allPhotoIds: string[] = [];
        for (const entry of grow.entries) {
            if (entry.photoIds && entry.photoIds.length > 0) {
                allPhotoIds.push(...entry.photoIds);
            }
        }

        // Delete all photos from IndexedDB (async, fire and forget)
        if (allPhotoIds.length > 0) {
            photoStore.deletePhotos(allPhotoIds).catch(err => {
                console.warn('Failed to delete some photos from IndexedDB:', err);
            });
        }

        this.data.grows.splice(index, 1);
        this.save();
        return true;
    }

    duplicateGrow(id: string): Grow | undefined {
        const original = this.data.grows.find(g => g.id === id);
        if (!original) return undefined;

        const now = new Date().toISOString();
        const today = now.split('T')[0];

        // Create new plants with new IDs (deep copy)
        const newPlants = original.plants.map(p => ({
            ...p,
            id: generateId('plant'),
            position: p.position ? { ...p.position } : undefined,
        }));

        // Try to infer presets from original grow dates to maintain timeline structure
        let vegPreset: GrowPreset = 'mid';
        let flowerPreset: FlowerPreset = 'medium';

        if (original.dates.germStart && original.dates.vegStart && original.dates.flowerStart) {
            const germDate = new Date(original.dates.germStart);
            const vegDate = new Date(original.dates.vegStart);
            const flowerDate = new Date(original.dates.flowerStart);

            // Calculate days from germ to veg start (should be ~11: 4 sprout + 7 seedling)
            const daysToVeg = Math.round((vegDate.getTime() - germDate.getTime()) / (1000 * 60 * 60 * 24));
            const seedlingDays = 7; // Standard
            const sproutDays = 4;   // Standard
            const vegDays = daysToVeg - seedlingDays - sproutDays;
            const vegWeeks = Math.max(1, Math.round(vegDays / 7));

            // Map veg weeks to preset
            if (vegWeeks <= 1) vegPreset = 'short';
            else if (vegWeeks === 2) vegPreset = 'fast';
            else if (vegWeeks === 3) vegPreset = 'mid';
            else vegPreset = 'long';

            // Calculate flower weeks if harvest date is set
            if (original.dates.harvest) {
                const harvestDate = new Date(original.dates.harvest);
                const flowerDays = Math.round((harvestDate.getTime() - flowerDate.getTime()) / (1000 * 60 * 60 * 24));
                const flowerWeeks = Math.round(flowerDays / 7);

                if (flowerWeeks <= 7) flowerPreset = 'short';
                else if (flowerWeeks === 8) flowerPreset = 'medium';
                else if (flowerWeeks === 9) flowerPreset = 'long';
                else flowerPreset = 'extra-long';
            }
        }

        // Calculate new dates based on inferred presets
        const vegConfig = GROW_PRESETS[vegPreset];
        const flowerConfig = FLOWER_PRESETS[flowerPreset];
        const newDates = calculateGrowDates(today, vegConfig.seedlingDays, vegConfig.vegWeeks, flowerConfig.weeks, flowerConfig.flushDays);

        const duplicated: Grow = {
            id: generateId('grow'),
            name: `${original.name} (Copy)`,
            strain: original.strain,
            plantCount: original.plantCount,
            type: original.type,
            plants: newPlants,
            entries: [], // Start fresh with no entries
            dates: newDates, // Use calculated dates for consistent timeline
            light: {
                ppfd: original.light.ppfd,
                vegHours: original.light.vegHours,
                flowerHours: original.light.flowerHours,
            },
            tent: original.tent ? {
                width: original.tent.width,
                depth: original.tent.depth,
            } : undefined,
            createdAt: now,
            updatedAt: now,
        };

        this.data.grows.push(duplicated);
        this.save();
        return duplicated;
    }

    // === Entries ===

    addEntry(
        growId: string,
        entry: Omit<Entry, 'id' | 'day' | 'phase' | 'createdAt' | 'updatedAt'>
    ): Entry | undefined {
        const grow = this.getGrow(growId);
        if (!grow) return undefined;

        const now = new Date().toISOString();
        const day = getDaysSinceSprout(grow, new Date(entry.date));
        const phase = getPhase(grow, new Date(entry.date));

        const newEntry: Entry = {
            ...entry,
            id: generateId('entry'),
            day,
            phase,
            createdAt: now,
            updatedAt: now,
        };

        grow.entries.push(newEntry);
        grow.entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        grow.updatedAt = now;

        this.save();
        return newEntry;
    }

    updateEntry(growId: string, entryId: string, updates: Partial<Entry>): Entry | undefined {
        const grow = this.getGrow(growId);
        if (!grow) return undefined;

        const entry = grow.entries.find(e => e.id === entryId);
        if (!entry) return undefined;

        Object.assign(entry, updates, { updatedAt: new Date().toISOString() });
        grow.updatedAt = entry.updatedAt;

        this.save();
        return entry;
    }

    deleteEntry(growId: string, entryId: string): boolean {
        const grow = this.getGrow(growId);
        if (!grow) return false;

        const index = grow.entries.findIndex(e => e.id === entryId);
        if (index === -1) return false;

        // Get the entry to clean up photos
        const entry = grow.entries[index];

        // Delete associated photos from IndexedDB (async, fire and forget)
        if (entry.photoIds && entry.photoIds.length > 0) {
            photoStore.deletePhotos(entry.photoIds).catch(err => {
                console.warn('Failed to delete some photos from IndexedDB:', err);
            });
        }

        grow.entries.splice(index, 1);
        grow.updatedAt = new Date().toISOString();

        this.save();
        return true;
    }

    // Quick add milestone to today
    addMilestone(growId: string, title: string): Entry | undefined {
        return this.addEntry(growId, {
            date: new Date().toISOString().split('T')[0],
            type: 'milestone' as EntryType,
            title,
        });
    }

    // === Settings ===

    getSettings(): Settings {
        return this.data.settings;
    }

    updateSettings(updates: Partial<Settings>): Settings {
        Object.assign(this.data.settings, updates);
        this.save();
        return this.data.settings;
    }

    getStrains(): string[] {
        return this.data.settings.strains;
    }

    addStrain(strain: string): void {
        if (!this.data.settings.strains.includes(strain)) {
            this.data.settings.strains.push(strain);
            this.save();
        }
    }

    // === Reminders ===

    getActiveReminders(growId?: string): Array<Entry & { growId: string; growName: string }> {
        const today = new Date().toISOString().split('T')[0];
        const allReminders: Array<Entry & { growId: string; growName: string }> = [];

        const grows = growId ? [this.getGrow(growId)].filter(Boolean) as Grow[] : this.data.grows;

        for (const grow of grows) {
            for (const entry of grow.entries) {
                // Skip reminders that are marked as done
                if (entry.type === 'reminder' && !entry.reminderDone) {
                    const bufferDays = entry.reminderBuffer ?? 0;
                    const reminderDate = new Date(entry.date);
                    const notifyDate = new Date(reminderDate);
                    notifyDate.setDate(notifyDate.getDate() - bufferDays);
                    const notifyDateStr = notifyDate.toISOString().split('T')[0];

                    // Show reminder if:
                    // 1. We've reached or passed the notify date (today >= notifyDate)
                    // 2. The reminder date hasn't passed yet (today <= reminderDate)
                    // 3. OR it's dismissed but still for today (reminderDismissed but date is today)
                    const isForToday = entry.date === today;
                    const shouldShow = (today >= notifyDateStr && today <= entry.date) ||
                        (entry.reminderDismissed && isForToday);

                    if (shouldShow) {
                        allReminders.push({
                            ...entry,
                            growId: grow.id,
                            growName: grow.name
                        });
                    }
                }
            }
        }

        return allReminders.sort((a, b) => a.date.localeCompare(b.date));
    }

    dismissReminder(growId: string, entryId: string): boolean {
        const grow = this.getGrow(growId);
        if (!grow) return false;

        const entry = grow.entries.find(e => e.id === entryId);
        if (entry && entry.type === 'reminder') {
            entry.reminderDismissed = true;
            entry.updatedAt = new Date().toISOString();
            this.save();
            return true;
        }
        return false;
    }

    undismissReminder(growId: string, entryId: string): boolean {
        const grow = this.getGrow(growId);
        if (!grow) return false;

        const entry = grow.entries.find(e => e.id === entryId);
        if (entry && entry.type === 'reminder') {
            entry.reminderDismissed = false;
            entry.updatedAt = new Date().toISOString();
            this.save();
            return true;
        }
        return false;
    }

    markReminderDone(growId: string, entryId: string): boolean {
        const grow = this.getGrow(growId);
        if (!grow) return false;

        const entry = grow.entries.find(e => e.id === entryId);
        if (entry && entry.type === 'reminder') {
            entry.reminderDone = true;
            entry.reminderDismissed = false; // Clear any temporary dismissal
            entry.updatedAt = new Date().toISOString();
            this.save();
            return true;
        }
        return false;
    }

    // === Export / Import ===

    exportJSON(): string {
        return JSON.stringify(this.data, null, 2);
    }

    /** Export with all IndexedDB photos resolved to base64 for full portability */
    async exportJSONWithPhotos(): Promise<string> {
        // Deep clone the data
        const exportData = structuredClone(this.data);

        // Resolve all photoIds to base64 photos
        for (const grow of exportData.grows) {
            for (const entry of grow.entries) {
                if (entry.photoIds && entry.photoIds.length > 0) {
                    const resolvedPhotos: string[] = [];
                    for (const photoId of entry.photoIds) {
                        const dataUrl = await photoStore.getPhotoAsDataURL(photoId);
                        if (dataUrl) {
                            resolvedPhotos.push(dataUrl);
                        }
                    }
                    // Move resolved photos to the photos array for export
                    entry.photos = [...(entry.photos ?? []), ...resolvedPhotos];
                    // Clear photoIds in export (they're IndexedDB-specific)
                    delete entry.photoIds;
                }
            }
        }

        return JSON.stringify(exportData, null, 2);
    }

    importJSON(json: string): boolean {
        try {
            const imported = JSON.parse(json) as StoreData;

            // Validate basic structure
            if (!imported.grows || !Array.isArray(imported.grows)) {
                throw new Error('Invalid data structure');
            }

            this.data = {
                ...DEFAULT_STORE_DATA,
                ...imported,
                settings: { ...DEFAULT_STORE_DATA.settings, ...imported.settings },
            };

            return this.save();
        } catch (e) {
            console.error('Failed to import JSON:', e);
            return false;
        }
    }

    // Export grow as Markdown for forum posting
    exportMarkdown(growId: string): string | undefined {
        const grow = this.getGrow(growId);
        if (!grow) return undefined;

        const { dates, entries, strain, plantCount, type, plants, light, tent } = grow;

        // Sort entries chronologically for processing
        const sortedEntries = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate statistics
        const totalDays = sortedEntries.length > 0 ? Math.max(...sortedEntries.map(e => e.day)) : 0;
        const totalPhotos = sortedEntries.reduce((sum, e) => {
            return sum + (e.photos?.length || (e.photo ? 1 : 0));
        }, 0);
        const milestones = sortedEntries.filter(e => e.type === 'milestone');
        const issues = sortedEntries.filter(e => e.type === 'issue');
        const waterings = sortedEntries.filter(e => e.type === 'watering');
        const feedings = sortedEntries.filter(e => e.type === 'feeding');

        // Calculate phase durations
        const phaseDurations: { phase: string; days: number }[] = [];
        const addPhaseDuration = (phase: string, start?: string, end?: string) => {
            if (!start) return;
            const startDate = new Date(start);
            const endDate = end ? new Date(end) : new Date();
            const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
            phaseDurations.push({ phase, days });
        };
        addPhaseDuration('Germination', dates.germStart, dates.sprout || dates.vegStart);
        if (dates.sprout) addPhaseDuration('Seedling', dates.sprout, dates.vegStart);
        addPhaseDuration('Veg', dates.vegStart, dates.flowerStart);
        addPhaseDuration('Flower', dates.flowerStart, dates.flushStart || dates.harvest);
        if (dates.flushStart) addPhaseDuration('Flush', dates.flushStart, dates.harvest);

        // Group entries by week
        const entriesByWeek = Object.groupBy(sortedEntries, (entry) => {
            const week = Math.ceil((entry.day + 1) / 7);
            return `Week ${week}`;
        });

        // Collect photos for placeholder list
        const photosWithPlaceholders: { day: number; index: number; photoNum?: number }[] = [];
        let photoIndex = 1;

        // Build markdown
        let md = `# 🌱 ${strain} - Grow Report\n\n`;

        // Type badge
        md += `> **${type === 'auto' ? '🌱 Autoflower' : '📸 Photoperiod'}** • ${plantCount} plant${plantCount > 1 ? 's' : ''} • ${totalDays} days\n\n`;

        // Quick stats summary
        md += `## 📊 By The Numbers\n\n`;
        md += `| ⏱️ Days | 🏁 Milestones | ⚠️ Issues | 📷 Photos | 💧 Waterings | 🌿 Feedings |\n`;
        md += `|:------:|:------------:|:--------:|:--------:|:-----------:|:----------:|\n`;
        md += `| ${totalDays} | ${milestones.length} | ${issues.length} | ${totalPhotos} | ${waterings.length} | ${feedings.length} |\n\n`;

        // Journey overview - phase timeline
        if (phaseDurations.length > 0) {
            md += `### 🗺️ Journey Overview\n\n`;
            md += `| Phase | Duration |\n`;
            md += `|-------|:--------:|\n`;
            for (const { phase, days } of phaseDurations) {
                const bar = '█'.repeat(Math.min(Math.ceil(days / 5), 10));
                md += `| ${phase} | ${bar} ${days}d |\n`;
            }
            md += `\n`;
        }

        // Grow details table
        md += `## 🔧 Setup Details\n\n`;
        md += `| Property | Value |\n`;
        md += `|----------|-------|\n`;
        md += `| **Type** | ${type === 'auto' ? 'Autoflower' : 'Photoperiod'} |\n`;
        md += `| **Plants** | ${plantCount} |\n`;
        if (light) {
            md += `| **PPFD** | ${light.ppfd} µmol/m²/s |\n`;
            md += `| **Light (Veg)** | ${light.vegHours}h |\n`;
            md += `| **Light (Flower)** | ${light.flowerHours}h |\n`;
        }
        if (tent) {
            md += `| **Tent Size** | ${tent.width}×${tent.depth} cm |\n`;
        }
        md += `\n`;

        // Plants section with more detail
        if (plants && plants.length > 0) {
            md += `## 🌿 The Cast\n\n`;
            md += `| # | Name | Strain | Seed Type | Pot | Notes |\n`;
            md += `|:-:|------|--------|:---------:|:---:|-------|\n`;
            for (const plant of plants) {
                const seedType = plant.seedType ? capitalize(plant.seedType) : 'Fem';
                const potSize = plant.potLiters ? `${plant.potLiters}L` : '-';
                const notes = plant.notes ? plant.notes.substring(0, 30) + (plant.notes.length > 30 ? '...' : '') : '-';
                md += `| ${plant.potNumber} | **${plant.name}** | ${plant.strain || strain} | ${seedType} | ${potSize} | ${notes} |\n`;
            }
            md += `\n`;
        }

        // Key dates section
        md += `## 📅 Key Dates\n\n`;
        md += `| Phase | Date | Day |\n`;
        md += `|-------|------|:---:|\n`;
        if (dates.germStart) md += `| 🌱 Germination | ${formatDatePretty(dates.germStart)} | 0 |\n`;
        if (dates.sprout) md += `| 🌿 Sprout | ${formatDatePretty(dates.sprout)} | - |\n`;
        if (dates.vegStart) {
            const vegDay = dates.sprout ? daysBetween(dates.sprout, dates.vegStart) : '-';
            md += `| 🪴 Veg Start | ${formatDatePretty(dates.vegStart)} | ${vegDay} |\n`;
        }
        if (dates.flowerStart) {
            const flowerDay = dates.sprout ? daysBetween(dates.sprout, dates.flowerStart) : '-';
            md += `| 🌸 Flower Start | ${formatDatePretty(dates.flowerStart)} | ${flowerDay} |\n`;
        }
        if (dates.flushStart) {
            const flushDay = dates.sprout ? daysBetween(dates.sprout, dates.flushStart) : '-';
            md += `| 💧 Flush Start | ${formatDatePretty(dates.flushStart)} | ${flushDay} |\n`;
        }
        if (dates.harvest) {
            const harvestDay = dates.sprout ? daysBetween(dates.sprout, dates.harvest) : '-';
            md += `| ✂️ Harvest | ${formatDatePretty(dates.harvest)} | ${harvestDay} |\n`;
        }
        md += `\n`;

        md += `---\n\n## 📖 Timeline\n\n`;

        // Add entries by week
        for (const [week, weekEntries] of Object.entries(entriesByWeek)) {
            if (!weekEntries) continue;

            const firstEntry = weekEntries[0];
            const phaseLabel = firstEntry?.phase ? ` • ${getPhaseEmoji(firstEntry.phase)} ${capitalize(firstEntry.phase)}` : '';

            // Week summary
            const weekMilestones = weekEntries.filter(e => e.type === 'milestone').length;
            const weekIssues = weekEntries.filter(e => e.type === 'issue').length;
            const weekPhotos = weekEntries.reduce((sum, e) => sum + (e.photos?.length || (e.photo ? 1 : 0)), 0);

            md += `### ${week}${phaseLabel}\n`;
            if (weekMilestones > 0 || weekIssues > 0 || weekPhotos > 0) {
                const badges = [];
                if (weekMilestones > 0) badges.push(`🏁 ${weekMilestones}`);
                if (weekIssues > 0) badges.push(`⚠️ ${weekIssues}`);
                if (weekPhotos > 0) badges.push(`📷 ${weekPhotos}`);
                md += `> ${badges.join(' • ')}\n`;
            }
            md += `\n`;

            for (const entry of weekEntries) {
                const icon = getEntryIcon(entry.type);

                // Build plant tags if entry has associated plants
                let plantTags = '';
                if (entry.plantIds && entry.plantIds.length > 0 && plants) {
                    const plantNames = entry.plantIds
                        .map(pid => plants.find(p => p.id === pid)?.name)
                        .filter(Boolean);
                    if (plantNames.length > 0) {
                        plantTags = ` \`[${plantNames.join(', ')}]\``;
                    }
                }

                // Entry type tags
                let typeBadge = '';
                if (entry.type === 'milestone') typeBadge = ' **MILESTONE**';
                if (entry.type === 'issue') typeBadge = ' ⚠️';

                md += `- **Day ${entry.day}** ${icon} ${entry.title}${typeBadge}${plantTags}`;

                if (entry.dli) {
                    md += ` ☀️ _DLI: ${entry.dli.toFixed(1)}_`;
                }

                // Entry tags
                if (entry.tags && entry.tags.length > 0) {
                    md += `\n  Tags: ${entry.tags.map(t => `\`${t}\``).join(' ')}`;
                }

                if (entry.content) {
                    md += `\n  > ${entry.content}`;
                }

                // Handle multiple photos
                const photos = entry.photos && entry.photos.length > 0
                    ? entry.photos
                    : entry.photo ? [entry.photo] : [];

                for (let i = 0; i < photos.length; i++) {
                    const photoLabel = photos.length > 1 ? `Day ${entry.day} (${i + 1}/${photos.length})` : `Day ${entry.day}`;
                    photosWithPlaceholders.push({ day: entry.day, index: photoIndex, photoNum: photos.length > 1 ? i + 1 : undefined });
                    md += `\n  ![${photoLabel}](UPLOAD_IMAGE_${photoIndex})`;
                    photoIndex++;
                }

                md += `\n\n`;
            }
        }

        // Lessons Learned section (issues summary)
        if (issues.length > 0) {
            md += `---\n\n## 📚 Lessons Learned\n\n`;
            md += `> Issues encountered during this grow:\n\n`;
            for (const issue of issues) {
                md += `### Day ${issue.day}: ${issue.title}\n`;
                if (issue.content) {
                    md += `${issue.content}\n`;
                }
                md += `\n`;
            }
        }

        // Milestones recap
        if (milestones.length > 0) {
            md += `---\n\n## 🏁 Milestones Achieved\n\n`;
            for (const milestone of milestones) {
                md += `- **Day ${milestone.day}**: ${milestone.title}`;
                if (milestone.content) md += ` - ${milestone.content}`;
                md += `\n`;
            }
            md += `\n`;
        }

        // Add image placeholder reference
        if (photosWithPlaceholders.length > 0) {
            md += `---\n\n## 📷 Image Upload Reference\n\n`;
            md += `> Upload your images and replace the placeholders:\n\n`;

            for (const { day, index, photoNum } of photosWithPlaceholders) {
                const label = photoNum ? `Day ${day} photo ${photoNum}` : `Day ${day} photo`;
                md += `${index}. \`UPLOAD_IMAGE_${index}\` → ${label}\n`;
            }
        }

        // Footer
        md += `\n---\n\n_Generated by [OG Grow Journal Assistant](https://github.com/specialagentmrrandom-byte/grow-tool) on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}_\n`;

        return md;
    }

    /**
     * Build a ready-to-post forum topic for a grow: a title plus the
     * forum-friendly Markdown body. Reuses exportMarkdown for the body so the
     * two stay in sync — this just wraps it with a sensible topic title for
     * Overgrow (see src/overgrow.ts for how the draft becomes a composer link).
     */
    getForumTopicDraft(growId: string): { title: string; body: string } | undefined {
        const grow = this.getGrow(growId);
        if (!grow) return undefined;

        const body = this.exportMarkdown(growId);
        if (body === undefined) return undefined;

        const typeLabel = grow.type === 'auto' ? 'Autoflower' : 'Photoperiod';
        const day = getDaysSinceSprout(grow, new Date());
        const dayLabel = day > 0 ? ` (Day ${day})` : '';
        const title = `🌱 ${grow.strain} — ${typeLabel} grow diary${dayLabel}`;

        return { title, body };
    }

    // Clear all data
    clear(): void {
        this.data = structuredClone(DEFAULT_STORE_DATA);
        this.save();
    }
}

// Helper functions
function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function getEntryIcon(type: EntryType): string {
    const icons: Record<EntryType, string> = {
        note: '📝',
        milestone: '🏁',
        issue: '⚠️',
        watering: '💧',
        feeding: '🌿',
        reminder: '⏰',
    };
    return icons[type] ?? '📝';
}

function getPhaseEmoji(phase: Phase): string {
    const emojis: Record<Phase, string> = {
        germination: '🌱',
        seedling: '🌿',
        veg: '🪴',
        flower: '🌸',
        flush: '💧',
        harvest: '✂️',
        complete: '🎉',
    };
    return emojis[phase] ?? '🌱';
}

function formatDatePretty(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function daysBetween(start: string, end: string): number {
    return Math.floor((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));
}

// Singleton instance
export const store = new Store();
