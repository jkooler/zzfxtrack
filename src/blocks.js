import { createIcons, icons } from 'lucide';

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
    closeBtn: document.getElementById('closeBlocksBtn'),
    createBlockBtn: document.getElementById('createBlockBtn'),
    insertBlockBtn: document.getElementById('insertBlockBtn'),
    deleteBlockBtn: document.getElementById('deleteBlockBtn'),
    preserveBlockBpm: document.getElementById('preserveBlockBpm'),
    deleteBlockModal: document.getElementById('deleteBlockModal'),
    deleteBlockText: document.getElementById('deleteBlockText'),
    cancelDeleteBlock: document.getElementById('cancelDeleteBlock'),
    confirmDeleteBlock: document.getElementById('confirmDeleteBlock'),
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
  
  if (blocksCache.length === 0) {
    elements.blocksList.innerHTML = `
      <div class="blocks-empty text-center py-8 text-muted-foreground">
        <p class="mb-2">No blocks yet.</p>
        <p class="text-sm">Click "Create Block" to make your first pattern!</p>
      </div>
    `;
    return;
  }
  
  blocksCache.forEach((block, index) => {
    const blockEl = document.createElement('div');
    blockEl.className = 'block-item';
    blockEl.dataset.index = index;
    blockEl.dataset.filename = block.filename;
    blockEl.tabIndex = 0;
    
    blockEl.innerHTML = `
      <div class="min-w-0">
        <div class="block-name font-bold text-sm text-foreground">${escapeHtml(block.name)}</div>
        <div class="block-description text-xs text-muted-foreground mt-1">${escapeHtml(block.description || 'No description')}</div>
      </div>
      <div class="song-item-actions">
        <button class="sidebar-edit-btn" title="Edit ${escapeHtml(block.name)}"><i data-lucide="pencil" class="w-4 h-4"></i> Edit</button>
        <button class="sidebar-del-btn" title="Delete ${escapeHtml(block.name)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
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
    
    elements.blocksList.appendChild(blockEl);
  });

  createIcons({ icons });
}

/**
 * Select a block from the list
 */
function selectBlock(index) {
  // Remove previous selection
  document.querySelectorAll('.block-item').forEach(el => {
    el.classList.remove('selected', 'bg-accent', 'border-primary');
  });
  
  // Add selection to clicked item
  const selectedEl = document.querySelector(`.block-item[data-index="${index}"]`);
  if (selectedEl) {
    selectedEl.classList.add('selected', 'bg-accent', 'border-primary');
  }
  
  // Store selected index
  selectedBlockIndex = index;
  
  const block = blocksCache[index];
  
    // Enable insert/delete/edit buttons
  if (elements.insertBlockBtn) {
    elements.insertBlockBtn.disabled = false;
  }
  if (elements.deleteBlockBtn) {
    elements.deleteBlockBtn.disabled = false;
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
  const selectedEl = document.querySelector('.block-item.selected');
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
  const block = Number.isInteger(index) ? blocksCache[index] : getSelectedBlock();
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
  if (preserveBlockBpm && !blockBpm && block.filename) {
    try {
      const response = await fetch(`/api/blocks/${block.filename}`);
      if (response.ok) {
        const fullBlock = await response.json();
        blockBpm = fullBlock?.trackerState?.bpm;
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
      blockBpm
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
  try {
    const response = await fetch(`/api/blocks/${block.filename}`, {
      method: 'DELETE',
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
export async function saveBlock(name, description, pattern, trackerState) {
  try {
    // Generate filename from name (sanitize)
    const filename = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '.js';
    
    const blockData = {
      filename,
      name,
      description: description || '',
      pattern,
      trackerState,
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
export async function updateBlock(filename, name, description, pattern, trackerState) {
  try {
    const blockData = {
      filename,
      name,
      description: description || '',
      pattern,
      trackerState,
    };
    
    const response = await fetch(`/api/blocks/${filename}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
  loadBlocksList(); // Refresh list when opening
}

/**
 * Close the blocks modal
 */
export function closeBlocksModal() {
  elements.modal?.classList.remove('open');
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
