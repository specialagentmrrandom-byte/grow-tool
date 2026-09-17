import { type Grow, type EntryType } from '../types';
import { store } from '../store';
import { photoStore } from '../photoStore';
import { getPhaseInfo } from '../dli';
import { iconSvg, LOG_TYPE_META, type LogType } from '../icons';
import { showSuccess, showError } from '../toast';

/**
 * Quick-log bottom sheet — the concept's fast entry flow, made context-aware.
 *
 * Each log type surfaces the fields that actually matter for it (just like the
 * concept's pH/height for measurements): water asks amount + runoff pH, feed
 * asks nutrients + EC, measure asks pH + height. "Photo" gets a real uploader
 * that stores images in IndexedDB via photoStore and shows a thumbnail review.
 * A free-text note is always available.
 *
 * Types map onto the app's existing EntryType model so no schema change is
 * needed (water→watering, feed→feeding, prune→milestone, photo/note/measure→
 * note); contextual values are summarised into the entry content, e.g.
 * "1.2 L · runoff pH 6.3 · slightly dry".
 *
 * Rendered into its own container in <body> (like the reminder bar) so it floats
 * above whatever view is showing and survives #app re-renders.
 */
const SHEET_TYPES: LogType[] = ['water', 'feed', 'prune', 'photo', 'note', 'measure'];

interface FieldDef {
  id: string;
  label: string;
  placeholder: string;
  /** How the value reads in the saved entry content (e.g. "1.2" → "1.2 L"). */
  fmt: (value: string) => string;
}

/** Context fields per type — the per-type equivalent of measure's pH/height. */
const FIELD_SETS: Partial<Record<LogType, FieldDef[]>> = {
  water: [
    { id: 'amount', label: 'Amount (L)', placeholder: '1.2', fmt: (v) => `${v} L` },
    { id: 'runoff', label: 'Runoff pH', placeholder: '6.3', fmt: (v) => `runoff pH ${v}` },
  ],
  feed: [
    { id: 'mix', label: 'Nutrients', placeholder: 'CalMag + Grow A/B', fmt: (v) => v },
    { id: 'ec', label: 'EC', placeholder: '1.4', fmt: (v) => `${v} EC` },
  ],
  measure: [
    { id: 'ph', label: 'pH', placeholder: '6.2', fmt: (v) => `pH ${v}` },
    { id: 'height', label: 'Height (cm)', placeholder: '72', fmt: (v) => `${v} cm` },
  ],
};

export class QuickLogSheet {
  private container: HTMLElement;
  private onSaved: (grow: Grow) => void;
  private grow: Grow | null = null;
  private pendingType: LogType = 'water';
  private note = '';
  private fields: Record<string, string> = {};
  /** Photos already saved to IndexedDB for this draft (cleaned up on cancel). */
  private photos: { id: string; dataUrl: string }[] = [];

  constructor(container: HTMLElement, callbacks: { onSaved: (grow: Grow) => void }) {
    this.container = container;
    this.onSaved = callbacks.onSaved;
    this.setupEvents();
  }

