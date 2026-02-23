let installed = false;

/** @type {Set<() => void>} */
const flushers = new Set();

/** @type {Set<() => boolean>} */
const confirmers = new Set();

export function registerBeforeUnloadFlusher(fn) {
  if (typeof fn !== 'function') return () => {};
  flushers.add(fn);
  return () => flushers.delete(fn);
}

export function registerBeforeUnloadConfirmer(fn) {
  if (typeof fn !== 'function') return () => {};
  confirmers.add(fn);
  return () => confirmers.delete(fn);
}

function shouldConfirmUnload() {
  for (const fn of confirmers) {
    try {
      if (fn()) return true;
    } catch (_e) {
      // Ignore confirmer errors.
    }
  }
  return false;
}

function flushBeforeUnload() {
  for (const fn of flushers) {
    try {
      fn();
    } catch (_e) {
      // Ignore flush errors.
    }
  }
}

export function setupBeforeUnloadHandler() {
  if (installed) return;
  installed = true;

  window.addEventListener('beforeunload', (e) => {
    const shouldConfirm = shouldConfirmUnload();
    flushBeforeUnload();
    if (!shouldConfirm) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

