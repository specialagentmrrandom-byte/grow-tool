import { type Grow, type EntryType, PHASE_COLORS } from '../types';
import { store } from '../store';
import { getPhaseInfo, formatPhase } from '../dli';
import { OVERGROW_URL } from '../overgrow';
import { iconSvg, entryTypeToLog, LOG_TYPE_META, type LogType } from '../icons';

/**
 * Dashboard component - the "Home" screen: a list of grows with a Today's tasks
 * strip and per-card quick-log chips. Restyled after the Grow Diary concept but
 * built on the app's existing palette + tokens so dark mode keeps working.
 */
export class Dashboard {
  private container: HTMLElement;
  private onGrowSelect: (grow: Grow) => void;
  private onNewGrow: () => void;
  private onSettings: () => void;
  private onDuplicate: (grow: Grow) => void;
  private onDelete: (grow: Grow) => void;
  private onQuickLog: (grow: Grow, type: EntryType) => void;
  private onOpenSheet: (grow: Grow) => void;
  private onTaskDone: (growId: string, entryId: string) => void;

  constructor(
    container: HTMLElement,
    callbacks: {
      onGrowSelect: (grow: Grow) => void;
      onNewGrow: () => void;
      onSettings: () => void;
      onDuplicate: (grow: Grow) => void;
      onDelete: (grow: Grow) => void;
      onQuickLog: (grow: Grow, type: EntryType) => void;
      onOpenSheet: (grow: Grow) => void;
      onTaskDone: (growId: string, entryId: string) => void;
    }
  ) {
    this.container = container;
    this.onGrowSelect = callbacks.onGrowSelect;
    this.onNewGrow = callbacks.onNewGrow;
    this.onSettings = callbacks.onSettings;
    this.onDuplicate = callbacks.onDuplicate;
    this.onDelete = callbacks.onDelete;
    this.onQuickLog = callbacks.onQuickLog;
    this.onOpenSheet = callbacks.onOpenSheet;
    this.onTaskDone = callbacks.onTaskDone;
    this.setupEvents();
  }

  private setupEvents(): void {
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Duplicate button — check first to prevent card open
      const duplicateBtn = target.closest<HTMLElement>('[data-duplicate-id]');
      if (duplicateBtn) {
        e.preventDefault();
        e.stopPropagation();
        const grow = store.getGrow(duplicateBtn.dataset.duplicateId!);
        if (grow) this.onDuplicate(grow);
        return;
      }

      // Delete button
      const deleteBtn = target.closest<HTMLElement>('[data-delete-id]');
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const grow = store.getGrow(deleteBtn.dataset.deleteId!);
        if (grow) this.onDelete(grow);
        return;
      }

      // Quick chips: water / feed / open sheet
      const waterBtn = target.closest<HTMLElement>('[data-water-id]');
      if (waterBtn) {
        e.stopPropagation();
        const grow = store.getGrow(waterBtn.dataset.waterId!);
        if (grow) this.onQuickLog(grow, 'watering');
        return;
      }
      const feedBtn = target.closest<HTMLElement>('[data-feed-id]');
      if (feedBtn) {
        e.stopPropagation();
        const grow = store.getGrow(feedBtn.dataset.feedId!);
        if (grow) this.onQuickLog(grow, 'feeding');
        return;
      }
      const sheetBtn = target.closest<HTMLElement>('[data-sheet-id]');
      if (sheetBtn) {
        e.stopPropagation();
        const grow = store.getGrow(sheetBtn.dataset.sheetId!);
        if (grow) this.onOpenSheet(grow);
        return;
      }

      // Today's task: Done / open
      const taskDone = target.closest<HTMLElement>('[data-task-done]');
      if (taskDone) {
        e.stopPropagation();
        this.onTaskDone(taskDone.dataset.growId!, taskDone.dataset.entryId!);
        return;
      }
      const taskOpen = target.closest<HTMLElement>('[data-task-open]');
      if (taskOpen) {
        const grow = store.getGrow(taskOpen.dataset.taskOpen!);
        if (grow) this.onGrowSelect(grow);
        return;
      }

