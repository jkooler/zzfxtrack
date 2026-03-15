import { createIcons, icons } from 'lucide';
import { setupScrubInteraction } from './instrument-ui.js';
import { primePreviewAudioContext, isArrangementPreviewPlaying, stopArrangementPreview, stopTrackerPreviewPlayback } from './tracker.js';
import { attachVisualizer } from './visualizer.js';
import { alertDialog } from './dialog.js';

/**
 * Blocks Module
 * 
 * Manages reusable musical patterns (blocks) that can be created,
 * saved, and inserted into patterns. Blocks are stored as separate files
 * in the /blocks/ folder.
 */

// Block storage - in-memory cache
let blocksCache = [];

// Currently selected block index
let selectedBlockIndex = null;

// DOM Elements
let elements = {};
	let blockToDelete = null;
let arrangementsCache = [];
let selectedArrangementIndex = null;
let playingArrangementRowIndex = null;
let playingArrangementRowBlocks = [];
let playingArrangementFilename = null;
let playingBlockFilename = null;
let playingBlockClearTimeout = null;
let arrangementEditMode = {
	  isEditing: false,
	  filename: null,
    scope: 'user',
	};
let arrangementToDelete = null;
let arrangementRowToDeleteIndex = null;
// v2: default User collapsed, System expanded when first using the app
export const BLOCKS_FOLDER_STATE_KEY = 'zzfxtrack-folder-state-blocks-v2';
const ARRANGEMENTS_FOLDER_STATE_KEY = 'zzfxtrack-folder-state-arrangements-v2';
let blockFolderState = loadFolderState(BLOCKS_FOLDER_STATE_KEY, { user: false, system: true });
let arrangementFolderState = loadFolderState(ARRANGEMENTS_FOLDER_STATE_KEY, { user: false, system: true });
const DEVELOPER_MODE_KEY = 'zzfxtrack-developer-mode';
const DEMO_MODE = import.meta.env.MODE === 'demo';
let targetPatternScope = 'user';

function normalizeScope(value) {
  return value === 'system' ? 'system' : 'user';
}

function normalizeArrangementMetadata(value) {
  return {
    title: String(value?.title || '').trim(),
    author: String(value?.author || '').trim(),
    contact: String(value?.contact || '').trim(),
    license: String(value?.license || '').trim(),
  };
}

function isDeveloperModeEnabled() {
  try {
    return localStorage.getItem(DEVELOPER_MODE_KEY) === '1';
  } catch (_e) {
    return false;
  }
}

function getDeveloperModeHeaders() {
  return isDeveloperModeEnabled() ? { 'X-Developer-Mode': '1' } : {};
}

function updateArrangementAdvancedSettingsVisibility() {
  if (!elements.arrangementAdvancedSettingsBtn) return;
  const shouldShow = !DEMO_MODE && elements.arrangementModal?.classList.contains('open');
  elements.arrangementAdvancedSettingsBtn.classList.toggle('dev-only-hidden', !shouldShow);
}

function updateArrangementSaveGuardUI() {
  if (elements.arrangementName) {
    elements.arrangementName.readOnly = false;
  }
  if (elements.arrangementBpm) {
    elements.arrangementBpm.readOnly = false;
  }
  if (elements.saveArrangementBtn) {
    elements.saveArrangementBtn.disabled = false;
    elements.saveArrangementBtn.title = '';
  }
}

function canInsertIntoCurrentPattern() {
  return true;
}

function updateInsertButtonsDisabledState() {
  const canInsert = canInsertIntoCurrentPattern();
  if (elements.insertBlockBtn) elements.insertBlockBtn.disabled = selectedBlockIndex == null || !canInsert;
  if (elements.insertArrangementBtn) elements.insertArrangementBtn.disabled = selectedArrangementIndex == null || !canInsert;
}

function scrollListItemIntoView(item) {
  if (!item) return;
  let container = item.parentElement;
  while (container && container !== document.body) {
    const style = window.getComputedStyle(container);
    const overflowY = style?.overflowY || '';
    if (/(auto|scroll|overlay)/.test(overflowY) && container.scrollHeight > container.clientHeight) {
      break;
    }
    container = container.parentElement;
  }
  if (!container || container === document.body) {
    item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return;
  }
  const padding = 80;
  const itemRect = item.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  if (itemRect.top < containerRect.top + padding) {
    container.scrollTop += itemRect.top - (containerRect.top + padding);
  } else if (itemRect.bottom > containerRect.bottom - padding) {
    container.scrollTop += itemRect.bottom - (containerRect.bottom - padding);
  }
}

function getVisibleModalListItems(selector) {
  return Array.from(document.querySelectorAll(selector)).filter((item) => item.offsetParent !== null);
}

function focusModalListItem(item) {
  if (!item || typeof item.focus !== 'function') return;
  item.focus({ preventScroll: true });
}

export function loadFolderState(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw);
    return {
      user: typeof parsed?.user === 'boolean' ? parsed.user : fallback.user,
      system: typeof parsed?.system === 'boolean' ? parsed.system : fallback.system,
    };
  } catch (_e) {
    return { ...fallback };
  }
}

export function saveFolderState(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_e) {
    // Ignore storage errors.
  }
}

function emitStatus(message, type = 'normal') {
  document.dispatchEvent(new CustomEvent('app:status', { detail: { message, type } }));
}

function getBlockSteps(block) {
  const steps = Number.isInteger(block?.trackerState?.steps)
    ? block.trackerState.steps
    : (Array.isArray(block?.trackerState?.grid?.[0]) ? block.trackerState.grid[0].length : null);
  if (Number.isInteger(steps) && steps > 0) return steps;
  return 16;
}

function updateArrangementChipSteps(blocks = []) {
  if (!Array.isArray(blocks) || !blocks.length) return;
  const blockByFilename = new Map(blocks.map(b => [b.filename, b]));
  blocksCache = blocksCache.map(b => {
    const update = blockByFilename.get(b.filename);
    return update?.trackerState ? { ...b, trackerState: update.trackerState } : b;
  });

  const chips = elements.arrangementRows?.querySelectorAll('.arr-chip[data-filename]') || [];
  chips.forEach((chip) => {
    const filename = chip.dataset.filename;
    const update = blockByFilename.get(filename);
    if (!update?.trackerState) return;
    const steps = getBlockSteps(update);
    chip.dataset.blockSteps = String(steps);
  });
}

function setArrangementRowPlayingVisual(rowEl, isPlaying) {
  if (!rowEl) return;
  const valueEl = rowEl.querySelector('.arr-row-number-value');
  const iconEl = rowEl.querySelector('.arr-row-play-icon');
  valueEl?.classList.toggle('hidden', !!isPlaying);
  iconEl?.classList.toggle('hidden', !isPlaying);
}

function clearBlocksModalScopeVisualizer({ detachSharedVisualizer = true } = {}) {
  document.querySelectorAll('#blocksList .block-item, #arrangementsList .block-item').forEach((item) => {
    item.classList.remove('relative', 'overflow-hidden');
    item.querySelector('canvas.list-item-visualizer')?.remove();
  });
  if (detachSharedVisualizer) attachVisualizer(null);
}

function isBlocksTabActive() {
  return !elements.blocksTabPanel?.classList.contains('hidden');
}

function isBlocksModalVisible() {
  return Boolean(
    elements.modal?.classList.contains('open')
    && !elements.modal?.classList.contains('is-suspended')
  );
}

function updateBlocksModalScopeVisualizer() {
  if (!isBlocksModalVisible()) {
    clearBlocksModalScopeVisualizer({ detachSharedVisualizer: false });
    return;
  }
  let target = null;

  if (isArrangementPreviewPlaying()) {
    if (isBlocksTabActive()) {
      for (const filename of playingArrangementRowBlocks) {
        target = Array.from(elements.blocksList?.querySelectorAll('.block-item') || [])
          .find((item) => item.dataset.filename === filename) || null;
        if (target) break;
      }
    } else if (playingArrangementFilename) {
      target = Array.from(elements.arrangementsList?.querySelectorAll('.block-item') || [])
        .find((item) => item.dataset.filename === playingArrangementFilename) || null;
    }
  } else if (isBlocksTabActive() && playingBlockFilename) {
    target = Array.from(elements.blocksList?.querySelectorAll('.block-item') || [])
      .find((item) => item.dataset.filename === playingBlockFilename) || null;
  }

  document.querySelectorAll('#blocksList .block-item, #arrangementsList .block-item').forEach((item) => {
    if (item !== target) {
      item.classList.remove('relative', 'overflow-hidden');
      item.querySelector('canvas.list-item-visualizer')?.remove();
    }
  });

  if (!target) {
    attachVisualizer(null);
    return;
  }

  target.classList.add('relative', 'overflow-hidden');
  let canvas = target.querySelector('canvas.list-item-visualizer');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'list-item-visualizer';
    target.insertBefore(canvas, target.firstChild);
  }
  canvas.width = target.clientWidth;
  canvas.height = target.clientHeight;
  attachVisualizer(canvas);
}

function suspendArrangementModal() {
  if (!elements.arrangementModal) return;
  elements.arrangementModal.classList.add('open');
  elements.arrangementModal.classList.add('is-suspended');
}

function resumeArrangementModal() {
  if (!elements.arrangementModal) return;
  elements.arrangementModal.classList.remove('is-suspended');
}

function suspendBlocksModal() {
  if (!elements.modal) return;
  elements.modal.classList.add('open');
  elements.modal.classList.add('is-suspended');
}

function resumeBlocksModal() {
  if (!elements.modal) return;
  elements.modal.classList.remove('is-suspended');
}

export function restoreSuspendedBlocksModals({ arrangement = false } = {}) {
  resumeBlocksModal();
  if (arrangement) {
    resumeArrangementModal();
    updateArrangementAdvancedSettingsVisibility();
    updateArrangementPreviewButtonState();
  }
}

function getArrangementDraftState() {
  const name = (elements.arrangementName?.value || arrangementDraft.name || 'Arrangement').trim() || 'Arrangement';
  const bpmVal = parseInt(elements.arrangementBpm?.value || String(arrangementDraft.bpm || 120), 10);
  const bpm = Number.isFinite(bpmVal) ? Math.min(Math.max(bpmVal, 20), 300) : 120;
  const metadata = normalizeArrangementMetadata(arrangementDraft.metadata);

  return {
    arrangementState: {
      version: 1,
      name,
      bpm,
      metadata,
      rows: arrangementDraft.rows.map(r => ({
        repeats: Number.isInteger(r.repeats) ? r.repeats : 1,
        blocks: Array.isArray(r.blocks) ? r.blocks.slice() : [],
        loop: Boolean(r.loop),
      })),
    },
    name,
    bpm,
  };
}

function emitArrangementStateChanged(extraDetail = {}) {
  const { arrangementState, name, bpm } = getArrangementDraftState();
  document.dispatchEvent(new CustomEvent('arrangements:stateChanged', {
    detail: {
      arrangementState,
      name,
      bpm,
      ...extraDetail,
    }
  }));
}

