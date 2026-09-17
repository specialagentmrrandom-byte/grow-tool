import { type Entry } from '../types';

export class ReminderBar {
    private container: HTMLElement;
    private onDismiss: (growId: string, entryId: string) => void;
    private onDone: (growId: string, entryId: string) => void;
    private onViewEntry: (growId: string, entryId: string) => void;

    constructor(
        container: HTMLElement,
        callbacks: {
            onDismiss: (growId: string, entryId: string) => void;
            onDone: (growId: string, entryId: string) => void;
            onViewEntry: (growId: string, entryId: string) => void;
        }
    ) {
        this.container = container;
        this.onDismiss = callbacks.onDismiss;
        this.onDone = callbacks.onDone;
        this.onViewEntry = callbacks.onViewEntry;
        this.setupEvents();
    }

    private setupEvents(): void {
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            // Close button
            const closeBtn = target.closest<HTMLElement>('[data-close-reminders]');
            if (closeBtn) {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
                return;
            }

            // Click on backdrop to close
            if (target.classList.contains('reminder-backdrop')) {
                this.hide();
                return;
            }

            const dismissBtn = target.closest<HTMLElement>('[data-dismiss-reminder]');
            if (dismissBtn) {
                e.preventDefault();
                e.stopPropagation();
                const [growId, entryId] = dismissBtn.dataset.dismissReminder!.split(':');
                this.onDismiss(growId, entryId);
                return;
            }

            const doneBtn = target.closest<HTMLElement>('[data-done-reminder]');
            if (doneBtn) {
                e.preventDefault();
                e.stopPropagation();
                const [growId, entryId] = doneBtn.dataset.doneReminder!.split(':');
                this.onDone(growId, entryId);
                return;
            }

            const viewBtn = target.closest<HTMLElement>('[data-view-reminder]');
            if (viewBtn) {
                e.preventDefault();
                const [growId, entryId] = viewBtn.dataset.viewReminder!.split(':');
                this.onViewEntry(growId, entryId);
                this.hide();
                return;
            }
        });
    }

    private hide(): void {
        this.container.classList.remove('visible');
    }

    private show(): void {
        // Always show reminders (no session blocking for today's reminders)
        this.container.classList.add('visible');
    }

    public forceShow(): void {
        // Force show regardless of session state (useful for testing or manual trigger)
        this.container.classList.add('visible');
    }

    render(reminders: Array<Entry & { growId: string; growName: string }>, force = false): void {
        if (reminders.length === 0) {
            this.container.innerHTML = '';
            this.container.classList.remove('visible');
            return;
        }

        this.container.innerHTML = `
      <div class="reminder-backdrop"></div>
      <div class="reminder-bar">
        <div class="reminder-bar-header">
          <div class="reminder-bar-title">
            <span class="reminder-icon">⏰</span>
            <span class="reminder-count">${reminders.length} ${reminders.length === 1 ? 'Reminder' : 'Reminders'}</span>
          </div>
          <button class="reminder-close-btn" data-close-reminders title="Close">×</button>
        </div>
        <div class="reminder-list">
          ${reminders.map(reminder => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const reminderDate = new Date(reminder.date);
            reminderDate.setHours(0, 0, 0, 0);
            const daysUntil = Math.ceil((reminderDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            let dateText = '';
            if (daysUntil === 0) dateText = 'Today';
            else if (daysUntil === 1) dateText = 'Tomorrow';
            else if (daysUntil > 1) dateText = `in ${daysUntil} days`;
            else dateText = `${Math.abs(daysUntil)} days ago`;

            return `
              <div class="reminder-item">
                <div class="reminder-content" data-view-reminder="${reminder.growId}:${reminder.id}">
                  <span class="reminder-title">${this.escapeHtml(reminder.title)}</span>
                  <span class="reminder-meta">
                    <span class="reminder-grow">${this.escapeHtml(reminder.growName)}</span>
                    <span class="reminder-date">${dateText}</span>
                  </span>
                </div>
                <div class="reminder-actions">
                  <button class="reminder-done" data-done-reminder="${reminder.growId}:${reminder.id}" title="Mark as Done">✓</button>
                </div>
              </div>
            `;
        }).join('')}
        </div>
      </div>
    `;
        if (force) {
            this.forceShow();
        } else {
            this.show();
        }
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
