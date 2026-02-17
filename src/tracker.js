/**
 * Tracker Module - Proof of Concept
 * 
 * A simple 4-channel, 16-step tracker that outputs Strudel mini-notation.
 * Uses zxcvb/qwerty keyboard layout for note input (like FastTracker/ProTracker).
 */

import { zzfxG } from './zzfx-loader.js';
import { playTestNote } from './instrument-preview.js';
import { createIcons, icons } from 'lucide';
import { setupScrubInteraction } from './instrument-ui.js';

const DEMO_MODE = import.meta.env.MODE === 'demo';
const DEVELOPER_MODE_KEY = 'zzfxm-developer-mode';

function isDeveloperModeEnabled() {
  try {
    return localStorage.getItem(DEVELOPER_MODE_KEY) === '1';
  } catch (_e) {
    return false;
  }
}

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
  bpm: 120,
  grid: [], // Array of channels, each with array of { note: string|null, active: boolean }
  instruments: [], // Available instruments
  channelInstruments: ['', '', '', ''], // Selected instrument for each channel
  focusedChannel: 0,
  focusedStep: 0,
};

// Edit mode state
let editMode = {
  isEditing: false,
  isNewBlock: false,
  blockFilename: null,
  blockName: null,
  blockDescription: null,
  blockScope: 'user',
  onSave: null, // Callback for save action
  returnToBlocksOnClose: false,
};

// Preview playback state
let previewState = {
  audioContext: null,
  playingSource: null,
  isPlaying: false,
  playheadRafId: null,
  playingStep: null,
};

export function primePreviewAudioContext() {
  if (!previewState.audioContext) {
    previewState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  const ctx = previewState.audioContext;
  if (ctx && ctx.state === 'suspended') {
    // Fire-and-forget; callers invoke this from a user gesture handler.
    ctx.resume().catch(() => {});
  }
}

let octaveOffset = 0;
let effectPreviewTimeout = null;
let effectPreviewRequest = null;
const EFFECT_PREVIEW_DEBOUNCE_MS = 150;

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
      vol: null,
      reps: null,
      nd: null,
      active: false,
    }))
  );
}

function setSteps(nextSteps) {
  const desired = parseInt(nextSteps, 10);
  if (Number.isNaN(desired)) return;
  const clamped = Math.min(Math.max(desired, 1), 256);
  if (clamped === state.steps) return;

  const prevGrid = state.grid;
  state.steps = clamped;

  state.grid = Array(state.channels).fill(null).map((_, ch) =>
    Array(state.steps).fill(null).map((__, step) => {
      const prevCell = prevGrid?.[ch]?.[step];
      if (prevCell) {
        return {
          note: prevCell.note ?? null,
          vol: prevCell.vol ?? null,
          reps: prevCell.reps ?? null,
          nd: prevCell.nd ?? null,
          active: false,
        };
      }
      return { note: null, vol: null, reps: null, nd: null, active: false };
    })
  );

  state.focusedStep = Math.min(Math.max(state.focusedStep, 0), state.steps - 1);

  renderGrid();
  updateOutput();

  if (previewState.isPlaying && previewState.audioContext) {
    const ctx = previewState.audioContext;
    const duration = previewState.bufferDuration || 2.0;
    const elapsed = ctx.currentTime - previewState.startTime;
    const currentOffset = elapsed > 0 ? elapsed % duration : 0;
    playPreview(currentOffset);
  }

  focusNoteCell(state.focusedChannel, state.focusedStep);
}

function scheduleEffectPreview(channel, step) {
  if (previewState.isPlaying) return;
  effectPreviewRequest = { channel, step };
  if (effectPreviewTimeout) {
    clearTimeout(effectPreviewTimeout);
  }
  effectPreviewTimeout = setTimeout(() => {
    effectPreviewTimeout = null;
    const request = effectPreviewRequest;
    effectPreviewRequest = null;
    if (!request || previewState.isPlaying) return;
    const cellNote = state.grid[request.channel]?.[request.step]?.note;
    if (cellNote && cellNote !== '~' && cellNote !== '-') {
      playNotePreview(request.channel, request.step, cellNote);
    }
  }, EFFECT_PREVIEW_DEBOUNCE_MS);
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
    saveBtn: document.getElementById('saveTrackerBtn'),
    previewBtn: document.getElementById('previewTrackerBtn'),
    blockProps: document.getElementById('trackerBlockProps'),
    blockNameInput: document.getElementById('trackerBlockName'),
    blockBpmInput: document.getElementById('trackerBlockBpm'),
    blockRowsPreset: document.getElementById('trackerBlockRowsPreset'),
    blockRowsCustom: document.getElementById('trackerBlockRowsCustom'),
    blockAdvancedSettingsBtn: document.getElementById('trackerBlockAdvancedSettingsBtn'),
    title: document.querySelector('#trackerModal h2'),
  };
}

/**
 * Render the tracker grid
 */