function updateArrangementPreviewButtonState() {
  if (!elements.previewArrangementBtn) return;
  if (isArrangementPreviewPlaying()) {
    elements.previewArrangementBtn.innerHTML = '<i data-lucide="square" class="w-[18px] h-5 fill-current"></i>';
  } else {
    elements.previewArrangementBtn.innerHTML = '<i data-lucide="play" class="w-[18px] h-5 fill-current"></i>';
  }
  createIcons({ icons });
}

/**
 * Initialize the blocks system
 */
export function initBlocks() {
  cacheElements();
  setupEventListeners();
  loadBlocksList();
}

/**
 * Cache DOM element references
 */
function cacheElements() {
	  elements = {
    modal: document.getElementById('blocksModal'),
    blocksList: document.getElementById('blocksList'),
    blocksTabPanel: document.getElementById('blocksTabPanel'),
    arrangerTabPanel: document.getElementById('arrangerTabPanel'),
    blocksTabBtn: document.getElementById('blocksModalBlocksTab'),
    arrangerTabBtn: document.getElementById('blocksModalArrangerTab'),
    description: document.getElementById('blocksModalDescription'),
    arrangementsList: document.getElementById('arrangementsList'),
    createArrangementBtn: document.getElementById('createArrangementBtn'),
    insertArrangementBtn: document.getElementById('insertArrangementBtn'),
    arrangementModal: document.getElementById('arrangementModal'),
    arrangementModalTitle: document.getElementById('arrangementModalTitle'),
    previewArrangementBtn: document.getElementById('previewArrangementBtn'),
    closeArrangementBtn: document.getElementById('closeArrangementBtn'),
    cancelArrangementBtn: document.getElementById('cancelArrangementBtn'),
    saveArrangementBtn: document.getElementById('saveArrangementBtn'),
    addArrangementRowBtn: document.getElementById('addArrangementRowBtn'),
    arrangementName: document.getElementById('arrangementName'),
    arrangementAdvancedSettingsBtn: document.getElementById('arrangementAdvancedSettingsBtn'),
    arrangementBpm: document.getElementById('arrangementBpm'),
    arrangementRows: document.getElementById('arrangementRows'),
    closeBtn: document.getElementById('closeBlocksBtn'),
    createBlockBtn: document.getElementById('createBlockBtn'),
    insertBlockBtn: document.getElementById('insertBlockBtn'),
    deleteBlockBtn: document.getElementById('deleteBlockBtn'),
	    preserveBlockBpm: document.getElementById('preserveBlockBpm'),
		    deleteBlockModal: document.getElementById('deleteBlockModal'),
		    deleteBlockText: document.getElementById('deleteBlockText'),
		    cancelDeleteBlock: document.getElementById('cancelDeleteBlock'),
		    confirmDeleteBlock: document.getElementById('confirmDeleteBlock'),
		    deleteArrangementModal: document.getElementById('deleteArrangementModal'),
		    deleteArrangementText: document.getElementById('deleteArrangementText'),
		    cancelDeleteArrangement: document.getElementById('cancelDeleteArrangement'),
		    confirmDeleteArrangement: document.getElementById('confirmDeleteArrangement'),
        deleteArrangementRowModal: document.getElementById('deleteArrangementRowModal'),
        deleteArrangementRowText: document.getElementById('deleteArrangementRowText'),
        cancelDeleteArrangementRow: document.getElementById('cancelDeleteArrangementRow'),
        confirmDeleteArrangementRow: document.getElementById('confirmDeleteArrangementRow'),
        arrangementUnsavedModal: document.getElementById('arrangementUnsavedConfirmModal'),
        arrangementUnsavedCancel: document.getElementById('arrangementUnsavedCancel'),
        arrangementUnsavedDontSave: document.getElementById('arrangementUnsavedDontSave'),
        arrangementUnsavedSave: document.getElementById('arrangementUnsavedSave'),
		  };
		}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  elements.closeBtn?.addEventListener('click', closeBlocksModal);
  elements.createBlockBtn?.addEventListener('click', openTrackerForNewBlock);
  elements.insertBlockBtn?.addEventListener('click', insertSelectedBlock);
	  elements.deleteBlockBtn?.addEventListener('click', deleteSelectedBlock);
		  elements.cancelDeleteBlock?.addEventListener('click', closeDeleteBlockModal);
		  elements.confirmDeleteBlock?.addEventListener('click', confirmDeleteBlock);
		  elements.cancelDeleteArrangement?.addEventListener('click', closeDeleteArrangementModal);
		  elements.confirmDeleteArrangement?.addEventListener('click', confirmDeleteArrangement);
      elements.cancelDeleteArrangementRow?.addEventListener('click', closeDeleteArrangementRowModal);
      elements.confirmDeleteArrangementRow?.addEventListener('click', confirmDeleteArrangementRow);

  elements.blocksTabBtn?.addEventListener('click', () => setActiveTab('blocks'));
  elements.arrangerTabBtn?.addEventListener('click', () => setActiveTab('arranger'));

  elements.createArrangementBtn?.addEventListener('click', () => { void openArrangementEditor(); });
  elements.insertArrangementBtn?.addEventListener('click', insertSelectedArrangement);
  elements.closeArrangementBtn?.addEventListener('click', requestCloseArrangementEditor);
  elements.cancelArrangementBtn?.addEventListener('click', requestCloseArrangementEditor);
  elements.arrangementUnsavedCancel?.addEventListener('click', closeArrangementUnsavedConfirmModal);
  elements.arrangementUnsavedDontSave?.addEventListener('click', () => {
    closeArrangementUnsavedConfirmModal();
    closeArrangementEditor();
  });
  elements.arrangementUnsavedSave?.addEventListener('click', () => {
    closeArrangementUnsavedConfirmModal();
    saveArrangementFromEditor();
  });
  elements.arrangementUnsavedModal?.addEventListener('click', (e) => {
    if (e.target === elements.arrangementUnsavedModal) closeArrangementUnsavedConfirmModal();
  });
  elements.previewArrangementBtn?.addEventListener('click', previewArrangementDraft);
  elements.addArrangementRowBtn?.addEventListener('click', () => {
    arrangementDraft.rows.push({ repeats: 1, blocks: [], loop: false });
    renderArrangementRows();
    emitArrangementStateChanged();
  });
  elements.saveArrangementBtn?.addEventListener('click', saveArrangementFromEditor);
  elements.arrangementName?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      elements.arrangementName.blur();
    }
  });
  elements.arrangementName?.addEventListener('blur', () => {
    const newName = (elements.arrangementName?.value ?? '').trim() || arrangementDraft.name || '';
    arrangementDraft.name = newName;
  });
  elements.arrangementAdvancedSettingsBtn?.addEventListener('click', () => {
    if (DEMO_MODE) return;
    const name = (elements.arrangementName?.value || arrangementDraft.name || '').trim();
    document.dispatchEvent(new CustomEvent('resource-scope:open', {
      detail: {
        applyDraftSettings: ({ metadata, scope }) => {
          arrangementDraft.metadata = normalizeArrangementMetadata(metadata);
          arrangementEditMode.scope = normalizeScope(scope);
        },
        getArrangementStatePayload: (metadataOverride) => {
          const { arrangementState } = getArrangementDraftState();
          return {
            ...arrangementState,
            metadata: normalizeArrangementMetadata(metadataOverride || arrangementDraft.metadata),
          };
        },
        metadata: arrangementDraft.metadata,
        type: 'arrangement',
        filename: arrangementEditMode.filename,
        name,
        scope: normalizeScope(arrangementEditMode.scope),
      }
    }));
  });

	  if (elements.arrangementBpm) {
	    setupScrubInteraction(elements.arrangementBpm);
	  }

    if (elements.deleteArrangementRowModal) {
      elements.deleteArrangementRowModal.addEventListener('click', (e) => {
        if (e.target === elements.deleteArrangementRowModal) {
          closeDeleteArrangementRowModal();
        }
      });
    }

	  document.addEventListener('resource-scope:changed', async (e) => {
	    const detail = e?.detail || {};
      if (detail.type === 'pattern') {
        targetPatternScope = normalizeScope(detail.scope);
        updateInsertButtonsDisabledState();
        return;
      }
	    if (detail.type === 'block') {
	      await loadBlocksList();
        updateInsertButtonsDisabledState();
	      return;
	    }
	    if (detail.type === 'arrangement') {
	      if (
	        (arrangementEditMode.filename && detail.filename === arrangementEditMode.filename) ||
	        (!arrangementEditMode.filename && !detail.filename)
	      ) {
	        arrangementEditMode.scope = normalizeScope(detail.scope);
          updateArrangementSaveGuardUI();
	      }
	      await loadArrangementsList();
        updateInsertButtonsDisabledState();
	    }
	  });

  document.addEventListener('blocks:targetPatternScope', (e) => {
    targetPatternScope = normalizeScope(e?.detail?.scope);
    updateInsertButtonsDisabledState();
  });

  document.addEventListener('developer-mode:changed', () => {
    // Re-render to show/hide immutable actions without forcing a reload.
    renderBlocksList();
    renderArrangementsList();
    updateArrangementAdvancedSettingsVisibility();
    updateArrangementSaveGuardUI();
    updateInsertButtonsDisabledState();
  });

  document.addEventListener('arrangements:blockCreated', (e) => {
    const detail = e?.detail || {};
    const rowIndex = Number.isInteger(detail.rowIndex) ? detail.rowIndex : null;
    const filename = detail.block?.filename || detail.filename;
    if (rowIndex == null || !filename) return;
    const row = arrangementDraft.rows?.[rowIndex];
    if (!row) return;
    if (!Array.isArray(row.blocks)) row.blocks = [];
    if (!row.blocks.includes(filename)) {
      row.blocks.push(filename);
    }
    renderArrangementRows();
    emitArrangementStateChanged({ addedRowIndex: rowIndex, addedFilename: filename });
  });

  document.addEventListener('tracker:closed', (e) => {
    if (!e?.detail?.returnToArrangementsOnClose) return;
    renderArrangementRows();
    resumeArrangementModal();
    updateArrangementAdvancedSettingsVisibility();
    elements.arrangementName?.focus();
    updateArrangementPreviewButtonState();
  });

  document.addEventListener('tracker:closed', (e) => {
    if (!e?.detail?.returnToBlocksOnClose) return;
    resumeBlocksModal();
  });

  document.addEventListener('arrangements:previewState', (e) => {
    updateArrangementPreviewButtonState();
    if (!e?.detail?.playing) {
      playingArrangementFilename = null;
      playingArrangementRowBlocks = [];
      playingBlockFilename = null;
      if (playingBlockClearTimeout) {
        clearTimeout(playingBlockClearTimeout);
        playingBlockClearTimeout = null;
      }
      clearBlocksModalScopeVisualizer();
      return;
    }
    playingBlockFilename = null;
    if (playingBlockClearTimeout) {
      clearTimeout(playingBlockClearTimeout);
      playingBlockClearTimeout = null;
    }
    updateBlocksModalScopeVisualizer();
  });

  document.addEventListener('arrangements:preview', (e) => {
    playingArrangementFilename = e?.detail?.arrangement?.filename || null;
    updateBlocksModalScopeVisualizer();
  });

  document.addEventListener('blocks:preview', (e) => {
    const index = Number.isInteger(selectedBlockIndex) ? selectedBlockIndex : null;
    const filename = index == null ? null : blocksCache?.[index]?.filename;
    playingBlockFilename = filename || null;

    if (playingBlockClearTimeout) {
      clearTimeout(playingBlockClearTimeout);
      playingBlockClearTimeout = null;
    }

    const trackerState = e?.detail?.trackerState || null;
    const bpm = Number.isFinite(trackerState?.bpm) ? trackerState.bpm : 120;
    const steps = Number.isFinite(trackerState?.steps)
      ? trackerState.steps
      : (Array.isArray(trackerState?.grid?.[0]) ? trackerState.grid[0].length : 16);
    const secondsPerStep = (60 / Math.max(20, Math.min(bpm, 300))) / 4;
    const durationMs = Math.max(0.5, steps * secondsPerStep + 1.0) * 1000;

    updateBlocksModalScopeVisualizer();

    playingBlockClearTimeout = setTimeout(() => {
      playingBlockClearTimeout = null;
      playingBlockFilename = null;
      updateBlocksModalScopeVisualizer();
    }, durationMs);
  });

  document.addEventListener('visualizer:ready', () => {
    updateBlocksModalScopeVisualizer();
  });

  document.addEventListener('arrangements:blocksLoaded', (e) => {
    const blocks = e?.detail?.blocks || [];
    updateArrangementChipSteps(blocks);
  });

  document.addEventListener('arrangements:playhead', (e) => {
    if (!isBlocksModalVisible()) return;
    const detail = e?.detail || {};
    const rowIndex = Number.isInteger(detail.rowIndex) ? detail.rowIndex : null;
    const progress = typeof detail.progress === 'number' ? detail.progress : 0;
    playingArrangementRowBlocks = rowIndex == null
      ? []
      : (Array.isArray(detail.blocks) ? detail.blocks : []);
    updateBlocksModalScopeVisualizer();

    if (playingArrangementRowIndex != null && playingArrangementRowIndex !== rowIndex) {
      const prevEl = elements.arrangementRows?.querySelector(`.arr-row[data-row="${playingArrangementRowIndex}"]`);
      if (prevEl) {
        prevEl.classList.remove('playing');
        setArrangementRowPlayingVisual(prevEl, false);
        prevEl.style.removeProperty('--arr-row-play-progress');
        prevEl.querySelectorAll('.arr-chip').forEach((chip) => {
          chip.style.removeProperty('--arr-chip-play-progress');
        });
      }
    }

    if (rowIndex == null) {
      playingArrangementRowIndex = null;
      return;
    }

    const rowEl = elements.arrangementRows?.querySelector(`.arr-row[data-row="${rowIndex}"]`);
    if (rowEl) {
      rowEl.classList.add('playing');
      setArrangementRowPlayingVisual(rowEl, true);
      const pct = Math.max(0, Math.min(progress, 1)) * 100;
      rowEl.style.setProperty('--arr-row-play-progress', `${pct.toFixed(2)}%`);

      const row = arrangementDraft.rows?.[rowIndex];
      const rowSteps = Number.isInteger(row?.repeats) ? Math.min(Math.max(row.repeats, 1), 16) * 16 : 16;
      const progressSteps = Math.max(0, Math.min(progress, 1)) * rowSteps;
      rowEl.querySelectorAll('.arr-chip').forEach((chip) => {
        const blockSteps = parseInt(chip.dataset.blockSteps || '16', 10);
        const steps = Number.isInteger(blockSteps) && blockSteps > 0 ? blockSteps : 16;
        const local = steps > 0 ? (progressSteps % steps) / steps : 0;
        const localPct = Math.max(0, Math.min(local, 1)) * 100;
        chip.style.setProperty('--arr-chip-play-progress', `${localPct.toFixed(2)}%`);
      });
    }
    playingArrangementRowIndex = rowIndex;
  });
}

