import { type Grow, type Entry, type EntryType, MILESTONE_PRESETS, MILESTONE_EMOJIS, REMINDER_BUFFERS, PLANT_COLORS } from '../types';
import { store } from '../store';
import { photoStore } from '../photoStore';
import { ImageViewer } from './ImageViewer';

export class EntryForm {
  private container: HTMLElement;
  private onSave: (entry: Entry) => void;
  private onCancel: () => void;
  private growId: string = '';
  private date: string = '';
  private editingEntry: Entry | null = null;
  private selectedPlantIds: Set<string> = new Set();
  private imageViewer: ImageViewer;
  private dliCalculator: any = null; // Will be DLICalculatorModal

  constructor(
    container: HTMLElement,
    callbacks: {
      onSave: (entry: Entry) => void;
      onCancel: () => void;
    }
  ) {
    this.container = container;
    this.onSave = callbacks.onSave;
    this.onCancel = callbacks.onCancel;

    // Create image viewer for fullscreen photo viewing
    const viewerContainer = document.getElementById('image-viewer');
    if (!viewerContainer) {
      const div = document.createElement('div');
      div.id = 'image-viewer';
      document.body.appendChild(div);
      this.imageViewer = new ImageViewer(div);
    } else {
      this.imageViewer = new ImageViewer(viewerContainer);
    }

    this.setupEvents();
  }

  private setupEvents(): void {
    this.container.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Close modal on overlay click or cancel
      if (target.classList.contains('modal-overlay') || target.classList.contains('cancel-btn')) {
        this.onCancel();
      }

      // Handle calc DLI button
      if (target.classList.contains('calc-dli-btn')) {
        const placeholder = this.container.querySelector('#dli-calculator-placeholder') as HTMLElement;
        if (placeholder) {
          if (this.dliCalculator) {
            // If already open, close it
            placeholder.innerHTML = '';
            this.dliCalculator = null;
          } else {
            // Import here to avoid circular dependency
            import('./DLICalculatorModal').then(({ DLICalculatorModal }) => {
              this.dliCalculator = new DLICalculatorModal(placeholder, () => {
                placeholder.innerHTML = '';
                this.dliCalculator = null;
              }, (dli) => {
                const dliInput = this.container.querySelector('#entry-dli') as HTMLInputElement;
                if (dliInput) {
                  dliInput.value = dli.toFixed(1);
                }
                placeholder.innerHTML = '';
                this.dliCalculator = null;
              }, true); // isInline = true
              this.dliCalculator.render();
            });
          }
        }
      }

      // Quick milestone toggle
      const milestoneBtn = target.closest<HTMLElement>('.quick-milestone');
      if (milestoneBtn) {
        const title = milestoneBtn.dataset.title!;
        const titleInput = this.container.querySelector('#entry-title') as HTMLInputElement;
        const typeSelect = this.container.querySelector('#entry-type') as HTMLSelectElement;

        // Don't proceed if type select is disabled (shouldn't happen, but safety check)
        if (typeSelect.disabled) return;

        // Toggle: if already active, deselect it
        if (milestoneBtn.classList.contains('active')) {
          milestoneBtn.classList.remove('active');
          titleInput.value = '';
          typeSelect.value = 'note';
          // Trigger change event to hide reminder buffer if needed
          typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          // Deselect any other active milestone
          this.container.querySelectorAll('.quick-milestone.active').forEach(btn => {
            btn.classList.remove('active');
          });
          // Select this one
          milestoneBtn.classList.add('active');
          titleInput.value = title;
          typeSelect.value = 'milestone';
          // Trigger change event to hide reminder buffer if needed
          typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }

      // Plant chip toggle
      const plantChip = target.closest<HTMLElement>('[data-plant-id]');
      if (plantChip) {
        const plantId = plantChip.dataset.plantId!;
        if (this.selectedPlantIds.has(plantId)) {
          this.selectedPlantIds.delete(plantId);
          plantChip.classList.remove('active');
        } else {
          this.selectedPlantIds.add(plantId);
          plantChip.classList.add('active');
        }
      }
    });