  private setupEvents(): void {
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-ql-close]') || target.classList.contains('ql-overlay')) {
        this.close();
        return;
      }
      const typeBtn = target.closest<HTMLElement>('[data-ql-type]');
      if (typeBtn) {
        this.pendingType = typeBtn.dataset.qlType as LogType;
        this.render();
        return;
      }
      const removeBtn = target.closest<HTMLElement>('[data-ql-remove-photo]');
      if (removeBtn) {
        this.removePhoto(removeBtn.dataset.qlRemovePhoto!);
        return;
      }
      if (target.closest('[data-ql-save]')) {
        this.save();
      }
    });

    this.container.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (target.dataset.qlField === 'note') {
        this.note = target.value;
      } else if (target.dataset.qlFieldid) {
        this.fields[target.dataset.qlFieldid] = target.value;
      }
    });

    this.container.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.dataset.qlPhoto !== undefined && target.files) {
        this.handlePhotos(target.files);
      }
    });
  }

  open(grow: Grow, initialType: LogType = 'water'): void {
    this.grow = grow;
    this.pendingType = initialType;
    this.note = '';
    this.fields = {};
    this.photos = [];
    this.render();
  }

  /** Close, deleting any photos that were attached but never saved. */
  close(): void {
    if (this.photos.length > 0) {
      photoStore.deletePhotos(this.photos.map((p) => p.id)).catch(() => { /* best effort */ });
    }
    this.photos = [];
    this.container.innerHTML = '';
    this.grow = null;
  }

  private async handlePhotos(files: FileList): Promise<void> {
    try {
      for (const file of Array.from(files)) {
        const { blob, dataUrl } = await this.compressImageToBlob(file, 100 * 1024);
        const id = photoStore.generatePhotoId();
        await photoStore.savePhoto(id, blob);
        this.photos.push({ id, dataUrl });
      }
      this.render();
    } catch (e) {
      console.error('Failed to add photo:', e);
      showError('Could not add photo', 'Please try a different image.');
    }
  }

  private removePhoto(id: string): void {
    photoStore.deletePhoto(id).catch(() => { /* best effort */ });
    this.photos = this.photos.filter((p) => p.id !== id);
    this.render();
  }

  private render(): void {
    const grow = this.grow;
    if (!grow) {
      this.container.innerHTML = '';
      return;
    }
    const info = getPhaseInfo(grow);

    const typeButtons = SHEET_TYPES.map((t) => {
      const meta = LOG_TYPE_META[t];
      const active = this.pendingType === t;
      return `
        <button class="ql-type${active ? ' ql-type-active' : ''}" data-ql-type="${t}" style="--type-color: var(${meta.colorVar});">
          <span class="ql-type-icon">${iconSvg(t, 17)}</span>
          <span class="ql-type-label">${meta.label}</span>
        </button>
      `;
    }).join('');

    // Per-type contextual inputs (water/feed/measure)
    const fieldDefs = FIELD_SETS[this.pendingType] ?? [];
    const fieldsHtml = fieldDefs.length > 0 ? `
      <div class="ql-fields">
        ${fieldDefs.map((f) => `
          <label class="ql-field">
            <span class="ql-field-label">${f.label}</span>
            <input data-ql-fieldid="${f.id}" value="${this.escapeAttr(this.fields[f.id] ?? '')}" placeholder="${this.escapeAttr(f.placeholder)}" inputmode="text" class="ql-input">
          </label>
        `).join('')}
      </div>
    ` : '';

    // Photo uploader (only on the Photo type)
    const uploaderHtml = this.pendingType === 'photo' ? `
      <label class="ql-upload">
        <span class="ql-upload-icon">${iconSvg('photo', 18)}</span>
        <span>Add photos from your device</span>
        <input type="file" accept="image/*" multiple data-ql-photo hidden>
      </label>
    ` : '';

    // Thumbnail review — shown whenever photos are attached, for any type
    const photosHtml = this.photos.length > 0 ? `
      <div class="ql-photos">
        ${this.photos.map((p) => `
          <div class="ql-photo-item">
            <img src="${p.dataUrl}" alt="Attached photo">
            <button class="ql-photo-remove" data-ql-remove-photo="${p.id}" aria-label="Remove photo">×</button>
          </div>
        `).join('')}
      </div>
    ` : '';

    this.container.innerHTML = `
      <div class="ql-overlay"></div>
      <div class="ql-sheet" role="dialog" aria-label="Log entry">
        <div class="ql-handle"></div>
        <div class="ql-title">Log entry</div>
        <div class="ql-sub">${this.escapeHtml(grow.strain)} · Day ${info.day}</div>

        <div class="ql-types">${typeButtons}</div>

        ${fieldsHtml}
        ${uploaderHtml}
        ${photosHtml}

        <textarea data-ql-field="note" rows="2" class="ql-note" placeholder="Add a note (optional)…">${this.escapeHtml(this.note)}</textarea>

        <div class="ql-actions">
          <button class="ql-cancel" data-ql-close>Cancel</button>
          <button class="ql-save" data-ql-save>Save to ${this.escapeHtml(grow.strain)}</button>
        </div>
      </div>
    `;
  }

  /** Map the concept's log type onto an EntryType + a default title. */
  private mapType(type: LogType): { entryType: EntryType; title: string } {
    switch (type) {
      case 'water': return { entryType: 'watering', title: 'Watered' };
      case 'feed': return { entryType: 'feeding', title: 'Fed' };
      case 'prune': return { entryType: 'milestone', title: 'Pruned' };
      case 'photo': return { entryType: 'note', title: 'Photo' };
      case 'measure': return { entryType: 'note', title: 'Measurement' };
      case 'note':
      default: return { entryType: 'note', title: 'Note' };
    }
  }

  /** Summarise the contextual fields + note into the entry's content string. */
  private buildContent(): string {
    const parts: string[] = [];
    for (const f of FIELD_SETS[this.pendingType] ?? []) {
      const v = (this.fields[f.id] ?? '').trim();
      if (v) parts.push(f.fmt(v));
    }
    const note = this.note.trim();
    if (note) parts.push(note);
    return parts.join(' · ');
  }

  private save(): void {
    const grow = this.grow;
    if (!grow) return;

    const { entryType, title } = this.mapType(this.pendingType);
    const content = this.buildContent();
    const photoIds = this.photos.map((p) => p.id);
    const today = new Date().toISOString().split('T')[0];

    store.addEntry(grow.id, {
      date: today,
      type: entryType,
      title,
      content: content || undefined,
      photoIds: photoIds.length > 0 ? photoIds : undefined,
    });

    // Photos are now referenced by the entry — don't let close() delete them.
    this.photos = [];
    showSuccess(`Saved to ${grow.strain}`);
    const saved = grow;
    this.close();
    this.onSaved(saved);
  }

  /** Compress an image to a Blob (+ dataUrl preview), matching EntryForm. */
  private compressImageToBlob(file: File, maxSize: number): Promise<{ blob: Blob; dataUrl: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
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

          let quality = 0.8;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length > maxSize && quality > 0.1) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          canvas.toBlob(
            (blob) => blob ? resolve({ blob, dataUrl }) : reject(new Error('Failed to create blob')),
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

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  private escapeAttr(str: string): string {
    return this.escapeHtml(str).replace(/"/g, '&quot;');
  }
}