function previewArrangementDraft() {
  if (isArrangementPreviewPlaying()) {
    stopArrangementPreview();
    playingArrangementFilename = null;
    playingArrangementRowBlocks = [];
    clearBlocksModalScopeVisualizer();
    updateArrangementPreviewButtonState();
    return;
  }

  const { arrangementState, name } = getArrangementDraftState();
  primePreviewAudioContext();
  console.log('[Arranger] Previewing draft:', arrangementState);
  const event = new CustomEvent('arrangements:preview', { detail: { arrangement: { name, arrangementState } } });
  document.dispatchEvent(event);
  setTimeout(updateArrangementPreviewButtonState, 200);
}

function setActiveTab(tab) {
  const blocksActive = tab !== 'arranger';
  elements.blocksTabPanel?.classList.toggle('hidden', !blocksActive);
  elements.arrangerTabPanel?.classList.toggle('hidden', blocksActive);
  elements.blocksTabBtn?.classList.toggle('active', blocksActive);
  elements.arrangerTabBtn?.classList.toggle('active', !blocksActive);
  if (blocksActive && isArrangementPreviewPlaying()) {
    stopArrangementPreview();
    playingArrangementFilename = null;
    playingArrangementRowBlocks = [];
    clearBlocksModalScopeVisualizer();
    updateArrangementPreviewButtonState();
  }
  if (!blocksActive) {
    stopTrackerPreviewPlayback();
  }
  // Keep insert buttons consistent: only enabled when an item is selected.
  updateInsertButtonsDisabledState();
  if (elements.description) {
    elements.description.textContent = blocksActive
      ? 'Blocks are reusable musical patterns. Create a block and insert it into a Strudel pattern or create arrangements from multiple blocks.'
      : 'Create arrangements with Blocks and add them to your Strudel patterns as a starting point.';
  }
  if (!blocksActive) {
    loadArrangementsList();
  }
  updateBlocksModalScopeVisualizer();
}

async function loadArrangementsList() {
  try {
    const response = await fetch('/api/arrangements');
    if (!response.ok) throw new Error('Failed to load arrangements');
    arrangementsCache = await response.json();
  } catch (err) {
    console.error('[Arranger] Failed to load arrangements:', err);
    arrangementsCache = [];
  }
  renderArrangementsList();
}

function renderArrangementsList() {
  if (!elements.arrangementsList) return;

  elements.arrangementsList.innerHTML = '';
  selectedArrangementIndex = null;
  updateInsertButtonsDisabledState();

  if (!arrangementsCache.length) {
    elements.arrangementsList.innerHTML = `
      <div class="blocks-empty text-center py-8 text-muted-foreground">
        <p class="mb-2">No arrangements yet.</p>
        <p class="text-sm">Create one to start arranging your blocks.</p>
      </div>
    `;
    updateInsertButtonsDisabledState();
    return;
  }

  const appendFolder = (scope, label, entries) => {
    const devMode = isDeveloperModeEnabled();
    const isEmpty = entries.length === 0;
    const expanded = isEmpty
      ? true
      : (scope === 'system' ? arrangementFolderState.system : arrangementFolderState.user);
    const icon = expanded ? 'chevron-down' : 'chevron-right';
    const highlightIcon = expanded && (scope !== 'user' || entries.length > 0);

    const folder = document.createElement('div');
    folder.className = 'mb-0 py-px';
    folder.innerHTML = `
      <button type="button" class="w-full flex items-center justify-between px-0 py-2 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40 ${expanded ? '' : 'border-b border-border'}" data-arr-folder="${scope}">
        <span class="inline-flex items-center gap-1.5">
          <i data-lucide="${icon}" class="w-5 h-5 shrink-0 ${expanded ? 'text-primary' : 'text-muted-foreground opacity-70'}"></i>
          ${label}
        </span>
        <span class="opacity-70">${entries.length}</span>
      </button>
      <div class="space-y-2 mt-1 ${expanded ? '' : 'hidden'}" data-arr-folder-items="${scope}"></div>
    `;
    const list = folder.querySelector(`[data-arr-folder-items="${scope}"]`);
    folder.querySelector(`[data-arr-folder="${scope}"]`)?.addEventListener('click', () => {
      if (isEmpty) return;
      if (scope === 'system') {
        arrangementFolderState.system = !arrangementFolderState.system;
      } else {
        arrangementFolderState.user = !arrangementFolderState.user;
      }
      saveFolderState(ARRANGEMENTS_FOLDER_STATE_KEY, arrangementFolderState);
      renderArrangementsList();
    });

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'text-xs text-muted-foreground px-2 py-1';
      empty.textContent = scope === 'user'
        ? 'No user arrangements yet. Create one to start arranging your blocks.'
        : 'No system arrangements available.';
      list?.appendChild(empty);
    }

    entries.forEach(({ arr, index }) => {
      const el = document.createElement('div');
      el.className = 'block-item';
      el.dataset.index = index;
      el.dataset.filename = arr.filename || '';
      el.tabIndex = 0;
      const displayName = decodeURIComponent((arr.filename || '').replace(/\.js$/i, ''));
      const isSystem = normalizeScope(arr.scope) === 'system';
      const canDeleteArr = !isSystem || devMode;
      const deleteActionMarkup = canDeleteArr
        ? `<button class="sidebar-del-btn" title="Delete ${escapeHtml(displayName)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`
        : '<button class="sidebar-del-btn invisible pointer-events-none" type="button" tabindex="-1" aria-hidden="true"><i data-lucide="trash-2" class="w-4 h-4"></i></button>';
      el.innerHTML = `
        <div class="min-w-0">
          <div class="block-name font-medium text-sm text-foreground">${escapeHtml(displayName)}</div>
          <div class="block-description text-xs text-muted-foreground mt-1">${escapeHtml(`BPM ${arr.bpm ?? 120}${isSystem ? ' • System' : ''}`)}</div>
        </div>
        <div class="list-item-actions">
          <button class="sidebar-edit-btn" title="Edit ${escapeHtml(displayName)}"><i data-lucide="pencil" class="w-4 h-4"></i> Edit</button>
          ${deleteActionMarkup}
        </div>
      `;

      el.addEventListener('click', () => {
        focusModalListItem(el);
        if (selectedArrangementIndex === index) {
          selectArrangement(index, { preview: false });
          void openArrangementEditor(arrangementsCache[index]);
        } else {
          selectArrangement(index);
        }
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = getVisibleModalListItems('#arrangementsList .block-item');
          const current = items.indexOf(el);
          const next = e.key === 'ArrowDown'
            ? items[Math.min(items.length - 1, current + 1)]
            : items[Math.max(0, current - 1)];
          if (next && next !== el) {
            focusModalListItem(next);
            const nextIndex = parseInt(next.dataset.index, 10);
            if (Number.isInteger(nextIndex)) selectArrangement(nextIndex);
          }
          return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (selectedArrangementIndex === index) {
          selectArrangement(index, { preview: false });
          void openArrangementEditor(arrangementsCache[index]);
        } else {
          selectArrangement(index);
        }
      });

      el.querySelector('.sidebar-edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        selectArrangement(index, { preview: false });
        void openArrangementEditor(arrangementsCache[index]);
      });

      const arrDelBtn = el.querySelector('.sidebar-del-btn');
      if (canDeleteArr && arrDelBtn) {
        arrDelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openDeleteArrangementModal(index);
        });
      }

      list?.appendChild(el);
    });

    elements.arrangementsList.appendChild(folder);
  };

  const sortByLeadingNumber = (a, b) => {
    const padNum = (s) => {
      const m = (s || '').match(/^(\d+)/);
      return m ? m[1].padStart(8, '0') + s : '\x00' + s;
    };
    const aKey = padNum(a.filename || '');
    const bKey = padNum(b.filename || '');
    return aKey.localeCompare(bKey);
  };
  arrangementsCache.sort(sortByLeadingNumber);
  const userEntries = [];
  const systemEntries = [];
  arrangementsCache.forEach((arr, index) => {
    if (normalizeScope(arr.scope) === 'system') {
      systemEntries.push({ arr, index });
    } else {
      userEntries.push({ arr, index });
    }
  });
  appendFolder('user', 'User', userEntries);
  appendFolder('system', 'System', systemEntries);

  createIcons({ icons });
  updateBlocksModalScopeVisualizer();
}

