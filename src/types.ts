// Phase types
export type Phase = 'germination' | 'seedling' | 'veg' | 'flower' | 'flush' | 'harvest' | 'complete';
export type GrowType = 'auto' | 'photo';
export type EntryType = 'note' | 'milestone' | 'issue' | 'watering' | 'feeding' | 'reminder';

// Reminder buffer options (days before reminder date to notify)
export const REMINDER_BUFFERS = [
    { label: 'Same day', days: 0 },
    { label: '1 day before', days: 1 },
    { label: '2 days before', days: 2 },
    { label: '3 days before', days: 3 },
    { label: '1 week before', days: 7 },
] as const;

export type ReminderBuffer = typeof REMINDER_BUFFERS[number]['days'];

// Milestone presets
export const MILESTONE_PRESETS = [
    'Sprouted',
    'Transplant',
    'Topped',
    'LST Started',
    'Defoliation',
    'Flip to 12/12',
    'First Pistils',
    'Stretch End',
    'Flush Started',
    'Harvest',
] as const;

export type MilestonePreset = typeof MILESTONE_PRESETS[number];

// Milestone emoji mapping
export const MILESTONE_EMOJIS: Record<MilestonePreset, string> = {
    'Sprouted': '🌱 ',
    'Transplant': '🪴 ',
    'Topped': '✂️ ',
    'LST Started': '🌀 ',
    'Defoliation': '🍃 ',
    'Flip to 12/12': '🌓 ',
    'First Pistils': '🌸 ',
    'Stretch End': '📏 ',
    'Flush Started': '💧 ',
    'Harvest': '✨ ',
};

// Cannabis strain names for random selection
export const CANNABIS_STRAINS = [
    'Northern Lightsaber Quest',
    'Blue Dragon Dream Saga',
    'Ancient Ogre Kush Chronicles',
    'Sour Diesel Beast Adventures',
    'Girl Scout Cookie Witch Tale',
    'White Widow Spider Legend',
    'Jack Herer the Wizard Odyssey',
    'AK-47 Dragonfire Expedition',
    'Amnesia Haze Potion Epic',
    'Bubblegum Troll Journey',
    'Chemdawg Sorcerer Myth',
    'Durban Poison Elixir Quest',
    'Green Crack Crystal Saga',
    'Mystic Haze Veil Chronicles',
    'Royal Kush Crown Legend',
    'Lemon Haze Citrus Odyssey',
    'Master Kush Mage Tale',
    'Purple Haze Enchantment Epic',
    'Silver Haze Moonlight Journey',
    'Skunk Goblin Adventures',
    'Super Silver Haze Storm Myth',
    'Trainwreck Troll Expedition',
    'White Rhino Horn Quest',
    'Wonder Woman Warrior Saga',
    'Zigzag Lightning Chronicles',
] as const;

// Light settings for DLI calculation
export interface LightSettings {
    ppfd: number;        // μmol/m²/s
    vegHours: number;    // hours per day during veg
    flowerHours: number; // hours per day during flower
}

// Important dates for grow phases
export interface GrowDates {
    germStart: string;    // ISO date string
    sprout?: string;      // Day 0 for timeline
    vegStart?: string;    // Seedling → Veg transition
    flowerStart?: string; // Flip date (photo) or auto transition
    flushStart?: string;  // Begin flush period
    harvest?: string;     // Actual or expected harvest
}

// Diary entry
export interface Entry {
    id: string;
    date: string;         // ISO date string
    day: number;          // Days since sprout
    phase: Phase;
    type: EntryType;
    title: string;
    content?: string;
    photo?: string;       // Legacy: single photo (Base64 thumbnail <100KB)
    photos?: string[];    // Legacy: multiple photos (Base64 thumbnails <100KB each)
    photoIds?: string[];  // NEW: references to photos stored in IndexedDB
    tags?: string[];
    plantIds?: string[];  // Which plants this entry applies to
    dli?: number;         // Actual DLI achieved that day
    // Reminder-specific fields
    reminderBuffer?: number;  // Days before date to start showing reminder
    reminderDismissed?: boolean;  // Whether user dismissed the reminder (temporary, shows again on reload)
    reminderDone?: boolean;     // Whether user marked reminder as done (permanent)
    createdAt: string;
    updatedAt: string;
}