function renderGrid() {
  if (!elements.grid) return;

  elements.grid.innerHTML = '';

  // Global time track column on the left (shared step numbering)
  const timeTrackEl = document.createElement('div');
  timeTrackEl.className = 'tracker-timetrack';

  const timeTrackHeaderEl = document.createElement('div');
  timeTrackHeaderEl.className = 'tracker-timetrack-header';

  const timeTrackLabelSpacer = document.createElement('div');
  timeTrackLabelSpacer.className = 'tracker-timetrack-label-spacer';
  timeTrackLabelSpacer.textContent = ' ';

  const timeTrackSelectSpacer = document.createElement('div');
  timeTrackSelectSpacer.className = 'tracker-timetrack-select-spacer';

  timeTrackHeaderEl.appendChild(timeTrackLabelSpacer);
  timeTrackHeaderEl.appendChild(timeTrackSelectSpacer);
  timeTrackEl.appendChild(timeTrackHeaderEl);

  for (let step = 0; step < state.steps; step++) {
    const stepEl = document.createElement('div');
    stepEl.className = 'tracker-timetrack-row';
    stepEl.dataset.step = step;
    stepEl.textContent = String(step + 1);
    if (step % 4 === 0) {
      stepEl.classList.add('beat');
    }

    if (step === state.focusedStep) {
      stepEl.classList.add('active');
    }

    stepEl.addEventListener('click', () => {
      setFocus(state.focusedChannel, step);
    });

    timeTrackEl.appendChild(stepEl);
  }

  elements.grid.appendChild(timeTrackEl);

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

    const repsLabelEl = document.createElement('div');
    repsLabelEl.className = 'tracker-reps-label';
    repsLabelEl.textContent = 'RP';

    const ndLabelEl = document.createElement('div');
    ndLabelEl.className = 'tracker-nd-label';
    ndLabelEl.textContent = 'DL';

    const volLabelEl = document.createElement('div');
    volLabelEl.className = 'tracker-vol-label';
    volLabelEl.textContent = '';

    const headerRowEl = document.createElement('div');
    headerRowEl.className = 'tracker-channel-header-row';
    headerRowEl.appendChild(selectEl);
    headerRowEl.appendChild(volLabelEl);
    headerRowEl.appendChild(repsLabelEl);
    headerRowEl.appendChild(ndLabelEl);

    headerEl.appendChild(labelEl);
    headerEl.appendChild(headerRowEl);
    channelEl.appendChild(headerEl);

    // Step rows
    for (let step = 0; step < state.steps; step++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'tracker-row';

      const cellEl = document.createElement('div');
      cellEl.className = 'tracker-cell';
      cellEl.dataset.channel = ch;
      cellEl.dataset.step = step;
      cellEl.tabIndex = 0;

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
        cellEl.focus();
      });

      const volEl = document.createElement('input');
      volEl.type = 'number';
      volEl.min = '0';
      volEl.max = '99';
      volEl.step = '1';
      volEl.className = 'tracker-vol-input';
      volEl.dataset.channel = ch;
      volEl.dataset.step = step;

      if (cellData.vol) {
        volEl.value = String(cellData.vol);
      }

      volEl.addEventListener('input', (e) => {
        const raw = e.target.value.trim();
        const parsed = parseInt(raw, 10);
        if (!raw) {
          state.grid[ch][step].vol = null;
        } else if (!Number.isNaN(parsed)) {
          const clamped = Math.min(Math.max(parsed, 0), 99);
          state.grid[ch][step].vol = clamped === 0 ? null : clamped;
          if (clamped === 0) e.target.value = '';
        }
        updateOutput();
        if (previewState.isPlaying && previewState.audioContext) {
          const ctx = previewState.audioContext;
          const duration = previewState.bufferDuration || 2.0;
          const elapsed = ctx.currentTime - previewState.startTime;
          const currentOffset = elapsed > 0 ? elapsed % duration : 0;
          playPreview(currentOffset);
        } else {
          scheduleEffectPreview(ch, step);
        }
      });

      volEl.addEventListener('click', (e) => {
        e.stopPropagation();
        setFocus(ch, step);
        volEl.focus();
      });

      setupScrubInteraction(volEl);

      const repsEl = document.createElement('input');
      repsEl.type = 'number';
      repsEl.min = '0';
      repsEl.max = '99';
      repsEl.step = '1';
      repsEl.className = 'tracker-reps-input';
      repsEl.dataset.channel = ch;
      repsEl.dataset.step = step;

      if (cellData.reps) {
        repsEl.value = String(cellData.reps);
      }

      repsEl.addEventListener('input', (e) => {
        const raw = e.target.value.trim();
        const parsed = parseInt(raw, 10);
        if (!raw) {
          state.grid[ch][step].reps = null;
        } else if (!Number.isNaN(parsed)) {
          const clamped = Math.min(Math.max(parsed, 0), 99);
          state.grid[ch][step].reps = clamped === 0 ? null : clamped;
          if (clamped === 0) e.target.value = '';
        }
        updateOutput();
        if (previewState.isPlaying && previewState.audioContext) {
          const ctx = previewState.audioContext;
          const duration = previewState.bufferDuration || 2.0;
          const elapsed = ctx.currentTime - previewState.startTime;
          const currentOffset = elapsed > 0 ? elapsed % duration : 0;
          playPreview(currentOffset);
        } else {
          scheduleEffectPreview(ch, step);
        }
      });

      repsEl.addEventListener('click', (e) => {
        e.stopPropagation();
        setFocus(ch, step);
        repsEl.focus();
      });

      const ndEl = document.createElement('input');
      ndEl.type = 'number';
      ndEl.min = '0';
      ndEl.max = '99';
      ndEl.step = '1';
      ndEl.className = 'tracker-nd-input';
      ndEl.dataset.channel = ch;
      ndEl.dataset.step = step;

      if (cellData.nd !== null && cellData.nd !== undefined) {
        ndEl.value = String(cellData.nd);
      }

      ndEl.addEventListener('input', (e) => {
        const raw = e.target.value.trim();
        const parsed = parseInt(raw, 10);
        if (!raw) {
          state.grid[ch][step].nd = null;
        } else if (!Number.isNaN(parsed)) {
          const clamped = Math.min(Math.max(parsed, 0), 99);
          state.grid[ch][step].nd = clamped === 0 ? null : clamped;
          if (clamped === 0) e.target.value = '';
        }
        updateOutput();
        if (previewState.isPlaying && previewState.audioContext) {
          const ctx = previewState.audioContext;
          const duration = previewState.bufferDuration || 2.0;
          const elapsed = ctx.currentTime - previewState.startTime;
          const currentOffset = elapsed > 0 ? elapsed % duration : 0;
          playPreview(currentOffset);
        } else {
          scheduleEffectPreview(ch, step);
        }
      });

      ndEl.addEventListener('click', (e) => {
        e.stopPropagation();
        setFocus(ch, step);
        ndEl.focus();
      });

      rowEl.appendChild(cellEl);
      rowEl.appendChild(volEl);
      rowEl.appendChild(repsEl);
      rowEl.appendChild(ndEl);
      channelEl.appendChild(rowEl);
    }

    elements.grid.appendChild(channelEl);
  }
}

/**
 * Set focus to a specific cell
 */
