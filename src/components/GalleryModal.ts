import { type Grow, type EntryType, type Phase, PHASE_COLORS, PLANT_COLORS } from '../types';
import { formatPhase, getPhase } from '../dli';
import { photoStore } from '../photoStore';

/**
 * Gallery slide data structure
 */
interface GallerySlide {
    day: number;
    date: string;
    week: number;
    phase: string;
    phaseColor: string;
    title: string;
    content?: string;
    photo?: string;
    entryId?: string;
    dli?: number;
    photoIndex?: number;  // Current photo number (1-based) if multiple
    photoCount?: number;  // Total photos for this entry if multiple
    entryType: EntryType; // Entry type for icon
    plants?: { name: string; color: string }[]; // Associated plants
    totalDays: number;    // Total grow days for progress
    totalEntries: number; // Total entries in grow
    currentEntryIndex: number; // This entry's position
}

/**
 * Phase segment for timeline
 */
interface PhaseSegment {
    phase: Phase;
    days: number;
    start: Date;
}

export class GalleryModal {
    private container: HTMLElement;
    private onClose: () => void;
    private slides: GallerySlide[] = [];
    private currentIndex = 0;
    private touchStartX = 0;
    private touchEndX = 0;
    private isPlaying = false;
    private playInterval: number | null = null;
    private phaseSegments: PhaseSegment[] = [];
    private totalGrowDays = 0;

    constructor(container: HTMLElement, onClose: () => void) {
        this.container = container;
        this.onClose = onClose;
    }

