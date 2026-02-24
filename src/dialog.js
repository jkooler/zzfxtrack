import { createIcons, icons } from 'lucide';

const BUTTON_BASE_CLASS = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 px-4 py-2';
const BUTTON_SECONDARY_CLASS = `${BUTTON_BASE_CLASS} border border-input bg-background hover:bg-accent hover:text-accent-foreground`;
const BUTTON_PRIMARY_CLASS = `${BUTTON_BASE_CLASS} bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm`;
const BUTTON_DANGER_CLASS = `${BUTTON_BASE_CLASS} bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm`;

let elements = null;
let activeResolve = null;
let isAlertMode = false;

function cacheElements() {
  if (elements) return elements;
  elements = {
    modal: document.getElementById('appDialogModal'),
    title: document.getElementById('appDialogTitle'),
    message: document.getElementById('appDialogMessage'),
    cancel: document.getElementById('appDialogCancel'),
    confirm: document.getElementById('appDialogConfirm'),
  };
  return elements;
}

function closeDialog(result) {
  const el = cacheElements();
  if (!el?.modal) return;
  el.modal.classList.remove('open', 'overlay-light');
  const resolve = activeResolve;
  activeResolve = null;
  if (typeof resolve === 'function') {
    resolve(Boolean(result));
  }
}

function wireDialogEvents() {
  const el = cacheElements();
  if (!el?.modal || el.modal.dataset.wired === '1') return;
  el.modal.dataset.wired = '1';
  el.cancel?.addEventListener('click', () => closeDialog(false));
  el.confirm?.addEventListener('click', () => closeDialog(true));
  el.modal.addEventListener('click', (event) => {
    if (event.target !== el.modal) return;
    closeDialog(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!el.modal.classList.contains('open')) return;
    closeDialog(false);
  });
}

function getConfirmButtonClass(variant) {
  if (variant === 'danger') return BUTTON_DANGER_CLASS;
  return BUTTON_PRIMARY_CLASS;
}

function openDialog({
  title = 'Confirm',
  message = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  showCancel = true,
  variant = 'primary',
  confirmIcon = null,
  overlayLight = false,
}) {
  const el = cacheElements();
  if (!el?.modal) {
    if (showCancel) {
      return Promise.resolve(window.confirm(String(message || '')));
    }
    window.alert(String(message || ''));
    return Promise.resolve(true);
  }

  wireDialogEvents();
  if (activeResolve) {
    activeResolve(false);
    activeResolve = null;
  }

  if (el.title) el.title.textContent = String(title || 'Confirm');
  if (el.message) el.message.textContent = String(message || '');
  if (el.confirm) {
    const label = String(confirmLabel || 'OK');
    if (confirmIcon) {
      el.confirm.innerHTML = `<i data-lucide="${confirmIcon}" class="w-4 h-4"></i>${label}`;
      createIcons({ icons });
    } else {
      el.confirm.textContent = label;
    }
    el.confirm.className = getConfirmButtonClass(variant);
  }
  if (el.cancel) {
    el.cancel.textContent = String(cancelLabel || 'Cancel');
    el.cancel.className = BUTTON_SECONDARY_CLASS;
    el.cancel.classList.toggle('hidden', !showCancel);
  }

  isAlertMode = !showCancel;
  el.modal.classList.toggle('overlay-light', Boolean(overlayLight));
  el.modal.classList.add('open');

  return new Promise((resolve) => {
    activeResolve = resolve;
  });
}

export async function confirmDialog(options = {}) {
  return openDialog({
    showCancel: true,
    ...options,
  });
}

export async function alertDialog(options = {}) {
  await openDialog({
    showCancel: false,
    confirmLabel: 'OK',
    ...options,
  });
}

export function isDialogOpen() {
  const el = cacheElements();
  return Boolean(el?.modal?.classList.contains('open'));
}

export function isDialogAlertMode() {
  return isAlertMode;
}
