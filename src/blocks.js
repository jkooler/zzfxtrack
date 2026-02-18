import { createIcons, icons } from 'lucide';
import { setupScrubInteraction } from './instrument-ui.js';
import { primePreviewAudioContext } from './tracker.js';

/**
 * Blocks Module
 * 
 * Manages reusable musical patterns (blocks) that can be created,
 * saved, and inserted into songs. Blocks are stored as separate files
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
let arrangementEditMode = {
	  isEditing: false,
	  filename: null,
    scope: 'user',
	};
let arrangementToDelete = null;
const BLOCKS_FOLDER_STATE_KEY = 'zzfxm-folder-state-blocks-v1';
const ARRANGEMENTS_FOLDER_STATE_KEY = 'zzfxm-folder-state-arrangements-v1';
let blockFolderState = loadFolderState(BLOCKS_FOLDER_STATE_KEY, { user: true, example: true });
let arrangementFolderState = loadFolderState(ARRANGEMENTS_FOLDER_STATE_KEY, { user: true, example: true });
const DEVELOPER_MODE_KEY = 'zzfxm-developer-mode';
const DEMO_MODE = import.meta.env.MODE === 'demo';

function normalizeScope(value) {
  return value === 'example' ? 'example' : 'user';
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
  const shouldShow = !DEMO_MODE && isDeveloperModeEnabled() && elements.arrangementModal?.classList.contains('open');
  elements.arrangementAdvancedSettingsBtn.classList.toggle('dev-only-hidden', !shouldShow);
}

function loadFolderState(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw);
    return {
      user: typeof parsed?.user === 'boolean' ? parsed.user : fallback.user,
      example: typeof parsed?.example === 'boolean' ? parsed.example : fallback.example,
    };
  } catch (_e) {
    return { ...fallback };
  }
}

function saveFolderState(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_e) {
    // Ignore storage errors.
  }
}

function emitStatus(message, type = 'normal') {
  document.dispatchEvent(new CustomEvent('app:status', { detail: { message, type } }));
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

  elements.blocksTabBtn?.addEventListener('click', () => setActiveTab('blocks'));
  elements.arrangerTabBtn?.addEventListener('click', () => setActiveTab('arranger'));

  elements.createArrangementBtn?.addEventListener('click', () => { void openArrangementEditor(); });
  elements.insertArrangementBtn?.addEventListener('click', insertSelectedArrangement);
  elements.closeArrangementBtn?.addEventListener('click', closeArrangementEditor);
  elements.cancelArrangementBtn?.addEventListener('click', closeArrangementEditor);
  elements.previewArrangementBtn?.addEventListener('click', previewArrangementDraft);
  elements.addArrangementRowBtn?.addEventListener('click', () => {
    arrangementDraft.rows.push({ repeats: 1, blocks: [] });
    renderArrangementRows();
  });
  elements.saveArrangementBtn?.addEventListener('click', saveArrangementFromEditor);
  elements.arrangementAdvancedSettingsBtn?.addEventListener('click', () => {
    if (!isDeveloperModeEnabled() || DEMO_MODE) return;
    const name = (elements.arrangementName?.value || arrangementDraft.name || '').trim();
    document.dispatchEvent(new CustomEvent('resource-scope:open', {
      detail: {
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

	  document.addEventListener('resource-scope:changed', async (e) => {
	    const detail = e?.detail || {};
	    if (detail.type === 'block') {
	      await loadBlocksList();
	      return;
	    }
	    if (detail.type === 'arrangement') {
	      if (
	        (arrangementEditMode.filename && detail.filename === arrangementEditMode.filename) ||
	        (!arrangementEditMode.filename && !detail.filename)
	      ) {
	        arrangementEditMode.scope = normalizeScope(detail.scope);
	      }
	      await loadArrangementsList();
	    }
	  });

	  document.addEventListener('developer-mode:changed', () => {
	    // Re-render to show/hide immutable actions without forcing a reload.
	    renderBlocksList();
	    renderArrangementsList();
	    updateArrangementAdvancedSettingsVisibility();
	  });
	}

function previewArrangementDraft() {
  const name = (elements.arrangementName?.value || arrangementDraft.name || 'Arrangement').trim() || 'Arrangement';
  const bpmVal = parseInt(elements.arrangementBpm?.value || String(arrangementDraft.bpm || 120), 10);
  const bpm = Number.isFinite(bpmVal) ? Math.min(Math.max(bpmVal, 20), 300) : 120;

  const arrangementState = {
    version: 1,
    name,
    bpm,
    rows: arrangementDraft.rows.map(r => ({
      repeats: Number.isInteger(r.repeats) ? r.repeats : 1,
      blocks: Array.isArray(r.blocks) ? r.blocks.slice() : [],
    })),
  };

  primePreviewAudioContext();
  emitStatus(`Previewing arrangement "${name}"...`, 'normal');
  console.log('[Arranger] Previewing draft:', arrangementState);
  const event = new CustomEvent('arrangements:preview', { detail: { arrangement: { name, arrangementState } } });
  document.dispatchEvent(event);
}

function setActiveTab(tab) {
  const blocksActive = tab !== 'arranger';
  elements.blocksTabPanel?.classList.toggle('hidden', !blocksActive);
  elements.arrangerTabPanel?.classList.toggle('hidden', blocksActive);
  elements.blocksTabBtn?.classList.toggle('active', blocksActive);
  elements.arrangerTabBtn?.classList.toggle('active', !blocksActive);
  // Keep insert buttons consistent: only enabled when an item is selected.
  if (elements.insertBlockBtn) elements.insertBlockBtn.disabled = selectedBlockIndex == null;
  if (elements.insertArrangementBtn) elements.insertArrangementBtn.disabled = selectedArrangementIndex == null;
  if (elements.description) {
    elements.description.textContent = blocksActive
      ? 'Blocks are reusable musical patterns. Create a block and insert it into a song or create arrangements from multiple blocks.'
      : 'Create arrangements with Blocks to quickly test out your song ideas.';
  }
  if (!blocksActive) {
    loadArrangementsList();
  }
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
  if (elements.insertArrangementBtn) elements.insertArrangementBtn.disabled = true;

  if (!arrangementsCache.length) {
    elements.arrangementsList.innerHTML = `
      <div class="blocks-empty text-center py-8 text-muted-foreground">
        <p class="mb-2">No arrangements yet.</p>
        <p class="text-sm">Create one to start arranging your blocks.</p>
      </div>
    `;
    if (elements.insertArrangementBtn) elements.insertArrangementBtn.disabled = true;
    return;
  }

  const appendFolder = (scope, label, entries) => {
    const devMode = isDeveloperModeEnabled();
    const expanded = scope === 'example'
      ? arrangementFolderState.example
      : arrangementFolderState.user;
    const icon = expanded ? 'folder-open' : 'folder';

    const folder = document.createElement('div');
    folder.className = 'mb-0 py-px';
    folder.innerHTML = `
      <button type="button" class="w-full flex items-center justify-between px-0 py-2 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40 ${expanded ? '' : 'border-b border-border'}" data-arr-folder="${scope}">
        <span class="inline-flex items-center gap-1.5">
          <i data-lucide="${icon}" class="w-4 h-4 ${expanded ? 'text-primary' : ''}"></i>
          ${label}
        </span>
        <span class="opacity-70">${entries.length}</span>
      </button>
      <div class="space-y-2 mt-1 ${expanded ? '' : 'hidden'}" data-arr-folder-items="${scope}"></div>
    `;
    const list = folder.querySelector(`[data-arr-folder-items="${scope}"]`);
    folder.querySelector(`[data-arr-folder="${scope}"]`)?.addEventListener('click', () => {
      if (scope === 'example') {
        arrangementFolderState.example = !arrangementFolderState.example;
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
        : 'No example arrangements available.';
      list?.appendChild(empty);
    }

    entries.forEach(({ arr, index }) => {
      const isExample = normalizeScope(arr.scope) === 'example';
      const isImmutable = isExample && !devMode;
      const el = document.createElement('div');
      el.className = 'block-item';
      el.dataset.index = index;
      el.tabIndex = 0;
      el.innerHTML = `
        <div class="min-w-0">
          <div class="block-name font-bold text-sm text-foreground">${escapeHtml(arr.name)}</div>
          <div class="block-description text-xs text-muted-foreground mt-1">${escapeHtml(`BPM ${arr.bpm ?? 120}${isExample ? ' • Example' : ''}`)}</div>
        </div>
        <div class="song-item-actions">
          <button class="sidebar-edit-btn" title="Edit ${escapeHtml(arr.name)}"><i data-lucide="pencil" class="w-4 h-4"></i> Edit</button>
          ${isImmutable ? '' : `<button class="sidebar-del-btn" title="Delete ${escapeHtml(arr.name)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`}
        </div>
      `;

      el.addEventListener('click', () => selectArrangement(index));
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        selectArrangement(index);
      });

      el.querySelector('.sidebar-edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        selectArrangement(index);
        void openArrangementEditor(arrangementsCache[index]);
      });

      el.querySelector('.sidebar-del-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteArrangementModal(index);
      });

      list?.appendChild(el);
    });

    elements.arrangementsList.appendChild(folder);
  };

  const userEntries = [];
  const exampleEntries = [];
  arrangementsCache.forEach((arr, index) => {
    if (normalizeScope(arr.scope) === 'example') {
      exampleEntries.push({ arr, index });
    } else {
      userEntries.push({ arr, index });
    }
  });
  appendFolder('user', 'User', userEntries);
  appendFolder('example', 'Examples', exampleEntries);

  createIcons({ icons });
}

function selectArrangement(index) {
  document.querySelectorAll('#arrangementsList .block-item').forEach(el => {
    el.classList.remove('selected', 'bg-accent', 'border-primary');
  });
  const selectedEl = document.querySelector(`#arrangementsList .block-item[data-index="${index}"]`);
  if (selectedEl) {
    selectedEl.classList.add('selected', 'bg-accent', 'border-primary');
  }
  selectedArrangementIndex = index;
  if (elements.insertArrangementBtn) elements.insertArrangementBtn.disabled = selectedArrangementIndex == null;

  const arrangement = arrangementsCache[index];
  if (arrangement?.arrangementState) {
    primePreviewAudioContext();
    emitStatus(`Previewing arrangement "${arrangement.name}"...`, 'normal');
    console.log('[Arranger] Preview request:', arrangement);
    const event = new CustomEvent('arrangements:preview', { detail: { arrangement } });
    document.dispatchEvent(event);
  }
}

		async function deleteArrangementByIndex(index) {
		  const arr = arrangementsCache[index];
		  if (!arr?.filename) return;
	    if (normalizeScope(arr.scope) === 'example' && !isDeveloperModeEnabled()) {
	      alert('Example arrangements cannot be deleted.');
	      return;
	    }
		  try {
	    const res = await fetch(`/api/arrangements/${arr.filename}`, { method: 'DELETE', headers: getDeveloperModeHeaders() });
	    if (!res.ok) throw new Error('Delete failed');
	    await loadArrangementsList();
	  } catch (err) {
	    console.error('[Arranger] Delete failed:', err);
	    alert('Failed to delete arrangement. See console for details.');
		  }
		}

	function openDeleteArrangementModal(index) {
	  const arr = arrangementsCache[index];
	  if (!arr) return;
	  arrangementToDelete = arr;
	  if (elements.deleteArrangementText) {
	    elements.deleteArrangementText.textContent = `This will permanently delete "${arr.name}". This action cannot be undone.`;
	  }
	  elements.deleteArrangementModal?.classList.add('open');
	  elements.confirmDeleteArrangement?.focus();
	}

	function closeDeleteArrangementModal() {
	  arrangementToDelete = null;
	  elements.deleteArrangementModal?.classList.remove('open');
	}

async function confirmDeleteArrangement() {
  if (!arrangementToDelete?.filename) {
		    closeDeleteArrangementModal();
		    return;
		  }
  const filename = arrangementToDelete.filename;
  if (normalizeScope(arrangementToDelete.scope) === 'example' && !isDeveloperModeEnabled()) {
    closeDeleteArrangementModal();
    alert('Example arrangements cannot be deleted.');
    return;
  }
  closeDeleteArrangementModal();
		  try {
		    const res = await fetch(`/api/arrangements/${filename}`, { method: 'DELETE', headers: getDeveloperModeHeaders() });
		    if (!res.ok) throw new Error('Delete failed');
		    await loadArrangementsList();
		  } catch (err) {
		    console.error('[Arranger] Delete failed:', err);
		    alert('Failed to delete arrangement. See console for details.');
		  }
		}

function getSelectedArrangement() {
  const selectedEl = document.querySelector('#arrangementsList .block-item.selected');
  if (!selectedEl) return null;
  const index = parseInt(selectedEl.dataset.index, 10);
  return arrangementsCache[index];
}

function insertSelectedArrangement() {
  const arr = getSelectedArrangement();
  if (!arr?.arrangementState) return;
  const event = new CustomEvent('arrangements:insert', { detail: { arrangement: arr } });
  document.dispatchEvent(event);
  closeBlocksModal();
}

let arrangementDraft = {
  version: 1,
  name: '',
  bpm: 120,
  rows: [{ repeats: 1, blocks: [] }],
};

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
  arrangementDraft = {
    version: 1,
    name: arrangement?.name || state?.name || '',
    bpm: state?.bpm ?? arrangement?.bpm ?? 120,
    rows: Array.isArray(state?.rows) && state.rows.length
      ? state.rows.map(r => ({
          repeats: Number.isInteger(r.repeats) ? r.repeats : 1,
          blocks: Array.isArray(r.blocks) ? r.blocks.slice() : [],
        }))
      : [{ repeats: 1, blocks: [] }],
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
  updateArrangementAdvancedSettingsVisibility();
  elements.arrangementName?.focus();
  createIcons({ icons });
}

function closeArrangementEditor() {
  elements.arrangementModal?.classList.remove('open');
  arrangementEditMode.scope = 'user';
  updateArrangementAdvancedSettingsVisibility();
}

function renderArrangementRows() {
  if (!elements.arrangementRows) return;
  elements.arrangementRows.innerHTML = '';

  arrangementDraft.rows.forEach((row, rowIndex) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'arr-row';
    rowEl.dataset.row = rowIndex;

    const repeatsEl = document.createElement('input');
    repeatsEl.type = 'number';
    repeatsEl.min = '1';
    repeatsEl.max = '99';
    repeatsEl.step = '1';
    repeatsEl.value = String(row.repeats || 1);
    repeatsEl.className = 'arr-repeats';
    repeatsEl.addEventListener('input', () => {
      const val = parseInt(repeatsEl.value, 10);
      row.repeats = Number.isFinite(val) ? Math.min(Math.max(val, 1), 99) : 1;
    });
    setupScrubInteraction(repeatsEl);

	    const chipsEl = document.createElement('div');
	    chipsEl.className = 'arr-chips';

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
	      row.blocks.forEach((filename, i) => {
	        const block = blocksCache.find(b => b.filename === filename);
	        const chip = document.createElement('div');
        chip.className = 'arr-chip';
        chip.innerHTML = `
          <span class="arr-chip-label">${escapeHtml(block?.name || filename)}</span>
          <button type="button" class="arr-chip-del" title="Remove"><i data-lucide="x" class="w-3 h-3"></i></button>
        `;
	        chip.querySelector('.arr-chip-del')?.addEventListener('click', () => {
	          row.blocks.splice(i, 1);
	          renderChips();
	          updateSelectDisabled(selectEl);
	          createIcons({ icons });
	        });
	        chipsEl.appendChild(chip);
	      });
	    };

	    const selectEl = document.createElement('select');
	    selectEl.className = 'arr-block-select';
	    selectEl.innerHTML = `<option value="">Add block…</option>` + blocksCache
	      .map(b => {
	        const disabled = row.blocks.includes(b.filename) ? ' disabled' : '';
	        return `<option value="${escapeHtml(b.filename)}"${disabled}>${escapeHtml(b.name)}</option>`;
	      })
	      .join('');
    selectEl.addEventListener('change', () => {
      const val = selectEl.value;
      if (!val) return;
      if (!row.blocks.includes(val)) {
        row.blocks.push(val);
      }
      selectEl.value = '';
      console.log('[Arranger] Added block to row', rowIndex, val, '=>', row.blocks);
      renderChips();
      updateSelectDisabled(selectEl);
      createIcons({ icons });
    });

    const removeRowBtn = document.createElement('button');
    removeRowBtn.type = 'button';
    removeRowBtn.className = 'arr-row-del';
    removeRowBtn.title = 'Remove row';
    removeRowBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
    removeRowBtn.addEventListener('click', () => {
      if (arrangementDraft.rows.length === 1) {
        arrangementDraft.rows[0] = { repeats: 1, blocks: [] };
      } else {
        arrangementDraft.rows.splice(rowIndex, 1);
      }
      renderArrangementRows();
      createIcons({ icons });
    });

	    rowEl.appendChild(repeatsEl);
	    rowEl.appendChild(chipsEl);
	    rowEl.appendChild(selectEl);
	    rowEl.appendChild(removeRowBtn);

	    elements.arrangementRows.appendChild(rowEl);
	    renderChips();
	    updateSelectDisabled(selectEl);
	  });

	  createIcons({ icons });
	}

async function saveArrangementFromEditor() {
  const rawName = elements.arrangementName?.value?.trim() || '';
  if (!rawName) {
    alert('Please enter an arrangement name.');
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

  const sanitizeBase = (str) => (str || 'arrangement')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'arrangement';

  const arrangementState = {
    version: 1,
    name: arrangementDraft.name,
    bpm: arrangementDraft.bpm,
    rows: arrangementDraft.rows.map(r => ({
      repeats: Number.isInteger(r.repeats) ? r.repeats : 1,
      blocks: Array.isArray(r.blocks) ? r.blocks.slice() : [],
    })),
  };
  console.log('[Arranger] arrangementState payload:', arrangementState);

  try {
	    if (arrangementEditMode.isEditing && arrangementEditMode.filename) {
	      const res = await fetch(`/api/arrangements/${arrangementEditMode.filename}`, {
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
      while (existingFilenames.has(`${uniqueSlug}.js`)) {
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
    closeArrangementEditor();
    emitStatus('Arrangement saved.', 'success');
  } catch (err) {
    console.error('[Arranger] Save failed:', err);
    alert('Failed to save arrangement. See console for details.');
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
  
  elements.blocksList.innerHTML = '';
  selectedBlockIndex = null;
  if (elements.insertBlockBtn) elements.insertBlockBtn.disabled = true;
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
    const expanded = scope === 'example'
      ? blockFolderState.example
      : blockFolderState.user;
    const icon = expanded ? 'folder-open' : 'folder';
    const folder = document.createElement('div');
    folder.className = 'mb-0 py-px';
    folder.innerHTML = `
      <button type="button" class="w-full flex items-center justify-between px-0 py-2 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40 ${expanded ? '' : 'border-b border-border'}" data-block-folder="${scope}">
        <span class="inline-flex items-center gap-1.5">
          <i data-lucide="${icon}" class="w-4 h-4 ${expanded ? 'text-primary' : ''}"></i>
          ${label}
        </span>
        <span class="opacity-70">${entries.length}</span>
      </button>
      <div class="space-y-2 mt-1 ${expanded ? '' : 'hidden'}" data-block-folder-items="${scope}"></div>
    `;
    const list = folder.querySelector(`[data-block-folder-items="${scope}"]`);
    folder.querySelector(`[data-block-folder="${scope}"]`)?.addEventListener('click', () => {
      if (scope === 'example') {
        blockFolderState.example = !blockFolderState.example;
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
        ? 'No user blocks yet. Click \"Create Block\" to make your first pattern.'
        : 'No example blocks available.';
      list?.appendChild(empty);
    }

    entries.forEach(({ block, index }) => {
      const isExample = normalizeScope(block.scope) === 'example';
      const isImmutable = isExample && !devMode;
      const bpm = Number.isFinite(block?.trackerState?.bpm) ? block.trackerState.bpm : null;
      const steps = Number.isFinite(block?.trackerState?.steps)
        ? block.trackerState.steps
        : (Array.isArray(block?.trackerState?.grid?.[0]) ? block.trackerState.grid[0].length : null);
      const blockMeta = (bpm != null && steps != null)
        ? `BPM ${bpm} • ${steps} row${steps === 1 ? '' : 's'}${isExample ? ' • Example' : ''}`
        : `${block.description || 'No block metadata'}${isExample ? ' • Example' : ''}`;

      const blockEl = document.createElement('div');
      blockEl.className = 'block-item';
      blockEl.dataset.index = index;
      blockEl.dataset.filename = block.filename;
      blockEl.tabIndex = 0;

      blockEl.innerHTML = `
        <div class="min-w-0">
          <div class="block-name font-bold text-sm text-foreground">${escapeHtml(block.name)}</div>
          <div class="block-description text-xs text-muted-foreground mt-1">${escapeHtml(blockMeta)}</div>
        </div>
        <div class="song-item-actions">
          <button class="sidebar-edit-btn" title="Edit ${escapeHtml(block.name)}"><i data-lucide="pencil" class="w-4 h-4"></i> Edit</button>
          ${isImmutable ? '' : `<button class="sidebar-del-btn" title="Delete ${escapeHtml(block.name)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`}
        </div>
      `;

      blockEl.addEventListener('click', () => selectBlock(index));
      blockEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        selectBlock(index);
      });

      const editBtn = blockEl.querySelector('.sidebar-edit-btn');
      editBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        selectBlock(index);
        openTrackerForEdit(index);
      });

      const deleteBtn = blockEl.querySelector('.sidebar-del-btn');
      deleteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteBlockByIndex(index);
      });

      list?.appendChild(blockEl);
    });

    elements.blocksList.appendChild(folder);
  };

  const userEntries = [];
  const exampleEntries = [];
  blocksCache.forEach((block, index) => {
    if (normalizeScope(block.scope) === 'example') {
      exampleEntries.push({ block, index });
    } else {
      userEntries.push({ block, index });
    }
  });
  appendFolder('user', 'User', userEntries);
  appendFolder('example', 'Examples', exampleEntries);

  createIcons({ icons });
}

/**
 * Select a block from the list
 */
