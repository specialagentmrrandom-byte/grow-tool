import { store } from '../store';
import {
    buildOvergrowNewTopicUrl,
    willTruncateForUrl,
    OVERGROW_URL,
    OVERGROW_DIARIES_URL,
} from '../overgrow';

export class ExportModal {
    private container: HTMLElement;
    private onClose: () => void;
    private currentGrowId: string | null = null;

    constructor(container: HTMLElement, onClose: () => void) {
        this.container = container;
        this.onClose = onClose;
        this.setupEvents();
    }

    private setupEvents(): void {
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            if (target.closest('.modal-close') || target.classList.contains('modal-overlay')) {
                this.onClose();
            }

            if (target.closest('.copy-btn')) {
                this.copyToClipboard();
            }

            if (target.closest('.export-json-btn')) {
                this.downloadJSON();
            }

            if (target.closest('.import-btn')) {
                (this.container.querySelector('#import-file') as HTMLInputElement)?.click();
            }
        });

        this.container.addEventListener('change', async (e) => {
            const target = e.target as HTMLInputElement | HTMLSelectElement;
            if (target.id === 'import-file') {
                this.handleImport(target as HTMLInputElement);
            }
            if (target.id === 'theme-preference') {
                const themePreference = (target as HTMLSelectElement).value as 'auto' | 'light' | 'dark';
                const settings = store.getSettings();
                settings.theme = themePreference;
                store.updateSettings(settings);

                // Apply theme immediately
                const { applyTheme, getSystemTheme, watchSystemTheme } = await import('../theme');
                if (themePreference === 'auto') {
                    // Apply system preference and start watching for changes
                    applyTheme(getSystemTheme());
                    // Clear localStorage so landing page also uses auto
                    localStorage.removeItem('og-grow-theme');
                    watchSystemTheme((theme) => {
                        if (store.getSettings().theme === 'auto') {
                            applyTheme(theme);
                        }
                    });
                } else {
                    applyTheme(themePreference);
                    localStorage.setItem('og-grow-theme', themePreference);
                }
            }
        });
    }

    renderExport(growId: string): void {
        const markdown = store.exportMarkdown(growId);
        this.currentGrowId = growId;

        const html = `
      <div class="modal-overlay">
        <div class="modal export-modal">
          <header class="modal-header">
            <h3>📤 Export Grow</h3>
            <button class="modal-close icon-btn">×</button>
          </header>
          <div class="modal-body">
            <div class="export-options">
              <button class="export-option-btn report-btn">
                <span class="option-icon">📊</span>
                <span class="option-title">Full HTML Report</span>
                <span class="option-desc">Beautiful standalone report with all entries, photos & stats</span>
              </button>
              <button class="export-option-btn overgrow-btn">
                <span class="option-icon">🌳</span>
                <span class="option-title">Post to Overgrow</span>
                <span class="option-desc">Open a pre-filled topic in the Overgrow.com community composer</span>
              </button>
              <button class="export-option-btn markdown-btn">
                <span class="option-icon">📝</span>
                <span class="option-title">Markdown Export</span>
                <span class="option-desc">Copy text for forums & grow diaries</span>
              </button>
            </div>
            <div class="markdown-section" style="display: none;">
              <p class="modal-info">
                Copy the Markdown below to post on forums like
                <a href="${OVERGROW_URL}" target="_blank" rel="noopener">Overgrow.com</a>.
                Replace <code>UPLOAD_IMAGE_X</code> placeholders with your uploaded image URLs.
              </p>
              <textarea class="export-content" readonly>${markdown ?? 'No data to export'}</textarea>
              <div class="btn-row">
                <button class="back-to-options btn-secondary">← Back</button>
                <button class="copy-btn btn-primary">📋 Copy to Clipboard</button>
              </div>
            </div>
            <div class="overgrow-section" style="display: none;">
              <p class="modal-info">
                This opens the <a href="${OVERGROW_URL}" target="_blank" rel="noopener">Overgrow.com</a>
                topic composer with your title and grow report already filled in — review, add your
                photos, and post. We'll also copy the full report to your clipboard as a backup.
                A good home for it is
                <a href="${OVERGROW_DIARIES_URL}" target="_blank" rel="noopener">Growroom Diaries</a>.
              </p>
              <label class="form-label">Topic title</label>
              <input type="text" class="overgrow-title form-input" />
              <label class="form-label">Post body (Markdown)</label>
              <textarea class="overgrow-body export-content" readonly></textarea>
              <p class="overgrow-trunc-note modal-info" style="display: none; color: var(--color-flush);">
                ⚡ This grow is long — the composer is pre-filled with the start of the report.
                The full version is on your clipboard; paste it in to replace the rest.
              </p>
              <div class="btn-row">
                <button class="back-to-options-og btn-secondary">← Back</button>
                <button class="overgrow-copy btn-secondary">📋 Copy post</button>
                <button class="overgrow-open btn-primary">🌳 Open Overgrow composer</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

        this.container.innerHTML = html;
        this.setupExportEvents();
    }

    private setupExportEvents(): void {
        const reportBtn = this.container.querySelector('.report-btn');
        const markdownBtn = this.container.querySelector('.markdown-btn');
        const overgrowBtn = this.container.querySelector('.overgrow-btn');
        const optionsDiv = this.container.querySelector('.export-options');
        const markdownSection = this.container.querySelector('.markdown-section');
        const overgrowSection = this.container.querySelector('.overgrow-section');
        const backBtn = this.container.querySelector('.back-to-options');
        const backBtnOg = this.container.querySelector('.back-to-options-og');

        const showOptions = () => {
            if (optionsDiv) (optionsDiv as HTMLElement).style.display = 'flex';
            if (markdownSection) (markdownSection as HTMLElement).style.display = 'none';
            if (overgrowSection) (overgrowSection as HTMLElement).style.display = 'none';
        };

        reportBtn?.addEventListener('click', async () => {
            if (this.currentGrowId) {
                const grow = store.getGrow(this.currentGrowId);
                if (grow) {
                    const { GrowReport } = await import('./GrowReport');
                    const report = new GrowReport(grow);
                    report.openInNewTab();
                }
            }
        });

        markdownBtn?.addEventListener('click', () => {
            if (optionsDiv && markdownSection) {
                (optionsDiv as HTMLElement).style.display = 'none';
                (markdownSection as HTMLElement).style.display = 'block';
            }
        });

        overgrowBtn?.addEventListener('click', () => this.showOvergrow(optionsDiv, overgrowSection));

        backBtn?.addEventListener('click', showOptions);
        backBtnOg?.addEventListener('click', showOptions);

        this.container.querySelector('.overgrow-copy')?.addEventListener('click', () => {
            this.copyOvergrowBody();
        });
        this.container.querySelector('.overgrow-open')?.addEventListener('click', () => {
            this.openOvergrowComposer();
        });
    }

    /** Populate the Overgrow draft fields and reveal the section. */
    private showOvergrow(optionsDiv: Element | null, overgrowSection: Element | null): void {
        if (!this.currentGrowId) return;
        const draft = store.getForumTopicDraft(this.currentGrowId);
        if (!draft) return;

        const titleInput = this.container.querySelector('.overgrow-title') as HTMLInputElement | null;
        const bodyArea = this.container.querySelector('.overgrow-body') as HTMLTextAreaElement | null;
        const truncNote = this.container.querySelector('.overgrow-trunc-note') as HTMLElement | null;

        // Set values as properties (never innerHTML) so user-authored grow names
        // and entry text can't break the markup or inject anything.
        if (titleInput) titleInput.value = draft.title;
        if (bodyArea) bodyArea.value = draft.body;
        if (truncNote) truncNote.style.display = willTruncateForUrl(draft.body) ? 'block' : 'none';

        if (optionsDiv) (optionsDiv as HTMLElement).style.display = 'none';
        if (overgrowSection) (overgrowSection as HTMLElement).style.display = 'block';
    }

    private async copyOvergrowBody(): Promise<void> {
        const bodyArea = this.container.querySelector('.overgrow-body') as HTMLTextAreaElement | null;
        if (!bodyArea) return;
        const btn = this.container.querySelector('.overgrow-copy');
        try {
            await navigator.clipboard.writeText(bodyArea.value);
        } catch {
            bodyArea.select();
            document.execCommand('copy');
        }
        if (btn) {
            const prev = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => (btn.textContent = prev), 2000);
        }
    }

    /**
     * Copy the full report to the clipboard (so nothing is lost if the body had
     * to be trimmed for the URL), then open Overgrow's composer pre-filled.
     */
    private async openOvergrowComposer(): Promise<void> {
        const titleInput = this.container.querySelector('.overgrow-title') as HTMLInputElement | null;
        const bodyArea = this.container.querySelector('.overgrow-body') as HTMLTextAreaElement | null;
        if (!titleInput || !bodyArea) return;

        const draft = { title: titleInput.value, body: bodyArea.value };

        try {
            await navigator.clipboard.writeText(draft.body);
        } catch {
            // Clipboard may be unavailable (e.g. insecure context); the composer
            // still opens pre-filled, so this is a non-fatal best effort.
        }

        const url = buildOvergrowNewTopicUrl(draft, ['grow-diary']);
        window.open(url, '_blank', 'noopener');
    }

    async renderSettings(): Promise<void> {
        const storageInfo = await store.getCombinedStorageInfo();
        const totalBarClass = storageInfo.total.status === 'critical' ? 'critical' : storageInfo.total.status === 'warning' ? 'warning' : '';
        const metaBarClass = storageInfo.localStorage.status === 'critical' ? 'critical' : storageInfo.localStorage.status === 'warning' ? 'warning' : '';
        const photoBarClass = storageInfo.indexedDB.status === 'critical' ? 'critical' : storageInfo.indexedDB.status === 'warning' ? 'warning' : '';

        const html = `
      <div class="modal-overlay">
        <div class="modal">
          <header class="modal-header">
            <h3>⚙️ Settings</h3>
            <button class="modal-close icon-btn">×</button>
          </header>
          <div class="modal-body">
            <div class="settings-section">
              <h4>🎨 Appearance</h4>
              <label class="form-label">Theme</label>
              <select id="theme-preference" class="form-select">
                <option value="auto" ${store.getSettings().theme === 'auto' ? 'selected' : ''}>🔄 Automatic (Follow System)</option>
                <option value="light" ${store.getSettings().theme === 'light' ? 'selected' : ''}>☀️ Light</option>
                <option value="dark" ${store.getSettings().theme === 'dark' ? 'selected' : ''}>🌙 Dark</option>
              </select>
              <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: var(--space-xs);">Automatic mode syncs with your system preferences.</p>
            </div>

            <div class="settings-section">
              <h4>💾 Storage</h4>
              
              <!-- Total storage summary -->
              <div class="storage-indicator" style="margin-bottom: var(--space-md); padding: var(--space-md); background: var(--color-bg); border-radius: var(--border-radius-sm);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-xs);">
                  <span style="font-weight: 500;">Total Used</span>
                  <span>${storageInfo.total.usedMB.toFixed(1)} MB / ${storageInfo.total.maxMB} MB</span>
                </div>
                <div class="storage-bar" style="width: 100%; height: 8px;">
                  <div class="storage-bar-fill ${totalBarClass}" style="width: ${Math.min(100, storageInfo.total.usagePercent * 100)}%"></div>
                </div>
              </div>

              <!-- Detailed breakdown -->
              <div style="display: grid; gap: var(--space-sm); margin-bottom: var(--space-md);">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: var(--font-size-sm); color: var(--color-text-muted);">
                  <span>📝 Metadata</span>
                  <div style="display: flex; align-items: center; gap: var(--space-xs);">
                    <div class="storage-bar" style="width: 60px; height: 4px;">
                      <div class="storage-bar-fill ${metaBarClass}" style="width: ${Math.min(100, storageInfo.localStorage.usagePercent * 100)}%"></div>
                    </div>
                    <span>${storageInfo.localStorage.usedMB.toFixed(2)} / ${storageInfo.localStorage.maxMB} MB</span>
                  </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: var(--font-size-sm); color: var(--color-text-muted);">
                  <span>📷 Photos</span>
                  <div style="display: flex; align-items: center; gap: var(--space-xs);">
                    <div class="storage-bar" style="width: 60px; height: 4px;">
                      <div class="storage-bar-fill ${photoBarClass}" style="width: ${Math.min(100, storageInfo.indexedDB.usagePercent * 100)}%"></div>
                    </div>
                    <span>${storageInfo.indexedDB.usedMB.toFixed(1)} / ${storageInfo.indexedDB.maxMB} MB</span>
                  </div>
                </div>
              </div>

              ${storageInfo.total.status === 'critical' ? `
                <p style="color: var(--color-danger); font-size: var(--font-size-sm); margin-bottom: var(--space-md);">
                  ⚠️ Storage almost full! Export your data now.
                </p>
              ` : storageInfo.total.status === 'warning' ? `
                <p style="color: var(--color-flush); font-size: var(--font-size-sm); margin-bottom: var(--space-md);">
                  ⚡ Storage getting full. Consider exporting a backup.
                </p>
              ` : ''}
              <div class="btn-group">
                <button class="export-json-btn btn-secondary">📥 Export Backup</button>
                <button class="import-btn btn-secondary">📤 Import Backup</button>
                <input type="file" id="import-file" accept=".json" hidden>
              </div>
              <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: var(--space-sm);">
                💡 Photos are stored separately with up to 50MB capacity. Export regularly for backup.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

        this.container.innerHTML = html;
    }

    private async copyToClipboard(): Promise<void> {
        const textarea = this.container.querySelector('.export-content') as HTMLTextAreaElement;
        if (!textarea) return;

        try {
            await navigator.clipboard.writeText(textarea.value);
            const btn = this.container.querySelector('.copy-btn')!;
            btn.textContent = '✓ Copied!';
            setTimeout(() => btn.textContent = '📋 Copy to Clipboard', 2000);
        } catch (e) {
            textarea.select();
            document.execCommand('copy');
        }
    }

    private async downloadJSON(): Promise<void> {
        // Use exportJSONWithPhotos to include IndexedDB photos in the export
        const json = await store.exportJSONWithPhotos();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `grow-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    private async handleImport(input: HTMLInputElement): Promise<void> {
        const file = input.files?.[0];
        if (!file) return;

        // Auto-backup current data before importing (including IndexedDB photos)
        const currentData = await store.exportJSONWithPhotos();
        if (currentData !== '{"grows":[],"plants":[],"global_entries":[]}' && currentData.length > 50) {
            const blob = new Blob([currentData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `grow-tracker-pre-import-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const json = e.target!.result as string;
            if (store.importJSON(json)) {
                alert('Import successful! A backup of your previous data was downloaded.');
                this.onClose();
                window.location.reload();
            } else {
                alert('Import failed. Please check the file format.');
            }
        };
        reader.readAsText(file);
    }

    close(): void {
        this.container.innerHTML = '';
    }
}