// Individual plant in a grow
export interface Plant {
    id: string;
    potNumber: number;    // Number to mark the pot with
    name: string;         // Nickname e.g. "Big Girl"
    strain: string;       // Strain name (can differ from grow default)
    seedType?: 'feminized' | 'regular' | 'experimental';  // Seed type
    notes?: string;
    potLiters?: number;   // Pot size in liters (e.g., 7, 11, 15, 20, 25)
    position?: {          // Position in tent (percentage 0-100)
        x: number;
        y: number;
    };
}

// Pot size presets: liters → side length in cm
export const POT_SIZES: Record<number, number> = {
    3: 16,   // Small starter pots
    5: 19,   // Small-medium pots
    7: 21,   // Standard small pots
    10: 23,  // Medium pots
    11: 24,  // Common grow pots
    15: 27,  // Large grow pots
    18: 29,  // Extra large pots
    20: 30,  // Very large pots
    25: 32,  // Jumbo pots
    30: 35,  // Massive pots
    50: 42,  // Industrial sized
};

// Convert liters to pot side length (cm).
// If an exact mapping exists in POT_SIZES, return it; otherwise interpolate
// linearly between the two nearest defined sizes for smooth visual scaling.
export function potLitersToSideCm(liters: number): number {
    if (!liters || typeof liters !== 'number' || isNaN(liters)) return POT_SIZES[11];
    if (POT_SIZES[liters]) return POT_SIZES[liters];

    // Get sorted keys
    const keys = Object.keys(POT_SIZES).map(k => parseInt(k, 10)).sort((a, b) => a - b);

    // If liters is smaller than smallest key or larger than largest, clamp
    if (liters <= keys[0]) return POT_SIZES[keys[0]];
    if (liters >= keys[keys.length - 1]) return POT_SIZES[keys[keys.length - 1]];

    // Find surrounding keys
    let lower = keys[0];
    let upper = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
        if (liters > keys[i] && liters < keys[i + 1]) {
            lower = keys[i];
            upper = keys[i + 1];
            break;
        }
    }

    const lowerCm = POT_SIZES[lower];
    const upperCm = POT_SIZES[upper];

    const t = (liters - lower) / (upper - lower);
    return lowerCm + (upperCm - lowerCm) * t;
}

// Tent configuration
export interface TentConfig {
    width: number;   // cm
    depth: number;   // cm
}

// Common tent size presets
export const TENT_SIZES = [
    { label: '60×60cm', width: 60, depth: 60 },
    { label: '80×80cm', width: 80, depth: 80 },
    { label: '100×100cm', width: 100, depth: 100 },
    { label: '120×120cm', width: 120, depth: 120 },
    { label: '120×60cm', width: 120, depth: 60 },
] as const;

// Auto-generate plant colors - Pastel earthy palette
export const PLANT_COLORS = [
    '#8FB894', // soft jade
    '#9CB3C0', // dusty blue
    '#E0B084', // warm sand
    '#D9A5B3', // dusty rose
    '#C9A9D1', // dusty lavender
    '#D9C78C', // golden wheat
    '#A8BCAD', // sage mint
    '#D4A89E', // terracotta
] as const;

// Main grow data structure
export interface Grow {
    id: string;
    name: string;
    strain: string;
    plantCount: number;
    plants: Plant[];      // Individual plant tracking
    type: GrowType;
    dates: GrowDates;
    light: LightSettings;
    tent?: TentConfig;    // Tent dimensions for planner
    entries: Entry[];
    deletedEntries?: Record<string, string>;  // Sync tombstones: entry id → deletion time (ISO)
    createdAt: string;
    updatedAt: string;
}

// App settings
export interface Settings {
    strains: string[];           // Previously used strains
    defaultLight: LightSettings;
    theme: 'auto' | 'dark' | 'light';  // Theme preference: auto = follow system
    lastReminderCheck?: string;  // ISO date of last reminder check
}

// Full store data
export interface StoreData {
    grows: Grow[];
    settings: Settings;
    version: number;
    deletedGrows?: Record<string, string>;  // Sync tombstones: grow id → deletion time (ISO)
}

// Phase info for display
export interface PhaseInfo {
    phase: Phase;
    day: number;           // Current day in grow
    daysInPhase: number;   // Days in current phase
    daysUntilNextPhase?: number; // Days until next phase starts
    daysUntilHarvest?: number;
    phaseProgress?: number; // 0-100 percentage
}

