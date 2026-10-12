/**
 * Tutorial Overlay component - guides users through features with highlighted elements
 */
export class TutorialOverlay {
  private currentStep: number = 0;
  private steps: TutorialStep[] = [];
  private onComplete: (() => void) | null = null;

  constructor(_container: HTMLElement) {
    // Container not needed since we use document.querySelector
  }

  startTutorial(steps: TutorialStep[], onComplete?: () => void): void {
    this.steps = steps;
    this.currentStep = 0;
    this.onComplete = onComplete || null;
    this.showStep();
  }

  private showStep(): void {
    if (this.currentStep >= this.steps.length) {
      this.endTutorial();
      return;
    }

    const step = this.steps[this.currentStep];
    const targetElement = document.querySelector(step.selector) as HTMLElement;

    if (!targetElement) {
      console.warn(`Tutorial step ${this.currentStep}: element not found for selector "${step.selector}"`);
      this.nextStep();
      return;
    }

    // Scroll the element into view
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    this.createOverlay(targetElement, step);
  }

  private createOverlay(targetElement: HTMLElement, step: TutorialStep): void {
    // Remove existing overlay
    this.removeOverlay();

    // Create backdrop with hole for target element
    const backdrop = document.createElement('div');
    backdrop.className = 'tutorial-backdrop';

    // Create highlight ring around target element
    const highlight = document.createElement('div');
    highlight.className = 'tutorial-highlight';

    // Also add a class to the target element itself
    targetElement.classList.add('tutorial-highlight-target');


    // Create tutorial dialog
    const dialog = document.createElement('div');
    dialog.className = 'tutorial-dialog';
    dialog.style.position = 'fixed';
    dialog.style.background = 'var(--color-bg-elevated)';
    dialog.style.border = '1px solid var(--color-border)';
    dialog.style.borderRadius = '12px';
    dialog.style.padding = 'var(--space-lg)';
    dialog.style.boxShadow = 'var(--shadow-lg)';
    dialog.style.maxWidth = 'min(400px, calc(100vw - 32px))';
    dialog.style.boxSizing = 'border-box';
    dialog.style.zIndex = '10002';
    dialog.style.pointerEvents = 'auto';

    dialog.innerHTML = `
      <div style="margin-bottom: var(--space-md);">
        <h3 style="margin: 0 0 var(--space-sm) 0; color: var(--color-text); font-size: 1.1rem; font-weight: 600;">${step.title}</h3>
        <p style="margin: 0; color: var(--color-text-muted); line-height: 1.5;">${step.description}</p>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-lg);">
        <button class="tutorial-skip" style="
          background: none;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: var(--space-xs);
          font-size: 0.9rem;
        ">Skip Tutorial</button>
        <div style="display: flex; align-items: center; gap: var(--space-md);">
          <span style="color: var(--color-text-muted); font-size: 0.9rem;">${this.currentStep + 1} of ${this.steps.length}</span>
          <button class="tutorial-next" style="
            background: var(--color-primary);
            color: white;
            border: none;
            border-radius: 6px;
            padding: var(--space-sm) var(--space-md);
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
          ">${this.currentStep === this.steps.length - 1 ? 'Finish' : 'Next'}</button>
        </div>
      </div>
      <div class="tutorial-arrow" data-position="${step.position}"></div>
    `;

    // Add to DOM
    document.body.appendChild(backdrop);
    document.body.appendChild(highlight);
    document.body.appendChild(dialog);

    // Keep spotlight and dialog glued to the target. scrollIntoView() is
    // smooth, so the target is still moving when we get here — measuring
    // once would leave the dialog sitting on top of the highlighted field.
    const GAP = 16;
    const MARGIN = 16;
    const updatePosition = () => {
      const r = targetElement.getBoundingClientRect();
      highlight.style.top = `${r.top - 4}px`;
      highlight.style.left = `${r.left - 4}px`;
      highlight.style.width = `${r.width + 8}px`;
      highlight.style.height = `${r.height + 8}px`;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dw = dialog.offsetWidth;
      const dh = dialog.offsetHeight;
      const left = Math.max(MARGIN, Math.min(r.left, vw - dw - MARGIN));
      let top: number;
      if (vh - r.bottom >= dh + GAP + MARGIN) {
        top = r.bottom + GAP;                  // below
      } else if (r.top >= dh + GAP + MARGIN) {
        top = r.top - GAP - dh;                // above
      } else {
        top = vh - dh - MARGIN;                // tall target: pin to bottom edge
      }
      dialog.style.top = `${Math.max(MARGIN, top)}px`;
      dialog.style.left = `${left}px`;
    };

    updatePosition();
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updatePosition);
    };
    window.addEventListener('scroll', onMove, { passive: true, capture: true });
    window.addEventListener('resize', onMove, { passive: true });
    (highlight as any)._tutorialCleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onMove, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', onMove);
    };

    // Store references
    backdrop.dataset.tutorial = 'backdrop';
    highlight.dataset.tutorial = 'highlight';
    dialog.dataset.tutorial = 'dialog';

    // Setup event listeners
    const nextBtn = dialog.querySelector('.tutorial-next') as HTMLElement;
    const skipBtn = dialog.querySelector('.tutorial-skip') as HTMLElement;

    nextBtn.addEventListener('click', () => this.nextStep());
    skipBtn.addEventListener('click', () => this.skipTutorial());
  }

  private nextStep(): void {
    this.currentStep++;
    this.showStep();
  }

  private endTutorial(): void {
    this.removeOverlay();
    if (this.onComplete) {
      this.onComplete();
    }
  }

  private skipTutorial(): void {
    localStorage.setItem('grow-form-tutorial-seen-v5', 'true');
    this.removeOverlay();
    // Don't call onComplete for skip
  }

  public removeOverlay(): void {
    // Remove all tutorial elements
    const tutorialElements = document.querySelectorAll('[data-tutorial]');
    tutorialElements.forEach(el => {
      // Call cleanup function if it exists
      if ((el as any)._tutorialCleanup) {
        (el as any)._tutorialCleanup();
      }
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });

    // Remove highlight class from target elements
    const highlightedElements = document.querySelectorAll('.tutorial-highlight-target');
    highlightedElements.forEach(el => {
      el.classList.remove('tutorial-highlight-target');
    });
  }
}

export interface TutorialStep {
  selector: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}