function selectArrangement(index, { preview = true } = {}) {
  document.querySelectorAll('#arrangementsList .block-item').forEach(el => {
    el.classList.remove('selected', 'bg-accent', 'border-primary');
  });
  const selectedEl = document.querySelector(`#arrangementsList .block-item[data-index="${index}"]`);
  if (selectedEl) {
    selectedEl.classList.add('selected', 'bg-accent', 'border-primary');
    scrollListItemIntoView(selectedEl);
  }
  selectedArrangementIndex = index;
  updateInsertButtonsDisabledState();

  if (!preview) return;

  const arrangement = arrangementsCache[index];
  if (arrangement?.arrangementState) {
    primePreviewAudioContext();
    console.log('[Arranger] Preview request:', arrangement);
    const event = new CustomEvent('arrangements:preview', { detail: { arrangement } });
    document.dispatchEvent(event);
  }
}

async function deleteArrangementByIndex(index) {
		  const arr = arrangementsCache[index];
		  if (!arr?.filename) return;
		  if (normalizeScope(arr.scope) === 'system' && !isDeveloperModeEnabled()) {
		    await alertDialog({
          title: 'Cannot Delete System Resource',
          message: 'System arrangements cannot be deleted. Enable developer mode to delete them.',
        });
		    return;
		  }
		  try {
	    const res = await fetch(`/api/arrangements/${arr.filename}`, { method: 'DELETE', headers: getDeveloperModeHeaders() });
	    if (!res.ok) throw new Error('Delete failed');
	    await loadArrangementsList();
	  } catch (err) {
	    console.error('[Arranger] Delete failed:', err);
	    await alertDialog({
        title: 'Arrangement Delete Failed',
        message: 'Could not delete the arrangement. See console for details.',
      });
		  }
		}

	function openDeleteArrangementModal(index) {
	  const arr = arrangementsCache[index];
	  if (!arr) return;
	  arrangementToDelete = arr;
	  if (elements.deleteArrangementText) {
	    elements.deleteArrangementText.textContent = `Delete arrangement "${arr.name}"? This cannot be undone.`;
	  }
	  elements.deleteArrangementModal?.classList.add('open');
	  elements.confirmDeleteArrangement?.focus();
	}

function closeDeleteArrangementModal() {
  arrangementToDelete = null;
  elements.deleteArrangementModal?.classList.remove('open');
}

function openDeleteArrangementRowModal(rowIndex) {
  if (!Number.isInteger(rowIndex)) return;
  arrangementRowToDeleteIndex = rowIndex;
  if (elements.deleteArrangementRowText) {
    elements.deleteArrangementRowText.textContent = 'Delete this row? This cannot be undone.';
  }
  elements.deleteArrangementRowModal?.classList.add('open');
  elements.confirmDeleteArrangementRow?.focus();
}

function closeDeleteArrangementRowModal() {
  arrangementRowToDeleteIndex = null;
  elements.deleteArrangementRowModal?.classList.remove('open');
}

function confirmDeleteArrangementRow() {
  if (!Number.isInteger(arrangementRowToDeleteIndex)) {
    closeDeleteArrangementRowModal();
    return;
  }
  const rowIndex = arrangementRowToDeleteIndex;
  closeDeleteArrangementRowModal();
  if (arrangementDraft.rows.length === 1) {
    arrangementDraft.rows[0] = { repeats: 1, blocks: [], loop: false };
  } else {
    arrangementDraft.rows.splice(rowIndex, 1);
  }
  renderArrangementRows();
  createIcons({ icons });
  emitArrangementStateChanged();
}

async function confirmDeleteArrangement() {
  if (!arrangementToDelete?.filename) {
		    closeDeleteArrangementModal();
		    return;
		  }
  if (normalizeScope(arrangementToDelete.scope) === 'system' && !isDeveloperModeEnabled()) {
    closeDeleteArrangementModal();
    await alertDialog({
      title: 'Cannot Delete System Resource',
      message: 'System arrangements cannot be deleted. Enable developer mode to delete them.',
    });
    return;
  }
  const filename = arrangementToDelete.filename;
  closeDeleteArrangementModal();
		  try {
		    const res = await fetch(`/api/arrangements/${filename}`, { method: 'DELETE', headers: getDeveloperModeHeaders() });
		    if (!res.ok) throw new Error('Delete failed');
		    await loadArrangementsList();
		  } catch (err) {
		    console.error('[Arranger] Delete failed:', err);
		    await alertDialog({
          title: 'Arrangement Delete Failed',
          message: 'Could not delete the arrangement. See console for details.',
        });
		  }
		}

function getSelectedArrangement() {
  const selectedEl = document.querySelector('#arrangementsList .block-item.selected');
  if (!selectedEl) return null;
  const index = parseInt(selectedEl.dataset.index, 10);
  return arrangementsCache[index];
}

function insertSelectedArrangement() {
  if (!canInsertIntoCurrentPattern()) {
    emitStatus('Cannot insert into system pattern outside developer mode', 'error');
    return;
  }
  const arr = getSelectedArrangement();
  if (!arr?.arrangementState) return;
  const event = new CustomEvent('arrangements:insert', { detail: { arrangement: arr } });
  document.dispatchEvent(event);
  closeBlocksModal('blocks');
}

let arrangementDraft = {
  version: 1,
  name: '',
  bpm: 120,
  metadata: normalizeArrangementMetadata(),
  rows: [{ repeats: 1, blocks: [], loop: false }],
};

/** Snapshot when arrangement editor was opened (for unsaved-changes detection) */
let lastSavedArrangementSnapshot = '';

function getArrangementSnapshot() {
  const name = (elements.arrangementName?.value ?? arrangementDraft.name ?? '').trim();
  const bpm = String(elements.arrangementBpm?.value ?? arrangementDraft.bpm ?? 120);
  const metadata = normalizeArrangementMetadata(arrangementDraft.metadata);
  const rows = arrangementDraft.rows.map((r) => ({
    repeats: Number.isInteger(r.repeats) ? r.repeats : 1,
    blocks: Array.isArray(r.blocks) ? r.blocks.slice() : [],
    loop: Boolean(r.loop),
  }));
  return JSON.stringify({ name, bpm, metadata, rows });
}

function hasArrangementUnsavedChanges() {
  return getArrangementSnapshot() !== lastSavedArrangementSnapshot;
}

async function ensureBlocksLoaded() {
  if (blocksCache?.length) return;
  await loadBlocksList();
}

async function openArrangementEditor(arrangement = null) {
  if (!elements.arrangementModal) return;
  await ensureBlocksLoaded();
  console.log('[Arranger] Opening editor. blocksCache:', blocksCache?.length || 0);
  if (!blocksCache?.length) {
    emitStatus('No blocks available (failed to load /api/blocks).', 'error');
  }

  arrangementEditMode.isEditing = !!arrangement;
  arrangementEditMode.filename = arrangement?.filename || null;
  arrangementEditMode.scope = normalizeScope(arrangement?.scope);

  const state = arrangement?.arrangementState || null;
  const nameFromFilename = arrangement?.filename ? arrangement.filename.replace(/\.js$/i, '') : '';
  arrangementDraft = {
    version: 1,
    name: arrangement ? nameFromFilename : (state?.name || ''),
    bpm: state?.bpm ?? arrangement?.bpm ?? 120,
    metadata: normalizeArrangementMetadata(state?.metadata),
    rows: Array.isArray(state?.rows) && state.rows.length
      ? (() => {
          const mapped = state.rows.map(r => ({
            repeats: Number.isInteger(r.repeats) ? r.repeats : 1,
            blocks: Array.isArray(r.blocks) ? r.blocks.slice() : [],
            loop: Boolean(r.loop),
          }));
          const loopIndices = mapped.map((r, i) => (r.loop ? i : -1)).filter(i => i >= 0);
          if (loopIndices.length > 1) {
            const keepIndex = loopIndices[loopIndices.length - 1];
            mapped.forEach((r, i) => { r.loop = i === keepIndex; });
          }
          return mapped;
        })()
      : [{ repeats: 1, blocks: [], loop: false }],
  };

  if (elements.arrangementModalTitle) {
    elements.arrangementModalTitle.textContent = arrangementEditMode.isEditing
      ? `Arrangement: ${arrangementDraft.name}`
      : 'Arrangement - New';
  }
  if (elements.arrangementName) elements.arrangementName.value = arrangementDraft.name;
  if (elements.arrangementBpm) elements.arrangementBpm.value = String(arrangementDraft.bpm);

  renderArrangementRows();
  elements.arrangementModal.classList.add('open');
  elements.arrangementModal.classList.remove('is-suspended');
  updateArrangementAdvancedSettingsVisibility();
  updateArrangementSaveGuardUI();
  elements.arrangementName?.focus();
  createIcons({ icons });
  updateArrangementPreviewButtonState();
  lastSavedArrangementSnapshot = getArrangementSnapshot();
}

function closeArrangementUnsavedConfirmModal() {
  elements.arrangementUnsavedModal?.classList.remove('open');
}

function requestCloseArrangementEditor() {
  if (hasArrangementUnsavedChanges()) {
    if (elements.arrangementUnsavedSave) {
      elements.arrangementUnsavedSave.classList.remove('hidden');
    }
    elements.arrangementUnsavedModal?.classList.add('open');
    return;
  }
  closeArrangementEditor();
}

function closeArrangementEditor() {
  closeArrangementUnsavedConfirmModal();
  const shouldRestoreBlocksModal = !isBlocksModalOpen();
  if (shouldRestoreBlocksModal) {
    // Open the blocks shell first to avoid a one-frame flash of the main app.
    openBlocksModal('arranger');
  }
  elements.arrangementModal?.classList.remove('open');
  arrangementEditMode.scope = 'user';
  updateArrangementAdvancedSettingsVisibility();
  updateArrangementSaveGuardUI();
  // Keep arrangement preview running when returning to the blocks shell.
  // Preview still stops when the user closes the whole blocks modal.
  updateArrangementPreviewButtonState();
  if (!shouldRestoreBlocksModal) {
    resumeBlocksModal();
  }
}