// DLI recommendations per phase (basic)
export const DLI_TARGETS: Record<Phase, { min: number; max: number; unit: string }> = {
    germination: { min: 5, max: 10, unit: 'mol/m²/day' },
    seedling: { min: 13, max: 19, unit: 'mol/m²/day' },
    veg: { min: 25, max: 45, unit: 'mol/m²/day' },
    flower: { min: 40, max: 65, unit: 'mol/m²/day' },
    flush: { min: 35, max: 50, unit: 'mol/m²/day' },
    harvest: { min: 0, max: 0, unit: 'mol/m²/day' },
    complete: { min: 0, max: 0, unit: 'mol/m²/day' },
};

// Granular week-by-week DLI targets
// Keys: 'phase_weekInPhase' or 'phase' for phases without week progression
export interface DLITarget {
    min: number;
    max: number;
    description: string;
}

export const DLI_TARGETS_GRANULAR: Record<string, { auto: DLITarget; photo: DLITarget }> = {
    // Germination - same for both types
    'germination': {
        auto: { min: 5, max: 10, description: 'Low light for sprouting' },
        photo: { min: 5, max: 10, description: 'Low light for sprouting' },
    },
    // Seedling week 1 (days 1-7 after sprout)
    'seedling_1': {
        auto: { min: 13, max: 19, description: 'Gentle light for young plants' },
        photo: { min: 13, max: 19, description: 'Gentle light for young plants' },
    },
    // Seedling week 2 (days 8-14)
    'seedling_2': {
        auto: { min: 15, max: 22, description: 'Ramping up as roots develop' },
        photo: { min: 15, max: 22, description: 'Ramping up as roots develop' },
    },
    // Early veg (week 1-2 of veg)
    'veg_1': {
        auto: { min: 22, max: 30, description: 'Building vegetative growth' },
        photo: { min: 20, max: 28, description: 'Building vegetative growth' },
    },
    'veg_2': {
        auto: { min: 28, max: 38, description: 'Increasing light intensity' },
        photo: { min: 25, max: 35, description: 'Increasing light intensity' },
    },
    // Mid-late veg (week 3+)
    'veg_3': {
        auto: { min: 35, max: 45, description: 'Mature veg, high light' },
        photo: { min: 30, max: 40, description: 'Mature veg growth' },
    },
    'veg_4+': {
        auto: { min: 40, max: 50, description: 'Max veg light (auto)' },
        photo: { min: 35, max: 45, description: 'Max veg light (photo)' },
    },
    // Flower week 1-2 (stretch/transition)
    'flower_1': {
        auto: { min: 38, max: 48, description: 'Transition to flower' },
        photo: { min: 38, max: 48, description: 'Transition to flower' },
    },
    'flower_2': {
        auto: { min: 42, max: 52, description: 'Early flower development' },
        photo: { min: 42, max: 52, description: 'Early flower development' },
    },
    // Flower week 3-4 (bud formation)
    'flower_3': {
        auto: { min: 45, max: 55, description: 'Bud sites forming' },
        photo: { min: 45, max: 55, description: 'Bud sites forming' },
    },
    'flower_4': {
        auto: { min: 48, max: 58, description: 'Bud development' },
        photo: { min: 48, max: 58, description: 'Bud development' },
    },
    // Flower week 5-6 (bud fattening)
    'flower_5': {
        auto: { min: 50, max: 60, description: 'Buds fattening' },
        photo: { min: 50, max: 60, description: 'Buds fattening' },
    },
    'flower_6': {
        auto: { min: 52, max: 62, description: 'Peak flower production' },
        photo: { min: 52, max: 62, description: 'Peak flower production' },
    },
    // Flower week 7+ (ripening)
    'flower_7+': {
        auto: { min: 55, max: 65, description: 'Maximum light for density' },
        photo: { min: 55, max: 65, description: 'Maximum light for density' },
    },
    // Flush - reduce slightly
    'flush': {
        auto: { min: 35, max: 50, description: 'Reduced light during flush' },
        photo: { min: 35, max: 50, description: 'Reduced light during flush' },
    },
    // Harvest/complete - no light needed
    'harvest': {
        auto: { min: 0, max: 0, description: 'Harvest time' },
        photo: { min: 0, max: 0, description: 'Harvest time' },
    },
    'complete': {
        auto: { min: 0, max: 0, description: 'Grow complete' },
        photo: { min: 0, max: 0, description: 'Grow complete' },
    },
};

