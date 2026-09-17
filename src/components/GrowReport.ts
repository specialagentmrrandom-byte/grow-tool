import { type Grow, type Entry, type EntryType, type Phase, PHASE_COLORS, PLANT_COLORS } from '../types';
import { formatPhase } from '../dli';
import reportStyles from './GrowReport.css?inline';

export class GrowReport {
    private grow: Grow;

    constructor(grow: Grow) {
        this.grow = grow;
    }

    generate(): string {
        const grow = this.grow;
        const sortedEntries = [...grow.entries].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Calculate statistics
        const totalDays = sortedEntries.length > 0 ? Math.max(...sortedEntries.map(e => e.day)) : 0;
        const totalPhotos = sortedEntries.reduce((sum, e) => {
            const photos = e.photos?.length || (e.photo ? 1 : 0);
            return sum + photos;
        }, 0);
        const milestones = sortedEntries.filter(e => e.type === 'milestone');
        const issues = sortedEntries.filter(e => e.type === 'issue');

        // Group entries by phase
        const entriesByPhase = this.groupEntriesByPhase(sortedEntries);

        // Calculate phase durations
        const phaseDurations = this.calculatePhaseDurations(grow);

        // Build the report HTML
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(grow.strain)} - Grow Report</title>
  <style>${this.getStyles()}</style>
</head>
<body>
  <div class="report">
    <!-- Cover Section -->
    <header class="cover">
      <div class="cover-content">
        <h1 class="strain-name">${this.escapeHtml(grow.strain)}</h1>
        <p class="grow-type">${grow.type === 'auto' ? '🌱 Autoflower' : '📸 Photoperiod'}</p>
        <div class="cover-stats">
          <div class="cover-stat">
            <span class="stat-value">${totalDays}</span>
            <span class="stat-label">Days</span>
          </div>
          <div class="cover-stat">
            <span class="stat-value">${grow.plantCount}</span>
            <span class="stat-label">Plants</span>
          </div>
          <div class="cover-stat">
            <span class="stat-value">${totalPhotos}</span>
            <span class="stat-label">Photos</span>
          </div>
          <div class="cover-stat">
            <span class="stat-value">${sortedEntries.length}</span>
            <span class="stat-label">Entries</span>
          </div>
        </div>
        <p class="date-range">${this.formatDate(grow.dates.germStart)} — ${grow.dates.harvest ? this.formatDate(grow.dates.harvest) : 'In Progress'}</p>
      </div>
    </header>