function renderArrangementRows() {
  if (!elements.arrangementRows) return;
  elements.arrangementRows.innerHTML = '';
  playingArrangementRowIndex = null;

  const sortBlocksForPicker = (blocks) => {
    const collator = typeof Intl !== 'undefined' && Intl.Collator
      ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      : null;
    const groupKey = (name) => {
      const s = String(name || '').trim().toLowerCase();
      const first = s[0] || '';
      if (first >= '0' && first <= '9') return `0${s}`;
      if (first >= 'a' && first <= 'z') return `1${s}`;
      return `2${s}`;
    };
    return (blocks || []).slice().sort((a, b) => {
      const aKey = groupKey(a?.name);
      const bKey = groupKey(b?.name);
      if (collator) {
        const byKey = collator.compare(aKey, bKey);
        if (byKey) return byKey;
      } else {
        if (aKey < bKey) return -1;
        if (aKey > bKey) return 1;
      }
      const aFile = String(a?.filename || '');
      const bFile = String(b?.filename || '');
      return collator ? collator.compare(aFile, bFile) : aFile.localeCompare(bFile);
    });
  };
  // User arrangements can reference both user and system blocks. Restricting this
  // to user-only blocks makes the picker look empty in common first-run cases.
  const blocksForPicker = sortBlocksForPicker(blocksCache);
  const blockByFilename = new Map(blocksCache.map((b) => [b.filename, b]));
  const compareRowBlockFilenames = (aFilename, bFilename) => {
    const aBlock = blockByFilename.get(aFilename);
    const bBlock = blockByFilename.get(bFilename);
    const aKey = aBlock ? aBlock.name : aFilename;
    const bKey = bBlock ? bBlock.name : bFilename;
    // Reuse the picker sort behavior (0..9 then a..z).
    const collator = typeof Intl !== 'undefined' && Intl.Collator
      ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      : null;
    const groupKey = (name) => {
      const s = String(name || '').trim().toLowerCase();
      const first = s[0] || '';
      if (first >= '0' && first <= '9') return `0${s}`;
      if (first >= 'a' && first <= 'z') return `1${s}`;
      return `2${s}`;
    };
    const aGroup = groupKey(aKey);
    const bGroup = groupKey(bKey);
    if (collator) {
      const byGroup = collator.compare(aGroup, bGroup);
      if (byGroup) return byGroup;
      return collator.compare(String(aFilename || ''), String(bFilename || ''));
    }
    if (aGroup < bGroup) return -1;
    if (aGroup > bGroup) return 1;
    return String(aFilename || '').localeCompare(String(bFilename || ''));
  };

  const isMac = (() => {
    try {
      const platform = String(navigator?.platform || '');
      const ua = String(navigator?.userAgent || '');
      return /Mac/i.test(platform) || /Mac OS X/i.test(ua);
    } catch (_e) {
      return false;
    }
  })();
  const isCopyModifier = (evt) => (isMac ? !!evt.altKey : !!evt.ctrlKey);

  const cssEscape = (value) => {
    try {
      return window.CSS && typeof window.CSS.escape === 'function'
        ? window.CSS.escape(String(value))
        : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    } catch (_e) {
      return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }
  };

  const shakeChip = (rowEl, filename) => {
    if (!rowEl || !filename) return;
    const selector = `.arr-chip[data-filename="${cssEscape(filename)}"]`;
    const chip = rowEl.querySelector(selector);
    if (!chip) return;
    chip.classList.remove('shake');
    // Force reflow so re-adding the class retriggers the animation.
    void chip.offsetWidth;
    chip.classList.add('shake');
    chip.addEventListener('animationend', () => chip.classList.remove('shake'), { once: true });
  };

  const handleBlockDrop = ({ filename, fromRowIndex, toRowIndex, copy }, targetRowEl) => {
    if (!filename) return;
    if (!Number.isInteger(toRowIndex)) return;
    const targetRow = arrangementDraft.rows?.[toRowIndex];
    if (!targetRow) return;
    if (!Array.isArray(targetRow.blocks)) targetRow.blocks = [];

    const normalizedFrom = Number.isInteger(fromRowIndex) ? fromRowIndex : null;
    const normalizedTo = toRowIndex;
    const shouldCopy = Boolean(copy);

    if (normalizedFrom === normalizedTo) {
      if (targetRow.blocks.includes(filename)) {
        shakeChip(targetRowEl, filename);
      }
      return;
    }

    if (targetRow.blocks.includes(filename)) {
      shakeChip(targetRowEl, filename);
      return;
    }

    if (!shouldCopy && normalizedFrom != null) {
      const srcRow = arrangementDraft.rows?.[normalizedFrom];
      if (srcRow && Array.isArray(srcRow.blocks)) {
        const idx = srcRow.blocks.indexOf(filename);
        if (idx >= 0) srcRow.blocks.splice(idx, 1);
      }
    }

    targetRow.blocks.push(filename);
    renderArrangementRows();
    emitArrangementStateChanged();
  };

  arrangementDraft.rows.forEach((row, rowIndex) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'arr-row';
    rowEl.dataset.row = rowIndex;

    const rowNumberEl = document.createElement('span');
    rowNumberEl.className = 'arr-row-number';
    rowNumberEl.setAttribute('aria-label', 'Row ' + (rowIndex + 1) + ' (drag to reorder)');
    rowNumberEl.draggable = true;
    rowNumberEl.addEventListener('dragstart', (e) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-zzfxtrack-arr-row', JSON.stringify({ fromRowIndex: rowIndex }));
      window.__arrRowDragFromIndex = rowIndex;
    });
    rowNumberEl.addEventListener('dragend', () => {
      window.__arrRowDragFromIndex = undefined;
      elements.arrangementRows?.querySelectorAll('.arr-row').forEach((el) => {
        el.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below');
      });
    });
    rowNumberEl.innerHTML = `
      <span class="arr-row-number-value">${rowIndex + 1}</span>
      <i data-lucide="play" class="arr-row-play-icon hidden w-2.5 h-2.5 fill-current"></i>
    `;

    const rowNumberWrap = document.createElement('div');
    rowNumberWrap.className = 'arr-row-number-wrap';
    rowNumberWrap.appendChild(rowNumberEl);

    const loopRowBtn = document.createElement('button');
    loopRowBtn.type = 'button';
    loopRowBtn.className = 'arr-loop-row-btn';
    loopRowBtn.setAttribute('aria-label', row.loop ? 'Loop row (on)' : 'Loop row (off)');
    loopRowBtn.title = row.loop ? 'Loop row (on)' : 'Loop row (off)';
    loopRowBtn.dataset.loop = row.loop ? 'true' : 'false';
    loopRowBtn.innerHTML = '<i data-lucide="repeat-2" class="w-4 h-4"></i>';
    loopRowBtn.addEventListener('click', () => {
      if (row.loop) {
        row.loop = false;
      } else {
        arrangementDraft.rows.forEach((r) => { r.loop = false; });
        row.loop = true;
      }
      loopRowBtn.dataset.loop = row.loop ? 'true' : 'false';
      loopRowBtn.setAttribute('aria-label', row.loop ? 'Loop row (on)' : 'Loop row (off)');
      loopRowBtn.title = loopRowBtn.getAttribute('aria-label');
      elements.arrangementRows?.querySelectorAll('.arr-row').forEach((rowEl) => {
        const i = parseInt(rowEl.dataset.row, 10);
        const r = arrangementDraft.rows?.[i];
        const btn = rowEl.querySelector('.arr-loop-row-btn');
        if (btn && r != null) {
          btn.dataset.loop = r.loop ? 'true' : 'false';
          btn.setAttribute('aria-label', r.loop ? 'Loop row (on)' : 'Loop row (off)');
          btn.title = btn.getAttribute('aria-label');
        }
      });
      if (window.lucide?.createIcons) window.lucide.createIcons();
      // Loop is runtime-only: notify tracker for loop-row switch without triggering save
      const { arrangementState } = getArrangementDraftState();
      if (arrangementState) {
        document.dispatchEvent(new CustomEvent('arrangements:previewLoopChanged', { detail: { arrangementState } }));
      }
    });
    rowNumberWrap.appendChild(loopRowBtn);
    if (window.lucide?.createIcons) window.lucide.createIcons();

    const repeatsEl = document.createElement('input');
    repeatsEl.type = 'number';
    repeatsEl.min = '1';
    repeatsEl.max = '16';
    repeatsEl.step = '1';
    repeatsEl.value = String(row.repeats || 1);
    repeatsEl.className = 'arr-repeats';
    repeatsEl.addEventListener('input', () => {
      const val = parseInt(repeatsEl.value, 10);
      row.repeats = Number.isFinite(val) ? Math.min(Math.max(val, 1), 16) : 1;
      emitArrangementStateChanged();
    });
    setupScrubInteraction(repeatsEl);

    const repeatsWrap = document.createElement('div');
    repeatsWrap.className = 'arr-repeats-wrap';
    repeatsWrap.appendChild(repeatsEl);

    const chipsEl = document.createElement('div');
		    chipsEl.className = 'arr-chips';

        rowEl.addEventListener('dragover', (e) => {
          if (!e.dataTransfer) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = isCopyModifier(e) ? 'copy' : 'move';
          rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below');
          const isRowDrag = e.dataTransfer.types.includes('application/x-zzfxtrack-arr-row');
          const fromIndex = isRowDrag ? window.__arrRowDragFromIndex : undefined;
          if (typeof fromIndex === 'number') {
            if (fromIndex > rowIndex) rowEl.classList.add('arr-row-drop-target-above');
            else if (fromIndex < rowIndex) rowEl.classList.add('arr-row-drop-target-below');
          } else {
            rowEl.classList.add('arr-row-drop-target-below');
          }
        });
        rowEl.addEventListener('dragleave', (e) => {
          const related = e.relatedTarget;
          if (related && related instanceof Node && rowEl.contains(related)) return;
          rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below');
        });
        rowEl.addEventListener('drop', (e) => {
          if (!e.dataTransfer) return;
          e.preventDefault();
          rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below');
          window.__arrRowDragFromIndex = undefined;
          let rowPayload = null;
          try {
            rowPayload = JSON.parse(e.dataTransfer.getData('application/x-zzfxtrack-arr-row') || 'null');
          } catch (_err) {
            rowPayload = null;
          }
          const fromRowIndex = Number.isInteger(rowPayload?.fromRowIndex) ? rowPayload.fromRowIndex : null;
          if (fromRowIndex != null && fromRowIndex !== rowIndex) {
            const moved = arrangementDraft.rows.splice(fromRowIndex, 1)[0];
            if (moved) {
              arrangementDraft.rows.splice(rowIndex, 0, moved);
              renderArrangementRows();
              emitArrangementStateChanged();
            }
            return;
          }
          let payload = null;
          try {
            payload = JSON.parse(e.dataTransfer.getData('application/x-zzfxtrack-arr-chip') || 'null');
          } catch (_err) {
            payload = null;
          }
          const filename = payload?.filename || e.dataTransfer.getData('text/plain') || '';
          const fromRowIndexChip = Number.isInteger(payload?.fromRowIndex) ? payload.fromRowIndex : null;
          handleBlockDrop({ filename, fromRowIndex: fromRowIndexChip, toRowIndex: rowIndex, copy: isCopyModifier(e) }, rowEl);
        });

		    const updateSelectDisabled = (selectEl) => {
		      if (!selectEl) return;
		      const options = Array.from(selectEl.querySelectorAll('option'));
		      for (const opt of options) {
	        if (!opt.value) continue;
	        opt.disabled = row.blocks.includes(opt.value);
	      }
	    };

		    const renderChips = () => {
		      chipsEl.innerHTML = '';
		      row.blocks
            .slice()
            .sort(compareRowBlockFilenames)
            .forEach((filename) => {
		        const block = blocksCache.find(b => b.filename === filename);
		        const chip = document.createElement('div');
	        chip.className = 'arr-chip';
	        chip.dataset.filename = filename;
	        chip.dataset.blockSteps = String(getBlockSteps(block));
	        chip.innerHTML = `
	          <span class="arr-chip-label">${escapeHtml(block?.name || filename)}</span>
	          <button type="button" class="arr-chip-del" title="Remove"><i data-lucide="x" class="w-3 h-3"></i></button>
	        `;
          chip.draggable = true;
          chip.addEventListener('dragstart', (e) => {
            if (!e.dataTransfer) return;
            const payload = { filename, fromRowIndex: rowIndex };
            e.dataTransfer.effectAllowed = 'copyMove';
            e.dataTransfer.setData('application/x-zzfxtrack-arr-chip', JSON.stringify(payload));
            e.dataTransfer.setData('text/plain', filename);
          });
		        chip.addEventListener('click', (event) => {
		          if (event.target?.closest('.arr-chip-del')) return;
		          void openTrackerForArrangementBlock(filename);
		        });
		        chip.querySelector('.arr-chip-del')?.addEventListener('click', () => {
              const idx = row.blocks.indexOf(filename);
              if (idx >= 0) row.blocks.splice(idx, 1);
		          renderChips();
		          updateSelectDisabled(selectEl);
		          createIcons({ icons });
	          emitArrangementStateChanged();
		        });
		        chipsEl.appendChild(chip);
		      });
		    };

		    const selectEl = document.createElement('select');
		    selectEl.className = 'arr-block-select';
		    selectEl.setAttribute('aria-label', 'Add block or row');
		    selectEl.title = 'Add block or row';
		    selectEl.innerHTML = `<option value="" selected></option><option value="__new_row__">+ New row</option><option value="__create__">+ New block</option>` + blocksForPicker
		      .map(b => {
		        const disabled = row.blocks.includes(b.filename) ? ' disabled' : '';
		        return `<option value="${escapeHtml(b.filename)}"${disabled}>${escapeHtml(b.name)}</option>`;
		      })
		      .join('');
	    selectEl.addEventListener('change', () => {
	      const val = selectEl.value;
	      if (!val) return;
	      if (val === '__new_row__') {
	        arrangementDraft.rows.splice(rowIndex + 1, 0, {
	          repeats: 1,
	          blocks: [],
	          loop: false,
	        });
	        selectEl.selectedIndex = 0;
	        renderArrangementRows();
	        createIcons({ icons });
	        emitArrangementStateChanged();
	        return;
	      }
	      if (val === '__create__') {
	        selectEl.selectedIndex = 0;
	        openTrackerForNewBlockFromArrangement(rowIndex);
	        return;
	      }
	      if (!row.blocks.includes(val)) {
	        row.blocks.push(val);
	      }
	      selectEl.selectedIndex = 0;
	      console.log('[Arranger] Added block to row', rowIndex, val, '=>', row.blocks);
	      renderChips();
	      updateSelectDisabled(selectEl);
	      createIcons({ icons });
	      emitArrangementStateChanged();
	    });

        const selectWrap = document.createElement('div');
        selectWrap.className = 'arr-block-select-wrap';
        selectWrap.innerHTML = '<span class="arr-block-select-plus-label" aria-hidden="true">+</span>';
        selectWrap.appendChild(selectEl);

    const duplicateRowBtn = document.createElement('button');
    duplicateRowBtn.type = 'button';
    duplicateRowBtn.className = 'arr-row-del arr-row-dup';
    duplicateRowBtn.title = 'Duplicate row';
    duplicateRowBtn.innerHTML = '<i data-lucide="copy" class="w-4 h-4"></i>';
    duplicateRowBtn.addEventListener('click', () => {
      const sourceRow = arrangementDraft.rows?.[rowIndex];
      if (!sourceRow) return;
      const duplicatedRow = {
        repeats: Number.isInteger(sourceRow.repeats) ? sourceRow.repeats : 1,
        blocks: Array.isArray(sourceRow.blocks) ? sourceRow.blocks.slice() : [],
        loop: Boolean(sourceRow.loop),
      };
      arrangementDraft.rows.splice(rowIndex + 1, 0, duplicatedRow);
      renderArrangementRows();
      createIcons({ icons });
      emitArrangementStateChanged();
    });

    const removeRowBtn = document.createElement('button');
    removeRowBtn.type = 'button';
    removeRowBtn.className = 'arr-row-del';
    removeRowBtn.title = 'Remove row';
    removeRowBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
    removeRowBtn.addEventListener('click', () => {
      openDeleteArrangementRowModal(rowIndex);
    });

		    const rowActionsGroup = document.createElement('div');
		    rowActionsGroup.className = 'arr-row-btn-group';
		    rowActionsGroup.appendChild(selectWrap);
		    rowActionsGroup.appendChild(duplicateRowBtn);
		    rowActionsGroup.appendChild(removeRowBtn);

		    const rowMain = document.createElement('div');
		    rowMain.className = 'arr-row-main';
		    rowMain.appendChild(rowNumberWrap);
		    rowMain.appendChild(repeatsWrap);
		    rowMain.appendChild(chipsEl);

		    const rowActions = document.createElement('div');
		    rowActions.className = 'arr-row-actions';
		    rowActions.appendChild(rowActionsGroup);

		    rowEl.appendChild(rowMain);
		    rowEl.appendChild(rowActions);

	    elements.arrangementRows.appendChild(rowEl);
	    renderChips();
	    updateSelectDisabled(selectEl);
	  });

	  createIcons({ icons });
	}

