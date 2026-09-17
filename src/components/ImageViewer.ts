/**
 * ImageViewer - Fullscreen image viewer with navigation and close button
 */
export class ImageViewer {
    private container: HTMLElement;
    private images: string[] = [];
    private currentIndex = 0;
    private keyHandler?: (e: KeyboardEvent) => void;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    /**
     * Open the viewer with a single image or array of images
     */
    open(images: string | string[], startIndex = 0): void {
        this.images = Array.isArray(images) ? images : [images];
        this.currentIndex = Math.max(0, Math.min(startIndex, this.images.length - 1));
        this.render();
        this.setupEvents();
    }

    /**
     * Close the viewer
     */
    close(): void {
        this.cleanup();
        this.container.innerHTML = '';
    }

    /**
     * Show next image
     */
    private next(): void {
        if (this.currentIndex < this.images.length - 1) {
            this.currentIndex++;
            this.updateImage();
        }
    }

    /**
     * Show previous image
     */
    private prev(): void {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.updateImage();
        }
    }

    /**
     * Update the displayed image
     */
    private updateImage(): void {
        const img = this.container.querySelector('.image-viewer-img') as HTMLImageElement;
        const counter = this.container.querySelector('.image-viewer-counter') as HTMLElement;
        const prevBtn = this.container.querySelector('.image-viewer-prev') as HTMLButtonElement;
        const nextBtn = this.container.querySelector('.image-viewer-next') as HTMLButtonElement;

        if (img) {
            img.src = this.images[this.currentIndex];
        }

        if (counter && this.images.length > 1) {
            counter.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
        }

        // Enable/disable navigation buttons
        if (prevBtn) {
            prevBtn.disabled = this.currentIndex === 0;
        }
        if (nextBtn) {
            nextBtn.disabled = this.currentIndex === this.images.length - 1;
        }
    }

    /**
     * Setup event listeners
     */
    private setupEvents(): void {
        // Click events
        this.container.addEventListener('click', this.handleClick);

        // Keyboard navigation
        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.close();
            if (e.key === 'ArrowLeft') this.prev();
            if (e.key === 'ArrowRight') this.next();
        };
        document.addEventListener('keydown', this.keyHandler);
    }

    /**
     * Handle click events
     */
    private handleClick = (e: MouseEvent): void => {
        const target = e.target as HTMLElement;

        // Close on overlay click (but not on image or controls)
        if (target.classList.contains('image-viewer-overlay')) {
            this.close();
        }

        // Close button
        if (target.closest('.image-viewer-close')) {
            this.close();
        }

        // Navigation buttons
        if (target.closest('.image-viewer-prev')) {
            this.prev();
        }

        if (target.closest('.image-viewer-next')) {
            this.next();
        }
    };

    /**
     * Cleanup event listeners
     */
    private cleanup(): void {
        this.container.removeEventListener('click', this.handleClick);
        if (this.keyHandler) {
            document.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = undefined;
        }
    }

    /**
     * Render the viewer
     */
    private render(): void {
        const showNav = this.images.length > 1;
        const counter = showNav ? `<div class="image-viewer-counter">${this.currentIndex + 1} / ${this.images.length}</div>` : '';

        const html = `
      <div class="image-viewer-overlay">
        <button class="image-viewer-close" aria-label="Close viewer">×</button>
        ${counter}
        <div class="image-viewer-content">
          <img src="${this.images[this.currentIndex]}" alt="Full size image" class="image-viewer-img">
        </div>
        ${showNav ? `
          <button class="image-viewer-prev" aria-label="Previous image" ${this.currentIndex === 0 ? 'disabled' : ''}>
            ‹
          </button>
          <button class="image-viewer-next" aria-label="Next image" ${this.currentIndex === this.images.length - 1 ? 'disabled' : ''}>
            ›
          </button>
        ` : ''}
      </div>
    `;

        this.container.innerHTML = html;
    }
}
