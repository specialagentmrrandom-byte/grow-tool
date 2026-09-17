import { type Grow, type Phase, type LightSettings, type PhaseInfo, type GrowType, type DLITarget, DLI_TARGETS, DLI_TARGETS_GRANULAR } from './types';

/**
 * Calculate Daily Light Integral (DLI)
 * Formula: DLI = PPFD × hours × 3600 / 1,000,000
 * @returns DLI in mol/m²/day
 */
export function calculateDLI(ppfd: number, hours: number): number {
    return (ppfd * hours * 3600) / 1_000_000;
}

/**
 * Get DLI for a grow based on current phase
 */
export function getGrowDLI(grow: Grow, date: Date = new Date()): number {
    const phase = getPhase(grow, date);
    const hours = ['flower', 'flush'].includes(phase)
        ? grow.light.flowerHours
        : grow.light.vegHours;
    return calculateDLI(grow.light.ppfd, hours);
}

/**
 * Check if DLI is within recommended range for phase
 */
export function isDLIInRange(dli: number, phase: Phase): boolean {
    const target = DLI_TARGETS[phase];
    return dli >= target.min && dli <= target.max;
}

/**
 * Get DLI recommendation for phase
 */
export function getDLIRecommendation(phase: Phase): { min: number; max: number; optimal: number } {
    const target = DLI_TARGETS[phase];
    return {
        min: target.min,
        max: target.max,
        optimal: (target.min + target.max) / 2,
    };
}

/**
 * Calculate required PPFD for target DLI
 */
export function calculateRequiredPPFD(targetDLI: number, hours: number): number {
    return (targetDLI * 1_000_000) / (hours * 3600);
}

/**
 * Parse date string to Date object, handling ISO strings
 */
function parseDate(dateStr: string | undefined): Date | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Get days between two dates (date2 - date1)
 */