function setFocus(channel, step) {
  const clampedChannel = Math.max(0, Math.min(channel, state.channels - 1));
  const clampedStep = Math.max(0, Math.min(step, state.steps - 1));

  // Remove active class from old cell
  const oldCell = document.querySelector(
    `.tracker-cell[data-channel="${state.focusedChannel}"][data-step="${state.focusedStep}"]`
  );
  if (oldCell) {
    oldCell.classList.remove('active');
  }
  const oldTimeStep = document.querySelector('.tracker-timetrack-row.active');
  if (oldTimeStep) {
    oldTimeStep.classList.remove('active');
  }

  state.focusedChannel = clampedChannel;
  state.focusedStep = clampedStep;

  // Add active class to new cell
  const newCell = document.querySelector(
    `.tracker-cell[data-channel="${state.focusedChannel}"][data-step="${state.focusedStep}"]`
  );
  if (newCell) {
    newCell.classList.add('active');
    const container = newCell.closest('.tracker-container');
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const cellRect = newCell.getBoundingClientRect();
      const headerEl = container.querySelector('.tracker-channel-header');
      const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;
      const visibleTop = containerRect.top + headerHeight;
      const visibleBottom = containerRect.bottom;

      if (cellRect.top < visibleTop || cellRect.bottom > visibleBottom) {
        const targetTop = container.scrollTop + (cellRect.top - containerRect.top) - headerHeight;
        const maxTop = Math.max(container.scrollHeight - container.clientHeight, 0);
        const clampedTop = Math.min(Math.max(targetTop, 0), maxTop);
        container.scrollTo({ top: clampedTop, behavior: 'smooth' });
      }
    } else {
      newCell.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  const newTimeStep = document.querySelector(`.tracker-timetrack-row[data-step="${state.focusedStep}"]`);
  if (newTimeStep) {
    newTimeStep.classList.add('active');
  }
}

function focusRepsInput(channel, step) {
  setFocus(channel, step);
  const repsInput = document.querySelector(
    `.tracker-reps-input[data-channel="${state.focusedChannel}"][data-step="${state.focusedStep}"]`
  );
  if (repsInput) {
    repsInput.focus();
    repsInput.select();
  }
}

function focusVolInput(channel, step) {
  setFocus(channel, step);
  const volInput = document.querySelector(
    `.tracker-vol-input[data-channel="${state.focusedChannel}"][data-step="${state.focusedStep}"]`
  );
  if (volInput) {
    volInput.focus();
    volInput.select();
  }
}

function focusNdInput(channel, step) {
  setFocus(channel, step);
  const ndInput = document.querySelector(
    `.tracker-nd-input[data-channel="${state.focusedChannel}"][data-step="${state.focusedStep}"]`
  );
  if (ndInput) {
    ndInput.focus();
    ndInput.select();
  }
}

function focusNoteCell(channel, step) {
  setFocus(channel, step);
  const cell = document.querySelector(
    `.tracker-cell[data-channel="${state.focusedChannel}"][data-step="${state.focusedStep}"]`
  );
  if (cell) {
    cell.focus();
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

  // Save button (for edit mode)
  elements.saveBtn?.addEventListener('click', handleSaveBlock);

  // Preview button
  elements.previewBtn?.addEventListener('click', togglePreview);
  elements.blockAdvancedSettingsBtn?.addEventListener('click', () => {
    if (!editMode.isEditing) return;
    if (!isDeveloperModeEnabled() || DEMO_MODE) return;
    const name = (elements.blockNameInput?.value || editMode.blockName || '').trim();
    document.dispatchEvent(new CustomEvent('resource-scope:open', {
      detail: {
        type: 'block',
        filename: editMode.blockFilename,
        name,
        scope: editMode.blockScope === 'example' ? 'example' : 'user',
      }
    }));
  });

  if (elements.blockBpmInput) {
    elements.blockBpmInput.addEventListener('input', (e) => {
      const raw = e.target.value.trim();
      const parsed = parseInt(raw, 10);
      if (Number.isNaN(parsed)) return;
      const clamped = Math.min(Math.max(parsed, 20), 300);
      state.bpm = clamped;
      if (previewState.isPlaying && previewState.audioContext) {
        const ctx = previewState.audioContext;
        const duration = previewState.bufferDuration || 2.0;
        const elapsed = ctx.currentTime - previewState.startTime;
        const currentOffset = elapsed > 0 ? elapsed % duration : 0;
        playPreview(currentOffset);
      }
    });

    elements.blockBpmInput.addEventListener('blur', (e) => {
      if (!e.target.value.trim()) {
        state.bpm = 120;
        e.target.value = '120';
      }
    });

    setupScrubInteraction(elements.blockBpmInput);
  }

  if (elements.blockRowsPreset && elements.blockRowsCustom) {
    elements.blockRowsPreset.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        elements.blockRowsCustom.classList.remove('hidden');
        setSteps(elements.blockRowsCustom.value);
        elements.blockRowsCustom.focus();
      } else {
        elements.blockRowsCustom.classList.add('hidden');
        setSteps(val);
      }
    });

    elements.blockRowsCustom.addEventListener('input', (e) => {
      if (elements.blockRowsPreset.value !== 'custom') return;
      const raw = e.target.value.trim();
      if (!raw) return;
      setSteps(raw);
    });

    elements.blockRowsCustom.addEventListener('blur', (e) => {
      if (elements.blockRowsPreset.value !== 'custom') return;
      if (!e.target.value.trim()) {
        e.target.value = String(state.steps);
      }
    });
  }

  document.addEventListener('resource-scope:changed', (e) => {
    const detail = e?.detail || {};
    if (detail.type !== 'block') return;
    if (!editMode.isEditing) return;
    if (editMode.blockFilename && detail.filename !== editMode.blockFilename) return;
    if (!editMode.blockFilename && detail.filename) return;
    editMode.blockScope = detail.scope === 'example' ? 'example' : 'user';
  });

  document.addEventListener('developer-mode:changed', () => {
    updateEditModeUI();
  });

  // Keyboard input
  document.addEventListener('keydown', handleKeyDown);
}

/**
 * Handle keyboard input
 */
