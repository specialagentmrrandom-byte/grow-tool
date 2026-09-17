import { type Grow, type Plant, type TentConfig, POT_SIZES, PLANT_COLORS, potLitersToSideCm } from '../types';

export class TentPlanner {
    private container: HTMLElement;
    private grow: Grow | null = null;
    private onPlantMove: (plantId: string, position: { x: number; y: number }) => void;
    private draggingPlant: Plant | null = null;
    private dragOffset = { x: 0, y: 0 };
    private tentEl: HTMLElement | null = null;

    constructor(
        container: HTMLElement,
        callbacks: {
            onPlantMove: (plantId: string, position: { x: number; y: number }) => void;
        }
    ) {
        this.container = container;
        this.onPlantMove = callbacks.onPlantMove;
        this.setupEvents();
    }

    // Public helper to refresh a single plant's visual size/overflow when pot size changes
    public refreshPlant(plant: Plant): void {
        if (!this.grow || !this.tentEl) return;
        const potEl = this.container.querySelector<HTMLElement>(`[data-plant-id="${plant.id}"]`);
        if (!potEl) return;

        const potLiters = plant.potLiters ?? 11;
        const potSideCm = potLitersToSideCm(potLiters);
        const tent = this.grow.tent!;

        const potWidthPct = (potSideCm / tent.width) * 100;
        const potHeightPct = (potSideCm / tent.depth) * 100;

        potEl.style.width = `${potWidthPct}%`;
        potEl.style.height = `${potHeightPct}%`;

        const sizeSpan = potEl.querySelector<HTMLElement>('.pot-size');
        if (sizeSpan) sizeSpan.textContent = `${potLiters}L`;

        // compute current center position to re-check overflow
        const left = parseFloat(potEl.style.left) || (plant.position?.x ?? 50);
        const top = parseFloat(potEl.style.top) || (plant.position?.y ?? 50);
        this.updateOverflowState(potEl, left, top);
    }

