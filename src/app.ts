import { type Grow, type Entry, type EntryType, getGrowColor } from './types';
import { store } from './store';
import { Timeline } from './timeline';
import { Dashboard, GrowForm, EntryForm, ExportModal, GalleryModal, DLICalculatorModal, TentLayoutModal, ReminderBar, QuickLogSheet } from './components/index';
import { getPhaseInfo, getDLITarget, formatPhase } from './dli';
import { iconSvg, LOG_TYPE_META, type LogType } from './icons';
import { PHASE_COLORS } from './types';
import { showError, showWarning, showSuccess } from './toast';

/**
 * Main application controller
 */
export class App {
    private appEl: HTMLElement;
    private modalEl: HTMLElement;
    private growModalEl: HTMLElement;
    private currentGrow: Grow | null = null;

    // Components
    private dashboard: Dashboard | null = null;
    private growForm: GrowForm | null = null;
    private entryForm: EntryForm | null = null;
    private timeline: Timeline | null = null;
    private tentLayoutModal: TentLayoutModal | null = null;
    private exportModal: ExportModal | null = null;
    private galleryModal: GalleryModal | null = null;
    private dliCalculatorModal: DLICalculatorModal | null = null;
    private reminderBar: ReminderBar | null = null;
    private quickLogSheet: QuickLogSheet | null = null;

    // Event listener cleanup
    private growViewCleanup: (() => void) | null = null;
    private storageEventCleanup: (() => void) | null = null;
    private reminderCheckInterval: number | null = null;
    private themeWatcherCleanup: (() => void) | null = null;

    constructor(appSelector: string = '#app', modalSelector: string = '#modal') {
        this.appEl = document.querySelector(appSelector)!;
        this.modalEl = document.querySelector(modalSelector)!;

        // Dedicated container for the grow detail popup — lives in <body> so it
        // floats above the dashboard (#app) and below the entry/other modals
        // (#modal), and survives #app re-renders.
        let growModalContainer = document.getElementById('grow-modal');
        if (!growModalContainer) {
            growModalContainer = document.createElement('div');
            growModalContainer.id = 'grow-modal';
            document.body.appendChild(growModalContainer);
        }
        this.growModalEl = growModalContainer;

        // Initialize components
        this.initComponents();

        // Set up storage event listener for save errors
        this.setupStorageEvents();

        // Set up periodic reminder checking (every minute)
        this.setupReminderChecking();

        // Set up theme watcher for cross-tab sync
        this.setupThemeWatcher();

        // Handle browser navigation
        window.addEventListener('popstate', () => this.handleRoute());

        // Initial route
        this.handleRoute();
    }

    private setupReminderChecking(): void {
        // Check reminders immediately
        this.renderReminders();

        // Check reminders every 5 minutes
        this.reminderCheckInterval = window.setInterval(() => {
            this.renderReminders();
        }, 300000); // 5 minutes
    }

    private setupStorageEvents(): void {
        this.storageEventCleanup = store.onStorageEvent((event) => {
            switch (event.type) {
                case 'save-error':
                    showError(event.message, event.details);
                    break;
                case 'quota-critical':
                    showError(event.message, event.details);
                    break;
                case 'quota-warning':
                    showWarning(event.message, event.details);
                    break;
            }
        });
    }

    /** Clean up event listeners when app is destroyed */
    public destroy(): void {
        if (this.storageEventCleanup) {
            this.storageEventCleanup();
            this.storageEventCleanup = null;
        }
        if (this.growViewCleanup) {
            this.growViewCleanup();
            this.growViewCleanup = null;
        }
        if (this.themeWatcherCleanup) {
            this.themeWatcherCleanup();
            this.themeWatcherCleanup = null;
        }
    }

