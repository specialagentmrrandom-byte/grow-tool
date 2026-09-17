import { type Grow, type GrowType, type Plant, type TentConfig, DEFAULT_LIGHT, PLANT_COLORS, TENT_SIZES, calculateGrowDates, generateId, getGrowColor, CANNABIS_STRAINS } from '../types';
import { store } from '../store';
import { TentPlanner } from './TentPlanner';
import { TutorialOverlay, type TutorialStep } from './TutorialOverlay';

/**
 * Grow form component - create/edit grows
 */
export class GrowForm {
  private container: HTMLElement;
  private onSave: (grow: Grow) => void;
  private onCancel: () => void;
  private editingGrow: Grow | null = null;
  private seedlingDays: number = 7;
  private vegWeeks: number = 3;
  private flowerWeeks: number = 8;
  private flushDays: number = 10;
  private plants: Plant[] = [];
  private tentConfig: TentConfig = { width: 80, depth: 80 };
  private tentPlanner: TentPlanner | null = null;
  private lastUsedPotSize: number = 11;
  private potSizeUpdateTimer: number | null = null;
  private tutorialOverlay: TutorialOverlay;
  private tutorialStarted: boolean = false;

  constructor(
    container: HTMLElement,
    callbacks: {
      onSave: (grow: Grow) => void;
      onCancel: () => void;
    }
  ) {
    this.container = container;
    this.onSave = callbacks.onSave;
    this.onCancel = callbacks.onCancel;
    this.tutorialOverlay = new TutorialOverlay(container);
    this.setupEvents();
    this.initializeTentPlanner();
  }

  private initializeTentPlanner(): void {
    // TentPlanner will be created in renderTentPlanner with the correct container
  }

  private setupEvents(): void {
    this.container.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.cancel-btn')) {
        this.tutorialOverlay.removeOverlay(); // Clean up tutorial when cancelling
        this.onCancel();
      }

      // Add plant button
      if (target.closest('.add-plant-btn')) {
        this.addPlant();
      }

      // Remove plant button
      const removeBtn = target.closest<HTMLElement>('[data-remove-plant]');
      if (removeBtn) {
        const plantId = removeBtn.dataset.removePlant!;
        this.removePlant(plantId);
      }

