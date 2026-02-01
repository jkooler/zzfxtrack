/**
 * Tracker Module - Proof of Concept
 * 
 * A simple 4-channel, 16-step tracker that outputs Strudel mini-notation.
 * Uses zxcvb/qwerty keyboard layout for note input (like FastTracker/ProTracker).
 */

// Keyboard to note mapping (zxcvb row = C3-B3, qwerty row = C4-B4)
const KEYBOARD_MAP = {
  // Lower row (C3 - B3)
  'z': 'c3',
  's': 'c#3',
  'x': 'd3',
  'd': 'd#3',
  'c': 'e3',
  'v': 'f3',
  'g': 'f#3',
  'b': 'g3',
  'h': 'g#3',
  'n': 'a3',
  'j': 'a#3',
  'm': 'b3',
  // Upper row (C4 - B4)
  'q': 'c4',
  '2': 'c#4',
  'w': 'd4',
  '3': 'd#4',
  'e': 'e4',
  'r': 'f4',
  '5': 'f#4',
  't': 'g4',
  '6': 'g#4',
  'y': 'a4',
  '7': 'a#4',
  'u': 'b4',
};

// Reverse mapping for display
const NOTE_TO_KEY = Object.fromEntries(
  Object.entries(KEYBOARD_MAP).map(([k, v]) => [v, k])
);

// Tracker state
const state = {
  channels: 4,
  steps: 16,
  grid: [], // Array of channels, each with array of { note: string|null, active: boolean }
  instruments: [], // Available instruments
  channelInstruments: ['', '', '', ''], // Selected instrument for each channel
  focusedChannel: 0,
  focusedStep: 0,
};

// DOM Elements
let elements = {};

/**
 * Initialize the tracker
 */
export function initTracker(instrumentList) {
  state.instruments = instrumentList || [];
  initGrid();
  cacheElements();
  renderGrid();
  setupEventListeners();
  updateOutput();
}

/**
 * Initialize the grid data structure
 */
function initGrid() {
  state.grid = Array(state.channels).fill(null).map(() =>
    Array(state.steps).fill(null).map(() => ({
      note: null,
      active: false,
    }))
  );
}

/**
 * Cache DOM element references
 */
function cacheElements() {
  elements = {
    modal: document.getElementById('trackerModal'),
    grid: document.getElementById('trackerGrid'),
    output: document.getElementById('trackerOutput'),
    closeBtn: document.getElementById('closeTrackerBtn'),
    clearBtn: document.getElementById('clearTrackerBtn'),
    copyBtn: document.getElementById('copyTrackerBtn'),
    applyBtn: document.getElementById('applyTrackerBtn'),
  };
}

/**
 * Render the tracker grid
 */
function renderGrid() {
  if (!elements.grid) return;

  elements.grid.innerHTML = '';

  for (let ch = 0; ch < state.channels; ch++) {
    const channelEl = document.createElement('div');
    channelEl.className = 'tracker-channel';
    channelEl.dataset.channel = ch;

    // Channel header with instrument select
    const headerEl = document.createElement('div');
    headerEl.className = 'tracker-channel-header';

    const labelEl = document.createElement('div');
    labelEl.className = 'tracker-channel-label';
    labelEl.textContent = `CH ${ch + 1}`;

    const selectEl = document.createElement('select');
    selectEl.className = 'tracker-channel-select';
    selectEl.dataset.channel = ch;
    
    // Add default option
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Select instrument...';
    selectEl.appendChild(defaultOpt);

    // Add instrument options
    state.instruments.forEach(inst => {
      const opt = document.createElement('option');
      opt.value = inst.id;
      opt.textContent = inst.name || inst.id;
      selectEl.appendChild(opt);
    });

    selectEl.value = state.channelInstruments[ch] || '';
    selectEl.addEventListener('change', (e) => {
      state.channelInstruments[ch] = e.target.value;
      updateOutput();
    });

    headerEl.appendChild(labelEl);
    headerEl.appendChild(selectEl);
    channelEl.appendChild(headerEl);

    // Step rows
    for (let step = 0; step < state.steps; step++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'tracker-row';

      const stepNumEl = document.createElement('div');
      stepNumEl.className = 'tracker-step-num';
      stepNumEl.textContent = step.toString(16).toUpperCase(); // Hex step numbers

      const cellEl = document.createElement('div');
      cellEl.className = 'tracker-cell';
      cellEl.dataset.channel = ch;
      cellEl.dataset.step = step;

      const cellData = state.grid[ch][step];
      if (cellData.note) {
        cellEl.textContent = cellData.note;
        cellEl.classList.add('has-note');
      } else if (cellData.note === '-') {
        cellEl.textContent = '-';
        cellEl.classList.add('rest');
      } else {
        cellEl.textContent = '·';
      }

      if (ch === state.focusedChannel && step === state.focusedStep) {
        cellEl.classList.add('active');
      }

      cellEl.addEventListener('click', () => {
        setFocus(ch, step);
      });

      rowEl.appendChild(stepNumEl);
      rowEl.appendChild(cellEl);
      channelEl.appendChild(rowEl);
    }

    elements.grid.appendChild(channelEl);
  }
}

