/**
 * The seeded pen (Codex `@rafime/codex/pen`) for the whole app: every Codex
 * edge and hatched shadow is drawn by one hand — the grow variant's
 * (`variantPen('grow')`, tokens.json → variants.grow.pen). The app's own
 * raised elements (buttons, chips, cards, the FAB) get their hatched shadow
 * from the same hand; their face and edge stay CSS (styles.css, "Drawn
 * shadows"). Without JavaScript the CSS hatching of the variant stays.
 */
import '@rafime/codex/pen.css';
import { createPen, type Pen } from '@rafime/codex/pen';
import { variantPen } from '@rafime/codex';

/** The app's pressable, raised elements — the same list styles.css hatches. */
export const APP_SHADOWS = ['.btn-primary', '.btn-secondary:not(.add-plant-btn)', '.save-btn', '.tutorial-next', '.ql-save', '.ql-cancel', '.export-option-btn', '.preset-btn', '.chip', '.plant-chip', '.ql-type', '.quicklog-btn', '.hero-action', '.auto-arrange-btn', '.grow-card', '.fab'].join(',');

export const GROW_PEN = variantPen('grow');

/** Runs the pen over the page; null without a DOM (tests, old browsers). */
export function startPen(root: HTMLElement = document.body): Pen | null {
    if (typeof document === 'undefined' || typeof ResizeObserver === 'undefined') return null;
    return createPen(root, GROW_PEN, { shadows: APP_SHADOWS });
}