      // Grow card open
      const growCard = target.closest<HTMLElement>('[data-grow-id]');
      if (growCard) {
        const grow = store.getGrow(growCard.dataset.growId!);
        if (grow) this.onGrowSelect(grow);
        return;
      }

      if (target.closest('.new-grow-btn')) {
        this.onNewGrow();
        return;
      }
      if (target.closest('.settings-btn')) {
        this.onSettings();
        return;
      }
      if (target.closest('.theme-toggle')) {
        import('../theme').then(({ toggleTheme }) => {
          toggleTheme();
          this.updateThemeIcon();
        });
      }
    });
  }

  private updateThemeIcon(): void {
    const icon = this.container.querySelector('.theme-icon');
    if (icon) {
      import('../theme').then(({ getCurrentTheme }) => {
        icon.textContent = getCurrentTheme() === 'light' ? '🌙' : '☀️';
      });
    }
  }

  render(): void {
    const grows = store.getGrows();
    const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    let html = `
      <header class="dash-header">
        <div class="dash-heading">
          <h1>Your grows</h1>
          <div class="dash-subtitle">${todayDate} · ${grows.length} ${grows.length === 1 ? 'grow' : 'grows'}</div>
        </div>
        <div class="header-actions">
          <button class="theme-toggle icon-btn" title="Toggle theme"><span class="theme-icon"></span></button>
          <button class="icon-btn settings-btn" title="Settings"><span class="action-icon">⚙️</span></button>
        </div>
      </header>
    `;

    if (grows.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-icon">🌱</div>
          <h2>Welcome to OG Grow Journal</h2>
          <p>Track your cannabis grow from seed to harvest</p>
          <div class="quick-start">
            <div class="quick-start-item"><span class="quick-start-icon">📅</span><span class="quick-start-text">Daily diary with photos</span></div>
            <div class="quick-start-item"><span class="quick-start-icon">🏕️</span><span class="quick-start-text">Visual tent planning</span></div>
            <div class="quick-start-item"><span class="quick-start-icon">📊</span><span class="quick-start-text">Smart light optimization</span></div>
          </div>
          <button class="btn btn-primary new-grow-btn" style="margin-top: var(--space-xl);"><span>🚀 Start Your First Grow</span></button>
        </div>
      `;
    } else {
      html += this.renderTodayStrip();
      html += '<div class="grow-cards">';
      for (const grow of grows) html += this.renderGrowCard(grow);
      html += '</div>';
      html += `
        <div class="fab-container">
          <button class="fab new-grow-btn" title="New Grow"><span>+</span></button>
        </div>
      `;
    }

    html += `
      <footer class="dashboard-footer">
        <span>Part of the</span>
        <a href="${OVERGROW_URL}" target="_blank" rel="noopener">🌳 Overgrow</a>
        <span>growing community</span>
      </footer>
    `;

    this.container.innerHTML = html;
    this.updateThemeIcon();
  }

  /** "Today's tasks" strip, built from active reminders across all grows. */
  private renderTodayStrip(): string {
    const tasks = store.getActiveReminders();
    const count = tasks.length;
    const badgeLabel = count > 0 ? `${count} due` : 'clear';
    const badgeClass = count > 0 ? 'task-badge-due' : 'task-badge-clear';

    let body: string;
    if (count === 0) {
      body = `
        <div class="today-empty">
          <span class="today-check">✓</span>
          <span>All caught up — nice work.</span>
        </div>
      `;
    } else {
      body = '<div class="today-tasks">';
      for (const t of tasks) {
        const meta = LOG_TYPE_META.reminder;
        body += `
          <div class="today-task" data-task-open="${t.growId}">
            <span class="task-icon" style="--type-color: var(${meta.colorVar});">${iconSvg('reminder', 16)}</span>
            <div class="task-text">
              <div class="task-action">${this.escapeHtml(t.title)}</div>
              <div class="task-grow">${this.escapeHtml(t.growName)}</div>
            </div>
            <button class="task-done" data-task-done data-grow-id="${t.growId}" data-entry-id="${t.id}">Done</button>
          </div>
        `;
      }
      body += '</div>';
    }

    return `
      <section class="today-strip">
        <div class="today-head">
          <span class="today-label">Today's tasks</span>
          <span class="task-badge ${badgeClass}">${badgeLabel}</span>
        </div>
        ${body}
      </section>
    `;
  }

  private renderGrowCard(grow: Grow): string {
    const info = getPhaseInfo(grow);
    const phaseColor = PHASE_COLORS[info.phase];
    const last = grow.entries[0];
    const reminders = store.getActiveReminders(grow.id);
    const due = reminders[0];
    const health = this.deriveHealth(grow);
    const healthVar = health === 'Healthy' ? '--color-primary' : '--color-flush';

    const lastLog: LogType = last ? entryTypeToLog(last.type) : 'note';
    const lastLabel = last
      ? `${this.escapeHtml(last.title)} · ${this.relativeTime(last.date)}`
      : 'No entries yet';

    return `
      <article class="grow-card" style="--phase-color: ${phaseColor};">
        <div class="grow-card-tools">
          <button class="grow-card-tool" data-duplicate-id="${grow.id}" title="Duplicate">📋</button>
          <button class="grow-card-tool grow-card-tool-danger" data-delete-id="${grow.id}" title="Delete">🗑️</button>
        </div>
        <div class="grow-card-main" data-grow-id="${grow.id}">
          <div class="grow-thumb" aria-hidden="true">
            <span class="grow-thumb-day">Day ${info.day}</span>
          </div>
          <div class="grow-card-info">
            <div class="grow-card-titlerow">
              <span class="grow-card-name">${this.escapeHtml(grow.strain)}</span>
              <span class="phase-badge" style="--phase-color: ${phaseColor};">${formatPhase(info.phase)}</span>
            </div>
            <div class="grow-card-strain">${this.escapeHtml(grow.name)}</div>
            <div class="grow-card-meta">
              <span class="meta-day">Day ${info.day}</span>
              <span class="meta-sep">·</span>
              <span class="meta-health" style="--health-color: var(${healthVar});">
                <span class="health-dot"></span>${health}
              </span>
            </div>
            <div class="grow-card-last">
              <span class="last-icon" style="--type-color: var(${LOG_TYPE_META[lastLog].colorVar});">${iconSvg(lastLog, 15)}</span>
              <span class="last-label">${lastLabel}</span>
            </div>
            ${due ? `<div class="due-pill"><span class="due-dot"></span>${this.escapeHtml(due.title)} due</div>` : ''}
          </div>
        </div>
        <div class="grow-card-chips">
          <button class="chip" data-water-id="${grow.id}"><span class="chip-icon" style="--type-color: var(--color-water);">${iconSvg('water', 15)}</span>Water</button>
          <button class="chip" data-feed-id="${grow.id}"><span class="chip-icon" style="--type-color: var(--color-veg);">${iconSvg('feed', 15)}</span>Feed</button>
          <button class="chip chip-more" data-sheet-id="${grow.id}" title="Log entry">+</button>
        </div>
      </article>
    `;
  }

  /** Light heuristic: a recent issue entry flags the grow as "Watch". */
  private deriveHealth(grow: Grow): 'Healthy' | 'Watch' {
    const hasRecentIssue = grow.entries.some(
      (e) => e.type === 'issue' && this.daysAgo(e.date) <= 10
    );
    return hasRecentIssue ? 'Watch' : 'Healthy';
  }

  private daysAgo(dateStr: string): number {
    const then = new Date(dateStr).getTime();
    const now = Date.now();
    return Math.floor((now - then) / 86400000);
  }

  private relativeTime(dateStr: string): string {
    const d = this.daysAgo(dateStr);
    if (d <= 0) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d < 7) return `${d}d ago`;
    if (d < 30) return `${Math.floor(d / 7)}w ago`;
    return `${Math.floor(d / 30)}mo ago`;
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