async function saveArrangementFromEditor() {
  const rawName = elements.arrangementName?.value?.trim() || '';
  if (!rawName) {
    await alertDialog({
      title: 'Arrangement Name Required',
      message: 'Please enter an arrangement name.',
    });
    elements.arrangementName?.focus();
    return;
  }

  emitStatus('Saving arrangement...', 'normal');
  console.log('[Arranger] Saving draft:', JSON.parse(JSON.stringify(arrangementDraft)));

  const bpmVal = parseInt(elements.arrangementBpm?.value || '120', 10);
  arrangementDraft.name = rawName;
  arrangementDraft.bpm = Number.isFinite(bpmVal) ? Math.min(Math.max(bpmVal, 20), 300) : 120;

  const existing = await fetch('/api/arrangements').then(r => r.ok ? r.json() : []).catch(() => []);
  const currentFilename = arrangementEditMode.filename ? arrangementEditMode.filename.toLowerCase() : null;
  const existingNames = new Set(
    existing
      .filter(a => String(a?.filename || '').toLowerCase() !== currentFilename)
      .map(a => String(a?.name || '').toLowerCase())
  );

  let uniqueName = rawName;
  let suffix = 1;
  while (existingNames.has(uniqueName.toLowerCase())) {
    suffix++;
    uniqueName = `${rawName}_${suffix}`;
  }
  arrangementDraft.name = uniqueName;
  if (elements.arrangementName) elements.arrangementName.value = uniqueName;

  const sanitizeBase = (str) => {
    const base = String(str || '').trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
    return base || 'arrangement';
  };

  const arrangementState = {
    version: 1,
    name: arrangementDraft.name,
    bpm: arrangementDraft.bpm,
    metadata: normalizeArrangementMetadata(arrangementDraft.metadata),
    rows: arrangementDraft.rows.map(r => ({
      repeats: Number.isInteger(r.repeats) ? r.repeats : 1,
      blocks: Array.isArray(r.blocks) ? r.blocks.slice() : [],
      loop: false,
    })),
  };
  console.log('[Arranger] arrangementState payload:', arrangementState);

  try {
	    if (arrangementEditMode.isEditing && arrangementEditMode.filename) {
	      const targetFilename = arrangementEditMode.filename;
	      const baseSlug = sanitizeBase(uniqueName);
	      const existingFilenames = new Set(existing.map((a) => String(a?.filename || '').toLowerCase()));
	      let slugSuffix = 1;
	      let uniqueSlug = baseSlug;
	      while (existingFilenames.has(`${uniqueSlug}.js`.toLowerCase()) && `${uniqueSlug}.js`.toLowerCase() !== targetFilename.toLowerCase()) {
	        slugSuffix++;
	        uniqueSlug = `${baseSlug}-${slugSuffix}`;
	      }
	      const newFilename = `${uniqueSlug}.js`;
	      if (newFilename.toLowerCase() !== targetFilename.toLowerCase()) {
	        const renameRes = await fetch('/api/rename-arrangement', {
	          method: 'POST',
	          headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
	          body: JSON.stringify({ oldName: targetFilename, newName: newFilename }),
	        });
	        if (!renameRes.ok) throw new Error('Rename failed');
	        arrangementEditMode.filename = newFilename;
	      }
	      const res = await fetch(`/api/arrangements/${encodeURIComponent(arrangementEditMode.filename)}`, {
	        method: 'PUT',
	        headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
	        body: JSON.stringify({ name: arrangementDraft.name, arrangementState, scope: arrangementEditMode.scope })
	      });
	      if (!res.ok) throw new Error('Update failed');
	    } else {
      const existingFilenames = new Set(existing.map(a => String(a?.filename || '').toLowerCase()));
      const baseSlug = sanitizeBase(arrangementDraft.name);
      let uniqueSlug = baseSlug;
      suffix = 1;
      while (existingFilenames.has(`${uniqueSlug}.js`.toLowerCase())) {
        suffix++;
        uniqueSlug = `${baseSlug}-${suffix}`;
      }
      const filename = `${uniqueSlug}.js`;
      const res = await fetch('/api/arrangements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, name: arrangementDraft.name, arrangementState, scope: arrangementEditMode.scope || 'user' })
      });
      if (!res.ok) throw new Error('Save failed');
      arrangementEditMode.filename = filename;
      arrangementEditMode.isEditing = true;
    }

    await loadArrangementsList();
    document.dispatchEvent(new CustomEvent('arrangements:saved', { detail: { filename: arrangementEditMode.filename, name: arrangementDraft.name } }));
    closeArrangementEditor();
    emitStatus('Arrangement saved.', 'success');
  } catch (err) {
    console.error('[Arranger] Save failed:', err);
    await alertDialog({
      title: 'Arrangement Save Failed',
      message: 'Could not save the arrangement. See console for details.',
    });
    emitStatus('Failed to save arrangement.', 'error');
  }
}

/**
 * Load the list of available blocks from the server
 */
