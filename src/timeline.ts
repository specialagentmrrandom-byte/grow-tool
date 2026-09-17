import { type Grow, type Entry, type Phase, PHASE_COLORS } from './types';
import { getPhase, getDaysSinceSprout, getWeekNumber, daysBetween, formatPhase, getDaysUntilNextPhase, getDaysUntilHarvest } from './dli';

export interface TimelineOptions {
  onDayClick?: (date: Date, day: number) => void;
  onEntryClick?: (entry: Entry) => void;
  onEntryDelete?: (entry: Entry) => void;
}

/**
 * Timeline renderer for grow visualization
 */
export class Timeline {
  private container: HTMLElement;
  private grow: Grow | null = null;
  private options: TimelineOptions;
  private viewMode: 'list' | 'grid' = 'list';

  constructor(container: HTMLElement, options: TimelineOptions = {}) {
    this.container = container;
    this.options = options;
    this.setupEventDelegation();
  }

  private getViewModeKey(growId: string): string {
    return `grow-view-mode-${growId}`;
  }

  private loadViewMode(growId: string): void {
    const saved = localStorage.getItem(this.getViewModeKey(growId));
    this.viewMode = (saved === 'grid' || saved === 'list') ? saved : 'list';
  }

  private saveViewMode(growId: string): void {
    localStorage.setItem(this.getViewModeKey(growId), this.viewMode);
  }