// Phase colors for UI - Pastel earthy tones
export const PHASE_COLORS: Record<Phase, string> = {
    germination: '#B8A199', // warm taupe
    seedling: '#C4D4A1',    // sage green
    veg: '#8FB894',         // soft jade
    flower: '#C9A9D1',      // dusty lavender
    flush: '#E0B084',       // warm sand
    harvest: '#D9C78C',     // golden wheat
    complete: '#9CA3A8',    // soft slate
};

// Helper to generate unique IDs
export const generateId = (prefix: string = 'id'): string =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// Default light settings
export const DEFAULT_LIGHT: LightSettings = {
    ppfd: 500,
    vegHours: 18,
    flowerHours: 12,
};

// Grow presets - defines veg weeks and typical flower duration
export type GrowPreset = 'short' | 'fast' | 'mid' | 'long';

export interface GrowPresetConfig {
    label: string;
    vegWeeks: number;
    flowerWeeks: number;   // Typical flower duration
    flushDays: number;     // Days before harvest to start flush
    seedlingDays: number;  // Days from sprout to veg start
}

export const GROW_PRESETS: Record<GrowPreset, GrowPresetConfig> = {
    short: {
        label: '⚡ Short (1 week veg)',
        vegWeeks: 1,
        flowerWeeks: 8,
        flushDays: 10,
        seedlingDays: 7,
    },
    fast: {
        label: '🚀 Fast (2 weeks veg)',
        vegWeeks: 2,
        flowerWeeks: 8,
        flushDays: 10,
        seedlingDays: 7,
    },
    mid: {
        label: '🌿 Mid (3 weeks veg)',
        vegWeeks: 3,
        flowerWeeks: 9,
        flushDays: 14,
        seedlingDays: 7,
    },
    long: {
        label: '🌳 Long (4 weeks veg)',
        vegWeeks: 4,
        flowerWeeks: 10,
        flushDays: 14,
        seedlingDays: 7,
    },
};

// Flower duration presets (7-10 weeks)
export type FlowerPreset = 'short' | 'medium' | 'long' | 'extra-long';

export interface FlowerPresetConfig {
    label: string;
    weeks: number;
    flushDays: number;
}

export const FLOWER_PRESETS: Record<FlowerPreset, FlowerPresetConfig> = {
    short: {
        label: '⚡ Short (7 weeks)',
        weeks: 7,
        flushDays: 7,
    },
    medium: {
        label: '🌸 Medium (8 weeks)',
        weeks: 8,
        flushDays: 10,
    },
    long: {
        label: '🌺 Long (9 weeks)',
        weeks: 9,
        flushDays: 14,
    },
    'extra-long': {
        label: '🌻 Extra Long (10 weeks)',
        weeks: 10,
        flushDays: 14,
    },
};

/**
 * Calculate all grow dates from germination start and presets
 */
export function calculateGrowDates(
    germStart: string,
    seedlingDays: number,
    vegWeeks: number,
    flowerWeeks: number,
    flushDays: number
): GrowDates {
    const germ = new Date(germStart);

    // Helper to add days
    const addDays = (date: Date, days: number): string => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result.toISOString().split('T')[0];
    };

    // Sprout: typically 3-5 days after germ start
    const sproutDays = 4;
    const sprout = addDays(germ, sproutDays);

    // Veg start: after seedling phase (only if vegWeeks > 0)
    const vegStart = vegWeeks > 0 ? addDays(germ, sproutDays + seedlingDays) : undefined;

    // Flower start: after veg phase (or seedling for autoflowers)
    const seedlingEndDays = sproutDays + seedlingDays;
    const vegEndDays = seedlingEndDays + (vegWeeks * 7);
    const flowerStart = addDays(germ, vegEndDays);

    // Harvest: after flower phase
    const harvestDays = seedlingEndDays + (vegWeeks * 7) + (flowerWeeks * 7);
    const harvest = addDays(germ, harvestDays);

    // Flush start: X days before harvest
    const flushStart = addDays(germ, harvestDays - flushDays);

    return {
        germStart,
        sprout,
        vegStart,
        flowerStart,
        flushStart,
        harvest,
    };
}

// Default store data
export const DEFAULT_STORE_DATA: StoreData = {
    grows: [],
    settings: {
        strains: [],
        defaultLight: DEFAULT_LIGHT,
        theme: 'auto',
    },
    version: 1,
};

// Generate a consistent, subtle background color for a grow based on its ID
export function getGrowColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = ((hash << 5) - hash) + id.charCodeAt(i);
        hash = hash & hash;
    }
    const hue = Math.abs(hash) % 360;
    return `hsla(${hue}, 30%, 20%, 1)`;
}