    private setupEvents(): void {
        // Click events
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            if (target.closest('.gallery-close') || target.classList.contains('gallery-overlay')) {
                this.close();
            }

            if (target.closest('.gallery-prev')) {
                this.prev();
            }

            if (target.closest('.gallery-next')) {
                this.next();
            }

            if (target.closest('.gallery-play')) {
                this.togglePlay();
            }

            // Dot navigation
            const dotIndex = target.closest<HTMLElement>('[data-slide-index]')?.dataset.slideIndex;
            if (dotIndex !== undefined) {
                this.goTo(parseInt(dotIndex, 10));
            }
        });

        // Keyboard navigation
        const keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.close();
            if (e.key === 'ArrowLeft') this.prev();
            if (e.key === 'ArrowRight') this.next();
            if (e.key === ' ') {
                e.preventDefault();
                this.togglePlay();
            }
        };
        document.addEventListener('keydown', keyHandler);
        // Store for cleanup
        (this as any)._keyHandler = keyHandler;

        // Touch swipe
        const slideContainer = this.container.querySelector('.gallery-slides');
        if (slideContainer) {
            slideContainer.addEventListener('touchstart', (e) => {
                this.touchStartX = (e as TouchEvent).changedTouches[0].screenX;
            }, { passive: true });

            slideContainer.addEventListener('touchend', (e) => {
                this.touchEndX = (e as TouchEvent).changedTouches[0].screenX;
                this.handleSwipe();
            }, { passive: true });
        }
    }

    private handleSwipe(): void {
        const diff = this.touchStartX - this.touchEndX;
        const threshold = 50;

        if (Math.abs(diff) > threshold) {
            if (diff > 0) {
                this.next();
            } else {
                this.prev();
            }
        }
    }

    private prev(): void {
        this.pausePlay();
        this.currentIndex = this.currentIndex > 0 ? this.currentIndex - 1 : this.slides.length - 1;
        this.updateSlide();
    }

    private next(): void {
        this.currentIndex = this.currentIndex < this.slides.length - 1 ? this.currentIndex + 1 : 0;
        this.updateSlide();
    }

    private goTo(index: number): void {
        this.pausePlay();
        this.currentIndex = Math.max(0, Math.min(index, this.slides.length - 1));
        this.updateSlide();
    }

    private togglePlay(): void {
        if (this.isPlaying) {
            this.pausePlay();
        } else {
            this.startPlay();
        }
    }

    private startPlay(): void {
        this.isPlaying = true;
        this.updatePlayButton();
        this.playInterval = window.setInterval(() => this.next(), 3000);
    }

    private pausePlay(): void {
        this.isPlaying = false;
        this.updatePlayButton();
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }

    private updatePlayButton(): void {
        const btn = this.container.querySelector('.gallery-play');
        if (btn) {
            btn.textContent = this.isPlaying ? '⏸' : '▶';
            btn.setAttribute('title', this.isPlaying ? 'Pause' : 'Play');
        }
    }

    private updateSlide(): void {
        const slide = this.slides[this.currentIndex];
        if (!slide) return;

        // Update slide content
        const slideEl = this.container.querySelector('.gallery-slide');
        if (slideEl) {
            slideEl.innerHTML = this.renderSlideContent(slide);
            // Trigger fade animation
            slideEl.classList.remove('fade-in');
            void (slideEl as HTMLElement).offsetWidth; // Force reflow
            slideEl.classList.add('fade-in');
        }

        // Update phase timeline marker
        const markerEl = this.container.querySelector('.gallery-phase-marker') as HTMLElement;
        if (markerEl && this.totalGrowDays > 0) {
            const markerPosition = Math.max(0, Math.min(100, (slide.day / this.totalGrowDays) * 100));
            markerEl.style.left = `${markerPosition}%`;
        }

        // Update dots
        this.container.querySelectorAll('.gallery-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === this.currentIndex);
        });

        // Update counter
        const counter = this.container.querySelector('.gallery-counter');
        if (counter) {
            counter.textContent = `${this.currentIndex + 1} / ${this.slides.length}`;
        }
    }

    private renderSlideContent(slide: GallerySlide): string {
        const formattedDate = new Date(slide.date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        });

        const entryIcons: Record<EntryType, string> = {
            note: '📝',
            milestone: '🏁',
            issue: '⚠️',
            watering: '💧',
            feeding: '🌿',
            reminder: '⏰',
        };

        const plantsHtml = slide.plants && slide.plants.length > 0
            ? `<div class="gallery-plants">${slide.plants.map(p =>
                `<span class="gallery-plant-tag" style="background: ${p.color}">${this.escapeHtml(p.name)}</span>`
            ).join('')}</div>`
            : '';

        const progressPercent = slide.totalDays > 0 ? Math.round((slide.day / slide.totalDays) * 100) : 0;

        if (slide.photo) {
            const photoLabel = slide.photoCount ? ` ${slide.photoIndex}/${slide.photoCount}` : '';
            return `
        <div class="gallery-photo" style="background-image: url('${slide.photo}')"></div>
        <div class="gallery-info">
          <div class="gallery-header">
            <div class="gallery-badges">
              <span class="gallery-badge gallery-badge-day">
                <span class="badge-value">${slide.day}</span>
                <span class="badge-label">Day</span>
              </span>
              <span class="gallery-badge gallery-badge-week">
                <span class="badge-value">${slide.week}</span>
                <span class="badge-label">Week</span>
              </span>
              <span class="gallery-badge gallery-badge-phase" style="background: ${slide.phaseColor}">
                ${slide.phase}
              </span>
            </div>
            <div class="gallery-meta">
              <span class="gallery-entry-type">${entryIcons[slide.entryType]}</span>
              ${slide.dli ? `<span class="gallery-dli">☀️ ${slide.dli.toFixed(1)} mol</span>` : ''}
              ${photoLabel ? `<span class="gallery-photo-count">📷${photoLabel}</span>` : ''}
            </div>
          </div>
          <div class="gallery-timeline-bar">
            <div class="gallery-timeline-progress" style="width: ${progressPercent}%"></div>
          </div>
          <div class="gallery-body">
            <div class="gallery-title">${this.escapeHtml(slide.title)}</div>
            <div class="gallery-date">${formattedDate}</div>
            ${plantsHtml}
            ${slide.content ? `<div class="gallery-content">${this.escapeHtml(slide.content)}</div>` : ''}
          </div>
        </div>
      `;
        }

        // Placeholder card for days without photos
        return `
      <div class="gallery-placeholder" style="background: ${slide.phaseColor}">
        <div class="placeholder-icon">${entryIcons[slide.entryType]}</div>
        <div class="placeholder-day">Day ${slide.day}</div>
        <div class="placeholder-week">Week ${slide.week}</div>
      </div>
      <div class="gallery-info">
        <div class="gallery-header">
          <div class="gallery-badges">
            <span class="gallery-badge gallery-badge-day">
              <span class="badge-value">${slide.day}</span>
              <span class="badge-label">Day</span>
            </span>
            <span class="gallery-badge gallery-badge-week">
              <span class="badge-value">${slide.week}</span>
              <span class="badge-label">Week</span>
            </span>
            <span class="gallery-badge gallery-badge-phase" style="background: ${slide.phaseColor}">
              ${slide.phase}
            </span>
          </div>
          <div class="gallery-meta">
            <span class="gallery-entry-type">${entryIcons[slide.entryType]}</span>
            ${slide.dli ? `<span class="gallery-dli">☀️ ${slide.dli.toFixed(1)} mol</span>` : ''}
          </div>
        </div>
        <div class="gallery-timeline-bar">
          <div class="gallery-timeline-progress" style="width: ${progressPercent}%"></div>
        </div>
        <div class="gallery-body">
          <div class="gallery-title">${this.escapeHtml(slide.title)}</div>
          <div class="gallery-date">${formattedDate}</div>
          ${plantsHtml}
          ${slide.content ? `<div class="gallery-content">${this.escapeHtml(slide.content)}</div>` : ''}
        </div>
      </div>
    `;
    }

    async render(grow: Grow): Promise<void> {
        // Build slides from entries, sorted chronologically (oldest first)
        const sortedEntries = [...grow.entries].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Calculate total days
        const totalDays = sortedEntries.length > 0
            ? Math.max(...sortedEntries.map(e => e.day))
            : 0;

        // Create slides - one per photo, or one slide if no photos
        // Need to resolve IndexedDB photoIds to data URLs
        const slidePromises = sortedEntries.map(async (entry, entryIndex): Promise<GallerySlide[]> => {
            // Gather photos from both legacy (base64) and new (IndexedDB) storage
            let photos: string[] = [];

            // Legacy base64 photos
            if (entry.photos && entry.photos.length > 0) {
                photos = [...entry.photos];
            } else if (entry.photo) {
                photos = [entry.photo];
            }

            // New IndexedDB photos
            if (entry.photoIds && entry.photoIds.length > 0) {
                const indexedPhotos = await Promise.all(
                    entry.photoIds.map(id => photoStore.getPhotoAsDataURL(id))
                );
                photos = [...photos, ...indexedPhotos.filter((p): p is string => p !== null)];
            }

            // Get associated plants
            const entryPlants = entry.plantIds && entry.plantIds.length > 0
                ? entry.plantIds.map(pid => {
                    const plantIndex = grow.plants.findIndex(p => p.id === pid);
                    const plant = grow.plants[plantIndex];
                    return plant ? {
                        name: plant.name,
                        color: PLANT_COLORS[plantIndex % PLANT_COLORS.length]
                    } : null;
                }).filter(Boolean) as { name: string; color: string }[]
                : [];

            const baseSlide = {
                day: entry.day,
                date: entry.date,
                week: Math.ceil((entry.day + 1) / 7),
                phase: formatPhase(entry.phase),
                phaseColor: PHASE_COLORS[entry.phase] || '#666',
                title: entry.title,
                content: entry.content,
                entryId: entry.id,
                dli: entry.dli,
                entryType: entry.type,
                plants: entryPlants,
                totalDays,
                totalEntries: sortedEntries.length,
                currentEntryIndex: entryIndex + 1,
            };

            if (photos.length === 0) {
                return [{ ...baseSlide }];
            }

            return photos.map((photo, index) => ({
                ...baseSlide,
                photo,
                photoIndex: photos.length > 1 ? index + 1 : undefined,
                photoCount: photos.length > 1 ? photos.length : undefined,
            }));
        });

        // Wait for all slides to resolve
        const slideArrays = await Promise.all(slidePromises);
        this.slides = slideArrays.flat();

        // If no entries, show empty state
        if (this.slides.length === 0) {
            this.container.innerHTML = `
        <div class="gallery-overlay">
          <div class="gallery-empty">
            <div class="gallery-empty-icon">📷</div>
            <h3>No entries yet</h3>
            <p>Add diary entries to build your grow gallery!</p>
            <button class="gallery-close btn-primary">Close</button>
          </div>
        </div>
      `;
            this.setupEvents();
            return;
        }

        this.currentIndex = 0;
        const slide = this.slides[0];

        // Build phase segments for timeline
        this.phaseSegments = this.buildPhaseSegments(grow);
        this.totalGrowDays = this.phaseSegments.reduce((sum, seg) => sum + seg.days, 0);

        // Calculate stats
        const totalPhotos = this.slides.filter(s => s.photo).length;
        const uniqueDays = new Set(this.slides.map(s => s.day)).size;

        // Render dots (show max 20, then use ranges)
        const maxDots = 20;
        const showAllDots = this.slides.length <= maxDots;

        const html = `
      <div class="gallery-overlay">
        <div class="gallery-container">
          <header class="gallery-header-section">
            <div class="gallery-header-row">
              <div class="gallery-header-info">
                <h3>${this.escapeHtml(grow.strain)}</h3>
                <span class="gallery-stats">${grow.plantCount} plant${grow.plantCount !== 1 ? 's' : ''} · ${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''} · ${uniqueDays} day${uniqueDays !== 1 ? 's' : ''}</span>
              </div>
              <div class="gallery-controls">
                <span class="gallery-counter">1 / ${this.slides.length}</span>
                <button class="gallery-play icon-btn" title="Play">▶</button>
                <button class="gallery-close icon-btn" title="Close">×</button>
              </div>
            </div>
            ${this.renderPhaseTimeline(slide.day)}
          </header>

          <div class="gallery-slides">
            <button class="gallery-nav gallery-prev" title="Previous">‹</button>
            <div class="gallery-slide fade-in">
              ${this.renderSlideContent(slide)}
            </div>
            <button class="gallery-nav gallery-next" title="Next">›</button>
          </div>

          <div class="gallery-dots">
            ${showAllDots
                ? this.slides.map((_, i) => `
                  <button class="gallery-dot ${i === 0 ? 'active' : ''}" data-slide-index="${i}"></button>
                `).join('')
                : `
                  <button class="gallery-dot active" data-slide-index="0"></button>
                  <span class="gallery-dots-info">${this.slides.length} slides</span>
                  <button class="gallery-dot" data-slide-index="${this.slides.length - 1}"></button>
                `
            }
          </div>
        </div>
      </div>
    `;

        this.container.innerHTML = html;
        this.setupEvents();
    }

    close(): void {
        this.pausePlay();
        // Remove keyboard listener
        if ((this as any)._keyHandler) {
            document.removeEventListener('keydown', (this as any)._keyHandler);
        }
        this.container.innerHTML = '';
        this.onClose();
    }

    private buildPhaseSegments(grow: Grow): PhaseSegment[] {
        const segments: PhaseSegment[] = [];
        const startDate = new Date(grow.dates.germStart);
        const endDate = grow.dates.harvest
            ? new Date(grow.dates.harvest)
            : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 2 weeks ahead if no harvest

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

    private renderPhaseTimeline(currentDay: number): string {
        if (this.phaseSegments.length === 0) return '';

        const markerPosition = this.totalGrowDays > 0
            ? Math.max(0, Math.min(100, (currentDay / this.totalGrowDays) * 100))
            : 0;

        const segmentsHtml = this.phaseSegments.map(seg => {
            const width = (seg.days / this.totalGrowDays) * 100;
            return `<div class="gallery-phase-segment" style="width: ${width}%; background: ${PHASE_COLORS[seg.phase]}" title="${formatPhase(seg.phase)}: ${seg.days}d"></div>`;
        }).join('');

        const labelsHtml = this.phaseSegments.map(seg => {
            const width = (seg.days / this.totalGrowDays) * 100;
            // Only show label if segment is wide enough
            const label = width > 8 ? formatPhase(seg.phase) : '';
            return `<div class="gallery-phase-label" style="width: ${width}%; color: ${PHASE_COLORS[seg.phase]}">${label}</div>`;
        }).join('');

        return `
      <div class="gallery-phase-timeline">
        <div class="gallery-phase-bar">
          ${segmentsHtml}
          <div class="gallery-phase-marker" style="left: ${markerPosition}%">
            <div class="phase-marker-head"></div>
            <div class="phase-marker-line"></div>
          </div>
        </div>
        <div class="gallery-phase-labels">${labelsHtml}</div>
      </div>
    `;
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