async function loadBlocksList() {
  try {
    const response = await fetch('/api/blocks');
    if (!response.ok) throw new Error('Failed to load blocks');
    
    blocksCache = await response.json();
    renderBlocksList();
  } catch (err) {
    console.error('[Blocks] Failed to load blocks:', err);
    blocksCache = [];
    renderBlocksList();
  }
}

/**
 * Render the blocks list in the modal
 */
function renderBlocksList() {
  if (!elements.blocksList) return;

  blockFolderState = loadFolderState(BLOCKS_FOLDER_STATE_KEY, { user: false, system: true });
  
  elements.blocksList.innerHTML = '';
  selectedBlockIndex = null;
  updateInsertButtonsDisabledState();
  if (elements.deleteBlockBtn) elements.deleteBlockBtn.disabled = true;
  
  if (blocksCache.length === 0) {
    elements.blocksList.innerHTML = `
      <div class="blocks-empty text-center py-8 text-muted-foreground">
        <p class="mb-2">No blocks yet.</p>
        <p class="text-sm">Click "Create Block" to make your first pattern!</p>
      </div>
    `;
    return;
  }

  const appendFolder = (scope, label, entries) => {
    const devMode = isDeveloperModeEnabled();
    const isEmpty = entries.length === 0;
    const expanded = isEmpty
      ? true
      : (scope === 'system' ? blockFolderState.system : blockFolderState.user);
    const icon = expanded ? 'chevron-down' : 'chevron-right';
    const highlightIcon = expanded && (scope !== 'user' || entries.length > 0);
    const folder = document.createElement('div');
    folder.className = 'mb-0 py-px';
    folder.innerHTML = `
      <button type="button" class="w-full flex items-center justify-between px-0 py-2 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40 ${expanded ? '' : 'border-b border-border'}" data-block-folder="${scope}">
        <span class="inline-flex items-center gap-1.5">
          <i data-lucide="${icon}" class="w-5 h-5 shrink-0 ${expanded ? 'text-primary' : 'text-muted-foreground opacity-70'}"></i>
          ${label}
        </span>
        <span class="opacity-70">${entries.length}</span>
      </button>
      <div class="space-y-2 mt-1 ${expanded ? '' : 'hidden'}" data-block-folder-items="${scope}"></div>
    `;
    const list = folder.querySelector(`[data-block-folder-items="${scope}"]`);
    folder.querySelector(`[data-block-folder="${scope}"]`)?.addEventListener('click', () => {
      if (isEmpty) return;
      if (scope === 'system') {
        blockFolderState.system = !blockFolderState.system;
      } else {
        blockFolderState.user = !blockFolderState.user;
      }
      saveFolderState(BLOCKS_FOLDER_STATE_KEY, blockFolderState);
      renderBlocksList();
    });

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'text-xs text-muted-foreground px-2 py-1';
      empty.textContent = scope === 'user'
        ? 'None was found'
        : 'No system blocks available.';
      list?.appendChild(empty);
    }

    entries.forEach(({ block, index }) => {
      const isSystem = normalizeScope(block.scope) === 'system';
      const canDeleteBlock = !isSystem || devMode;
      const deleteActionMarkup = canDeleteBlock
        ? `<button class="sidebar-del-btn" title="Delete ${escapeHtml(block.name)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`
        : '<button class="sidebar-del-btn invisible pointer-events-none" type="button" tabindex="-1" aria-hidden="true"><i data-lucide="trash-2" class="w-4 h-4"></i></button>';
      const bpm = Number.isFinite(block?.trackerState?.bpm) ? block.trackerState.bpm : null;
      const steps = Number.isFinite(block?.trackerState?.steps)
        ? block.trackerState.steps
        : (Array.isArray(block?.trackerState?.grid?.[0]) ? block.trackerState.grid[0].length : null);
      const blockMeta = (bpm != null && steps != null)
        ? `BPM ${bpm} • ${steps} row${steps === 1 ? '' : 's'}${isSystem ? ' • System' : ''}`
        : `${block.description || 'No block metadata'}${isSystem ? ' • System' : ''}`;

      const blockEl = document.createElement('div');
      blockEl.className = 'block-item';
      blockEl.dataset.index = index;
      blockEl.dataset.filename = block.filename;
      blockEl.tabIndex = 0;

      blockEl.innerHTML = `
        <div class="min-w-0">
          <div class="block-name font-medium text-sm text-foreground">${escapeHtml(block.name)}</div>
          <div class="block-description text-xs text-muted-foreground mt-1">${escapeHtml(blockMeta)}</div>
        </div>
        <div class="list-item-actions">
          <button class="sidebar-edit-btn" title="Edit ${escapeHtml(block.name)}">Edit</button>
          <button class="sidebar-dup-btn" title="Duplicate ${escapeHtml(block.name)}"><i data-lucide="copy-plus" class="w-4 h-4"></i></button>
          ${deleteActionMarkup}
        </div>
      `;

      blockEl.addEventListener('click', () => {
        focusModalListItem(blockEl);
        if (selectedBlockIndex === index) {
          openTrackerForEdit(index);
        } else {
          selectBlock(index);
        }
      });
      blockEl.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = getVisibleModalListItems('#blocksList .block-item');
          const current = items.indexOf(blockEl);
          const next = e.key === 'ArrowDown'
            ? items[Math.min(items.length - 1, current + 1)]
            : items[Math.max(0, current - 1)];
          if (next && next !== blockEl) {
            focusModalListItem(next);
            const nextIndex = parseInt(next.dataset.index, 10);
            if (Number.isInteger(nextIndex)) selectBlock(nextIndex);
          }
          return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (selectedBlockIndex === index) {
          openTrackerForEdit(index);
        } else {
          selectBlock(index);
        }
      });

      const dupBtn = blockEl.querySelector('.sidebar-dup-btn');
      dupBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        selectBlock(index, { preview: false });
        await duplicateBlockByIndex(index);
      });

      const editBtn = blockEl.querySelector('.sidebar-edit-btn');
      editBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        selectBlock(index, { preview: false });
        openTrackerForEdit(index);
      });

      const deleteBtn = blockEl.querySelector('.sidebar-del-btn');
      if (canDeleteBlock && deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteBlockByIndex(index);
        });
      }

      list?.appendChild(blockEl);
    });

    elements.blocksList.appendChild(folder);
  };

  const userEntries = [];
  const systemEntries = [];
  blocksCache.forEach((block, index) => {
    if (normalizeScope(block.scope) === 'system') {
      systemEntries.push({ block, index });
    } else {
      userEntries.push({ block, index });
    }
  });
  appendFolder('user', 'User', userEntries);
  appendFolder('system', 'System', systemEntries);

  createIcons({ icons });
  updateBlocksModalScopeVisualizer();
}

/**
 * Select a block from the list
 */
function selectBlock(index, { preview = true } = {}) {
  // Remove previous selection
  document.querySelectorAll('#blocksList .block-item').forEach(el => {
    el.classList.remove('selected', 'bg-accent', 'border-primary');
  });
  
  // Add selection to clicked item
  const selectedEl = document.querySelector(`#blocksList .block-item[data-index="${index}"]`);
  if (selectedEl) {
    selectedEl.classList.add('selected', 'bg-accent', 'border-primary');
    scrollListItemIntoView(selectedEl);
  }
  
  // Store selected index
  selectedBlockIndex = index;
  
  const block = blocksCache[index];
  
    // Enable insert/delete/edit buttons
  updateInsertButtonsDisabledState();
  if (elements.deleteBlockBtn) {
    elements.deleteBlockBtn.disabled = selectedBlockIndex == null || (normalizeScope(block?.scope) === 'system' && !isDeveloperModeEnabled());
  }
  // Trigger preview on selection (skip when opening Edit to avoid one-shot preview then hard cut)
  if (preview && block) {
    previewBlock(block);
  }
}

async function previewBlock(block) {
  let trackerState = block.trackerState;
  if (!trackerState && block.filename) {
    try {
      const response = await fetch(`/api/blocks/${block.filename}`);
      if (response.ok) {
        const fullBlock = await response.json();
        trackerState = fullBlock.trackerState;
      }
    } catch (err) {
      console.warn('[Blocks] Could not fetch block for preview:', err);
    }
  }

  if (!trackerState) return;

  const event = new CustomEvent('blocks:preview', {
    detail: {
      name: block.name,
      trackerState,
    }
  });
  document.dispatchEvent(event);
}

/**
 * Get the currently selected block
 */
function getSelectedBlock() {
  const selectedEl = document.querySelector('#blocksList .block-item.selected');
  if (!selectedEl) return null;
  
  const index = parseInt(selectedEl.dataset.index, 10);
  return blocksCache[index];
}

async function duplicateBlockByIndex(index) {
  const block = Number.isInteger(index) ? blocksCache[index] : null;
  if (!block) return;

  let trackerState = block.trackerState;
  let description = block.description || '';
  let scope = block.scope;

  if (block.filename) {
    try {
      const response = await fetch(`/api/blocks/${encodeURIComponent(block.filename)}`);
      if (response.ok) {
        const fullBlock = await response.json();
        trackerState = fullBlock?.trackerState ?? trackerState;
        description = fullBlock?.description ?? description;
        scope = fullBlock?.scope ?? scope;
      }
    } catch (err) {
      console.warn('[Blocks] Could not fetch full block data for duplication:', err);
    }
  }

  if (!trackerState) {
    await alertDialog({
      title: 'Cannot Duplicate Block',
      message: 'This block has no tracker data to duplicate.',
    });
    return;
  }

  document.dispatchEvent(new CustomEvent('tracker:duplicateBlock', {
    detail: {
      filename: block.filename,
      name: block.name,
      description,
      scope: normalizeScope(scope),
      pattern: block.pattern || '',
      trackerState,
    },
  }));
}

/**
 * Open tracker to create a new block
 */
function openTrackerForNewBlock() {
  suspendBlocksModal();
  
  // Dispatch event to open tracker in "block creation mode"
  const event = new CustomEvent('blocks:create');
  document.dispatchEvent(event);
}

function openTrackerForNewBlockFromArrangement(rowIndex) {
  suspendBlocksModal();
  suspendArrangementModal();
  const event = new CustomEvent('blocks:create', {
    detail: {
      returnToArrangementsOnClose: true,
      arrangementInsertRowIndex: rowIndex,
    }
  });
  document.dispatchEvent(event);
}

/**
 * Open tracker to edit the selected block
 */
async function openTrackerForEdit(index = null) {
  let block = Number.isInteger(index) ? blocksCache[index] : getSelectedBlock();
  if (!block) return;

  // Always fetch full block data so we get trackerState, scope, denseRows, etc.
  let trackerState = block.trackerState;
  if (block.filename) {
    try {
      const response = await fetch(`/api/blocks/${encodeURIComponent(block.filename)}`);
      if (response.ok) {
        const fullBlock = await response.json();
        trackerState = fullBlock.trackerState ?? trackerState;
        block = { ...block };
        if (fullBlock?.scope !== undefined) block.scope = fullBlock.scope;
      }
    } catch (err) {
      console.warn('[Blocks] Could not fetch full block data:', err);
    }
  }

  suspendBlocksModal();

  // Dispatch event to open tracker in "block edit mode"
  const event = new CustomEvent('blocks:edit', {
    detail: { 
      block: block,
      trackerState: trackerState
    }
  });
  document.dispatchEvent(event);
}