export function daysBetween(date1: Date | string, date2: Date | string): number {
    const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
    const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
    const diffMs = d2.getTime() - d1.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get days since sprout (Day 0)
 */
export function getDaysSinceSprout(grow: Grow, date: Date = new Date()): number {
    const sprout = parseDate(grow.dates.sprout) ?? parseDate(grow.dates.germStart);
    if (!sprout) return 0;
    return Math.max(0, daysBetween(sprout, date));
}

/**
 * Detect current phase based on dates
 */
export function getPhase(grow: Grow, date: Date = new Date()): Phase {
    const d = date.toISOString().split('T')[0];
    const { dates } = grow;

    // Not started yet
    if (dates.germStart && d < dates.germStart) return 'germination';

    // Check harvest/complete first
    if (dates.harvest && d >= dates.harvest) return 'complete';

    // Flush phase
    if (dates.flushStart && d >= dates.flushStart) return 'flush';

    // Flower phase
    if (dates.flowerStart && d >= dates.flowerStart) return 'flower';

    // Veg phase
    if (dates.vegStart && d >= dates.vegStart) return 'veg';

    // Sprout / seedling
    if (dates.sprout && d >= dates.sprout) return 'seedling';

    // Default to germination
    return 'germination';
}

/**
 * Get number of days in current phase
 */
export function getDaysInPhase(grow: Grow, date: Date = new Date()): number {
    const phase = getPhase(grow, date);
    const { dates } = grow;

    let phaseStart: Date | null = null;

    switch (phase) {
        case 'germination':
            phaseStart = parseDate(dates.germStart);
            break;
        case 'seedling':
            phaseStart = parseDate(dates.sprout);
            break;
        case 'veg':
            phaseStart = parseDate(dates.vegStart);
            break;
        case 'flower':
            phaseStart = parseDate(dates.flowerStart);
            break;
        case 'flush':
            phaseStart = parseDate(dates.flushStart);
            break;
        case 'harvest':
        case 'complete':
            phaseStart = parseDate(dates.harvest);
            break;
    }

    if (!phaseStart) return 0;
    return Math.max(1, daysBetween(phaseStart, date) + 1);
}

/**
 * Get days until the next phase starts
 */
export function getDaysUntilNextPhase(grow: Grow, date: Date = new Date()): number | null {
    const phase = getPhase(grow, date);
    const { dates } = grow;

    let nextPhaseStart: Date | null = null;

    switch (phase) {
        case 'germination':
            nextPhaseStart = parseDate(dates.sprout);
            break;
        case 'seedling':
            nextPhaseStart = parseDate(dates.vegStart);
            break;
        case 'veg':
            nextPhaseStart = parseDate(dates.flowerStart);
            break;
        case 'flower':
            nextPhaseStart = parseDate(dates.flushStart);
            break;
        case 'flush':
            nextPhaseStart = parseDate(dates.harvest);
            break;
        case 'harvest':
        case 'complete':
            // No next phase
            return null;
    }

    if (!nextPhaseStart) return null;
    const days = daysBetween(date, nextPhaseStart);
    return days >= 0 ? days : null;
}

/**
 * Get days until expected harvest
 */
export function getDaysUntilHarvest(grow: Grow, date: Date = new Date()): number | null {
    const harvest = parseDate(grow.dates.harvest);
    if (!harvest) return null;

    const days = daysBetween(date, harvest);
    return days >= 0 ? days : null;
}

/**
 * Get comprehensive phase info for a grow
 */
export function getPhaseInfo(grow: Grow, date: Date = new Date()): PhaseInfo {
    const phase = getPhase(grow, date);
    const day = getDaysSinceSprout(grow, date);
    const daysInPhase = getDaysInPhase(grow, date);
    const daysUntilNextPhase = getDaysUntilNextPhase(grow, date) ?? undefined;
    const daysUntilHarvest = getDaysUntilHarvest(grow, date) ?? undefined;

    // Calculate phase progress (if we know phase duration)
    let phaseProgress: number | undefined;
    const { dates } = grow;

    if (phase === 'veg' && dates.vegStart && dates.flowerStart) {
        const totalDays = daysBetween(dates.vegStart, dates.flowerStart);
        phaseProgress = totalDays > 0 ? Math.min(100, (daysInPhase / totalDays) * 100) : undefined;
    } else if (phase === 'flower' && dates.flowerStart && dates.flushStart) {
        const totalDays = daysBetween(dates.flowerStart, dates.flushStart);
        phaseProgress = totalDays > 0 ? Math.min(100, (daysInPhase / totalDays) * 100) : undefined;
    } else if (phase === 'flush' && dates.flushStart && dates.harvest) {
        const totalDays = daysBetween(dates.flushStart, dates.harvest);
        phaseProgress = totalDays > 0 ? Math.min(100, (daysInPhase / totalDays) * 100) : undefined;
    }

    return { phase, day, daysInPhase, daysUntilNextPhase, daysUntilHarvest, phaseProgress };
}

/**
 * Calculate expected flower duration for common strain types
 */
export function getTypicalFlowerDuration(type: 'auto' | 'photo'): { min: number; avg: number; max: number } {
    if (type === 'auto') {
        return { min: 56, avg: 70, max: 84 }; // 8-12 weeks total, ~8 weeks flower
    }
    return { min: 49, avg: 63, max: 77 }; // 7-11 weeks
}

/**
 * Suggest flush start date based on harvest date
 */
export function suggestFlushDate(harvestDate: Date, flushDays: number = 10): Date {
    const flush = new Date(harvestDate);
    flush.setDate(flush.getDate() - flushDays);
    return flush;
}

/**
 * Format phase for display
 */
export function formatPhase(phase: Phase): string {
    const labels: Record<Phase, string> = {
        germination: 'Germination',
        seedling: 'Seedling',
        veg: 'Vegetative',
        flower: 'Flowering',
        flush: 'Flushing',
        harvest: 'Harvest',
        complete: 'Complete',
    };
    return labels[phase];
}

/**
 * Get week number from day
 */
export function getWeekNumber(day: number): number {
    return Math.ceil((day + 1) / 7);
}

/**
 * Get granular DLI target based on phase, week in phase, and grow type
 */
export function getDLITarget(grow: Grow, date: Date = new Date()): DLITarget {
    const phase = getPhase(grow, date);
    const daysInPhase = getDaysInPhase(grow, date);
    const weekInPhase = Math.max(1, Math.ceil((daysInPhase + 1) / 7));
    const growType: GrowType = grow.type;

    // Determine the lookup key
    let key: string;

    switch (phase) {
        case 'germination':
        case 'flush':
        case 'harvest':
        case 'complete':
            // These phases don't have week progression
            key = phase;
            break;
        case 'seedling':
            // Seedling has weeks 1-2, then caps at 2
            key = `seedling_${Math.min(weekInPhase, 2)}`;
            break;
        case 'veg':
            // Veg has weeks 1-3, then 4+
            if (weekInPhase >= 4) {
                key = 'veg_4+';
            } else {
                key = `veg_${weekInPhase}`;
            }
            break;
        case 'flower':
            // Flower has weeks 1-6, then 7+
            if (weekInPhase >= 7) {
                key = 'flower_7+';
            } else {
                key = `flower_${weekInPhase}`;
            }
            break;
        default:
            key = 'germination';
    }

    // Look up the target, fallback to basic phase target if not found
    const granularTarget = DLI_TARGETS_GRANULAR[key];
    if (granularTarget) {
        return granularTarget[growType];
    }

    // Fallback to basic DLI_TARGETS
    const basicTarget = DLI_TARGETS[phase];
    return {
        min: basicTarget.min,
        max: basicTarget.max,
        description: `${phase} phase`,
    };
}

/**
 * Get light hours based on phase
 */
export function getLightHours(light: LightSettings, phase: Phase): number {
    return ['flower', 'flush', 'harvest'].includes(phase)
        ? light.flowerHours
        : light.vegHours;
}
