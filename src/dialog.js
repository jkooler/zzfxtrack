import { createIcons, icons } from 'lucide';

const BUTTON_BASE_CLASS = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-9 px-4 py-2';
const BUTTON_SECONDARY_CLASS = `${BUTTON_BASE_CLASS} border border-input bg-background hover:bg-accent hover:text-accent-foreground`;
const BUTTON_PRIMARY_CLASS = `${BUTTON_BASE_CLASS} bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm`;
const BUTTON_DANGER_CLASS = `${BUTTON_BASE_CLASS} bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm`;

let elements = null;
let activeResolve = null;
let isAlertMode = false;
let activeDialogMode = 'confirm';

function cacheElements() {
  if (elements) return elements;
  elements = {
    modal: document.getElementById('appDialogModal'),
    title: document.getElementById('appDialogTitle'),
    message: document.getElementById('appDialogMessage'),
    prompt: document.getElementById('appDialogPrompt'),
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
    resolve(result);
  }
}

function handleCancel() {
  closeDialog(activeDialogMode === 'prompt' ? null : false);
}

function handleConfirm() {
  const el = cacheElements();
  if (activeDialogMode === 'prompt') {
    closeDialog(String(el?.prompt?.value || ''));
    return;
  }
  closeDialog(true);
}

function wireDialogEvents() {
  const el = cacheElements();
  if (!el?.modal || el.modal.dataset.wired === '1') return;
  el.modal.dataset.wired = '1';
  el.cancel?.addEventListener('click', handleCancel);
  el.confirm?.addEventListener('click', handleConfirm);
  el.modal.addEventListener('click', (event) => {
    if (event.target !== el.modal) return;
    handleCancel();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!el.modal.classList.contains('open')) return;
    handleCancel();
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
  hideCancelCompletely = false,
  variant = 'primary',
  confirmIcon = null,
  overlayLight = false,
  promptValue = '',
  promptPlaceholder = '',
  promptReadOnly = false,
  promptRows = 6,
  showPrompt = false,
  selectPromptOnOpen = false,
}) {
  const el = cacheElements();
  if (!el?.modal) {
    if (showPrompt) {
      return Promise.resolve(window.prompt(String(message || ''), String(promptValue || '')));
    }
    if (showCancel) {
      return Promise.resolve(window.confirm(String(message || '')));
    }
    window.alert(String(message || ''));
    return Promise.resolve(true);
  }

  wireDialogEvents();
  if (activeResolve) {
    activeResolve(activeDialogMode === 'prompt' ? null : false);
    activeResolve = null;
  }

  if (el.title) el.title.textContent = String(title || 'Confirm');
  if (el.message) el.message.textContent = String(message || '');
  if (el.prompt) {
    el.prompt.value = String(promptValue || '');
    el.prompt.placeholder = String(promptPlaceholder || '');
    el.prompt.readOnly = Boolean(promptReadOnly);
    el.prompt.rows = Number.isFinite(Number(promptRows)) ? Number(promptRows) : 6;
    el.prompt.classList.toggle('hidden', !showPrompt);
  }
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
    el.cancel.hidden = Boolean(hideCancelCompletely);
    el.cancel.disabled = Boolean(hideCancelCompletely);
    el.cancel.tabIndex = hideCancelCompletely ? -1 : 0;
    el.cancel.setAttribute('aria-hidden', hideCancelCompletely ? 'true' : 'false');
  }

  isAlertMode = !showCancel;
  activeDialogMode = showPrompt ? 'prompt' : 'confirm';
  el.modal.classList.toggle('overlay-light', Boolean(overlayLight));
  el.modal.classList.add('open');
  if (showPrompt && selectPromptOnOpen && el.prompt) {
    requestAnimationFrame(() => {
      el.prompt?.focus();
      el.prompt?.select();
    });
  }

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

export async function promptDialog(options = {}) {
  return openDialog({
    showPrompt: true,
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
