export class DLICalculatorModal {
  private container: HTMLElement;
  private onClose: () => void;
  private onUseValue?: (dli: number) => void;
  private isInline: boolean = false;

  constructor(container: HTMLElement, onClose: () => void, onUseValue?: (dli: number) => void, isInline: boolean = false) {
    this.container = container;
    this.onClose = onClose;
    this.onUseValue = onUseValue;
    this.isInline = isInline;
  }

  private setupEvents(): void {
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (target.closest('.modal-close')) {
        e.stopPropagation();
        this.close();
      }

      if (!this.isInline && target.classList.contains('modal-overlay')) {
        e.stopPropagation();
        this.close();
      }

      if (target.id === 'use-dli-value') {
        e.stopPropagation();
        this.useValue();
      }
    });

    this.container.addEventListener('input', () => {
      this.updateCalculations();
    });
  }

  render(): void {
    const modalHtml = `
      <div class="modal">
        <header class="modal-header">
          <h3>💡 DLI Calculator</h3>
          <button class="modal-close icon-btn">×</button>
        </header>
        <div class="modal-body">
          <p class="modal-info">
            Calculate your Daily Light Integral (DLI) based on your light's PPFD and photoperiod.
          </p>
          
          <div class="form-group">
            <label for="calc-ppfd">PPFD (μmol/m²/s)</label>
            <input 
              type="number" 
              id="calc-ppfd" 
              min="100" 
              max="2000"
              value="600"
              placeholder="e.g. 600"
            >
            <span class="form-hint">Your light's output at canopy level</span>
          </div>
          
          <div class="form-group">
            <label for="calc-hours">Light Hours per Day</label>
            <input 
              type="number" 
              id="calc-hours" 
              min="1" 
              max="24"
              value="18"
              placeholder="e.g. 18"
            >
          </div>
          
          <div class="dli-result" id="dli-result">
            <div class="dli-result-value">
              <span class="dli-number">38.9</span>
              <span class="dli-unit">mol/m²/day</span>
            </div>
            <div class="dli-status" id="dli-status">
              <!-- Status will be updated dynamically -->
            </div>
            ${this.onUseValue ? `
              <button type="button" class="btn btn-primary" id="use-dli-value">
                Use This Value
              </button>
            ` : ''}
          </div>
          
          <div class="dli-targets">
            <h4>📊 DLI Targets by Phase</h4>
            <div class="dli-target-list">
              <div class="dli-target-item">
                <span class="dli-target-phase" style="color: var(--color-germination)">🌱 Germination</span>
                <span class="dli-target-range">5-10 mol/m²/day</span>
              </div>
              <div class="dli-target-item">
                <span class="dli-target-phase" style="color: var(--color-seedling)">🌿 Seedling</span>
                <span class="dli-target-range">13-19 mol/m²/day</span>
              </div>
              <div class="dli-target-item">
                <span class="dli-target-phase" style="color: var(--color-veg)">🪴 Veg</span>
                <span class="dli-target-range">25-45 mol/m²/day</span>
              </div>
              <div class="dli-target-item">
                <span class="dli-target-phase" style="color: var(--color-flower)">🌸 Flower</span>
                <span class="dli-target-range">40-65 mol/m²/day</span>
              </div>
            </div>
          </div>
          
          <div class="dli-presets">
            <h4>⚡ Quick Presets</h4>
            <div class="preset-buttons">
              <button type="button" class="preset-btn" data-ppfd="400" data-hours="18">
                Seedling<br><small>400<span class="stat-unit">μmol</span> × 18<span class="stat-unit">h</span></small>
              </button>
              <button type="button" class="preset-btn" data-ppfd="600" data-hours="18">
                Veg<br><small>600<span class="stat-unit">μmol</span> × 18<span class="stat-unit">h</span></small>
              </button>
              <button type="button" class="preset-btn" data-ppfd="800" data-hours="12">
                Flower<br><small>800<span class="stat-unit">μmol</span> × 12<span class="stat-unit">h</span></small>
              </button>
              <button type="button" class="preset-btn" data-ppfd="1000" data-hours="12">
                Max Flower<br><small>1000<span class="stat-unit">μmol</span> × 12<span class="stat-unit">h</span></small>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const html = this.isInline ? modalHtml : `<div class="modal-overlay">${modalHtml}</div>`;

    this.container.innerHTML = html;
    this.setupEvents();
    this.setupPresetButtons();
    this.updateCalculations();
  }

  private setupPresetButtons(): void {
    this.container.querySelectorAll('[data-ppfd][data-hours]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ppfd = btn.getAttribute('data-ppfd');
        const hours = btn.getAttribute('data-hours');

        const ppfdInput = this.container.querySelector('#calc-ppfd') as HTMLInputElement;
        const hoursInput = this.container.querySelector('#calc-hours') as HTMLInputElement;

        if (ppfdInput && ppfd) ppfdInput.value = ppfd;
        if (hoursInput && hours) hoursInput.value = hours;

        this.updateCalculations();
      });
    });
  }

  private updateCalculations(): void {
    const ppfd = parseFloat((this.container.querySelector('#calc-ppfd') as HTMLInputElement)?.value) || 0;
    const hours = parseFloat((this.container.querySelector('#calc-hours') as HTMLInputElement)?.value) || 0;

    const dli = (ppfd * hours * 3600) / 1_000_000;

    const resultEl = this.container.querySelector('.dli-number');
    const statusEl = this.container.querySelector('#dli-status');

    if (resultEl) {
      resultEl.textContent = dli.toFixed(1);
    }

    if (statusEl) {
      let status = '';
      let statusClass = '';

      if (dli < 5) {
        status = '⚠️ Too low - not enough light for healthy growth';
        statusClass = 'warning';
      } else if (dli < 13) {
        status = '🌱 Good for germination/early seedling';
        statusClass = 'germination';
      } else if (dli < 25) {
        status = '🌿 Good for seedlings/early veg';
        statusClass = 'seedling';
      } else if (dli < 45) {
        status = '🪴 Excellent for vegetative growth';
        statusClass = 'veg';
      } else if (dli < 65) {
        status = '🌸 Excellent for flowering';
        statusClass = 'flower';
      } else {
        status = '⚠️ Very high - may cause light stress';
        statusClass = 'warning';
      }

      statusEl.innerHTML = `<span class="dli-status-text ${statusClass}">${status}</span>`;
    }
  }

  private useValue(): void {
    const dli = parseFloat((this.container.querySelector('.dli-number') as HTMLElement)?.textContent || '0');
    if (this.onUseValue) {
      this.onUseValue(dli);
    }
    this.close();
  }

  setUseValueCallback(callback: (dli: number) => void): void {
    this.onUseValue = callback;
  }

  close(): void {
    this.container.innerHTML = '';
    this.onClose();
  }
}
