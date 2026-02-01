/**
 * Blocks Module
 * 
 * Manages reusable musical patterns (blocks) that can be created,
 * saved, and inserted into songs. Blocks are stored as separate files
 * in the /blocks/ folder.
 */

// Block storage - in-memory cache
let blocksCache = [];

// DOM Elements
let elements = {};

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
    selectedBlockName: document.getElementById('selectedBlockName'),
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
    blockEl.className = 'block-item p-3 rounded-md border border-border hover:border-primary/50 cursor-pointer transition-colors';
    blockEl.dataset.index = index;
    blockEl.dataset.filename = block.filename;
    
    blockEl.innerHTML = `
      <div class="block-name font-bold text-sm text-foreground">${escapeHtml(block.name)}</div>
      <div class="block-description text-xs text-muted-foreground mt-1">${escapeHtml(block.description || 'No description')}</div>
    `;
    
    blockEl.addEventListener('click', () => selectBlock(index));
    
    elements.blocksList.appendChild(blockEl);
  });
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
  
  // Update selected block display
  const block = blocksCache[index];
  if (elements.selectedBlockName) {
    elements.selectedBlockName.textContent = block?.name || 'No block selected';
  }
  
  // Enable insert/delete buttons
  if (elements.insertBlockBtn) {
    elements.insertBlockBtn.disabled = !block;
  }
  if (elements.deleteBlockBtn) {
    elements.deleteBlockBtn.disabled = !block;
  }
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
 * Insert the selected block into the current song
 */
async function insertSelectedBlock() {
  const block = getSelectedBlock();
  if (!block || !block.pattern) {
    console.warn('[Blocks] No block selected or block has no pattern');
    return;
  }
  
  // Dispatch event to insert block into editor
  const event = new CustomEvent('blocks:insert', {
    detail: { 
      pattern: block.pattern,
      name: block.name 
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
  if (!block) return;
  
  if (!confirm(`Delete block "${block.name}"? This cannot be undone.`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/blocks/${block.filename}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) throw new Error('Delete failed');
    
    // Reload the list
    await loadBlocksList();
    
    // Reset selection
    if (elements.selectedBlockName) {
      elements.selectedBlockName.textContent = 'No block selected';
    }
    if (elements.insertBlockBtn) {
      elements.insertBlockBtn.disabled = true;
    }
    if (elements.deleteBlockBtn) {
      elements.deleteBlockBtn.disabled = true;
    }
  } catch (err) {
    console.error('[Blocks] Failed to delete block:', err);
    alert('Failed to delete block. See console for details.');
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
