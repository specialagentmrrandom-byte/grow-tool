import { type Grow } from '../types';
import { TentPlanner } from './TentPlanner';

export class TentLayoutModal {
    private container: HTMLElement;
    private onClose: () => void;
    private tentPlanner: TentPlanner | null = null;

    constructor(container: HTMLElement, onClose: () => void) {
        this.container = container;
        this.onClose = onClose;
    }

    private setupEvents(): void {
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            if (target.closest('.modal-close')) {
                e.stopPropagation();
                this.close();
            }

            if (target.classList.contains('modal-overlay')) {
                e.stopPropagation();
                this.close();
            }
        });
    }

    render(grow: Grow, onPlantMove: (plantId: string, position: { x: number; y: number }) => void): void {
        const modalHtml = `
            <div class="modal-overlay">
                <div class="modal modal-large">
                    <header class="modal-header modal-header-compact">
                        <h3>🏕️ Tent Layout</h3>
                        <button class="modal-close icon-btn">×</button>
                    </header>
                    <div class="modal-body">
                        <div id="tent-layout-planner"></div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = modalHtml;
        this.setupEvents();

        // Initialize TentPlanner inside the modal
        const plannerEl = this.container.querySelector('#tent-layout-planner') as HTMLElement;
        this.tentPlanner = new TentPlanner(plannerEl, {
            onPlantMove: onPlantMove,
        });
        this.tentPlanner.render(grow);
    }

    close(): void {
        this.container.innerHTML = '';
        this.onClose();
    }
}