    this.container.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.id === 'entry-photo') {
        this.handlePhotoUpload(target);
      }
      // Show/hide reminder buffer based on entry type
      if (target.id === 'entry-type') {
        const reminderBufferGroup = this.container.querySelector('.reminder-buffer-group') as HTMLElement;
        if (reminderBufferGroup) {
          reminderBufferGroup.style.display = target.value === 'reminder' ? 'block' : 'none';
        }
      }
    });

    // Photo remove button and preview click
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Photo remove button
      const removeBtn = target.closest('.photo-remove') as HTMLElement;
      if (removeBtn) {
        e.preventDefault();
        const item = removeBtn.closest('.photo-preview-item');
        if (item) item.remove();
        return; // Don't trigger image viewer when removing
      }

      // Photo preview click - open fullscreen viewer
      const previewImg = target.closest('.photo-preview-item img') as HTMLImageElement;
      if (previewImg) {
        e.preventDefault();

        // Collect all photo URLs from preview items
        const allPhotos = Array.from(
          this.container.querySelectorAll<HTMLImageElement>('.photo-preview-item img')
        ).map(img => img.src);

        // Find the index of clicked photo
        const clickedIndex = allPhotos.findIndex(src => src === previewImg.src);

        // Open viewer with all photos, starting at clicked index
        this.imageViewer.open(allPhotos, clickedIndex);
      }
    });
  }

  render(grow: Grow, date: string, entry?: Entry): void {
    this.growId = grow.id;
    this.date = date;
    this.editingEntry = entry ?? null;
    this.selectedPlantIds = new Set(entry?.plantIds ?? []);

    // Check if date is in the future
    const today = new Date().toISOString().split('T')[0];
    const isFuture = date > today;

    // For future dates, force reminder type unless editing an existing entry
    const defaultType = isFuture && !entry ? 'reminder' : (entry?.type ?? 'note');

    const html = `
      <div class="modal-overlay">
        <div class="modal entry-modal">
          <form class="entry-form-modal">
            <header class="modal-header">
              <h3>${entry ? 'Edit Entry' : 'Add Entry'} - ${this.formatDate(date)}</h3>
              <button type="button" class="modal-close icon-btn">×</button>
            </header>
            
            <div class="modal-body">
              ${!isFuture || (entry && entry.type !== 'reminder') ? `
                <div class="quick-milestones">
                  ${MILESTONE_PRESETS.map(m => `
                    <button type="button" class="quick-milestone chip" data-title="${m}">${MILESTONE_EMOJIS[m]}${m}</button>
                  `).join('')}
                </div>
              ` : ''}
              
              <div class="form-group">
                <label for="entry-title">Title</label>
                <input
                  type="text"
                  id="entry-title"
                  name="title"
                  value="${this.escapeHtml(entry?.title ?? '')}"
                  placeholder="${isFuture ? 'Describe what to do' : 'Describe what happened'}"
                  required
                >
              </div>

              ${grow.plants.length > 0 && (!isFuture || (entry && entry.type !== 'reminder')) ? `
                <div class="form-group">
                  <label>Plants</label>
                  <div class="plant-chips">
                    ${grow.plants.map(p => `
                      <button type="button"
                              class="plant-chip ${this.selectedPlantIds.has(p.id) ? 'active' : ''}"
                              data-plant-id="${p.id}"
                              style="--plant-color: ${PLANT_COLORS[p.potNumber % PLANT_COLORS.length]}">
                        <span class="plant-pot">#${p.potNumber}</span>
                        <span class="plant-name">${this.escapeHtml(p.name)}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
              
              <div class="form-group">
                <label for="entry-type">Type</label>
                <select id="entry-type" name="type" required ${isFuture && !entry ? 'disabled' : ''}>
                  <option value="note" ${defaultType === 'note' ? 'selected' : ''} ${isFuture && !entry ? 'disabled' : ''}>📝 Note</option>
                  <option value="milestone" ${defaultType === 'milestone' ? 'selected' : ''} ${isFuture && !entry ? 'disabled' : ''}>🏁 Milestone</option>
                  <option value="watering" ${defaultType === 'watering' ? 'selected' : ''} ${isFuture && !entry ? 'disabled' : ''}>💧 Watering</option>
                  <option value="feeding" ${defaultType === 'feeding' ? 'selected' : ''} ${isFuture && !entry ? 'disabled' : ''}>🌿 Feeding</option>
                  <option value="issue" ${defaultType === 'issue' ? 'selected' : ''} ${isFuture && !entry ? 'disabled' : ''}>⚠️ Issue</option>
                  <option value="reminder" ${defaultType === 'reminder' ? 'selected' : ''}>⏰ Reminder</option>
                </select>
                ${isFuture && !entry ? '<input type="hidden" name="type" value="reminder">' : ''}
              </div>
              
              <div class="form-group reminder-buffer-group" style="display: ${defaultType === 'reminder' ? 'block' : 'none'}">
                <label for="reminder-buffer">Notify me</label>
                <select id="reminder-buffer" name="reminderBuffer">
                  ${REMINDER_BUFFERS.map(buffer => `
                    <option value="${buffer.days}" ${entry?.reminderBuffer === buffer.days ? 'selected' : ''}>
                      ${buffer.label}
                    </option>
                  `).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label for="entry-content">Notes (optional)</label>
                <textarea 
                  id="entry-content" 
                  name="content" 
                  rows="3"
                  placeholder="${isFuture ? 'Add details about this task' : 'Add observations, measurements, or details'}"
                >${this.escapeHtml(entry?.content ?? '')}</textarea>
              </div>
              
              ${!isFuture || (entry && entry.type !== 'reminder') ? `
                <div class="form-group">
                  <label for="entry-dli">DLI (optional)</label>
                  <div class="input-with-btn">
                    <input 
                      type="number" 
                      id="entry-dli" 
                      name="dli" 
                      step="0.1"
                      min="0"
                      max="100"
                      value="${entry?.dli ?? ''}"
                      placeholder="Actual DLI achieved"
                    >
                    <button type="button" class="btn btn-secondary calc-dli-btn" title="Calculate DLI">
                      💡 Calc
                    </button>
                  </div>
                </div>
              ` : ''}
              
              <div id="dli-calculator-placeholder"></div>
              
              ${!isFuture || (entry && entry.type !== 'reminder') ? `
                <div class="form-group">
                  <label for="entry-photo">Photos</label>
                  <input type="file" id="entry-photo" name="photo" accept="image/*" multiple>
                  <div id="photo-preview" class="photo-preview-grid">
                    ${this.getExistingPhotos(entry).map((p, i) => `<div class="photo-preview-item" data-photo-index="${i}"><img src="${p}" alt="Photo ${i + 1}"><button type="button" class="photo-remove" data-remove-index="${i}">×</button></div>`).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
            
            <footer class="modal-footer">
              <button type="submit" class="btn-primary">💾 Save Entry</button>
            </footer>
          </form>
        </div>
      </div>
    `;

    this.container.innerHTML = html;

    // Load IndexedDB photos after render
    this.loadExistingPhotosToPreview(entry);
  }

  close(): void {
    this.container.innerHTML = '';
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  private async handlePhotoUpload(input: HTMLInputElement): Promise<void> {
    const files = input.files;
    if (!files || files.length === 0) return;

    const preview = this.container.querySelector('#photo-preview') as HTMLElement;

    try {
      for (const file of Array.from(files)) {
        const { blob, dataUrl } = await this.compressImageToBlob(file, 100 * 1024); // 100KB max
        const photoId = photoStore.generatePhotoId();

        // Save blob to IndexedDB
        await photoStore.savePhoto(photoId, blob);

        const index = preview.children.length;
        const item = document.createElement('div');
        item.className = 'photo-preview-item';
        item.dataset.photoIndex = String(index);
        item.dataset.photoId = photoId; // Store the IndexedDB ID
        item.innerHTML = `<img src="${dataUrl}" alt="Photo ${index + 1}"><button type="button" class="photo-remove" data-remove-index="${index}">×</button>`;
        preview.appendChild(item);
      }
      // Clear input so same files can be selected again
      input.value = '';
    } catch (e) {
      console.error('Failed to process photo:', e);
    }
  }

  private getExistingPhotos(entry?: Entry): string[] {
    if (!entry) return [];
    if (entry.photos && entry.photos.length > 0) return entry.photos;
    if (entry.photo) return [entry.photo];
    return [];
  }

  /** Load photos after render (for IndexedDB photos) */
  private async loadExistingPhotosToPreview(entry?: Entry): Promise<void> {
    if (!entry) return;

    const preview = this.container.querySelector('#photo-preview') as HTMLElement;
    if (!preview) return;

    const photoIds = entry.photoIds ?? [];

    for (let i = 0; i < photoIds.length; i++) {
      const photoId = photoIds[i];
      const dataUrl = await photoStore.getPhotoAsDataURL(photoId);

      if (dataUrl) {
        const item = document.createElement('div');
        item.className = 'photo-preview-item';
        item.dataset.photoIndex = String(preview.children.length);
        item.dataset.photoId = photoId;
        item.innerHTML = `<img src="${dataUrl}" alt="Photo ${i + 1}"><button type="button" class="photo-remove" data-remove-index="${preview.children.length}">×</button>`;
        preview.appendChild(item);
      }
    }
  }

  /** Compress image and return both Blob (for IndexedDB) and dataUrl (for preview) */
  private compressImageToBlob(file: File, maxSize: number): Promise<{ blob: Blob; dataUrl: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // Scale down to 780p (max height 780px)
          const maxHeight = 780;
          if (height > maxHeight) {
            const ratio = maxHeight / height;
            width *= ratio;
            height *= ratio;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, width, height);

          // Compress with decreasing quality until under maxSize
          let quality = 0.8;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);

          while (dataUrl.length > maxSize && quality > 0.1) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          // Convert final dataUrl to Blob
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve({ blob, dataUrl });
              } else {
                reject(new Error('Failed to create blob'));
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = reject;
        img.src = e.target!.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private handleSubmit(): void {
    const form = this.container.querySelector('form') as HTMLFormElement;
    const formData = new FormData(form);
    const photoItems = this.container.querySelectorAll('#photo-preview .photo-preview-item') as NodeListOf<HTMLElement>;
    const dliValue = formData.get('dli') as string;

    // Collect photo IDs from IndexedDB-stored photos
    const photoIds: string[] = [];
    const legacyPhotos: string[] = []; // For photos that are still data URLs (from editing)

    for (const item of photoItems) {
      const photoId = item.dataset.photoId;
      const img = item.querySelector('img') as HTMLImageElement;

      if (photoId) {
        // New photo stored in IndexedDB
        photoIds.push(photoId);
      } else if (img?.src.startsWith('data:')) {
        // Legacy photo (editing existing entry with old format)
        legacyPhotos.push(img.src);
      }
    }

    const entryType = formData.get('type') as EntryType;
    const reminderBufferValue = formData.get('reminderBuffer');

    const entryData = {
      date: this.date,
      type: entryType,
      title: formData.get('title') as string,
      content: formData.get('content') as string || undefined,
      photoIds: photoIds.length > 0 ? photoIds : undefined,
      photos: legacyPhotos.length > 0 ? legacyPhotos : undefined, // Keep legacy photos if any
      photo: undefined, // Clear legacy single-photo field
      plantIds: this.selectedPlantIds.size > 0 ? Array.from(this.selectedPlantIds) : undefined,
      dli: dliValue ? parseFloat(dliValue) : undefined,
      reminderBuffer: entryType === 'reminder' && reminderBufferValue ? parseInt(reminderBufferValue as string) : undefined,
      reminderDismissed: entryType === 'reminder' ? false : undefined,
    };

    let entry: Entry | undefined;

    if (this.editingEntry) {
      entry = store.updateEntry(this.growId, this.editingEntry.id, entryData);
    } else {
      entry = store.addEntry(this.growId, entryData);
    }

    if (entry) this.onSave(entry);
  }

  private formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