    <!-- Journey Timeline Overview -->
    <section class="timeline-overview">
      <h2>🗺️ Journey Overview</h2>
      <div class="phase-timeline">
        ${phaseDurations.map(p => `
          <div class="phase-block" style="flex: ${p.days}; background: ${PHASE_COLORS[p.phase]}">
            <span class="phase-name">${formatPhase(p.phase)}</span>
            <span class="phase-days">${p.days}d</span>
          </div>
        `).join('')}
      </div>
      <div class="journey-milestones">
        ${milestones.map(m => `
          <div class="milestone-marker" style="left: ${(m.day / totalDays) * 100}%">
            <span class="milestone-dot">🏁</span>
            <span class="milestone-label">${this.escapeHtml(m.title)}</span>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- Plants Section -->
    ${grow.plants.length > 0 ? `
    <section class="plants-section">
      <h2>🌿 The Cast</h2>
      <div class="plants-grid">
        ${grow.plants.map((plant, i) => `
          <div class="plant-card" style="border-color: ${PLANT_COLORS[i % PLANT_COLORS.length]}">
            <div class="plant-header" style="background: ${PLANT_COLORS[i % PLANT_COLORS.length]}">
              <span class="pot-number">#${plant.potNumber}</span>
              <span class="plant-name">${this.escapeHtml(plant.name)}</span>
            </div>
            <div class="plant-details">
              <p><strong>Strain:</strong> ${this.escapeHtml(plant.strain)}</p>
              ${plant.potLiters ? `<p><strong>Pot:</strong> ${plant.potLiters}L</p>` : ''}
              ${plant.seedType ? `<p><strong>Seed:</strong> ${plant.seedType}</p>` : ''}
              ${plant.notes ? `<p class="plant-notes">${this.escapeHtml(plant.notes)}</p>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </section>
    ` : ''}

    <!-- Key Stats -->
    <section class="stats-section">
      <h2>📊 By The Numbers</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-icon">⏱️</span>
          <span class="stat-value">${totalDays}</span>
          <span class="stat-label">Total Days</span>
        </div>
        <div class="stat-card">
          <span class="stat-icon">🏁</span>
          <span class="stat-value">${milestones.length}</span>
          <span class="stat-label">Milestones</span>
        </div>
        <div class="stat-card">
          <span class="stat-icon">⚠️</span>
          <span class="stat-value">${issues.length}</span>
          <span class="stat-label">Issues</span>
        </div>
        <div class="stat-card">
          <span class="stat-icon">💧</span>
          <span class="stat-value">${sortedEntries.filter(e => e.type === 'watering').length}</span>
          <span class="stat-label">Waterings</span>
        </div>
        <div class="stat-card">
          <span class="stat-icon">🌿</span>
          <span class="stat-value">${sortedEntries.filter(e => e.type === 'feeding').length}</span>
          <span class="stat-label">Feedings</span>
        </div>
        <div class="stat-card">
          <span class="stat-icon">☀️</span>
          <span class="stat-value">${grow.light.ppfd}</span>
          <span class="stat-label">PPFD</span>
        </div>
      </div>
    </section>

    <!-- Phase-by-Phase Story -->
    ${Object.entries(entriesByPhase).map(([phase, entries]) => `
    <section class="phase-section" style="--phase-color: ${PHASE_COLORS[phase as Phase]}">
      <div class="phase-header">
        <h2>${this.getPhaseEmoji(phase as Phase)} ${formatPhase(phase as Phase)}</h2>
        <span class="phase-duration">${entries.length > 0 ? `Day ${entries[0].day} — Day ${entries[entries.length - 1].day}` : ''}</span>
      </div>
      
      ${this.renderPhaseHighlights(entries)}
      
      <div class="entries-timeline">
        ${entries.map(entry => this.renderEntry(entry)).join('')}
      </div>
    </section>
    `).join('')}

    <!-- Photo Gallery -->
    ${totalPhotos > 0 ? `
    <section class="gallery-section">
      <h2>📸 Photo Gallery</h2>
      <div class="photo-grid">
        ${this.renderPhotoGallery(sortedEntries)}
      </div>
    </section>
    ` : ''}

    <!-- Lessons Learned (Issues Summary) -->
    ${issues.length > 0 ? `
    <section class="lessons-section">
      <h2>📚 Lessons Learned</h2>
      <div class="lessons-list">
        ${issues.map(issue => `
          <div class="lesson-card">
            <span class="lesson-day">Day ${issue.day}</span>
            <h4>${this.escapeHtml(issue.title)}</h4>
            ${issue.content ? `<p>${this.escapeHtml(issue.content)}</p>` : ''}
          </div>
        `).join('')}
      </div>
    </section>
    ` : ''}

    <!-- Closing -->
    <footer class="report-footer">
      <p>Generated by Grow Tool</p>
      <p class="timestamp">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </footer>
  </div>
</body>
</html>`;
    }

    private groupEntriesByPhase(entries: Entry[]): Record<Phase, Entry[]> {
        const grouped: Record<Phase, Entry[]> = {
            germination: [],
            seedling: [],
            veg: [],
            flower: [],
            flush: [],
            harvest: [],
            complete: [],
        };

        for (const entry of entries) {
            grouped[entry.phase].push(entry);
        }

        // Remove empty phases
        for (const phase of Object.keys(grouped) as Phase[]) {
            if (grouped[phase].length === 0) {
                delete (grouped as any)[phase];
            }
        }

        return grouped;
    }

    private calculatePhaseDurations(grow: Grow): { phase: Phase; days: number }[] {
        const durations: { phase: Phase; days: number }[] = [];
        const dates = grow.dates;

        const addPhase = (phase: Phase, start?: string, end?: string) => {
            if (!start) return;
            const startDate = new Date(start);
            const endDate = end ? new Date(end) : new Date();
            const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
            durations.push({ phase, days });
        };

        addPhase('germination', dates.germStart, dates.sprout || dates.vegStart);
        if (dates.sprout) addPhase('seedling', dates.sprout, dates.vegStart);
        addPhase('veg', dates.vegStart, dates.flowerStart);
        addPhase('flower', dates.flowerStart, dates.flushStart || dates.harvest);
        if (dates.flushStart) addPhase('flush', dates.flushStart, dates.harvest);

        return durations.filter(d => d.days > 0);
    }

    private renderPhaseHighlights(entries: Entry[]): string {
        const milestones = entries.filter(e => e.type === 'milestone');
        const issues = entries.filter(e => e.type === 'issue');
        const photosCount = entries.reduce((sum, e) => sum + (e.photos?.length || (e.photo ? 1 : 0)), 0);

        if (milestones.length === 0 && issues.length === 0 && photosCount === 0) {
            return '';
        }

        return `
      <div class="phase-highlights">
        ${milestones.length > 0 ? `<span class="highlight">🏁 ${milestones.length} milestone${milestones.length > 1 ? 's' : ''}</span>` : ''}
        ${issues.length > 0 ? `<span class="highlight warning">⚠️ ${issues.length} issue${issues.length > 1 ? 's' : ''}</span>` : ''}
        ${photosCount > 0 ? `<span class="highlight">📷 ${photosCount} photo${photosCount > 1 ? 's' : ''}</span>` : ''}
      </div>
    `;
    }

    private renderEntry(entry: Entry): string {
        const photos = entry.photos || (entry.photo ? [entry.photo] : []);
        const typeIcons: Record<EntryType, string> = {
            note: '📝',
            milestone: '🏁',
            issue: '⚠️',
            watering: '💧',
            feeding: '🌿',
            reminder: '⏰',
        };

        return `
      <div class="entry ${entry.type}">
        <div class="entry-marker">
          <span class="entry-day">Day ${entry.day}</span>
          <span class="entry-date">${this.formatDateShort(entry.date)}</span>
        </div>
        <div class="entry-content">
          <div class="entry-header">
            <span class="entry-type">${typeIcons[entry.type]}</span>
            <h4>${this.escapeHtml(entry.title)}</h4>
            ${entry.dli ? `<span class="entry-dli">☀️ ${entry.dli.toFixed(1)} mol</span>` : ''}
          </div>
          ${entry.content ? `<p class="entry-text">${this.escapeHtml(entry.content)}</p>` : ''}
          ${entry.tags && entry.tags.length > 0 ? `
            <div class="entry-tags">
              ${entry.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
          ${photos.length > 0 ? `
            <div class="entry-photos">
              ${photos.map(photo => `<img src="${photo}" alt="${this.escapeHtml(entry.title)}" loading="lazy">`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
    }

    private renderPhotoGallery(entries: Entry[]): string {
        const photos: { photo: string; day: number; title: string; phase: Phase }[] = [];

        for (const entry of entries) {
            const entryPhotos = entry.photos || (entry.photo ? [entry.photo] : []);
            for (const photo of entryPhotos) {
                photos.push({
                    photo,
                    day: entry.day,
                    title: entry.title,
                    phase: entry.phase,
                });
            }
        }

        return photos.map(p => `
      <div class="gallery-item" style="--phase-color: ${PHASE_COLORS[p.phase]}">
        <img src="${p.photo}" alt="Day ${p.day}" loading="lazy">
        <div class="gallery-caption">
          <span class="gallery-day">Day ${p.day}</span>
          <span class="gallery-title">${this.escapeHtml(p.title)}</span>
        </div>
      </div>
    `).join('');
    }

    private getPhaseEmoji(phase: Phase): string {
        const emojis: Record<Phase, string> = {
            germination: '🌱',
            seedling: '🌿',
            veg: '🪴',
            flower: '🌸',
            flush: '💧',
            harvest: '✂️',
            complete: '🎉',
        };
        return emojis[phase];
    }

    private formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    private formatDateShort(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    private getStyles(): string {
        return reportStyles;
    }

    /**
     * Download the report as an HTML file
     */
    download(): void {
        const html = this.generate();
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.grow.strain.replace(/[^a-z0-9]/gi, '_')}_grow_report.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Open report in new tab
     */
    openInNewTab(): void {
        const html = this.generate();
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    }
}