function handleKeyDown(e) {
  // Only process if tracker is open
  if (!elements.modal?.classList.contains('open')) return;

  // Don't capture if typing in a select/textarea/input
  const isFormField = e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT';
  const isVolInput = e.target.classList?.contains('tracker-vol-input');
  const isRepsInput = e.target.classList?.contains('tracker-reps-input');
  const isNdInput = e.target.classList?.contains('tracker-nd-input');
  if (isFormField && !isVolInput && !isRepsInput && !isNdInput) return;

  if (isVolInput || isRepsInput || isNdInput) {
    const key = e.key.toLowerCase();
    const channel = parseInt(e.target.dataset.channel, 10);
    const step = parseInt(e.target.dataset.step, 10);
    const inVol = isVolInput;
    const inReps = isRepsInput;

    if (key === 'tab') {
      e.preventDefault();
      const delta = e.shiftKey ? -4 : 4;
      const targetStep = Math.min(Math.max(step + delta, 0), state.steps - 1);
      if (inVol) {
        focusVolInput(channel, targetStep);
      } else if (inReps) {
        focusRepsInput(channel, targetStep);
      } else {
        focusNdInput(channel, targetStep);
      }
      return;
    }

    if (key === 'arrowup') {
      e.preventDefault();
      if (inVol) {
        focusVolInput(channel, Math.max(step - 1, 0));
      } else if (inReps) {
        focusRepsInput(channel, Math.max(step - 1, 0));
      } else {
        focusNdInput(channel, Math.max(step - 1, 0));
      }
      return;
    }
    if (key === 'arrowdown') {
      e.preventDefault();
      if (inVol) {
        focusVolInput(channel, Math.min(step + 1, state.steps - 1));
      } else if (inReps) {
        focusRepsInput(channel, Math.min(step + 1, state.steps - 1));
      } else {
        focusNdInput(channel, Math.min(step + 1, state.steps - 1));
      }
      return;
    }
    if (key === 'arrowleft') {
      e.preventDefault();
      if (inVol) {
        focusNoteCell(channel, step);
      } else if (inReps) {
        focusVolInput(channel, step);
      } else {
        focusRepsInput(channel, step);
      }
      return;
    }
    if (key === 'arrowright') {
      e.preventDefault();
      if (inVol) {
        focusRepsInput(channel, step);
      } else if (inReps) {
        focusNdInput(channel, step);
      } else {
        const nextChannel = Math.min(channel + 1, state.channels - 1);
        focusNoteCell(nextChannel, step);
      }
      return;
    }
    return;
  }

  // Only handle editing when a cell is actively selected
  if (!document.querySelector('.tracker-cell.active')) return;

  const key = e.key.toLowerCase();

  // Navigation
  if (key === 'arrowup') {
    e.preventDefault();
    const newStep = Math.max(state.focusedStep - 1, 0);
    setFocus(state.focusedChannel, newStep);
    return;
  }

  if (key === 'arrowdown') {
    e.preventDefault();
    const newStep = Math.min(state.focusedStep + 1, state.steps - 1);
    setFocus(state.focusedChannel, newStep);
    return;
  }

  if (key === 'arrowleft') {
    e.preventDefault();
    if (state.focusedChannel > 0) {
      focusNdInput(state.focusedChannel - 1, state.focusedStep);
    } else {
      setFocus(0, state.focusedStep);
    }
    return;
  }

  if (key === 'arrowright') {
    e.preventDefault();
    const volInput = document.querySelector(
      `.tracker-vol-input[data-channel="${state.focusedChannel}"][data-step="${state.focusedStep}"]`
    );
    if (volInput) {
      focusVolInput(state.focusedChannel, state.focusedStep);
    } else {
      const newCh = Math.min(state.focusedChannel + 1, state.channels - 1);
      setFocus(newCh, state.focusedStep);
    }
    return;
  }

  if (key === 'tab') {
    e.preventDefault();
    const delta = e.shiftKey ? -4 : 4;
    const targetStep = Math.min(Math.max(state.focusedStep + delta, 0), state.steps - 1);
    setFocus(state.focusedChannel, targetStep);
    return;
  }

  if (key === 'enter') {
    e.preventDefault();
    togglePreview();
    return;
  }

  if (key === '/') {
    e.preventDefault();
    octaveOffset = Math.max(octaveOffset - 1, -3);
    return;
  }

  if (key === '*') {
    e.preventDefault();
    octaveOffset = Math.min(octaveOffset + 1, 3);
    return;
  }

  // Note input
  if (KEYBOARD_MAP[key]) {
    e.preventDefault();
    const note = applyOctaveOffset(KEYBOARD_MAP[key], octaveOffset);
    if (note) {
      setNote(state.focusedChannel, state.focusedStep, note);
    }
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

  if (key === ' ') {
    e.preventDefault();
    insertBlankRowAtStep(state.focusedChannel, state.focusedStep);
    const newStep = Math.min(state.focusedStep + 1, state.steps - 1);
    setFocus(state.focusedChannel, newStep);
    return;
  }

  // Clear note
  if (key === 'delete') {
    e.preventDefault();
    setNote(state.focusedChannel, state.focusedStep, null);
    const newStep = Math.min(state.focusedStep + 1, state.steps - 1);
    setFocus(state.focusedChannel, newStep);
    return;
  }

  if (key === 'backspace') {
    e.preventDefault();
    if (state.focusedStep === 0) {
      setNote(state.focusedChannel, state.focusedStep, null);
      setFocus(state.focusedChannel, 0);
    } else {
      shiftColumnUpFromStep(state.focusedChannel, state.focusedStep - 1);
      setFocus(state.focusedChannel, state.focusedStep - 1);
    }
    return;
  }

  // (fallthrough)
}

function applyOctaveOffset(noteStr, offset) {
  const match = noteStr.match(/^([a-g]#?)(\d)$/i);
  if (!match) return noteStr;
  const noteName = match[1].toLowerCase();
  const octave = parseInt(match[2], 10);
  const nextOctave = Math.min(Math.max(octave + offset, 0), 8);
  return `${noteName}${nextOctave}`;
}

/**
 * Set a note in the grid
 */
function setNote(channel, step, note) {
  state.grid[channel][step].note = note;
  renderGrid();
  updateOutput();
  
  // If preview is playing, update the loop seamlessly
  if (previewState.isPlaying && previewState.audioContext) {
    const ctx = previewState.audioContext;
    const duration = previewState.bufferDuration || 2.0;
    const elapsed = ctx.currentTime - previewState.startTime;
    const currentOffset = elapsed > 0 ? elapsed % duration : 0;
    
    playPreview(currentOffset);
  } else {
    // Otherwise play single note preview if it's a valid note
    if (note && note !== '~' && note !== '-') {
      playNotePreview(channel, step, note);
    }
  }
}

function shiftColumnUpFromStep(channel, startStep) {
  for (let step = startStep; step < state.steps - 1; step++) {
    state.grid[channel][step].note = state.grid[channel][step + 1].note;
  }
  state.grid[channel][state.steps - 1].note = null;
  renderGrid();
  updateOutput();

  if (previewState.isPlaying && previewState.audioContext) {
    const ctx = previewState.audioContext;
    const duration = previewState.bufferDuration || 2.0;
    const elapsed = ctx.currentTime - previewState.startTime;
    const currentOffset = elapsed > 0 ? elapsed % duration : 0;
    
    playPreview(currentOffset);
  }
}

function insertBlankRowAtStep(channel, startStep) {
  for (let step = state.steps - 1; step > startStep; step--) {
    state.grid[channel][step].note = state.grid[channel][step - 1].note;
  }
  state.grid[channel][startStep].note = null;
  renderGrid();
  updateOutput();

  if (previewState.isPlaying && previewState.audioContext) {
    const ctx = previewState.audioContext;
    const duration = previewState.bufferDuration || 2.0;
    const elapsed = ctx.currentTime - previewState.startTime;
    const currentOffset = elapsed > 0 ? elapsed % duration : 0;
    
    playPreview(currentOffset);
  }
}

/**
 * Play a preview of a note using the channel's instrument
 */
function playNotePreview(channel, step, noteStr) {
  const instrumentId = state.channelInstruments[channel];
  if (!instrumentId) return;
  
  // Find instrument params
  const instrument = state.instruments.find(i => i.id === instrumentId);
  if (!instrument || !instrument.params) return;
  
  // Calculate frequency for the note
  const noteMap = {
    'c': 0, 'c#': 1, 'd': 2, 'd#': 3, 'e': 4, 'f': 5,
    'f#': 6, 'g': 7, 'g#': 8, 'a': 9, 'a#': 10, 'b': 11
  };
  
  const match = noteStr.match(/^([a-g]#?)(\d)$/i);
  if (!match) return;
  
  const noteName = match[1].toLowerCase();
  const octave = parseInt(match[2], 10);
  
  const noteOffset = noteMap[noteName];
  if (noteOffset === undefined) return;
  
  // MIDI note number (A4 = 69)
  const midiNote = (octave + 1) * 12 + noteOffset;
  
  // Calculate absolute frequency (A4 = 440 Hz)
  const frequency = 440 * Math.pow(2, (midiNote - 69) / 12);
  
  const cell = state.grid[channel]?.[step];
  const noteGain = Number.isInteger(cell?.vol) ? Math.min(Math.max(cell.vol, 1), 99) / 99 : 1;
  const { reps, delaySteps, substepCount } = resolveSubsteps(cell?.reps, cell?.nd);
  const stepSize = substepCount / reps;
  const delaySeconds = (delaySteps / substepCount) * (60 / state.bpm / 4);
  const repeatInterval = stepSize / substepCount * (60 / state.bpm / 4);
  
  for (let r = 0; r < reps; r++) {
    const delay = delaySeconds + (r * repeatInterval);
    playTestNote(instrument.params, frequency, noteGain, delay, true);
  }
}

/**
 * Clear all tracker data
 */
function clearAll() {
  initGrid();
  state.channelInstruments = ['', '', '', ''];
  renderGrid();
  updateOutput();
  
  if (previewState.isPlaying && previewState.audioContext) {
    const ctx = previewState.audioContext;
    const duration = previewState.bufferDuration || 2.0;
    const elapsed = ctx.currentTime - previewState.startTime;
    const currentOffset = elapsed > 0 ? elapsed % duration : 0;
    
    playPreview(currentOffset);
  }
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

    const tokens = state.grid[ch].map(cell => {
      if (!cell.note || cell.note === '-') return '~';
      return buildStepToken(cell.note, cell.reps, cell.nd);
    });

    const hasVol = state.grid[ch].some(cell => cell.vol != null);
    const gainTokens = hasVol ? state.grid[ch].map(cell => {
      const vol = Number.isInteger(cell.vol) ? cell.vol : 99;
      const gain = Math.min(Math.max(vol, 1), 99) / 99;
      return gain.toFixed(2).replace(/\.00$/, '');
    }) : null;

    patterns.push({
      instrument,
      pattern: tokens.join(' '),
      gainPattern: gainTokens ? gainTokens.join(' ') : null,
    });
  }

  if (patterns.length === 0) {
    elements.output.value = '// Select instruments and add notes to generate pattern';
    return;
  }

  // Generate Strudel code
  const lines = patterns.map(p => {
    if (p.gainPattern) {
      return `note("${p.pattern}").s("${p.instrument}").gain("${p.gainPattern}")`;
    }
    return `note("${p.pattern}").s("${p.instrument}")`;
  });

  if (lines.length === 1) {
    elements.output.value = lines[0];
  } else {
    elements.output.value = `stack(\n  ${lines.join(',\n  ')}\n)`;
  }
}

// Note: keep explicit step timing; no compression.

function buildStepToken(note, repsValue, ndValue) {
  const { reps, delaySteps, substepCount } = resolveSubsteps(repsValue, ndValue);
  if (reps === 1 && delaySteps === 0) return note;

  const stepSize = substepCount / reps;
  const slots = Array(substepCount).fill('~');
  for (let r = 0; r < reps; r++) {
    const idx = delaySteps + r * stepSize;
    if (idx >= 0 && idx < slots.length) {
      slots[idx] = note;
    }
  }
  return `[${slots.join(' ')}]`;
}

function resolveSubsteps(repsValue, ndValue) {
  const reps = Number.isInteger(repsValue) && repsValue > 1 ? repsValue : 1;
  const nd = Number.isInteger(ndValue) && ndValue > 0 ? ndValue : 0;
  const substepCount = lcm(4, reps);
  const stepSize = substepCount / reps;
  const maxDelay = Math.max(substepCount - (reps - 1) * stepSize - 1, 0);
  const desiredDelay = Math.round((nd / 4) * substepCount);
  const delaySteps = Math.min(Math.max(desiredDelay, 0), maxDelay);
  return { reps, delaySteps, substepCount };
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function lcm(a, b) {
  return Math.abs(a * b) / gcd(a, b);
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
 * Toggle preview playback
 */
function togglePreview() {
  if (previewState.isPlaying) {
    stopPreview();
  } else {
    playPreview();
  }
}

/**
 * Play a preview of the current tracker pattern
 */
function playPreview(startOffset = 0) {
  // Stop any existing playback
  stopPreview();

  // Check if we have any notes with instruments
  const hasContent = state.channelInstruments.some((inst, ch) => {
    if (!inst) return false;
    return state.grid[ch].some(cell => cell.note && cell.note !== '~');
  });

  if (!hasContent) {
    console.log('[Tracker] No content to preview');
    return;
  }

  // Initialize audio context if needed
  if (!previewState.audioContext) {
    previewState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  const ctx = previewState.audioContext;
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  // Default BPM (16 steps per cycle, 4 beats per cycle = 16th notes)
  const secondsPerBeat = 60 / state.bpm;
  const secondsPerStep = secondsPerBeat / 4; // 16th notes

  const sampleRate = 44100;
  const samplesPerStep = Math.floor(secondsPerStep * sampleRate);
  
  // Calculate buffer length (exact pattern length for seamless looping)
  const totalSteps = state.steps;
  const patternSamples = Math.ceil(totalSteps * samplesPerStep);
  const mixBuffer = new Float32Array(patternSamples);

  const noteToFreq = (noteStr) => {
    if (!noteStr || noteStr === '~' || noteStr === '-') return null;
    
    const noteMap = {
      'c': 0, 'c#': 1, 'd': 2, 'd#': 3, 'e': 4, 'f': 5,
      'f#': 6, 'g': 7, 'g#': 8, 'a': 9, 'a#': 10, 'b': 11
    };
    
    const match = noteStr.match(/^([a-g]#?)(\d)$/i);
    if (!match) return null;
    
    const noteName = match[1].toLowerCase();
    const octave = parseInt(match[2], 10);
    
    const noteOffset = noteMap[noteName];
    if (noteOffset === undefined) return null;
    
    const midiNote = (octave + 1) * 12 + noteOffset;
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  };

  // Process each channel
  for (let ch = 0; ch < state.channels; ch++) {
    const instrumentId = state.channelInstruments[ch];
    if (!instrumentId) continue;

    // Find instrument params
    const instrument = state.instruments.find(i => i.id === instrumentId);
    if (!instrument || !instrument.params) {
      console.warn(`[Tracker] Instrument not found: ${instrumentId}`);
      continue;
    }

    const baseParams = instrument.params;

    // Process each step
    for (let step = 0; step < state.steps; step++) {
      const cell = state.grid[ch][step];
      const freq = noteToFreq(cell.note);
      if (freq === null) continue;

      // Clone and modify params for this note
      const p = [...baseParams];
      while (p.length < 21) p.push(0);

      // Set absolute frequency
      p[2] = freq;

      // Generate samples
      const intendedVol = p[0] !== undefined ? p[0] : 1;
      p[0] = 1; // Generate at full volume for normalization

      let samples;
      try {
        samples = zzfxG(...p);
      } catch (err) {
        console.error(`[Tracker] Failed to generate sound for ${instrumentId}:`, err);
        continue;
      }

      if (!samples || samples.length === 0) continue;

      // Normalize
      let maxAmp = 0;
      for (let i = 0; i < samples.length; i++) {
        const abs = Math.abs(samples[i]);
        if (abs > maxAmp) maxAmp = abs;
      }
      if (maxAmp > 0) {
        const scale = (0.5 / maxAmp) * intendedVol;
        for (let i = 0; i < samples.length; i++) {
          samples[i] *= scale;
        }
      }

      const { reps, delaySteps, substepCount } = resolveSubsteps(cell.reps, cell.nd);
      const noteGain = Number.isInteger(cell.vol) ? Math.min(Math.max(cell.vol, 1), 99) / 99 : 1;
      const stepSize = substepCount / reps;
      for (let r = 0; r < reps; r++) {
        const subOffset = Math.floor(samplesPerStep * ((delaySteps + r * stepSize) / substepCount));
        const noteStart = step * samplesPerStep + subOffset;
        for (let j = 0; j < samples.length; j++) {
          const bufferIndex = (noteStart + j) % patternSamples;
          mixBuffer[bufferIndex] += samples[j] * noteGain;
        }
      }
    }
  }

  // Final normalization
  let maxAmp = 0;
  for (let i = 0; i < mixBuffer.length; i++) {
    maxAmp = Math.max(maxAmp, Math.abs(mixBuffer[i]));
  }
  if (maxAmp > 0) {
    const scale = 0.5 / maxAmp;
    for (let i = 0; i < mixBuffer.length; i++) {
      mixBuffer[i] *= scale;
    }
  }

  // Create audio buffer and play
  const audioBuffer = ctx.createBuffer(1, mixBuffer.length, sampleRate);
  audioBuffer.getChannelData(0).set(mixBuffer);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true; // Loop indefinitely
  source.connect(ctx.destination);
  
  // Start with offset if provided to maintain loop position
  source.start(0, startOffset % audioBuffer.duration);

  previewState.playingSource = source;
  previewState.isPlaying = true;
  previewState.bufferDuration = audioBuffer.duration;
  // Calculate when the loop effectively started to track position for future updates
  previewState.startTime = ctx.currentTime - (startOffset % audioBuffer.duration);

  startPlayhead({
    ctx,
    secondsPerStep,
    totalSteps,
  });

  // Update button state
  updatePreviewUI();
  
  // No onended handler needed for looping, as it stops only on manual stop()

  console.log(`[Tracker] Preview playing loop (${totalSteps} steps @ ${BPM} BPM)`);
}

/**
 * Stop preview playback
 */
function stopPreview() {
  if (previewState.playingSource) {
    try {
      previewState.playingSource.stop();
    } catch (e) {
      // Already stopped
    }
    previewState.playingSource = null;
  }
  stopPlayhead();
  previewState.isPlaying = false;
  updatePreviewUI();
}

export function stopTrackerPreviewPlayback() {
  stopPreview();
}

function stopPlayhead() {
  if (previewState.playheadRafId != null) {
    cancelAnimationFrame(previewState.playheadRafId);
    previewState.playheadRafId = null;
  }
  setPlayingStep(null);
}

function startPlayhead({ ctx, secondsPerStep, totalSteps }) {
  stopPlayhead();

  const tick = () => {
    if (!previewState.isPlaying || previewState.startTime == null) return;

    const elapsed = ctx.currentTime - previewState.startTime;
    const step = Math.floor(elapsed / secondsPerStep) % totalSteps;

    if (step !== previewState.playingStep) {
      if (stepHasPlayableNote(step)) {
        setPlayingStep(step);
      } else {
        setPlayingStep(null);
      }
    }

    previewState.playheadRafId = requestAnimationFrame(tick);
  };

  previewState.playheadRafId = requestAnimationFrame(tick);
}

function stepHasPlayableNote(step) {
  for (let ch = 0; ch < state.channels; ch++) {
    const instrumentId = state.channelInstruments[ch];
    if (!instrumentId) continue;
    const note = state.grid[ch][step]?.note;
    if (!note) continue;
    if (note === '-' || note === '~') continue;
    return true;
  }
  return false;
}

function setPlayingStep(step) {
  const prev = previewState.playingStep;
  if (prev != null) {
    document.querySelectorAll(`.tracker-cell[data-step="${prev}"]`).forEach(el => {
      el.classList.remove('playing-step');
    });
  }

  previewState.playingStep = step;

  if (step == null) return;

  document.querySelectorAll(`.tracker-cell[data-step="${step}"]`).forEach(el => {
    el.classList.add('playing-step');
  });
}

/**
 * Update preview button UI based on playback state
 */
function updatePreviewUI() {
  if (!elements.previewBtn) return;

  if (previewState.isPlaying) {
    elements.previewBtn.innerHTML = '<i data-lucide="square" class="w-5 h-5 fill-current"></i>';
  } else {
    elements.previewBtn.innerHTML = '<i data-lucide="play" class="w-5 h-5 fill-current"></i>';
  }
  elements.previewBtn.style.color = '#eee';

  createIcons({ icons });
}

/**
 * Play a one-shot preview of a tracker state (no looping)
 */
export function previewTrackerStateOnce(trackerState, instrumentList, bpm = 120) {
  if (!trackerState || !instrumentList) return;

  stopPreview();

  if (!previewState.audioContext) {
    previewState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  const ctx = previewState.audioContext;
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const rendered = renderTrackerStateToMixBuffer(trackerState, instrumentList, bpm, { tailSeconds: 1 });
  if (!rendered) return;

  const { mixBuffer, sampleRate } = rendered;
  playMixBuffer(mixBuffer, sampleRate);
}

function playMixBuffer(mixBuffer, sampleRate) {
  if (!mixBuffer || mixBuffer.length === 0) return;

  if (!previewState.audioContext) {
    previewState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  const ctx = previewState.audioContext;
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const audioBuffer = ctx.createBuffer(1, mixBuffer.length, sampleRate);
  audioBuffer.getChannelData(0).set(mixBuffer);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = false;
  source.connect(ctx.destination);
  source.start(0);

  previewState.playingSource = source;
  previewState.isPlaying = true;
  previewState.bufferDuration = audioBuffer.duration;
  previewState.startTime = ctx.currentTime;
  updatePreviewUI();

  source.onended = () => {
    if (previewState.playingSource === source) {
      previewState.playingSource = null;
      previewState.isPlaying = false;
      updatePreviewUI();
    }
  };
}

function renderTrackerStateToMixBuffer(trackerState, instrumentList, bpm, { tailSeconds = 0 } = {}) {
  const channels = trackerState.channels || (Array.isArray(trackerState.grid) ? trackerState.grid.length : 0);
  const steps = trackerState.steps || (Array.isArray(trackerState.grid?.[0]) ? trackerState.grid[0].length : 0);
  const grid = trackerState.grid || [];
  const channelInstruments = Array.isArray(trackerState.channelInstruments) ? trackerState.channelInstruments : [];
  const repsGrid = Array.isArray(trackerState.reps) ? trackerState.reps : [];
  const ndGrid = Array.isArray(trackerState.nd) ? trackerState.nd : [];
  const volGrid = Array.isArray(trackerState.vol) ? trackerState.vol : [];

  const hasContent = grid.some((channel, ch) => {
    const instId = channelInstruments[ch];
    if (!instId) return false;
    return Array.isArray(channel) && channel.some(note => note && note !== '~' && note !== '-');
  });
  if (!hasContent) return;

  const secondsPerBeat = 60 / bpm;
  const secondsPerStep = secondsPerBeat / 4; // 16th notes
  const sampleRate = 44100;
  const samplesPerStep = Math.floor(secondsPerStep * sampleRate);
  const tailSamples = Math.floor(sampleRate * Math.max(0, tailSeconds));
  const mainSamples = Math.ceil(steps * samplesPerStep);
  const patternSamples = mainSamples + tailSamples;
  const mixBuffer = new Float32Array(patternSamples);

  const noteToFreq = (noteStr) => {
    if (!noteStr || noteStr === '~' || noteStr === '-') return null;
    
    const noteMap = {
      'c': 0, 'c#': 1, 'd': 2, 'd#': 3, 'e': 4, 'f': 5,
      'f#': 6, 'g': 7, 'g#': 8, 'a': 9, 'a#': 10, 'b': 11
    };
    
    const match = noteStr.match(/^([a-g]#?)(\d)$/i);
    if (!match) return null;
    
    const noteName = match[1].toLowerCase();
    const octave = parseInt(match[2], 10);
    
    const noteOffset = noteMap[noteName];
    if (noteOffset === undefined) return null;
    
    const midiNote = (octave + 1) * 12 + noteOffset;
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  };

  const instrumentById = new Map(instrumentList.map(inst => [inst.id, inst]));
  let mixedNotes = 0;

  for (let ch = 0; ch < channels; ch++) {
    const instrumentId = channelInstruments[ch];
    if (!instrumentId) continue;

    const instrument = instrumentById.get(instrumentId);
    if (!instrument || !instrument.params) continue;

    const baseParams = instrument.params;
    const channel = grid[ch] || [];

    for (let step = 0; step < steps; step++) {
      const note = channel[step];
      const freq = noteToFreq(note);
      if (freq === null) continue;

      const p = [...baseParams];
      while (p.length < 21) p.push(0);

      p[2] = freq;

      const intendedVol = p[0] !== undefined ? p[0] : 1;
      p[0] = 1;

      let samples;
      try {
        samples = zzfxG(...p);
      } catch (err) {
        console.error(`[Tracker] Failed to generate sound for ${instrumentId}:`, err);
        continue;
      }

      if (!samples || samples.length === 0) continue;

      let maxAmp = 0;
      for (let i = 0; i < samples.length; i++) {
        const abs = Math.abs(samples[i]);
        if (abs > maxAmp) maxAmp = abs;
      }
      if (maxAmp > 0) {
        const scale = (0.5 / maxAmp) * intendedVol;
        for (let i = 0; i < samples.length; i++) {
          samples[i] *= scale;
        }
      }

      const repsVal = repsGrid[ch]?.[step];
      const ndVal = ndGrid[ch]?.[step];
      const volVal = volGrid[ch]?.[step];
      const { reps, delaySteps, substepCount } = resolveSubsteps(repsVal, ndVal);
      const noteGain = Number.isInteger(volVal) ? Math.min(Math.max(volVal, 1), 99) / 99 : 1;
      const stepSize = substepCount / reps;
      for (let r = 0; r < reps; r++) {
        const subOffset = Math.floor(samplesPerStep * ((delaySteps + r * stepSize) / substepCount));
        const noteStart = step * samplesPerStep + subOffset;
        for (let j = 0; j < samples.length; j++) {
          const bufferIndex = noteStart + j;
          if (bufferIndex >= mixBuffer.length) break;
          mixBuffer[bufferIndex] += samples[j] * noteGain;
        }
      }
      mixedNotes++;
    }
  }

  if (mixedNotes === 0) {
    console.warn('[Tracker] Render produced silence (no matching instruments?).');
    return null;
  }

  let maxAmp = 0;
  for (let i = 0; i < mixBuffer.length; i++) {
    maxAmp = Math.max(maxAmp, Math.abs(mixBuffer[i]));
  }
  if (maxAmp > 0) {
    const scale = 0.5 / maxAmp;
    for (let i = 0; i < mixBuffer.length; i++) {
      mixBuffer[i] *= scale;
    }
  }

  return { mixBuffer, sampleRate, samplesPerStep, mainSamples };
}

export function previewArrangementStateOnce(arrangementState, trackerStateByFilename, instrumentList, bpm = 120) {
  if (!arrangementState || !instrumentList) return;

  stopPreview();

  const secondsPerBeat = 60 / bpm;
  const secondsPerStep = secondsPerBeat / 4; // 16th notes
  const sampleRate = 44100;
  const samplesPerStep = Math.floor(secondsPerStep * sampleRate);

  const rows = Array.isArray(arrangementState.rows) ? arrangementState.rows : [];
  if (!rows.length) return;

  // Strudel's arrange() treats the first number as the number of cycles the section lasts for.
  // In our tracker, 1 cycle == 16 steps (16th notes).
  const rowDescriptors = rows.map(r => {
    const cycles = Number.isInteger(r?.repeats) ? Math.min(Math.max(r.repeats, 1), 99) : 1;
    const files = Array.isArray(r?.blocks) ? r.blocks.filter(Boolean) : [];
    const states = files.map(f => trackerStateByFilename?.[f]).filter(Boolean);
    return { cycles, files, states };
  });

  const totalCycles = rowDescriptors.reduce((sum, r) => sum + r.cycles, 0);
  if (!totalCycles) return;

  const tailSamples = sampleRate; // 1 second tail at end
  const totalSamples = totalCycles * 16 * samplesPerStep + tailSamples;
  const mixBuffer = new Float32Array(totalSamples);

  let writeOffset = 0;
  let anyMixed = false;
  for (const row of rowDescriptors) {
    const rowMainSamples = row.cycles * 16 * samplesPerStep;
    const rowMix = new Float32Array(rowMainSamples + tailSamples);

    // Mix stacked blocks for this row
    for (const state of row.states) {
      const srcChannels = Number.isInteger(state?.channels)
        ? state.channels
        : (Array.isArray(state?.grid) ? state.grid.length : 0);
      const srcSteps = Number.isInteger(state?.steps)
        ? state.steps
        : (Array.isArray(state?.grid?.[0]) ? state.grid[0].length : 0);
      if (!srcChannels || !srcSteps) continue;

      const rowSteps = row.cycles * 16;
      const expandOrSlice = (src) => {
        if (!Array.isArray(src)) return null;
        const out = new Array(rowSteps);
        for (let i = 0; i < rowSteps; i++) {
          out[i] = src[i % srcSteps] ?? null;
        }
        return out;
      };

      const renderState = {
        version: 1,
        channels: srcChannels,
        steps: rowSteps,
        bpm,
        grid: Array.from({ length: srcChannels }, (_, ch) => expandOrSlice(state.grid?.[ch]) || Array.from({ length: rowSteps }, () => null)),
        vol: Array.from({ length: srcChannels }, (_, ch) => expandOrSlice(state.vol?.[ch]) || Array.from({ length: rowSteps }, () => null)),
        reps: Array.from({ length: srcChannels }, (_, ch) => expandOrSlice(state.reps?.[ch]) || Array.from({ length: rowSteps }, () => null)),
        nd: Array.from({ length: srcChannels }, (_, ch) => expandOrSlice(state.nd?.[ch]) || Array.from({ length: rowSteps }, () => null)),
        channelInstruments: Array.isArray(state.channelInstruments)
          ? state.channelInstruments.slice(0, srcChannels)
          : Array.from({ length: srcChannels }, () => ''),
      };

      const rendered = renderTrackerStateToMixBuffer(renderState, instrumentList, bpm, { tailSeconds: 1 });
      if (!rendered?.mixBuffer) continue;
      const blockBuf = rendered.mixBuffer;
      for (let i = 0; i < rowMainSamples; i++) {
        if (i >= blockBuf.length) break;
        rowMix[i] += blockBuf[i];
      }
      for (let t = 0; t < tailSamples; t++) {
        const srcIdx = rowMainSamples + t;
        if (srcIdx >= blockBuf.length) break;
        const fade = 1 - (t / tailSamples);
        rowMix[rowMainSamples + t] += blockBuf[srcIdx] * fade;
      }

      anyMixed = true;
    }

    // Overlap-add into the global buffer so the tail can ring over into the next row.
    for (let i = 0; i < rowMix.length; i++) {
      const dst = writeOffset + i;
      if (dst >= mixBuffer.length) break;
      mixBuffer[dst] += rowMix[i];
    }
    writeOffset += rowMainSamples;
  }

  let maxAmp = 0;
  for (let i = 0; i < mixBuffer.length; i++) {
    maxAmp = Math.max(maxAmp, Math.abs(mixBuffer[i]));
  }
  if (!anyMixed || maxAmp === 0) {
    console.warn('[Arranger] Preview produced silence. Check block trackerState instruments match current instruments.');
    return;
  }
  if (maxAmp > 0) {
    const scale = 0.5 / maxAmp;
    for (let i = 0; i < mixBuffer.length; i++) {
      mixBuffer[i] *= scale;
    }
  }

  playMixBuffer(mixBuffer, sampleRate);
}

/**
 * Open the tracker modal
 */
export function openTracker(instrumentList) {
  // Reset edit mode
  resetEditMode();
  
  // Enable editing for new blocks so we can save them
  editMode.isEditing = true;
  editMode.isNewBlock = true;
  editMode.returnToBlocksOnClose = true;
  editMode.blockScope = 'user';
  state.bpm = 120;
  setSteps(16);
  
  // Update UI (save button will be visible now)
  updateEditModeUI();
  
  if (instrumentList) {
    state.instruments = instrumentList;
    renderGrid();
  }

  elements.modal?.classList.add('open');
  
  // Focus first cell
  setFocus(0, 0);
}

/**
 * Open the tracker modal in edit mode for an existing block
 */
export function openTrackerForEdit(instrumentList, blockData) {
  // Set edit mode
  editMode.isEditing = true;
  editMode.isNewBlock = false;
  editMode.returnToBlocksOnClose = true;
  editMode.blockFilename = blockData.filename;
  editMode.blockName = blockData.name;
  editMode.blockDescription = blockData.description;
  editMode.blockScope = blockData.scope === 'example' ? 'example' : 'user';
  
  // Update UI for edit mode
  updateEditModeUI();
  
  // Clear and reset state first
  clearAll();
  
  // Load tracker state if available
  if (blockData.trackerState) {
    deserializeTrackerState(blockData.trackerState);
  }
  
  if (instrumentList) {
    state.instruments = instrumentList;
    renderGrid();
  }

  elements.modal?.classList.add('open');
  
  // Focus first cell
  setFocus(0, 0);
}

/**
 * Reset edit mode state
 */
function resetEditMode() {
  editMode.isEditing = false;
  editMode.isNewBlock = false;
  editMode.blockFilename = null;
  editMode.blockName = null;
  editMode.blockDescription = null;
  editMode.blockScope = 'user';
  editMode.onSave = null;
  editMode.returnToBlocksOnClose = false;
}

/**
 * Update UI based on edit mode state
 */
function updateEditModeUI() {
  // Update title
  if (elements.title) {
    if (editMode.isEditing) {
      elements.title.textContent = editMode.isNewBlock 
        ? 'Block - New Block' 
        : `Block: ${editMode.blockName}`;
    } else { // Should not happen if saving is enabled, but fallback
      elements.title.textContent = 'Tracker';
    }
  }
  
  // Show/hide block properties (name input)
  if (elements.blockProps) {
    if (editMode.isEditing) {
      elements.blockProps.classList.remove('hidden');
      if (elements.blockNameInput) {
        elements.blockNameInput.value = editMode.blockName || '';
      }
      if (elements.blockBpmInput) {
        elements.blockBpmInput.value = String(state.bpm || 120);
      }
      if (elements.blockRowsPreset && elements.blockRowsCustom) {
        const preset = (state.steps === 16 || state.steps === 32 || state.steps === 64) ? String(state.steps) : 'custom';
        elements.blockRowsPreset.value = preset;
        if (preset === 'custom') {
          elements.blockRowsCustom.classList.remove('hidden');
          elements.blockRowsCustom.value = String(state.steps);
        } else {
          elements.blockRowsCustom.classList.add('hidden');
        }
      }
    } else {
      elements.blockProps.classList.add('hidden');
    }

    // Ensure icons render when the block props row is revealed.
    createIcons({ icons });
  }

  if (elements.blockAdvancedSettingsBtn) {
    const shouldShow = editMode.isEditing && isDeveloperModeEnabled() && !DEMO_MODE;
    elements.blockAdvancedSettingsBtn.classList.toggle('dev-only-hidden', !shouldShow);
  }
  
  // Show/hide save button
  if (elements.saveBtn) {
    if (editMode.isEditing) {
      elements.saveBtn.classList.remove('hidden');
    } else {
      elements.saveBtn.classList.add('hidden');
    }
  }
}

/**
 * Handle save button click in edit mode
 */
function handleSaveBlock() {
  if (!editMode.isEditing) return;
  
  // Get and validate name
  let name = editMode.blockName;
  if (elements.blockNameInput) {
    name = elements.blockNameInput.value.trim();
    if (!name) {
      alert("Please enter a block name.");
      elements.blockNameInput.focus();
      return;
    }
  }
  
  const trackerState = serializeTrackerState();
  const pattern = elements.output?.value || '';
  
  // Dispatch event for the app to handle saving
  const event = new CustomEvent('tracker:saveBlock', {
    detail: {
      isNewBlock: editMode.isNewBlock,
      filename: editMode.blockFilename,
      name: name,
      description: editMode.blockDescription,
      scope: editMode.blockScope,
      pattern,
      trackerState,
    }
  });
  document.dispatchEvent(event);
}

/**
 * Close the tracker modal
 */
export function closeTracker() {
  const shouldReturnToBlocks = !!editMode.returnToBlocksOnClose;
  // Stop any playing preview
  stopPreview();
  
  elements.modal?.classList.remove('open');
  
  // Reset edit mode when closing
  resetEditMode();
  updateEditModeUI();

  document.dispatchEvent(new CustomEvent('tracker:closed', { detail: { returnToBlocksOnClose: shouldReturnToBlocks } }));
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
  const volData = state.grid.map(channel =>
    channel.map(cell => (cell.vol ? cell.vol : null))
  );
  const repsData = state.grid.map(channel =>
    channel.map(cell => (cell.reps ? cell.reps : null))
  );
  const ndData = state.grid.map(channel =>
    channel.map(cell => (Number.isInteger(cell.nd) ? cell.nd : null))
  );

  return {
    version: 1,
    channels: state.channels,
    steps: state.steps,
    bpm: state.bpm,
    grid: gridData,
    vol: volData,
    reps: repsData,
    nd: ndData,
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
    const nextSteps = Number.isInteger(data.steps) ? Math.min(Math.max(data.steps, 1), 256) : state.steps;
    state.steps = nextSteps;
    initGrid();

    // Validate grid dimensions
    if (!Array.isArray(data.grid) || data.grid.length !== state.channels) {
      console.warn('[Tracker] Grid dimension mismatch');
      return false;
    }

    // Load grid data
    for (let ch = 0; ch < state.channels; ch++) {
      const chNotes = Array.isArray(data.grid[ch]) ? data.grid[ch] : [];
      const chVol = Array.isArray(data.vol?.[ch]) ? data.vol[ch] : [];
      const chReps = Array.isArray(data.reps?.[ch]) ? data.reps[ch] : [];
      const chNd = Array.isArray(data.nd?.[ch]) ? data.nd[ch] : [];
      for (let step = 0; step < state.steps; step++) {
        state.grid[ch][step].note = chNotes[step] || null;
        if (chVol.length) {
          const volVal = chVol[step];
          state.grid[ch][step].vol = volVal ? volVal : null;
        } else {
          state.grid[ch][step].vol = null;
        }
        if (chReps.length) {
          const repsVal = chReps[step];
          state.grid[ch][step].reps = repsVal ? repsVal : null;
        } else {
          state.grid[ch][step].reps = null;
        }
        if (chNd.length) {
          const ndVal = chNd[step];
          state.grid[ch][step].nd = Number.isInteger(ndVal) ? ndVal : null;
        } else {
          state.grid[ch][step].nd = null;
        }
      }
    }

    // Load instrument assignments
    if (data.channelInstruments && Array.isArray(data.channelInstruments)) {
      state.channelInstruments = data.channelInstruments.slice(0, state.channels);
    }
    state.bpm = Number.isFinite(data.bpm) ? data.bpm : 120;
    if (elements.blockBpmInput) {
      elements.blockBpmInput.value = String(state.bpm);
    }
    if (elements.blockRowsPreset && elements.blockRowsCustom) {
      const preset = (state.steps === 16 || state.steps === 32 || state.steps === 64) ? String(state.steps) : 'custom';
      elements.blockRowsPreset.value = preset;
      if (preset === 'custom') {
        elements.blockRowsCustom.classList.remove('hidden');
        elements.blockRowsCustom.value = String(state.steps);
      } else {
        elements.blockRowsCustom.classList.add('hidden');
      }
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