    private setupEvents(): void {
        // Mouse events
        this.container.addEventListener('mousedown', (e) => this.handleDragStart(e));
        document.addEventListener('mousemove', (e) => this.handleDragMove(e));
        document.addEventListener('mouseup', () => this.handleDragEnd());

        // Touch events
        this.container.addEventListener('touchstart', (e) => this.handleDragStart(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.handleDragMove(e), { passive: false });
        document.addEventListener('touchend', () => this.handleDragEnd());

        // Auto-arrange button
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.auto-arrange-btn') && this.grow) {
                this.forceAutoArrange();
            }
        });
    }

    private handleDragStart(e: MouseEvent | TouchEvent): void {
        const target = e.target as HTMLElement;
        const potEl = target.closest<HTMLElement>('.tent-pot');
        if (!potEl || !this.grow) return;

        const plantId = potEl.dataset.plantId!;
        this.draggingPlant = this.grow.plants.find(p => p.id === plantId) ?? null;
        if (!this.draggingPlant) return;

        e.preventDefault();
        potEl.classList.add('dragging');

        const rect = potEl.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        this.dragOffset = {
            x: clientX - rect.left - rect.width / 2,
            y: clientY - rect.top - rect.height / 2
        };
    }

    private handleDragMove(e: MouseEvent | TouchEvent): void {
        if (!this.draggingPlant || !this.tentEl) return;

        e.preventDefault();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        const tentRect = this.tentEl.getBoundingClientRect();
        const x = ((clientX - this.dragOffset.x - tentRect.left) / tentRect.width) * 100;
        const y = ((clientY - this.dragOffset.y - tentRect.top) / tentRect.height) * 100;

        // Update pot position visually
        const potEl = this.container.querySelector<HTMLElement>(`[data-plant-id="${this.draggingPlant.id}"]`);
        if (potEl) {
            potEl.style.left = `${Math.max(0, Math.min(100, x))}%`;
            potEl.style.top = `${Math.max(0, Math.min(100, y))}%`;
            this.updateOverflowState(potEl, x, y);
        }
    }

    private handleDragEnd(): void {
        if (!this.draggingPlant || !this.tentEl) return;

        const potEl = this.container.querySelector<HTMLElement>(`[data-plant-id="${this.draggingPlant.id}"]`);
        if (potEl) {
            potEl.classList.remove('dragging');

            // Get final position
            const left = parseFloat(potEl.style.left);
            const top = parseFloat(potEl.style.top);

            // Persist the position
            this.onPlantMove(this.draggingPlant.id, { x: left, y: top });
        }

        this.draggingPlant = null;
    }

    private updateOverflowState(potEl: HTMLElement, x: number, y: number): void {
        if (!this.grow?.tent) return;

        const plant = this.grow.plants.find(p => p.id === potEl.dataset.plantId);
        if (!plant) return;

        const potLiters = plant.potLiters ?? 11;
        const potSideCm = POT_SIZES[potLiters] ?? 24;
        const tent = this.grow.tent;

        // Calculate pot size as percentage of tent
        const potWidthPct = (potSideCm / tent.width) * 100;
        const potHeightPct = (potSideCm / tent.depth) * 100;

        // Check if pot overflows tent boundaries
        const overflows = (
            x - potWidthPct / 2 < 0 ||
            x + potWidthPct / 2 > 100 ||
            y - potHeightPct / 2 < 0 ||
            y + potHeightPct / 2 > 100
        );

        potEl.classList.toggle('overflow', overflows);
    }

    render(grow: Grow): void {
        this.grow = grow;

        if (!grow.tent) {
            this.container.innerHTML = '';
            return;
        }

        const tent = grow.tent;
        const aspectRatio = tent.width / tent.depth;

        // Auto-arrange plants without positions
        this.autoArrangePlants(grow);

        const html = `
            <div class="tent-planner">
                <div class="tent-header">
                    <div class="tent-header-actions">
                        <button class="auto-arrange-btn" title="Auto arrange pots">⚡ Arrange</button>
                        <span class="tent-dimensions">${tent.width}×${tent.depth}cm</span>
                    </div>
                </div>
                <div class="tent-view" style="aspect-ratio: ${aspectRatio};">
                    <div class="tent-outline" id="tent-outline">
                        ${grow.plants.map((plant, index) => this.renderPot(plant, index, tent)).join('')}
                    </div>
                    <div class="tent-grid"></div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.tentEl = this.container.querySelector('#tent-outline');

        // Update overflow states for all pots
        grow.plants.forEach(plant => {
            const potEl = this.container.querySelector<HTMLElement>(`[data-plant-id="${plant.id}"]`);
            if (potEl && plant.position) {
                this.updateOverflowState(potEl, plant.position.x, plant.position.y);
            }
        });
    }

    private forceAutoArrange(): void {
        if (!this.grow) return;
        // Clear all positions to force re-arrangement
        this.grow.plants.forEach(plant => {
            plant.position = undefined;
        });
        // Re-render with new positions
        this.render(this.grow);
    }

    private autoArrangePlants(grow: Grow): void {
        const plantsToArrange = grow.plants.filter(p => !p.position);
        if (plantsToArrange.length === 0) return;

        const tent = grow.tent;
        if (!tent) return;

        // Calculate pot dimensions as percentage of tent
        const getPotSize = (plant: Plant) => {
            const potLiters = plant.potLiters ?? 11;
            const potSideCm = potLitersToSideCm(potLiters);
            return {
                w: (potSideCm / tent.width) * 100,
                h: (potSideCm / tent.depth) * 100
            };
        };

        // Get all plants with their sizes
        const allPots = grow.plants.map(p => ({
            plant: p,
            ...getPotSize(p),
            needsPlacement: !p.position
        }));

        // Sort by size (largest first) for better bin packing
        const potsToPlace = allPots.filter(p => p.needsPlacement);
        potsToPlace.sort((a, b) => (b.w * b.h) - (a.w * a.h));

        // Shuffle with bias toward size order (mix it up but keep large ones early)
        for (let i = 0; i < potsToPlace.length - 1; i++) {
            if (Math.random() < 0.3) { // 30% chance to swap with a random later element
                const j = i + Math.floor(Math.random() * (potsToPlace.length - i));
                [potsToPlace[i], potsToPlace[j]] = [potsToPlace[j], potsToPlace[i]];
            }
        }

        // Minimal gap between pots (percentage) - just enough to see separation
        const gap = 2;

        // Edge margin
        const edgeMargin = 2;

        // Track placed pots (using top-left corner + dimensions for clarity)
        const placed: { left: number; top: number; right: number; bottom: number }[] = [];

        // Check collision with gap
        const collides = (left: number, top: number, right: number, bottom: number): boolean => {
            for (const p of placed) {
                const noOverlap = right + gap <= p.left ||
                    left >= p.right + gap ||
                    bottom + gap <= p.top ||
                    top >= p.bottom + gap;
                if (!noOverlap) return true;
            }
            return false;
        };

        // Check bounds
        const inBounds = (left: number, top: number, right: number, bottom: number): boolean => {
            return left >= edgeMargin && right <= 100 - edgeMargin &&
                top >= edgeMargin && bottom <= 100 - edgeMargin;
        };

        // Bottom-Left bin packing: find the first valid position scanning top-to-bottom, left-to-right
        const findBestPosition = (w: number, h: number): { x: number; y: number } | null => {
            const step = 2; // Fine-grained search for tight packing

            // Scan from top to bottom, left to right
            for (let top = edgeMargin; top <= 100 - edgeMargin - h; top += step) {
                for (let left = edgeMargin; left <= 100 - edgeMargin - w; left += step) {
                    const right = left + w;
                    const bottom = top + h;

                    if (inBounds(left, top, right, bottom) && !collides(left, top, right, bottom)) {
                        // Found a valid position - return immediately (greedy top-left placement)
                        return {
                            x: left + w / 2, // Convert back to center
                            y: top + h / 2
                        };
                    }
                }
            }

            return null;
        };

        // Place each pot
        potsToPlace.forEach((pot) => {
            const pos = findBestPosition(pot.w, pot.h);

            if (pos) {
                pot.plant.position = { x: pos.x, y: pos.y };
                placed.push({
                    left: pos.x - pot.w / 2,
                    top: pos.y - pot.h / 2,
                    right: pos.x + pot.w / 2,
                    bottom: pos.y + pot.h / 2
                });
            } else {
                // Fallback: center (shouldn't happen with reasonable plant counts)
                pot.plant.position = { x: 50, y: 50 };
            }

            this.onPlantMove(pot.plant.id, pot.plant.position);
        });
    }

    private renderPot(plant: Plant, index: number, tent: TentConfig): string {
        const position = plant.position ?? { x: 50, y: 50 };
        const potLiters = plant.potLiters ?? 11;
        const potSideCm = potLitersToSideCm(potLiters);

        // Calculate pot size as percentage of tent
        const potWidthPct = (potSideCm / tent.width) * 100;
        const potHeightPct = (potSideCm / tent.depth) * 100;

        const color = PLANT_COLORS[index % PLANT_COLORS.length];

        return `
            <div class="tent-pot" 
                 data-plant-id="${this.escapeHtml(plant.id)}"
                 style="
                     left: ${position.x}%;
                     top: ${position.y}%;
                     width: ${potWidthPct}%;
                     height: ${potHeightPct}%;
                     background: ${color};
                 ">
                <span class="pot-number">#${plant.potNumber}</span>
                <span class="pot-name">${this.escapeHtml(plant.name)}</span>
                <span class="pot-size">${potLiters}L</span>
            </div>
        `;
    }

    /** Plant names and ids are user input — never drop them into HTML raw. */
    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }
}