/**
 * Set focus to a specific cell
 */
function setFocus(channel, step) {
  // Remove active class from old cell
  const oldCell = document.querySelector(
    `.tracker-cell[data-channel="${state.focusedChannel}"][data-step="${state.focusedStep}"]`
  );
  if (oldCell) {
    oldCell.classList.remove('active');
  }

  state.focusedChannel = channel;
  state.focusedStep = step;

  // Add active class to new cell
  const newCell = document.querySelector(
    `.tracker-cell[data-channel="${state.focusedChannel}"][data-step="${state.focusedStep}"]`
  );
  if (newCell) {
    newCell.classList.add('active');
    newCell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/**
 * Setup keyboard event listeners
 */
function setupEventListeners() {
  // Modal close button
  elements.closeBtn?.addEventListener('click', closeTracker);

  // Clear button
  elements.clearBtn?.addEventListener('click', () => {
    if (confirm('Clear all tracker data?')) {
      clearAll();
    }
  });

  // Copy button
  elements.copyBtn?.addEventListener('click', copyToClipboard);

  // Apply button
  elements.applyBtn?.addEventListener('click', applyToEditor);

  // Keyboard input
  document.addEventListener('keydown', handleKeyDown);
}

/**
 * Handle keyboard input
 */
function handleKeyDown(e) {
  // Only process if tracker is open
  if (!elements.modal?.classList.contains('open')) return;

  // Don't capture if typing in a select/textarea
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

  const key = e.key.toLowerCase();

  // Navigation
  if (key === 'arrowup') {
    e.preventDefault();
    const newStep = (state.focusedStep - 1 + state.steps) % state.steps;
    setFocus(state.focusedChannel, newStep);
    return;
  }

  if (key === 'arrowdown') {
    e.preventDefault();
    const newStep = (state.focusedStep + 1) % state.steps;
    setFocus(state.focusedChannel, newStep);
    return;
  }

  if (key === 'arrowleft') {
    e.preventDefault();
    const newCh = (state.focusedChannel - 1 + state.channels) % state.channels;
    setFocus(newCh, state.focusedStep);
    return;
  }

  if (key === 'arrowright' || key === 'tab') {
    e.preventDefault();
    const newCh = (state.focusedChannel + 1) % state.channels;
    setFocus(newCh, state.focusedStep);
    return;
  }

  // Note input
  if (KEYBOARD_MAP[key]) {
    e.preventDefault();
    setNote(state.focusedChannel, state.focusedStep, KEYBOARD_MAP[key]);
    // Advance to next step
    const newStep = (state.focusedStep + 1) % state.steps;
    setFocus(state.focusedChannel, newStep);
    return;
  }

  // Rest
  if (key === '-') {
    e.preventDefault();
    setNote(state.focusedChannel, state.focusedStep, '-');
    const newStep = (state.focusedStep + 1) % state.steps;
    setFocus(state.focusedChannel, newStep);
    return;
  }

  // Clear note
  if (key === 'backspace' || key === 'delete') {
    e.preventDefault();
    setNote(state.focusedChannel, state.focusedStep, null);
    return;
  }
}

/**
 * Set a note in the grid
 */
function setNote(channel, step, note) {
  state.grid[channel][step].note = note;
  renderGrid();
  updateOutput();
}

/**
 * Clear all tracker data
 */
function clearAll() {
  initGrid();
  state.channelInstruments = ['', '', '', ''];
  renderGrid();
  updateOutput();
}

/**
 * Generate mini-notation output from the grid
 */
function updateOutput() {
  if (!elements.output) return;

  const patterns = [];

  for (let ch = 0; ch < state.channels; ch++) {
    const instrument = state.channelInstruments[ch];
    if (!instrument) continue;

    const notes = state.grid[ch].map(cell => cell.note || '~');
    
    // Optimize: collapse repeated notes with *
    const optimized = optimizePattern(notes);
    
    patterns.push({
      instrument,
      pattern: optimized,
    });
  }

  if (patterns.length === 0) {
    elements.output.value = '// Select instruments and add notes to generate pattern';
    return;
  }

  // Generate Strudel code
  const lines = patterns.map(p => {
    return `note("${p.pattern}").s("${p.instrument}")`;
  });

  if (lines.length === 1) {
    elements.output.value = lines[0];
  } else {
    elements.output.value = `stack(\n  ${lines.join(',\n  ')}\n)`;
  }
}

/**
 * Optimize a pattern by collapsing repeated notes
 */
function optimizePattern(notes) {
  if (notes.length === 0) return '';

  const result = [];
  let current = notes[0];
  let count = 1;

  for (let i = 1; i < notes.length; i++) {
    if (notes[i] === current) {
      count++;
    } else {
      result.push(formatNote(current, count));
      current = notes[i];
      count = 1;
    }
  }
  result.push(formatNote(current, count));

  return result.join(' ');
}

/**
 * Format a note with optional repeat count
 */
function formatNote(note, count) {
  if (count === 1) return note;
  return `${note}*${count}`;
}

/**
 * Copy output to clipboard
 */
async function copyToClipboard() {
  if (!elements.output) return;
  
  try {
    await navigator.clipboard.writeText(elements.output.value);
    const originalText = elements.copyBtn.innerHTML;
    elements.copyBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Copied!';
    setTimeout(() => {
      elements.copyBtn.innerHTML = originalText;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

/**
 * Apply tracker output to the Strudel editor
 */
function applyToEditor() {
  const event = new CustomEvent('tracker:apply', {
    detail: { code: elements.output.value },
  });
  document.dispatchEvent(event);
  closeTracker();
}

/**
 * Open the tracker modal
 */
export function openTracker(instrumentList) {
  if (instrumentList) {
    state.instruments = instrumentList;
    renderGrid();
  }

  elements.modal?.classList.add('open');
  
  // Focus first cell
  setFocus(0, 0);
}

/**
 * Close the tracker modal
 */
export function closeTracker() {
  elements.modal?.classList.remove('open');
}

/**
 * Check if tracker is open
 */
export function isTrackerOpen() {
  return elements.modal?.classList.contains('open') || false;
}

/**
 * Update available instruments
 */
export function updateInstruments(instrumentList) {
  state.instruments = instrumentList;
  renderGrid();
}

/**
 * Get current tracker output
 */
export function getOutput() {
  return elements.output?.value || '';
}

/**
 * Serialize tracker state to a compact format
 * @returns {Object} Tracker state object
 */
export function serializeTrackerState() {
  // Extract just the note data from the grid (not the 'active' UI state)
  const gridData = state.grid.map(channel =>
    channel.map(cell => cell.note || null)
  );

  return {
    version: 1,
    channels: state.channels,
    steps: state.steps,
    grid: gridData,
    channelInstruments: state.channelInstruments,
  };
}

/**
 * Deserialize tracker state and load into the grid
 * @param {Object} data - Tracker state object
 * @returns {boolean} Success
 */
export function deserializeTrackerState(data) {
  if (!data || data.version !== 1) {
    console.warn('[Tracker] Invalid or incompatible tracker state');
    return false;
  }

  try {
    // Validate grid dimensions
    if (!Array.isArray(data.grid) || data.grid.length !== state.channels) {
      console.warn('[Tracker] Grid dimension mismatch');
      return false;
    }

    // Load grid data
    for (let ch = 0; ch < state.channels; ch++) {
      if (!Array.isArray(data.grid[ch]) || data.grid[ch].length !== state.steps) {
        console.warn(`[Tracker] Channel ${ch} dimension mismatch`);
        continue;
      }

      for (let step = 0; step < state.steps; step++) {
        state.grid[ch][step].note = data.grid[ch][step] || null;
      }
    }

    // Load instrument assignments
    if (data.channelInstruments && Array.isArray(data.channelInstruments)) {
      state.channelInstruments = data.channelInstruments.slice(0, state.channels);
    }

    // Re-render with new data
    renderGrid();
    updateOutput();

    console.log('[Tracker] State restored successfully');
    return true;
  } catch (err) {
    console.error('[Tracker] Failed to deserialize state:', err);
    return false;
  }
}