function selectBlock(index) {
  // Remove previous selection
  document.querySelectorAll('#blocksList .block-item').forEach(el => {
    el.classList.remove('selected', 'bg-accent', 'border-primary');
  });
  
  // Add selection to clicked item
  const selectedEl = document.querySelector(`#blocksList .block-item[data-index="${index}"]`);
  if (selectedEl) {
    selectedEl.classList.add('selected', 'bg-accent', 'border-primary');
  }
  
  // Store selected index
  selectedBlockIndex = index;
  
  const block = blocksCache[index];
  
    // Enable insert/delete/edit buttons
  if (elements.insertBlockBtn) {
    elements.insertBlockBtn.disabled = selectedBlockIndex == null;
  }
  if (elements.deleteBlockBtn) {
    elements.deleteBlockBtn.disabled = selectedBlockIndex == null || (normalizeScope(block?.scope) === 'example' && !isDeveloperModeEnabled());
  }
  // Trigger preview on selection
  if (block) {
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

/**
 * Open tracker to create a new block
 */
function openTrackerForNewBlock() {
  closeBlocksModal();
  
  // Dispatch event to open tracker in "block creation mode"
  const event = new CustomEvent('blocks:create');
  document.dispatchEvent(event);
}

/**
 * Open tracker to edit the selected block
 */
async function openTrackerForEdit(index = null) {
  let block = Number.isInteger(index) ? blocksCache[index] : getSelectedBlock();
  if (!block) return;
  
  closeBlocksModal();
  
  // Fetch the full block data including trackerState
  let trackerState = block.trackerState;
  
  // If trackerState wasn't in the cached data, fetch it directly from the file
  if (!trackerState && block.filename) {
    try {
      const response = await fetch(`/api/blocks/${block.filename}`);
      if (response.ok) {
        const fullBlock = await response.json();
        trackerState = fullBlock.trackerState;
        if (fullBlock?.scope) {
          block = { ...block, scope: fullBlock.scope };
        }
      }
    } catch (err) {
      console.warn('[Blocks] Could not fetch full block data:', err);
    }
  }
  
  // Dispatch event to open tracker in "block edit mode"
  const event = new CustomEvent('blocks:edit', {
    detail: { 
      block: block,
      trackerState: trackerState
    }
  });
  document.dispatchEvent(event);
}

/**
 * Insert the selected block into the current song
 */
async function insertSelectedBlock() {
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
  
  closeBlocksModal();
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
  if (normalizeScope(block.scope) === 'example' && !isDeveloperModeEnabled()) {
    alert('Example blocks cannot be deleted.');
    return;
  }
  blockToDelete = block;
  if (elements.deleteBlockText) {
    elements.deleteBlockText.innerHTML = `Block: <strong>${escapeHtml(block.name)}</strong><br>This action is irreversible.`;
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
  if (normalizeScope(block.scope) === 'example' && !isDeveloperModeEnabled()) {
    closeDeleteBlockModal();
    alert('Example blocks cannot be deleted.');
    return;
  }
  try {
    const response = await fetch(`/api/blocks/${block.filename}`, {
      method: 'DELETE',
      headers: getDeveloperModeHeaders(),
    });
    
    if (!response.ok) throw new Error('Delete failed');
    
    // Reload the list
    await loadBlocksList();
    
    // Reset selection
    clearBlockSelection();
  } catch (err) {
    console.error('[Blocks] Failed to delete block:', err);
    alert('Failed to delete block. See console for details.');
  } finally {
    closeDeleteBlockModal();
  }
}

function clearBlockSelection() {
  selectedBlockIndex = null;
  if (elements.insertBlockBtn) {
    elements.insertBlockBtn.disabled = true;
  }
  if (elements.deleteBlockBtn) {
    elements.deleteBlockBtn.disabled = true;
  }
}

/**
 * Save a new block from tracker data
 */
export async function saveBlock(name, description, pattern, trackerState, scope = 'user') {
  try {
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
    while (existingNames.has(uniqueName.toLowerCase())) {
      suffix++;
      uniqueName = `${baseName}_${suffix}`;
    }

    const baseSlug = sanitizeBase(baseName);
    let uniqueSlug = baseSlug;
    suffix = 1;
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
    
    return true;
  } catch (err) {
    console.error('[Blocks] Failed to save block:', err);
    return false;
  }
}

/**
 * Update an existing block with new data
 */
export async function updateBlock(filename, name, description, pattern, trackerState, scope = 'user') {
  try {
    const existing = await fetch('/api/blocks').then(r => r.ok ? r.json() : []).catch(() => []);
    const currentFilename = String(filename || '').toLowerCase();
    const existingNames = new Set(
      existing
        .filter(b => String(b?.filename || '').toLowerCase() !== currentFilename)
        .map(b => String(b?.name || '').toLowerCase())
    );

    const baseName = String(name || '').trim() || 'block';
    let uniqueName = baseName;
    let suffix = 1;
    while (existingNames.has(uniqueName.toLowerCase())) {
      suffix++;
      uniqueName = `${baseName}_${suffix}`;
    }

    const blockData = {
      filename,
      name: uniqueName,
      description: description || '',
      pattern,
      trackerState,
      scope: normalizeScope(scope),
    };
    
    const response = await fetch(`/api/blocks/${filename}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getDeveloperModeHeaders() },
      body: JSON.stringify(blockData),
    });
    
    if (!response.ok) throw new Error('Update failed');
    
    // Reload the list
    await loadBlocksList();
    
    return true;
  } catch (err) {
    console.error('[Blocks] Failed to update block:', err);
    return false;
  }
}

/**
 * Open the blocks modal
 */
export function openBlocksModal() {
  elements.modal?.classList.add('open');
  setActiveTab('blocks');
  loadBlocksList(); // Refresh list when opening
  document.dispatchEvent(new CustomEvent('blocks:modalOpen'));
}

/**
 * Close the blocks modal
 */
export function closeBlocksModal() {
  elements.modal?.classList.remove('open');
  document.dispatchEvent(new CustomEvent('blocks:modalClose'));
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