    private initComponents(): void {
        // Dashboard
        this.dashboard = new Dashboard(this.appEl, {
            onGrowSelect: (grow) => this.showGrow(grow),
            onNewGrow: () => this.showNewGrow(),
            onSettings: () => this.showSettings(),
            onDuplicate: (grow) => this.duplicateGrow(grow),
            onDelete: (grow) => this.deleteGrow(grow),
            onQuickLog: (grow, type) => this.quickLog(grow, type),
            onOpenSheet: (grow) => this.openQuickLogSheet(grow),
            onTaskDone: (growId, entryId) => {
                store.markReminderDone(growId, entryId);
                this.dashboard?.render();
                this.renderReminders();
            },
        });

        // Quick-log bottom sheet — its own container in body so it floats above views
        let sheetContainer = document.getElementById('sheet-container');
        if (!sheetContainer) {
            sheetContainer = document.createElement('div');
            sheetContainer.id = 'sheet-container';
            document.body.appendChild(sheetContainer);
        }
        this.quickLogSheet = new QuickLogSheet(sheetContainer, {
            onSaved: () => {
                // Refresh whichever view is showing
                if (this.currentGrow) {
                    this.refreshGrow();
                } else {
                    this.dashboard?.render();
                }
                this.renderReminders();
            },
        });

        // Grow form
        this.growForm = new GrowForm(this.appEl, {
            onSave: (grow) => this.showGrow(grow),
            onCancel: () => this.showDashboard(),
        });

        // Export modal
        this.exportModal = new ExportModal(this.modalEl, () => this.closeModal());

        // Gallery modal
        this.galleryModal = new GalleryModal(this.modalEl, () => this.closeModal());

        // DLI Calculator modal
        this.dliCalculatorModal = new DLICalculatorModal(this.modalEl, () => this.closeModal());

        // Tent Layout modal
        this.tentLayoutModal = new TentLayoutModal(this.modalEl, () => this.closeModal());

        // Reminder bar - create container in body (not in #app which gets cleared)
        let reminderContainer = document.getElementById('reminder-container');
        if (!reminderContainer) {
            reminderContainer = document.createElement('div');
            reminderContainer.id = 'reminder-container';
            document.body.appendChild(reminderContainer);
        }
        this.reminderBar = new ReminderBar(reminderContainer, {
            onDismiss: (growId, entryId) => {
                store.dismissReminder(growId, entryId);
                this.renderReminders();
            },
            onDone: (growId, entryId) => {
                store.markReminderDone(growId, entryId);
                this.renderReminders();
            },
            onViewEntry: (growId, entryId) => {
                const grow = store.getGrow(growId);
                if (grow) {
                    this.showGrow(grow);
                    // Scroll to the entry date after a brief delay
                    setTimeout(() => {
                        const entry = grow.entries.find(e => e.id === entryId);
                        if (entry) {
                            const dayEl = document.querySelector(`[data-date="${entry.date}"]`);
                            if (dayEl) {
                                dayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }
                    }, 300);
                }
            }
        });
    }

    private handleRoute(): void {
        const hash = window.location.hash.slice(1) || '/';
        const [path, id] = hash.split('/').filter(Boolean);

        // Clean up tutorial when navigating away from new grow form
        if (path !== 'new' && this.growForm) {
            this.growForm.cleanupTutorial();
        }

        switch (path) {
            case 'grow':
                if (id) {
                    const grow = store.getGrow(id);
                    if (grow) {
                        this.showGrow(grow, false);
                        return;
                    }
                }
                this.showDashboard(false);
                break;
            case 'new':
                this.showNewGrow(false);
                break;
            default:
                this.showDashboard(false);
        }
    }

    private navigate(hash: string, pushState = true): void {
        if (pushState) {
            window.history.pushState(null, '', `#${hash}`);
        }
    }

    // === Views ===

    showDashboard(pushState = true): void {
        // Clean up grow view listeners if coming from grow view
        if (this.growViewCleanup) {
            this.growViewCleanup();
            this.growViewCleanup = null;
        }
        this.closeGrowModal();
        this.currentGrow = null;
        this.navigate('/', pushState);
        this.dashboard!.render();
        this.renderReminders();
    }

    cleanup(): void {
        // Clear reminder check interval
        if (this.reminderCheckInterval !== null) {
            window.clearInterval(this.reminderCheckInterval);
            this.reminderCheckInterval = null;
        }
        // Clear storage event listener
        if (this.storageEventCleanup) {
            this.storageEventCleanup();
            this.storageEventCleanup = null;
        }
        // Clear grow view cleanup
        if (this.growViewCleanup) {
            this.growViewCleanup();
            this.growViewCleanup = null;
        }
        // Clear theme watcher
        if (this.themeWatcherCleanup) {
            this.themeWatcherCleanup();
            this.themeWatcherCleanup = null;
        }
    }

    private renderReminders(): void {
        if (this.reminderBar) {
            const reminders = store.getActiveReminders();
            this.reminderBar.render(reminders);
        }
    }

    showGrow(grow: Grow, pushState = true): void {
        this.currentGrow = grow;
        this.navigate(`grow/${grow.id}`, pushState);
        // The dashboard is the backdrop behind the popup — make sure it's there
        // (e.g. on a deep-link, or coming from the new/edit grow form).
        this.dashboard!.render();
        this.renderGrowView(grow);
    }

    showNewGrow(pushState = true): void {
        // Clean up grow view listeners if coming from grow view
        if (this.growViewCleanup) {
            this.growViewCleanup();
            this.growViewCleanup = null;
        }
        this.closeGrowModal();
        this.navigate('new', pushState);
        this.growForm!.render();
        this.renderReminders();
    }

    showEditGrow(grow: Grow): void {
        // Clean up grow view listeners
        if (this.growViewCleanup) {
            this.growViewCleanup();
            this.growViewCleanup = null;
        }
        // Close the detail popup so the edit form (rendered into #app) is visible
        this.closeGrowModal();
        this.growForm!.render(grow);
        this.renderReminders();
    }

    // === Quick logging ===

    /** One-tap log from a card chip or the detail quick-log row. */
    private quickLog(grow: Grow, type: EntryType): void {
        const titles: Partial<Record<EntryType, string>> = {
            watering: 'Watered',
            feeding: 'Fed',
            note: 'Note',
            milestone: 'Logged',
        };
        store.addEntry(grow.id, {
            date: new Date().toISOString().split('T')[0],
            type,
            title: titles[type] ?? 'Logged',
        });
        showSuccess(`${titles[type] ?? 'Logged'} · ${grow.strain}`);
        if (this.currentGrow && this.currentGrow.id === grow.id) {
            this.refreshGrow();
        } else {
            this.dashboard?.render();
        }
        this.renderReminders();
    }

    private openQuickLogSheet(grow: Grow): void {
        this.quickLogSheet?.open(grow);
    }

    // === Grow View ===

    /** Tear down the grow detail popup and release the background scroll-lock. */
    private closeGrowModal(): void {
        this.growModalEl.innerHTML = '';
        document.body.classList.remove('grow-popup-open');
    }

    private renderGrowView(grow: Grow): void {
        // Clean up previous grow view event listeners
        if (this.growViewCleanup) {
            this.growViewCleanup();
            this.growViewCleanup = null;
        }

        const info = getPhaseInfo(grow);
        const dliTarget = getDLITarget(grow);
        const growColor = getGrowColor(grow.id);
        const phaseColor = PHASE_COLORS[info.phase];
        const stageLabel = formatPhase(info.phase);

        // Fourth stat: days-to-harvest when known, otherwise the DLI target.
        const fourthStat = info.daysUntilHarvest !== undefined
            ? { value: `${info.daysUntilHarvest}<span class="ds-unit">d</span>`, label: 'To harvest' }
            : { value: `${dliTarget.min}<span class="ds-unit">–${dliTarget.max}</span>`, label: 'DLI target' };

        const quickRowTypes: LogType[] = ['water', 'feed', 'prune', 'photo', 'note', 'measure'];
        const quickRow = quickRowTypes.map((t) => `
          <button class="quicklog-btn" data-ql-open data-type="${t}">
            <span class="ql-row-icon" style="--type-color: var(${LOG_TYPE_META[t].colorVar});">${iconSvg(t, 18)}</span>
            <span class="ql-row-label">${LOG_TYPE_META[t].label}</span>
          </button>
        `).join('');

        const html = `
      <div class="modal-overlay grow-overlay">
      <div class="modal modal-grow" role="dialog" aria-modal="true" aria-labelledby="grow-popup-title">
      <div class="grow-view" style="--grow-color: ${growColor}; --phase-color: ${phaseColor}">
        <div class="grow-hero">
          <div class="grow-hero-overlay"></div>
          <button class="hero-back" data-action="back" aria-label="Close">‹</button>
          <div class="hero-actions">
            <button class="hero-action" data-action="gallery" title="Watch grow">🖼️</button>
            <button class="hero-action" data-action="export" title="Share">📤</button>
            <button class="hero-action" data-action="tent-layout" title="Tent layout">🏕️</button>
            <button class="hero-action" data-action="edit" title="Edit">✏️</button>
          </div>
          <div class="hero-caption">
            <div class="hero-titlerow">
              <span class="hero-name" id="grow-popup-title">${this.escapeHtml(grow.strain)}</span>
              <span class="phase-badge" style="--phase-color: ${phaseColor}">${stageLabel}</span>
            </div>
            <div class="hero-strain">${this.escapeHtml(grow.name)}</div>
          </div>
        </div>

        <div class="grow-body">
          <div class="grow-controls">
            <div class="detail-stats">
              <div class="detail-stat"><div class="ds-value">${info.day}</div><div class="ds-label">Day</div></div>
              <div class="detail-stat"><div class="ds-value">${stageLabel}</div><div class="ds-label">Stage</div></div>
              <div class="detail-stat"><div class="ds-value">${grow.plantCount}</div><div class="ds-label">Plants</div></div>
              <div class="detail-stat"><div class="ds-value">${fourthStat.value}</div><div class="ds-label">${fourthStat.label}</div></div>
            </div>

            <div class="section-label">Quick log</div>
            <div class="quicklog-row" data-scroll>${quickRow}</div>

            <button class="detail-log-btn" data-action="log-sheet">+ Log a detailed entry</button>
          </div>

          <div class="timeline-container" id="timeline"></div>
        </div>
      </div>
      </div>
      </div>
    `;

        this.growModalEl.innerHTML = html;

        // Lock the dashboard behind the popup so it doesn't scroll through, and
        // move focus into the dialog for keyboard users.
        document.body.classList.add('grow-popup-open');
        requestAnimationFrame(() => {
            (this.growModalEl.querySelector('.hero-back') as HTMLElement | null)?.focus();
        });

        // Render reminders (container is in body, not affected by innerHTML)
        this.renderReminders();

        // Setup timeline
        const timelineEl = this.growModalEl.querySelector('#timeline') as HTMLElement;
        this.timeline = new Timeline(timelineEl, {
            onDayClick: (date, _day) => this.showEntryForm(grow, date),
            onEntryClick: (entry) => this.showEntryForm(grow, new Date(entry.date), entry),
            onEntryDelete: (entry) => this.deleteEntry(grow.id, entry),
        });
        this.timeline.render(grow);

        // Setup entry form only once (reuse across grow views)
        if (!this.entryForm) {
            this.entryForm = new EntryForm(this.modalEl, {
                onSave: () => this.refreshGrow(),
                onCancel: () => this.closeEntryForm(),
            });
        }

        // Setup event listeners
        this.growViewCleanup = this.setupGrowViewEvents(grow);
    }

    private setupGrowViewEvents(grow: Grow): () => void {
        // Header actions handler
        const headerClickHandler = (e: Event) => {
            const target = e.target as HTMLElement;

            // Click on the dimmed overlay (outside the panel) closes the popup
            if (target.classList.contains('grow-overlay')) {
                this.showDashboard();
                return;
            }

            const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;

            switch (action) {
                case 'back':
                    this.showDashboard();
                    break;
                case 'gallery':
                    // Use currentGrow to get fresh data with any new photos
                    if (this.currentGrow) {
                        this.showGallery(this.currentGrow);
                    }
                    break;
                case 'edit':
                    if (this.currentGrow) {
                        this.showEditGrow(this.currentGrow);
                    }
                    break;
                case 'export':
                    this.showExport(grow.id);
                    break;
                case 'tent-layout':
                    this.showTentLayout(grow);
                    break;
                case 'log-sheet':
                    this.openQuickLogSheet(grow);
                    break;
            }

            // Quick-log row → open the sheet with the tapped type preselected
            const qlOpen = target.closest<HTMLElement>('[data-ql-open]');
            if (qlOpen) {
                this.quickLogSheet?.open(grow, qlOpen.dataset.type as LogType);
            }
        };

        this.growModalEl.addEventListener('click', headerClickHandler);

        // Keyboard handling for the popup. Defer entirely when another modal
        // (entry form, gallery, …) is stacked on top — it owns the keyboard.
        const keyHandler = (e: KeyboardEvent) => {
            if (this.modalEl.childElementCount > 0) return;

            if (e.key === 'Escape') {
                this.showDashboard();
                return;
            }

            // Trap Tab focus within the dialog.
            if (e.key === 'Tab') {
                const focusables = Array.from(
                    this.growModalEl.querySelectorAll<HTMLElement>(
                        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                    )
                ).filter((el) => el.offsetParent !== null);
                if (focusables.length === 0) return;

                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                const active = document.activeElement as HTMLElement;

                if (!this.growModalEl.contains(active)) {
                    e.preventDefault();
                    first.focus();
                } else if (e.shiftKey && active === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && active === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', keyHandler);

        // Return cleanup function
        return () => {
            this.growModalEl.removeEventListener('click', headerClickHandler);
            document.removeEventListener('keydown', keyHandler);
        };
    }

    private showEntryForm(grow: Grow, date: Date, entry?: Entry): void {
        this.entryForm!.render(grow, date.toISOString().split('T')[0], entry);
    }

    private closeEntryForm(): void {
        this.entryForm?.close();
    }

    private deleteEntry(growId: string, entry: Entry): void {
        if (confirm(`Delete entry "${entry.title}"?`)) {
            store.deleteEntry(growId, entry.id);
            this.refreshGrow();
        }
    }

    private refreshGrow(): void {
        if (this.currentGrow) {
            const grow = store.getGrow(this.currentGrow.id);
            if (grow) {
                this.currentGrow = grow;
                this.closeEntryForm();
                this.timeline?.render(grow);
            }
        }
    }

    private updateGrowViewThemeIcon(): void {
        const icon = this.appEl.querySelector('.theme-icon');
        if (icon) {
            import('./theme').then(({ getCurrentTheme }) => {
                const theme = getCurrentTheme();
                icon.textContent = theme === 'light' ? '🌙' : '☀️';
            });
        }
    }

    private setupThemeWatcher(): void {
        // Clean up previous listeners if they exist
        if (this.themeWatcherCleanup) {
            this.themeWatcherCleanup();
        }

        // Listen for theme changes (from other tabs or custom events)
        const handleThemeChange = () => {
            this.updateGrowViewThemeIcon();
        };

        const storageHandler = (e: StorageEvent) => {
            if (e.key === 'og-grow-theme') {
                import('./theme').then(({ applyTheme }) => {
                    const theme = e.newValue as 'light' | 'dark';
                    if (theme) {
                        applyTheme(theme);
                        handleThemeChange();
                    }
                });
            }
        };

        window.addEventListener('storage', storageHandler);
        window.addEventListener('themechange', handleThemeChange);

        // Store cleanup function
        this.themeWatcherCleanup = () => {
            window.removeEventListener('storage', storageHandler);
            window.removeEventListener('themechange', handleThemeChange);
        };
    }

    // === Modals ===

    showGallery(grow: Grow): void {
        this.galleryModal!.render(grow);
    }

    showExport(growId: string): void {
        this.exportModal!.renderExport(growId);
    }

    showSettings(): void {
        this.exportModal!.renderSettings();
    }

    showDLICalculator(callback?: (dli: number) => void): void {
        if (callback) {
            this.dliCalculatorModal!.setUseValueCallback(callback);
        }
        this.dliCalculatorModal!.render();
    }

    showTentLayout(grow: Grow): void {
        this.tentLayoutModal!.render(grow, (plantId, position) => {
            // Update plant position in store
            const updatedPlants = grow.plants.map(p =>
                p.id === plantId ? { ...p, position } : p
            );
            store.updateGrow(grow.id, { plants: updatedPlants });
        });
    }

    closeModal(): void {
        this.exportModal!.close();
    }

    // === Grow Actions ===

    private duplicateGrow(grow: Grow): void {
        const duplicated = store.duplicateGrow(grow.id);
        if (duplicated) {
            // Stay on dashboard and refresh to show the new grow
            this.dashboard!.render();
        }
    }

    private deleteGrow(grow: Grow): void {
        if (confirm(`Delete "${grow.strain}"? This cannot be undone.`)) {
            store.deleteGrow(grow.id);
            this.dashboard!.render();
        }
    }

    // === Utils ===

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