      // Tent preset selection
      const tentPresetBtn = target.closest<HTMLElement>('[data-tent-preset]');
      if (tentPresetBtn) {
        const index = parseInt(tentPresetBtn.dataset.tentPreset!, 10);
        const preset = TENT_SIZES[index];
        this.tentConfig = { width: preset.width, depth: preset.depth };
        this.updateTentInputs();
        this.renderTentPlanner();
      }
    });

    this.container.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'grow-type') {
        this.updateTypeFields();
        this.updateDatePreview();
      }
      if (target.id === 'germ-start') {
        this.updateDatePreview();
      }
      if (target.id === 'tent-width' || target.id === 'tent-depth') {
        this.tentConfig.width = parseInt((this.container.querySelector('#tent-width') as HTMLInputElement)?.value || '80', 10);
        this.tentConfig.depth = parseInt((this.container.querySelector('#tent-depth') as HTMLInputElement)?.value || '80', 10);
        this.updateTentPresetUI();
        this.renderTentPlanner();
      }
      if (target.id === 'seedling-days') {
        this.seedlingDays = parseInt((target as HTMLInputElement).value, 10);
        this.updateDatePreview();
      }
      if (target.id === 'veg-weeks') {
        this.vegWeeks = parseInt((target as HTMLInputElement).value, 10);
        this.updateDatePreview();
      }
      if (target.id === 'flower-weeks') {
        this.flowerWeeks = parseInt((target as HTMLInputElement).value, 10);
        this.updateDatePreview();
      }
      if (target.id === 'flush-days') {
        this.flushDays = parseInt((target as HTMLInputElement).value, 10);
        this.updateDatePreview();
      }
      if (target.classList.contains('plant-seed-type')) {
        const plantId = target.dataset.plantId!;
        const plant = this.plants.find(p => p.id === plantId);
        if (plant) plant.seedType = (target as HTMLSelectElement).value as 'feminized' | 'regular' | 'experimental';
      }
    });

    // Plant field changes (delegated)
    this.container.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.classList.contains('plant-name-input')) {
        const plantId = target.dataset.plantId!;
        const plant = this.plants.find(p => p.id === plantId);
        if (plant) plant.name = target.value;
      }
      if (target.classList.contains('plant-strain-input')) {
        const plantId = target.dataset.plantId!;
        const plant = this.plants.find(p => p.id === plantId);
        if (plant) plant.strain = target.value;
      }
      if (target.classList.contains('plant-pot-slider')) {
        const plantId = target.dataset.plantId!;
        const plant = this.plants.find(p => p.id === plantId);
        if (plant) {
          const newPotSize = parseInt(target.value, 10);
          plant.potLiters = newPotSize;
          this.lastUsedPotSize = newPotSize;
          // Update the display span
          const displaySpan = target.parentElement?.querySelector('.pot-size-display');
          if (displaySpan) displaySpan.textContent = `${target.value}L`;
          // Immediately refresh the single pot in the tent for responsive feedback,
          // and also debounce a full re-render to keep layout consistent after sliding.
          if (this.tentPlanner) this.tentPlanner.refreshPlant(plant);
          if (this.potSizeUpdateTimer) window.clearTimeout(this.potSizeUpdateTimer);
          this.potSizeUpdateTimer = window.setTimeout(() => {
            this.renderTentPlanner();
            this.potSizeUpdateTimer = null;
          }, 120);
        }
      }
      // Slider value updates
      if (target.id === 'seedling-days') {
        const span = target.parentElement?.querySelector('.input-unit');
        if (span) span.textContent = `${target.value}d`;
      }
      if (target.id === 'veg-weeks') {
        const span = target.parentElement?.querySelector('.input-unit');
        if (span) span.textContent = `${target.value}w`;
      }
      if (target.id === 'flower-weeks') {
        const span = target.parentElement?.querySelector('.input-unit');
        if (span) span.textContent = `${target.value}w`;
      }
      if (target.id === 'flush-days') {
        const span = target.parentElement?.querySelector('.input-unit');
        if (span) span.textContent = `${target.value}d`;
      }
      if (target.classList.contains('plant-pot-size')) {
        const plantId = target.dataset.plantId!;
        const plant = this.plants.find(p => p.id === plantId);
        if (plant) plant.potLiters = parseInt(target.value, 10);
        // update tent after numeric change
        if (this.potSizeUpdateTimer) window.clearTimeout(this.potSizeUpdateTimer);
        this.potSizeUpdateTimer = window.setTimeout(() => {
          this.renderTentPlanner();
          this.potSizeUpdateTimer = null;
        }, 120);
      }
      if (target.classList.contains('plant-seed-type')) {
        const plantId = target.dataset.plantId!;
        const plant = this.plants.find(p => p.id === plantId);
        if (plant) plant.seedType = target.value as 'feminized' | 'regular' | 'experimental';
      }
    });
  }

  private addPlant(): void {
    const nextPotNumber = this.plants.length > 0
      ? Math.max(...this.plants.map(p => p.potNumber)) + 1
      : 1;

    this.plants.unshift({
      id: generateId('plant'),
      potNumber: nextPotNumber,
      name: `Plant ${nextPotNumber}`,
      strain: '',
      seedType: 'feminized',
      potLiters: this.lastUsedPotSize,
    });

    this.renderPlantsList();
    this.renderTentPlanner();
  }

  private removePlant(plantId: string): void {
    this.plants = this.plants.filter(p => p.id !== plantId);
    this.renderPlantsList();
    this.renderTentPlanner();
  }

  private renderPlantsList(): void {
    const plantsContainer = this.container.querySelector('#plants-list');
    if (!plantsContainer) return;

    const defaultStrain = (this.container.querySelector('#strain') as HTMLInputElement)?.value ?? '';

    const headerHtml = this.plants.length > 0 ? `
      <div class="plant-row plant-row-header">
        <span class="plant-col-header">#</span>
        <span class="plant-col-header">Name</span>
        <span class="plant-col-header">Strain</span>
        <span class="plant-col-header">Seed Type</span>
        <span class="plant-col-header">Pot Size</span>
        <span class="plant-col-header"></span>
      </div>
    ` : '';

    plantsContainer.innerHTML = headerHtml + this.plants.map((plant, index) => `
            <div class="plant-row" data-plant-id="${plant.id}">
                <span class="plant-pot-badge" style="background: ${PLANT_COLORS[index % PLANT_COLORS.length]}">#${plant.potNumber}</span>
                <input 
                    type="text" 
                    class="plant-name-input" 
                    data-plant-id="${plant.id}"
                    value="${this.escapeHtml(plant.name)}"
                    placeholder="Plant name"
                >
                <input 
                    type="text" 
                    class="plant-strain-input" 
                    data-plant-id="${plant.id}"
                    value="${this.escapeHtml(plant.strain || defaultStrain)}"
                    placeholder="Strain"
                    list="strain-list"
                >
                <select class="plant-seed-type" data-plant-id="${plant.id}" title="Seed type">
                    <option value="feminized" ${plant.seedType === 'feminized' || !plant.seedType ? 'selected' : ''}>feminized</option>
                    <option value="regular" ${plant.seedType === 'regular' ? 'selected' : ''}>regular</option>
                    <option value="experimental" ${plant.seedType === 'experimental' ? 'selected' : ''}>experimental</option>
                </select>
                <div class="pot-size-slider-container">
                    <input 
                        type="range" 
                        class="plant-pot-slider" 
                        data-plant-id="${plant.id}"
                        min="3" 
                        max="50" 
                        step="1" 
                        value="${plant.potLiters || 11}"
                        title="Pot size in liters"
                    >
                    <span class="pot-size-display">${plant.potLiters || 11}L</span>
                </div>
                <button type="button" class="remove-plant-btn icon-btn" data-remove-plant="${plant.id}" title="Remove">×</button>
            </div>
        `).join('');
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  render(grow?: Grow): void {
    // Clean up any existing tutorial when re-rendering
    this.tutorialOverlay.removeOverlay();
    this.editingGrow = grow ?? null;
    this.plants = grow?.plants ? [...grow.plants] : [];
    this.tentConfig = grow?.tent ?? { width: 80, depth: 80 };
    // Initialize lastUsedPotSize from existing plants or default
    this.lastUsedPotSize = this.plants.length > 0 ? (this.plants[0].potLiters || 11) : 11;

    // Reset tutorial flag for new grows
    if (!grow) {
      this.tutorialStarted = false;
    }

    // Set veg weeks based on grow type
    if (grow) {
      // For existing grows, use the calculated veg weeks from dates
      const vegStart = grow.dates.vegStart ? new Date(grow.dates.vegStart) : null;
      const flowerStart = grow.dates.flowerStart ? new Date(grow.dates.flowerStart) : null;

      if (vegStart && flowerStart) {
        const vegDays = Math.floor((flowerStart.getTime() - vegStart.getTime()) / (1000 * 60 * 60 * 24));
        this.vegWeeks = Math.floor(vegDays / 7);
      } else if (grow.type === 'auto') {
        this.vegWeeks = 0;
      } else {
        this.vegWeeks = 3; // Default for photo plants
      }
    } else {
      // For new grows, set based on type (will be updated by updateTypeFields)
      this.vegWeeks = 3; // Default
    }

    const strains = store.getStrains();
    const randomStrain = grow ? grow.strain : CANNABIS_STRAINS[Math.floor(Math.random() * CANNABIS_STRAINS.length)];
    const today = new Date().toISOString().split('T')[0];
    const growColor = grow ? getGrowColor(grow.id) : '';

    const html = `
      <form class="grow-form" ${grow ? `style="--grow-color: ${growColor}"` : ''}>
        <header class="form-header">
          <button type="button" class="cancel-btn icon-btn">←</button>
          <h2>${grow ? 'Edit Grow' : 'New Grow'}</h2>
          <button type="submit" class="save-btn">Save</button>
        </header>
        
        <div class="form-body">
          <!-- Basic Info Section -->
          <section class="form-section">
            <div class="form-card">
              <div class="form-row">
                <div class="form-group">
                  <label for="strain">🌿 Grow Name</label>
                  <input 
                    type="text" 
                    id="strain" 
                    name="strain" 
                    list="strain-list"
                    value="${randomStrain}"
                    placeholder="e.g. Northern Lights Auto"
                    required
                  >
                  <datalist id="strain-list">
                    ${strains.map((s: string) => `<option value="${s}">`).join('')}
                  </datalist>
                </div>
                
                <div class="form-group">
                  <label for="grow-type">Type</label>
                  <div class="segmented-control">
                    <button type="button" class="segment ${grow?.type === 'auto' ? 'active' : ''}" data-type="auto">🌱 Automatics</button>
                    <button type="button" class="segment ${!grow || grow?.type === 'photo' ? 'active' : ''}" data-type="photo">💡 Photoflowering</button>
                  </div>
                  <input type="hidden" id="grow-type" name="type" value="${grow?.type ?? 'photo'}">
                </div>
              </div>
            </div>
          </section>
          
          <!-- Schedule Section -->
          <section class="form-section">
            <h3 class="section-title">📅 Schedule
              <span class="tooltip">
                <span class="tooltip-icon">i</span>
                <span class="tooltip-text">Set your grow timeline. Adjust weeks for each phase to match your strain's needs.</span>
              </span>
            </h3>
            <div class="form-card">
              <div class="date-row">
                <div class="form-group">
                  <label for="germ-start">Germination Start</label>
                  <input type="date" id="germ-start" name="germStart" value="${grow?.dates.germStart ?? today}" required>
                </div>
                <div class="date-preview" id="date-preview">
                  <!-- Calculated dates will appear here -->
                </div>
              </div>
              
              <div class="form-row">
                <div class="form-group">
                  <label for="seedling-days">Seedling Days</label>
                  <div class="input-with-unit">
                    <input type="range" id="seedling-days" name="seedlingDays" min="5" max="10" value="${this.seedlingDays}">
                    <span class="input-unit">${this.seedlingDays}d</span>
                  </div>
                </div>
                <div class="form-group">
                  <label for="veg-weeks">Veg Weeks</label>
                  <div class="input-with-unit">
                    <input type="range" id="veg-weeks" name="vegWeeks" min="0" max="6" value="${this.vegWeeks}">
                    <span class="input-unit">${this.vegWeeks}w</span>
                  </div>
                </div>
              </div>
              
              <div class="form-row">
                <div class="form-group">
                  <label for="flower-weeks">Flower Weeks</label>
                  <div class="input-with-unit">
                    <input type="range" id="flower-weeks" name="flowerWeeks" min="7" max="12" value="${this.flowerWeeks}">
                    <span class="input-unit">${this.flowerWeeks}w</span>
                  </div>
                </div>
                <div class="form-group">
                  <label for="flush-days">Flush Days</label>
                  <div class="input-with-unit">
                    <input type="range" id="flush-days" name="flushDays" min="7" max="14" value="${this.flushDays}">
                    <span class="input-unit">${this.flushDays}d</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          
          <!-- Grow Space Section -->
          <section class="form-section">
            <h3 class="section-title">🏕️ Grow Space</h3>
            <div class="form-card">
              <!-- Tent Subsection -->
              <div class="subsection">
                <h4 class="subsection-title">🏕️ Tent</h4>
                <div class="tent-layout-row">
                  <div class="tent-controls">
                    <div class="form-group">
                      <label>Size Preset</label>
                      <div class="preset-pills">
                        ${TENT_SIZES.map((tent, i) => `
                          <button type="button" 
                                  class="preset-pill ${tent.width === this.tentConfig.width && tent.depth === this.tentConfig.depth ? 'active' : ''}" 
                                  data-tent-preset="${i}">
                            ${tent.label}
                          </button>
                        `).join('')}
                      </div>
                    </div>
                    
                    <div class="form-group">
                      <label for="tent-width">Width</label>
                      <div class="input-with-unit">
                        <input type="number" id="tent-width" name="tentWidth" min="40" max="300" value="${this.tentConfig.width}">
                        <span class="input-unit">cm</span>
                      </div>
                    </div>
                    
                    <div class="form-group">
                      <label for="tent-depth">Depth</label>
                      <div class="input-with-unit">
                        <input type="number" id="tent-depth" name="tentDepth" min="40" max="300" value="${this.tentConfig.depth}">
                        <span class="input-unit">cm</span>
                      </div>
                    </div>
                  </div>
                  
                  <div class="tent-planner-section">
                    <h4 class="subsection-title">📐 Tent Layout
                      <span class="tooltip">
                        <span class="tooltip-icon">i</span>
                        <span class="tooltip-text">Drag pots to position them in your tent. Use auto-arrange for optimal spacing.</span>
                      </span>
                    </h4>
                    <div id="tent-planner-container">
                      <!-- Tent planner will be rendered here -->
                    </div>
                  </div>
                  
                  <div class="plants-controls">
                    <button type="button" class="add-plant-btn btn-secondary">+ Add Plant</button>
                    <div id="plants-list" class="plants-list">
                      <!-- Plant rows rendered dynamically -->
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </form>
    `;

    this.container.innerHTML = html;
    this.setupTypeSegments();
    this.updateTypeFields();
    this.updateDatePreview();    // Initialize plants list
    if (this.plants.length === 0) {
      this.addPlant(); // Add default plant
    } else {
      this.renderPlantsList();
    }
    this.renderTentPlanner();

    // Show tutorial for new grows if user hasn't seen it before
    if (!grow && !localStorage.getItem('grow-form-tutorial-seen-v5') && !this.tutorialStarted) {
      this.tutorialStarted = true;
      // Delay to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        const checkElement = () => {
          const firstElement = document.querySelector('#strain');
          if (firstElement) {
            this.tutorialOverlay.startTutorial(this.getTutorialSteps(), () => {
              localStorage.setItem('grow-form-tutorial-seen-v5', 'true');
            });
          } else {
            setTimeout(checkElement, 100);
          }
        };
        setTimeout(checkElement, 500);
      });
    }
  }

  private renderTentPlanner(): void {
    const plannerContainer = this.container.querySelector('#tent-planner-container');
    if (!plannerContainer) return;

    // Create TentPlanner with the actual container
    this.tentPlanner = new TentPlanner(plannerContainer as HTMLElement, {
      onPlantMove: (plantId: string, position: { x: number; y: number }) => {
        const plant = this.plants.find(p => p.id === plantId);
        if (plant) {
          plant.position = position;
        }
      }
    });

    // Create a temporary grow object for the planner
    const tempGrow: Grow = {
      id: this.editingGrow?.id || 'temp',
      name: this.editingGrow?.name || '',
      strain: this.editingGrow?.strain || '',
      plantCount: this.plants.length,
      plants: this.plants,
      type: (this.container.querySelector('#grow-type') as HTMLInputElement)?.value as GrowType || 'photo',
      dates: this.editingGrow?.dates || {
        germStart: (this.container.querySelector('#germ-start') as HTMLInputElement)?.value || new Date().toISOString().split('T')[0],
        sprout: '',
        vegStart: '',
        flowerStart: '',
        flushStart: '',
        harvest: '',
      },
      light: this.editingGrow?.light || DEFAULT_LIGHT,
      tent: this.tentConfig,
      entries: this.editingGrow?.entries || [],
      createdAt: this.editingGrow?.createdAt || new Date().toISOString(),
      updatedAt: this.editingGrow?.updatedAt || new Date().toISOString(),
    };

    this.tentPlanner.render(tempGrow);
  }

  private setupTypeSegments(): void {
    this.container.querySelectorAll('.segment[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        const hiddenInput = this.container.querySelector('#grow-type') as HTMLInputElement;
        if (hiddenInput && type) {
          hiddenInput.value = type;
          this.container.querySelectorAll('.segment[data-type]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.updateTypeFields();
          this.updateDatePreview();
        }
      });
    });
  }

  private updateTypeFields(): void {
    const type = (this.container.querySelector('#grow-type') as HTMLInputElement)?.value;
    const photoFields = this.container.querySelectorAll('.photo-only');
    photoFields.forEach(el => {
      (el as HTMLElement).style.display = type === 'photo' ? '' : 'none';
    });

    // Handle veg weeks for auto vs photo plants
    const vegWeeksInput = this.container.querySelector('#veg-weeks') as HTMLInputElement;
    const vegWeeksContainer = vegWeeksInput?.parentElement?.parentElement as HTMLElement;

    if (type === 'auto') {
      // Autoflowers don't have a veg phase
      this.vegWeeks = 0;
      if (vegWeeksInput) vegWeeksInput.value = '0';
      if (vegWeeksContainer) vegWeeksContainer.style.display = 'none';
    } else {
      // Photo plants can have veg phase
      if (vegWeeksContainer) vegWeeksContainer.style.display = '';
      // Don't change the value if it's already set, but ensure it's not 0
      if (this.vegWeeks === 0) {
        this.vegWeeks = 3; // Default for photo plants
        if (vegWeeksInput) vegWeeksInput.value = '3';
      }
    }
  }

  private updateTentInputs(): void {
    const widthInput = this.container.querySelector('#tent-width') as HTMLInputElement;
    const depthInput = this.container.querySelector('#tent-depth') as HTMLInputElement;
    if (widthInput) widthInput.value = String(this.tentConfig.width);
    if (depthInput) depthInput.value = String(this.tentConfig.depth);
    this.updateTentPresetUI();
  }

  private updateTentPresetUI(): void {
    this.container.querySelectorAll('[data-tent-preset]').forEach(btn => {
      const index = parseInt(btn.getAttribute('data-tent-preset')!, 10);
      const preset = TENT_SIZES[index];
      btn.classList.toggle('active', preset.width === this.tentConfig.width && preset.depth === this.tentConfig.depth);
    });
  }

  private updateDatePreview(): void {
    const germStart = (this.container.querySelector('#germ-start') as HTMLInputElement)?.value;
    const type = (this.container.querySelector('#grow-type') as HTMLInputElement)?.value as GrowType;
    const previewEl = this.container.querySelector('#date-preview');

    if (!germStart || !previewEl) return;

    const dates = calculateGrowDates(germStart, this.seedlingDays, this.vegWeeks, this.flowerWeeks, this.flushDays);

    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    };

    const totalDays = Math.round(
      (new Date(dates.harvest!).getTime() - new Date(germStart).getTime()) / (1000 * 60 * 60 * 24)
    );

    previewEl.innerHTML = `
      <div class="date-preview-header">
        <strong>📅 Calculated Schedule</strong>
        <span class="total-days">${totalDays}<span class="stat-unit">d</span> total</span>
      </div>
      <div class="date-preview-grid">
        <div class="date-item">
          <span class="date-icon">🌱</span>
          <span class="date-label">Sprout</span>
          <span class="date-value">${formatDate(dates.sprout!)}</span>
        </div>
        ${dates.vegStart ? `
        <div class="date-item">
          <span class="date-icon">🌿</span>
          <span class="date-label">Veg Start</span>
          <span class="date-value">${formatDate(dates.vegStart)} <span class="phase-duration">(${this.vegWeeks}w)</span></span>
        </div>
        ` : ''}
        <div class="date-item">
          <span class="date-icon">🌸</span>
          <span class="date-label">${type === 'photo' ? 'Flip to Flower' : 'Flower Start'}</span>
          <span class="date-value">${formatDate(dates.flowerStart!)} <span class="phase-duration">(${this.flowerWeeks}w)</span></span>
        </div>
        <div class="date-item">
          <span class="date-icon">🚿</span>
          <span class="date-label">Flush Start</span>
          <span class="date-value">${formatDate(dates.flushStart!)} <span class="phase-duration">(${this.flushDays}d)</span></span>
        </div>
        <div class="date-item highlight">
          <span class="date-icon">🎉</span>
          <span class="date-label">Harvest</span>
          <span class="date-value">${formatDate(dates.harvest!)}</span>
        </div>
      </div>
    `;
  }

  private handleSubmit(): void {
    const form = this.container.querySelector('form') as HTMLFormElement;
    const formData = new FormData(form);

    const germStart = formData.get('germStart') as string;
    const type = formData.get('type') as GrowType;
    const strain = formData.get('strain') as string;

    // Calculate dates from current values
    const calculatedDates = calculateGrowDates(germStart, this.seedlingDays, this.vegWeeks, this.flowerWeeks, this.flushDays);

    // Ensure plants have the default strain if not set
    const plantsWithStrain = this.plants.map(p => ({
      ...p,
      strain: p.strain || strain
    }));

    const growData = {
      name: strain,
      strain: strain,
      plantCount: this.plants.length,
      plants: plantsWithStrain,
      type,
      dates: calculatedDates,
      light: this.editingGrow?.light ?? DEFAULT_LIGHT,
      tent: this.tentConfig,
    };

    let grow: Grow;

    if (this.editingGrow) {
      grow = store.updateGrow(this.editingGrow.id, growData)!;
    } else {
      grow = store.addGrow(growData);
    }

    this.onSave(grow);
  }

  private getTutorialSteps(): TutorialStep[] {
    return [
      {
        selector: '#strain',
        title: '🌿 Choose Your Grow Name',
        description: 'Give your grow a memorable name. You can choose from popular strains or create your own custom name.',
        position: 'bottom'
      },
      {
        selector: '.segmented-control',
        title: '🌱 Select Grow Type',
        description: 'Choose between autoflowering strains (grow faster, smaller plants) or photoflowering strains (need light cycles, larger yields).',
        position: 'bottom'
      },
      {
        selector: '#germ-start',
        title: '📅 Set Start Date',
        description: 'Pick when you plan to start germination. This sets the timeline for your entire grow cycle.',
        position: 'bottom'
      },
      {
        selector: '#seedling-days',
        title: '🌱 Seedling Phase',
        description: 'Adjust how many days your seedlings need before moving to vegetative growth. Usually 5-10 days.',
        position: 'top'
      },
      {
        selector: '#veg-weeks',
        title: '🌿 Vegetative Phase',
        description: 'Set weeks for vegetative growth. Autoflowers have very short veg periods, while photoflowers can veg for weeks.',
        position: 'top'
      },
      {
        selector: '#flower-weeks',
        title: '🌸 Flower Phase',
        description: 'Duration of the flowering/budding phase. Most strains flower for 7-12 weeks depending on the variety.',
        position: 'top'
      },
      {
        selector: '#flush-days',
        title: '🧼 Flush Period',
        description: 'Final cleansing phase before harvest. Plants get plain water to remove nutrients from tissues.',
        position: 'top'
      },
      {
        selector: '.preset-pills',
        title: '🏕️ Choose Tent Size',
        description: 'Select a preset tent size or customize dimensions. This affects how many plants you can fit.',
        position: 'bottom'
      },
      {
        selector: '#tent-planner-container',
        title: '📐 Plan Your Layout',
        description: 'Drag and drop plants to position them optimally in your tent. Use auto-arrange for perfect spacing.',
        position: 'top'
      },
      {
        selector: '.add-plant-btn',
        title: '🪴 Add Your Plants',
        description: 'Add plants to your grow. Each plant can have different pot sizes and positions in your tent.',
        position: 'bottom'
      }
    ];
  }

  /** Public method to clean up tutorial - called by app when navigating away */
  public cleanupTutorial(): void {
    this.tutorialOverlay.removeOverlay();
    this.tutorialStarted = false;
  }
}
