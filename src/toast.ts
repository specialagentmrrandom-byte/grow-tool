/**
 * Toast notification system for user feedback
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
    title: string;
    message?: string;
    type?: ToastType;
    duration?: number; // ms, 0 for persistent
}

// Ensure toast container exists
function getToastContainer(): HTMLElement {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

// Get icon for toast type
function getToastIcon(type: ToastType): string {
    switch (type) {
        case 'success': return '✓';
        case 'error': return '⚠️';
        case 'warning': return '⚡';
        case 'info': return 'ℹ️';
    }
}

// Show a toast notification
export function showToast(options: ToastOptions): void {
    const { title, message, type = 'info', duration = 5000 } = options;
    const container = getToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${getToastIcon(type)}</span>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
        </div>
        <button class="toast-close" aria-label="Close">×</button>
    `;

    // Close button handler
    toast.querySelector('.toast-close')?.addEventListener('click', () => {
        dismissToast(toast);
    });

    container.appendChild(toast);

    // Auto dismiss after duration (unless duration is 0)
    if (duration > 0) {
        setTimeout(() => dismissToast(toast), duration);
    }
}

// Dismiss a toast with animation
function dismissToast(toast: HTMLElement): void {
    if (toast.classList.contains('toast-exit')) return;

    toast.classList.add('toast-exit');
    setTimeout(() => {
        toast.remove();
        // Clean up container if empty
        const container = document.getElementById('toast-container');
        if (container && container.children.length === 0) {
            container.remove();
        }
    }, 300);
}

// Helper to escape HTML
function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Convenience methods
export function showSuccess(title: string, message?: string): void {
    showToast({ title, message, type: 'success' });
}

export function showError(title: string, message?: string): void {
    showToast({ title, message, type: 'error', duration: 8000 });
}

export function showWarning(title: string, message?: string): void {
    showToast({ title, message, type: 'warning', duration: 6000 });
}