  private setupEventDelegation(): void {
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // View mode toggle
      const viewToggle = target.closest<HTMLElement>('[data-view-mode]');
      if (viewToggle) {
        const mode = viewToggle.dataset.viewMode as 'list' | 'grid';
        if (mode && mode !== this.viewMode) {
          this.viewMode = mode;
          if (this.grow) {
            this.saveViewMode(this.grow.id);
            this.render(this.grow);
          }
        }
        return;
      }

      // Entry delete (check first, before entry click)
      const deleteBtn = target.closest<HTMLElement>('[data-delete-entry]');
      if (deleteBtn && this.grow && this.options.onEntryDelete) {
        e.stopPropagation();
        const entryId = deleteBtn.dataset.deleteEntry;
        const entry = this.grow.entries.find(e => e.id === entryId);
        if (entry) this.options.onEntryDelete(entry);
        return;
      }

      // Entry click
      const entryEl = target.closest<HTMLElement>('[data-entry-id]');
      if (entryEl && this.grow && this.options.onEntryClick) {
        const entry = this.grow.entries.find(e => e.id === entryEl.dataset.entryId);
        if (entry) this.options.onEntryClick(entry);
        return;
      }

      // Day click (add entry button)
      const addBtn = target.closest<HTMLElement>('.add-entry-btn');
      if (addBtn) {
        const dayEl = addBtn.closest<HTMLElement>('[data-date]');
        if (dayEl && this.options.onDayClick) {
          const date = new Date(dayEl.dataset.date!);
          const day = parseInt(dayEl.dataset.day ?? '0', 10);
          this.options.onDayClick(date, day);
        }
        return;
      }

      // Week header click - let details handle it natively
      // No additional handling needed as <details> handles open/close
    });
  }

  /**
   * Render timeline for a grow
   */
  render(grow: Grow): void {
    // Load saved view mode for this grow (only on grow change)
    if (!this.grow || this.grow.id !== grow.id) {
      this.loadViewMode(grow.id);
    }
    this.grow = grow;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Calculate timeline range
    const startDate = new Date(grow.dates.germStart);
    const endDate = grow.dates.harvest
      ? new Date(grow.dates.harvest)
      : new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks ahead

    // Build phase segments
    const phases = this.buildPhaseSegments(grow, startDate, endDate);

    // Group entries by date
    const entriesByDate = new Map<string, Entry[]>();
    for (const entry of grow.entries) {
      const dateKey = entry.date.split('T')[0];
      const existing = entriesByDate.get(dateKey) ?? [];
      existing.push(entry);
      entriesByDate.set(dateKey, existing);
    }

    // Build HTML
    let html = '<div class="timeline">';

    // Sticky toolbar with progress and view toggle
    html += '<div class="timeline-toolbar">';

    // Calculate progress data
    const totalDays = daysBetween(startDate, endDate);
    const daysFromStart = daysBetween(startDate, today);
    const todayPosition = Math.max(0, Math.min(100, (daysFromStart / totalDays) * 100));
    const currentDay = getDaysSinceSprout(grow, today);
    const currentPhase = getPhase(grow, today);
    const daysUntilNextPhase = getDaysUntilNextPhase(grow, today);
    const daysUntilHarvest = getDaysUntilHarvest(grow, today);

    // Toolbar header row
    html += `
        <div class="toolbar-header">
          <span class="toolbar-day">Day ${currentDay}</span>
          <span class="toolbar-phase-badge" style="background: ${PHASE_COLORS[currentPhase]}">${formatPhase(currentPhase)}</span>
        </div>
        `;

    // Stats row
    const nextPhaseUrgent = daysUntilNextPhase !== null && daysUntilNextPhase < 3;
    html += `
        <div class="toolbar-stats">
          <div class="toolbar-stat${nextPhaseUrgent ? ' stat-urgent' : ''}">
            <span class="stat-value">${daysUntilNextPhase ?? '—'}${daysUntilNextPhase !== null ? '<span class="stat-unit">d</span>' : ''}</span>
            <span class="stat-label">to next phase</span>
          </div>
          <div class="toolbar-stat">
            <span class="stat-value">${Math.round(todayPosition)}<span class="stat-unit">%</span></span>
            <span class="stat-label">complete</span>
          </div>
          <div class="toolbar-stat">
            <span class="stat-value">${daysUntilHarvest ?? '—'}${daysUntilHarvest !== null ? '<span class="stat-unit">d</span>' : ''}</span>
            <span class="stat-label">days to harvest</span>
          </div>
          <div class="toolbar-stat">
            <span class="stat-value">${grow.entries.length}</span>
            <span class="stat-label">entries</span>
          </div>
        </div>
        `;

    // Phase progress bar with today marker
    html += '<div class="toolbar-progress-container">';
    html += '<div class="toolbar-progress-bar">';
    for (const phase of phases) {
      const width = (phase.days / totalDays) * 100;
      html += `
        <div class="progress-segment" 
             style="width: ${width}%; background: ${PHASE_COLORS[phase.phase]}"
             title="${formatPhase(phase.phase)}: ${phase.days} days">
        </div>
      `;
    }
    html += '</div>';

    // Entry dots on progress bar
    for (const entry of grow.entries) {
      const entryDate = new Date(entry.date);
      if (entryDate >= startDate && entryDate <= endDate) {
        const entryDays = daysBetween(startDate, entryDate);
        const entryPosition = (entryDays / totalDays) * 100;
        html += `
          <div class="entry-dot" 
               style="left: ${entryPosition}%" 
               title="${this.escapeHtml(entry.title)}">
            <span class="entry-dot-icon">${this.getEntryIcon(entry.type)}</span>
          </div>
        `;
      }
    }

    // Today marker
    if (todayPosition >= 0 && todayPosition <= 100) {
      html += `
            <div class="toolbar-today-marker" style="left: ${todayPosition}%">
              <div class="today-marker-label">TODAY</div>
              <div class="today-marker-line"></div>
            </div>
            `;
    }

    // Scroll position marker (will be updated via JS)
    html += `
        <div class="toolbar-scroll-marker" style="left: 0%">
          <div class="scroll-marker-head"></div>
          <div class="scroll-marker-line"></div>
        </div>
        `;
    html += '</div>';

    // Phase labels under progress bar
    html += '<div class="toolbar-phase-labels">';
    for (const phase of phases) {
      const width = (phase.days / totalDays) * 100;
      html += `
        <div class="phase-label" style="width: ${width}%; color: ${PHASE_COLORS[phase.phase]}">
          ${formatPhase(phase.phase)}
        </div>
      `;
    }
    html += '</div>';

    // Close toolbar
    html += '</div>';

    // View mode toggle (outside sticky toolbar, with weeks)
    html += `
        <div class="timeline-view-toggle">
          <button class="view-toggle-btn ${this.viewMode === 'list' ? 'active' : ''}" data-view-mode="list" title="List view">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="0" y="1" width="16" height="2" rx="0.5"/>
              <rect x="0" y="7" width="16" height="2" rx="0.5"/>
              <rect x="0" y="13" width="16" height="2" rx="0.5"/>
            </svg>
          </button>
          <button class="view-toggle-btn ${this.viewMode === 'grid' ? 'active' : ''}" data-view-mode="grid" title="Grid view">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="0" y="0" width="7" height="7" rx="1"/>
              <rect x="9" y="0" width="7" height="7" rx="1"/>
              <rect x="0" y="9" width="7" height="7" rx="1"/>
              <rect x="9" y="9" width="7" height="7" rx="1"/>
            </svg>
          </button>
        </div>
        `;

    // Timeline entries
    html += `<div class="timeline-entries ${this.viewMode === 'grid' ? 'grid-view' : 'list-view'}">`;

    let currentDate = new Date(startDate);
    let currentWeek: number | 'pregrow' = 0;
    let weekHasToday = false;
    let weekDaysHtml = '';
    let weekPhase: Phase = 'germination';
    let weekEntryCount = 0;
    let weekStartDate: Date = new Date(startDate);
    let weekEndDate: Date = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const day = getDaysSinceSprout(grow, currentDate);
      // Days before sprout (day 0 or negative) are "pregrow", otherwise use week number
      const week: number | 'pregrow' = day < 1 ? 'pregrow' : getWeekNumber(day);
      const phase = getPhase(grow, currentDate);
      const isToday = dateStr === todayStr;
      const isFuture = currentDate > today;
      const entries = entriesByDate.get(dateStr) ?? [];

      // Week changed - close previous week and start new one
      if (week !== currentWeek) {
        // Close previous week if exists
        if (currentWeek !== 0) {
          html += this.renderWeekAccordion(currentWeek, weekPhase, weekDaysHtml, weekHasToday, weekEntryCount, weekStartDate, weekEndDate);
        }
        currentWeek = week;
        weekPhase = phase;
        weekHasToday = false;
        weekDaysHtml = '';
        weekEntryCount = 0;
        weekStartDate = new Date(currentDate);
      }

      // Always update end date to current date
      weekEndDate = new Date(currentDate);

      if (isToday) weekHasToday = true;
      weekEntryCount += entries.length;

      // Day row
      const dayClasses = [
        'timeline-day',
        isToday ? 'is-today' : '',
        isFuture ? 'is-future' : '',
        entries.length > 0 ? 'has-entries' : '',
      ].filter(Boolean).join(' ');

      weekDaysHtml += `
        <div class="${dayClasses}" 
             data-date="${dateStr}" 
             data-day="${day}"
             style="--phase-color: ${PHASE_COLORS[phase]}">
          <div class="day-marker">
            <span class="day-number">Day ${day}</span>
            <span class="day-date">${this.formatDate(currentDate)}</span>
            ${isToday ? '<span class="today-badge">Today</span>' : ''}
          </div>
          <div class="day-content">
            ${this.renderDayEntries(entries)}
            <button class="add-entry-btn" title="${isFuture ? 'Add reminder' : 'Add entry'}">+</button>
          </div>
        </div>
      `;

      // Next day
      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    }

    // Close final week
    if (currentWeek !== 0) {
      html += this.renderWeekAccordion(currentWeek, weekPhase, weekDaysHtml, weekHasToday, weekEntryCount, weekStartDate, weekEndDate);
    }

    html += '</div></div>';

    this.container.innerHTML = html;

    // Set up scroll marker tracking
    this.setupScrollMarker();

    // Scroll to today
    requestAnimationFrame(() => {
      const todayEl = this.container.querySelector('.is-today');
      todayEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  private setupScrollMarker(): void {
    const entriesContainer = this.container.querySelector('.timeline-entries') as HTMLElement;
    const scrollMarker = this.container.querySelector('.toolbar-scroll-marker') as HTMLElement;
    if (!entriesContainer || !scrollMarker) return;

    const updateScrollMarker = () => {
      // Get the bounding rect of the entries container
      const containerRect = entriesContainer.getBoundingClientRect();
      const containerTop = containerRect.top;
      const containerHeight = containerRect.height;

      // Calculate how far we've scrolled through the container
      // When container top is at viewport top, we're at the start
      // When container bottom is at viewport bottom, we're at the end
      const viewportHeight = window.innerHeight;
      const toolbarHeight = 180; // Approximate height of sticky toolbar

      // Calculate scroll progress: 0 = top of content visible, 1 = bottom of content visible
      const scrollableDistance = containerHeight - (viewportHeight - toolbarHeight);

      if (scrollableDistance <= 0) {
        // Content fits in viewport, show at 50%
        scrollMarker.style.left = '50%';
        return;
      }

      // How much of the container is above the visible area (below toolbar)
      const scrolledAmount = toolbarHeight - containerTop;
      const progress = Math.max(0, Math.min(1, scrolledAmount / scrollableDistance));

      scrollMarker.style.left = `${progress * 100}%`;
    };

    // Update on scroll with throttling
    let ticking = false;
    const scrollHandler = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateScrollMarker();
          ticking = false;
        });
        ticking = true;
      }
    };

    // Listen on window scroll since content scrolls with page
    window.addEventListener('scroll', scrollHandler, { passive: true });

    // Also handle accordion open/close which changes content positions
    this.container.addEventListener('toggle', () => {
      // Delay update to allow DOM to settle after accordion toggle
      setTimeout(scrollHandler, 50);
    }, true);

    // Initial update
    requestAnimationFrame(updateScrollMarker);
  }

  private renderWeekAccordion(week: number | 'pregrow', phase: Phase, daysHtml: string, hasToday: boolean, entryCount: number, startDate: Date, endDate: Date): string {
    // In grid view, always expand all weeks; in list view, only expand current week
    const isOpen = this.viewMode === 'grid' || hasToday;
    const dateRange = `${this.formatDate(startDate)} - ${this.formatDate(endDate)}`;
    const currentWeekClass = hasToday ? 'current-week' : '';
    const weekLabel = week === 'pregrow' ? 'Pre-grow' : `Week ${week}`;
    const pregrowClass = week === 'pregrow' ? 'pregrow' : '';
    return `
      <details class="timeline-week ${currentWeekClass} ${pregrowClass}" ${isOpen ? 'open' : ''} style="--phase-color: ${PHASE_COLORS[phase]}">
        <summary class="timeline-week-header">
          <span class="week-info">
            <span class="week-label">${weekLabel}</span>
            <span class="week-dates">${dateRange}</span>
            <span class="phase-label">${formatPhase(phase)}</span>
            ${hasToday ? '<span class="today-indicator">Today</span>' : ''}
            ${entryCount > 0 ? `<span class="entry-count">${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}</span>` : ''}
          </span>
          <span class="week-toggle"></span>
        </summary>
        <div class="timeline-week-days ${this.viewMode === 'grid' ? 'grid-view' : 'list-view'}">
          ${daysHtml}
        </div>
      </details>
    `;
  }

  private buildPhaseSegments(
    grow: Grow,
    startDate: Date,
    endDate: Date
  ): { phase: Phase; days: number; start: Date }[] {
    const segments: { phase: Phase; days: number; start: Date }[] = [];
    let current = new Date(startDate);
    let currentPhase = getPhase(grow, current);
    let segmentStart = new Date(current);
    let segmentDays = 0;

    while (current <= endDate) {
      const phase = getPhase(grow, current);

      if (phase !== currentPhase) {
        segments.push({ phase: currentPhase, days: segmentDays, start: segmentStart });
        currentPhase = phase;
        segmentStart = new Date(current);
        segmentDays = 0;
      }

      segmentDays++;
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    }

    // Add final segment
    if (segmentDays > 0) {
      segments.push({ phase: currentPhase, days: segmentDays, start: segmentStart });
    }

    return segments;
  }

  private renderDayEntries(entries: Entry[]): string {
    if (entries.length === 0) return '';

    return entries.map(entry => `
      <div class="timeline-entry" data-entry-id="${entry.id}" data-type="${entry.type}">
        <span class="entry-icon">${this.getEntryIcon(entry.type)}</span>
        <span class="entry-title">${this.escapeHtml(entry.title)}</span>
        ${(entry.photo || (entry.photos && entry.photos.length > 0) || (entry.photoIds && entry.photoIds.length > 0)) ? '<span class="entry-photo-indicator">📷</span>' : ''}
        <button class="entry-delete" data-delete-entry="${entry.id}" title="Delete">×</button>
      </div>
    `).join('');
  }

  private getEntryIcon(type: Entry['type']): string {
    const icons: Record<Entry['type'], string> = {
      note: '📝',
      milestone: '🏁',
      issue: '⚠️',
      watering: '💧',
      feeding: '🌿',
      reminder: '⏰',
    };
    return icons[type];
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Scroll to specific day
   */
  scrollToDay(day: number): void {
    const dayEl = this.container.querySelector(`[data-day="${day}"]`);
    dayEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * Scroll to today
   */
  scrollToToday(): void {
    const todayEl = this.container.querySelector('.is-today');
    todayEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