async function openTrackerForArrangementBlock(filename) {
  if (!filename) return;
  let block = blocksCache.find(b => b.filename === filename) || { filename, name: filename, description: '' };
  let trackerState = block.trackerState;

  if (block.filename) {
    try {
      const response = await fetch(`/api/blocks/${encodeURIComponent(block.filename)}`);
      if (response.ok) {
        const fullBlock = await response.json();
        trackerState = fullBlock.trackerState ?? trackerState;
        block = { ...block };
        if (fullBlock?.scope !== undefined) block.scope = fullBlock.scope;
        if (fullBlock?.name !== undefined) block.name = fullBlock.name;
        if (fullBlock?.description !== undefined) block.description = fullBlock.description;
      }
    } catch (err) {
      console.warn('[Arranger] Could not fetch full block data:', err);
    }
  }

  if (!trackerState) return;

  suspendBlocksModal();
  suspendArrangementModal();
  const event = new CustomEvent('blocks:edit', {
    detail: {
      block,
      trackerState,
      returnToArrangementsOnClose: true,
    }
  });
  document.dispatchEvent(event);
}

/**
 * Insert the selected block into the current pattern
 */
async function insertSelectedBlock() {
  if (!canInsertIntoCurrentPattern()) {
    emitStatus('Cannot insert into system pattern outside developer mode', 'error');
    return;
  }
  const block = getSelectedBlock();
  if (!block || !block.pattern) {
    console.warn('[Blocks] No block selected or block has no pattern');
    return;
  }
  const preserveBlockBpm = !!elements.preserveBlockBpm?.checked;
  let blockBpm = block.trackerState?.bpm;
  let blockSteps = block.trackerState?.steps;
  if (((preserveBlockBpm && !blockBpm) || !blockSteps) && block.filename) {
    try {
      const response = await fetch(`/api/blocks/${block.filename}`);
      if (response.ok) {
        const fullBlock = await response.json();
        blockBpm = fullBlock?.trackerState?.bpm;
        blockSteps = fullBlock?.trackerState?.steps;
      }
    } catch (err) {
      console.warn('[Blocks] Could not fetch block BPM:', err);
    }
  }
  
  // Dispatch event to insert block into editor
  const event = new CustomEvent('blocks:insert', {
    detail: { 
      pattern: block.pattern,
      name: block.name,
      preserveBlockBpm,
      blockBpm,
      blockSteps
    },
  });
  document.dispatchEvent(event);
  
  closeBlocksModal('blocks');
}

/**
 * Delete the selected block
 */
async function deleteSelectedBlock() {
  const block = getSelectedBlock();
  showDeleteBlockConfirmation(block);
}

async function deleteBlockByIndex(index) {
  const block = blocksCache[index];
  showDeleteBlockConfirmation(block);
}

function showDeleteBlockConfirmation(block) {
  if (!block) return;
  if (normalizeScope(block.scope) === 'system' && !isDeveloperModeEnabled()) {
    void alertDialog({
      title: 'Cannot Delete System Resource',
      message: 'System blocks cannot be deleted. Enable developer mode to delete them.',
    });
    return;
  }
  blockToDelete = block;
  if (elements.deleteBlockText) {
    elements.deleteBlockText.innerHTML = `Delete block: <strong>${escapeHtml(block.name)}</strong>?<br>This cannot be undone.`;
  }
  elements.deleteBlockModal?.classList.add('open');
}

function closeDeleteBlockModal() {
  elements.deleteBlockModal?.classList.remove('open');
  blockToDelete = null;
}

async function confirmDeleteBlock() {
  if (!blockToDelete) return;
  const block = blockToDelete;
  if (normalizeScope(block.scope) === 'system' && !isDeveloperModeEnabled()) {
    closeDeleteBlockModal();
    await alertDialog({
      title: 'Cannot Delete System Resource',
      message: 'System blocks cannot be deleted. Enable developer mode to delete them.',
    });
    return;
  }
  try {
    const response = await fetch(`/api/blocks/${block.filename}`, {
      method: 'DELETE',
      headers: getDeveloperModeHeaders(),
    });

    if (!response.ok) {
      if (response.status === 409) {
        let usedBy = [];
        try {
          const payload = await response.json();
          usedBy = Array.isArray(payload?.usedBy) ? payload.usedBy : [];
        } catch (_e) {
          usedBy = [];
        }
        const list = usedBy.length
          ? usedBy.map((entry) => `${entry.name || entry.filename} (${entry.filename})`).join(', ')
          : 'one or more arrangements';
        await alertDialog({
          title: 'Cannot Delete Block',
          message: `This block is used in arrangements:\n${list}`,
        });
        return;
      }
      throw new Error('Delete failed');
    }
    
    // Reload the list
    await loadBlocksList();
    
    // Reset selection
    clearBlockSelection();
  } catch (err) {
    console.error('[Blocks] Failed to delete block:', err);
    await alertDialog({
      title: 'Block Delete Failed',
      message: 'Could not delete the block. See console for details.',
    });
  } finally {
    closeDeleteBlockModal();
  }
}

function clearBlockSelection() {
  selectedBlockIndex = null;
  updateInsertButtonsDisabledState();
  if (elements.deleteBlockBtn) {
    elements.deleteBlockBtn.disabled = true;
  }
}

/**
 * Save a new block from tracker data
 */
export async function saveBlock(name, description, pattern, trackerState, scope = 'user', options = {}) {
  try {
    const { allowAutoSuffix = true } = options;
    const sanitizeBase = (raw) => (raw || 'block')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'block';

    const existing = await fetch('/api/blocks').then(r => r.ok ? r.json() : []).catch(() => []);
    const existingNames = new Set(existing.map(b => String(b?.name || '').toLowerCase()));
    const existingFilenames = new Set(existing.map(b => String(b?.filename || '').toLowerCase()));

    const baseName = String(name || '').trim() || 'block';
    let uniqueName = baseName;
    let suffix = 1;
    if (!allowAutoSuffix && existingNames.has(baseName.toLowerCase())) {
      await alertDialog({
        title: 'Duplicate Block Name',
        message: `A block named "${baseName}" already exists.`,
      });
      return false;
    }
    while (existingNames.has(uniqueName.toLowerCase())) {
      suffix++;
      uniqueName = `${baseName}_${suffix}`;
    }

    const baseSlug = sanitizeBase(baseName);
    let uniqueSlug = baseSlug;
    suffix = 1;
    if (!allowAutoSuffix && existingFilenames.has(`${baseSlug}.js`)) {
      await alertDialog({
        title: 'Duplicate Block Name',
        message: `A block named "${baseName}" already exists.`,
      });
      return false;
    }
    while (existingFilenames.has(`${uniqueSlug}.js`)) {
      suffix++;
      uniqueSlug = `${baseSlug}-${suffix}`;
    }
    const filename = `${uniqueSlug}.js`;
    
    const blockData = {
      filename,
      name: uniqueName,
      description: description || '',
      pattern,
      trackerState,
      scope: normalizeScope(scope),
    };
    const response = await fetch('/api/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(blockData),
    });
    
    if (!response.ok) throw new Error('Save failed');
    
    // Reload the list
    await loadBlocksList();
    
    return { ok: true, block: blockData };
  } catch (err) {
    console.error('[Blocks] Failed to save block:', err);
    return false;
  }
}

/**
 * Update an existing block with new data
 */
export async function updateBlock(filename, name, description, pattern, trackerState, scope = 'user', options = {}) {
  try {
    const sanitizeBase = (raw) => (raw || 'block')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'block';

    const baseName = String(name || '').trim() || 'block';
    const uniqueName = baseName;
    const baseSlug = sanitizeBase(baseName);
    const preserveFilename = Boolean(options?.preserveFilename);
    const nextFilename = preserveFilename
      ? filename
      : `${baseSlug}.js`;

    const blockData = {
      filename,
      newFilename: nextFilename,
      name: uniqueName,
      description: description || '',
      pattern,
      trackerState,
      scope: normalizeScope(scope),
    };
    
    const response = await fetch(`/api/blocks/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
      body: JSON.stringify(blockData),
    });
    
    if (!response.ok) {
      const msg = await response.text().catch(() => 'Update failed');
      throw new Error(msg || 'Update failed');
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch (_e) {
      payload = null;
    }
    const updatedFilename = payload?.filename || nextFilename;
    const previousFilename = payload?.previousFilename || filename;

    if (updatedFilename !== previousFilename && arrangementDraft?.rows?.length) {
      arrangementDraft.rows = arrangementDraft.rows.map((row) => ({
        ...row,
        blocks: Array.isArray(row?.blocks)
          ? row.blocks.map((b) => (b === previousFilename ? updatedFilename : b))
          : [],
      }));
      if (playingBlockFilename === previousFilename) playingBlockFilename = updatedFilename;
      if (Array.isArray(playingArrangementRowBlocks) && playingArrangementRowBlocks.length) {
        playingArrangementRowBlocks = playingArrangementRowBlocks.map((b) => (b === previousFilename ? updatedFilename : b));
      }
      emitArrangementStateChanged();
    }
    
    // Reload lists (blocks + arrangements because arrangement rows reference block filenames)
    await loadBlocksList();
    await loadArrangementsList();
    // If arrangement editor is currently open, re-render chips/labels immediately so renamed block names are visible.
    if (elements.arrangementModal?.classList.contains('open')) {
      renderArrangementRows();
    }
    
    return { ok: true, filename: updatedFilename, previousFilename };
  } catch (err) {
    console.error('[Blocks] Failed to update block:', err);
    return { ok: false, error: err?.message || 'Failed to update block' };
  }
}

/**
 * Open the blocks modal
 */
export function openBlocksModal(initialTab = 'arranger') {
  elements.modal?.classList.add('open');
  elements.modal?.classList.remove('is-suspended');
  setActiveTab(initialTab === 'blocks' ? 'blocks' : 'arranger');
  loadBlocksList(); // Refresh list when opening
  document.dispatchEvent(new CustomEvent('blocks:modalOpen'));
}

/**
 * Close the blocks modal
 */
export function closeBlocksModal(reason = null) {
  // Always stop any Blocks/Arrangement preview audio when modal closes.
  stopTrackerPreviewPlayback();
  stopArrangementPreview();

  elements.modal?.classList.remove('open');
  elements.modal?.classList.remove('is-suspended');
  playingArrangementFilename = null;
  playingArrangementRowBlocks = [];
  playingBlockFilename = null;
  if (playingBlockClearTimeout) {
    clearTimeout(playingBlockClearTimeout);
    playingBlockClearTimeout = null;
  }
  clearBlocksModalScopeVisualizer();
  document.dispatchEvent(new CustomEvent('blocks:modalClose', { detail: { reason } }));
}

/**
 * Check if blocks modal is open
 */
export function isBlocksModalOpen() {
  return elements.modal?.classList.contains('open') || false;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
