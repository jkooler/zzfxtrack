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
import { getAudioContext } from '@strudel/webaudio';
import { getVisualizerAnalyser } from './visualizer.js';
import { dbToGain, sanitizePlaybackMixSettings, softClipSample } from './mix-settings.js';

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
  // Upper row continuation (C5 - E5)
  'i': 'c5',
  '9': 'c#5',
  'o': 'd5',
  '0': 'd#5',
  'p': 'e5',
};

// Reverse mapping for display
const NOTE_TO_KEY = Object.fromEntries(
  Object.entries(KEYBOARD_MAP).map(([k, v]) => [v, k])
);

/** Ordered list for note-cell scrub: empty, rest, then C0..B8 (matches noteToFreq format). */
const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const SCRUB_NOTE_VALUES = (() => {
  const list = [null, '-'];
  for (let oct = 0; oct <= 8; oct++) {
    for (const name of NOTE_NAMES) list.push(name + oct);
  }
  return list;
})();

/** Maximum number of channels; grid always has this many columns so reducing active channels keeps data. */
const MAX_CHANNELS = 8;

// Tracker state
const state = {
  /** Active channel count (1..MAX_CHANNELS); only this many are shown and played. */
  channels: 4,
  steps: 16,
  bpm: 120,
  grid: [], // Array of MAX_CHANNELS channels, each with array of { note, vol, reps, nd, active }
  instruments: [], // Available instruments
  channelInstruments: Array(MAX_CHANNELS).fill(''), // Selected instrument per channel
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
  autoSaveOnInput: false,
  returnToArrangementsOnClose: false,
  returnToBlocksOnClose: false,
  arrangementInsertRowIndex: null,
};

/** Snapshot of state when tracker was opened or last saved (for unsaved-changes detection) */
let lastSavedSnapshot = '';
/** When user reduces step count, we keep previous grids keyed by step count so restoring any count is non-destructive (preset or custom). */
const gridBackupsBySteps = new Map(); // stepCount -> grid (deep copy)
/** Per-block scroll position and focused cell (filename -> { scrollTop, channel, step }). */
const blockScrollPositions = new Map();

// Preview playback state
let previewState = {
  audioContext: null,
  playingSource: null,
  isPlaying: false,
  playheadRafId: null,
  playingStep: null,
  instrumentSignature: '',
};

const arrangementPreviewState = {
  audioContext: null,
  playingSource: null,
  playingSources: [],
  isPlaying: false,
  bufferDuration: 0,
  loopDuration: 0,
  startTime: null,
  nextStartTime: null,
  schedulerId: null,
  audioBuffer: null,
  secondsPerStep: 0,
  totalSteps: 0,
  rowBounds: [],
  playheadRafId: null,
  playingRowIndex: null,
  playingRowProgress: null,
  arrangementState: null,
  trackerStateByFilename: null,
  instrumentList: null,
  bpm: 120,
  mixSettings: sanitizePlaybackMixSettings(),
  overridesByFilename: new Map(),
  overridesByRowIndex: new Map(),
  pendingUpdate: null,
};

function ensureArrangementAudioContext() {
  if (!arrangementPreviewState.audioContext) {
    arrangementPreviewState.audioContext = getAudioContext();
  }
  const ctx = arrangementPreviewState.audioContext;
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function primePreviewAudioContext() {
  if (!previewState.audioContext) {
    previewState.audioContext = getAudioContext();
  }
  const ctx = previewState.audioContext;
  if (ctx && ctx.state === 'suspended') {
    // Fire-and-forget; callers invoke this from a user gesture handler.
    ctx.resume().catch(() => {});
  }
  if (arrangementPreviewState.audioContext) {
    const arrangementCtx = arrangementPreviewState.audioContext;
    if (arrangementCtx && arrangementCtx.state === 'suspended') {
      arrangementCtx.resume().catch(() => {});
    }
  }
}

let octaveOffset = 0;
let effectPreviewTimeout = null;
let effectPreviewRequest = null;
/** Ignore preview start within this ms of modal open to avoid accidental first-note play */
const TRACKER_OPEN_PREVIEW_GUARD_MS = 250;
let trackerModalOpenedAt = 0;
const EFFECT_PREVIEW_DEBOUNCE_MS = 150;
/** Debounce (ms) before playing a note while scrubbing the note cell. */
const NOTE_SCRUB_PREVIEW_DEBOUNCE_MS = 80;
const TRACKER_NOTE_PREVIEW_GAIN = 0.8;
const TRACKER_NOTE_PREVIEW_DUCKED_GAIN = 0.35;
let liveArrangementUpdateTimeout = null;

// DOM Elements
let elements = {};

/**
 * Initialize the tracker
 */
export function initTracker(instrumentList) {
  state.instruments = instrumentList || [];
  initGrid();
  cacheElements();
  setupNotationSection();
  renderGrid();
  setupEventListeners();
  updateOutput();
}

/**
 * Initialize the grid data structure (always MAX_CHANNELS columns; state.channels is active count).
 */
function initGrid() {
  state.grid = Array(MAX_CHANNELS).fill(null).map(() =>
    Array(state.steps).fill(null).map(() => ({
      note: null,
      vol: null,
      reps: null,
      nd: null,
      active: false,
    }))
  );
  while (state.channelInstruments.length < MAX_CHANNELS) {
    state.channelInstruments.push('');
  }
  state.channelInstruments = state.channelInstruments.slice(0, MAX_CHANNELS);
}

/** Deep-copy grid so we can store/restore it without sharing references. */
function deepCopyGrid(grid) {
  if (!Array.isArray(grid)) return [];
  return grid.map((channel) => {
    if (!Array.isArray(channel)) return [];
    return channel.map((cell) =>
      cell
        ? {
            note: cell.note ?? null,
            vol: cell.vol ?? null,
            reps: cell.reps ?? null,
            nd: cell.nd ?? null,
            active: false,
          }
        : { note: null, vol: null, reps: null, nd: null, active: false }
    );
  });
}

function setSteps(nextSteps, options = {}) {
  const desired = parseInt(nextSteps, 10);
  if (Number.isNaN(desired)) return;
  const clamped = Math.min(Math.max(desired, 1), 256);
  if (clamped === state.steps) return;

  const prevGrid = state.grid;
  const isReducing = clamped < state.steps;
  const isIncreasing = clamped > state.steps;

  if (isReducing) {
    gridBackupsBySteps.set(state.steps, deepCopyGrid(state.grid));
  }

  const backupGrid = gridBackupsBySteps.get(clamped);
  if (isIncreasing && backupGrid) {
    state.steps = clamped;
    state.grid = deepCopyGrid(backupGrid);
    gridBackupsBySteps.delete(clamped);

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
    if (!options.skipFocus) focusNoteCell(state.focusedChannel, state.focusedStep);
    return;
  }

  state.steps = clamped;

  state.grid = Array(MAX_CHANNELS).fill(null).map((_, ch) =>
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

  if (!options.skipFocus) focusNoteCell(state.focusedChannel, state.focusedStep);
}

/**
 * Set active channel count (1..MAX_CHANNELS). Grid data for all columns is preserved.
 */
function setChannels(n) {
  const next = Math.min(MAX_CHANNELS, Math.max(1, Number(n) | 0));
  if (next === state.channels) return;
  state.channels = next;
  state.focusedChannel = Math.min(state.focusedChannel, state.channels - 1);
  renderGrid();
  updateOutput();
  syncChannelsUI();
}

function syncChannelsUI() {
  if (!elements.blockChannels) return;
  elements.blockChannels.value = String(state.channels);
}

function cancelEffectPreview() {
  if (effectPreviewTimeout) {
    clearTimeout(effectPreviewTimeout);
    effectPreviewTimeout = null;
  }
  effectPreviewRequest = null;
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
    notationToggle: document.getElementById('trackerNotationToggle'),
    notationContent: document.getElementById('trackerNotationContent'),
    closeBtn: document.getElementById('closeTrackerBtn'),
    clearBtn: document.getElementById('clearTrackerBtn'),
    copyBtn: document.getElementById('copyTrackerBtn'),
    saveBtn: document.getElementById('saveTrackerBtn'),
    previewBtn: document.getElementById('previewTrackerBtn'),
    blockPropsRow1: document.getElementById('trackerBlockPropsRow1'),
    blockPropsRow2: document.getElementById('trackerBlockPropsRow2'),
    blockNameInput: document.getElementById('trackerBlockName'),
    blockBpmInput: document.getElementById('trackerBlockBpm'),
    blockRowsPreset: document.getElementById('trackerBlockRowsPreset'),
    blockRowsCustom: document.getElementById('trackerBlockRowsCustom'),
    blockChannels: document.getElementById('trackerBlockChannels'),
    blockAdvancedSettingsBtn: document.getElementById('trackerBlockAdvancedSettingsBtn'),
    title: document.querySelector('#trackerModal h2'),
    clearConfirmModal: document.getElementById('clearTrackerConfirmModal'),
    clearConfirmCancel: document.getElementById('clearTrackerConfirmCancel'),
    clearConfirmOk: document.getElementById('clearTrackerConfirmOk'),
    unsavedConfirmModal: document.getElementById('trackerUnsavedConfirmModal'),
    unsavedCancel: document.getElementById('trackerUnsavedCancel'),
    unsavedDontSave: document.getElementById('trackerUnsavedDontSave'),
    unsavedSave: document.getElementById('trackerUnsavedSave'),
  };
}

/**
 * Set up the expandable Generated Mini-Notation section (collapsed by default).
 */
function setupNotationSection() {
  const toggle = elements.notationToggle;
  const content = elements.notationContent;
  if (!toggle || !content) return;

  const setExpanded = (expanded) => {
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.classList.toggle('tracker-notation-expanded', expanded);
    content.classList.toggle('hidden', !expanded);
  };

  setExpanded(false);

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    setExpanded(!expanded);
  });
}

/**
 * Measure horizontal scrollbar height in pixels for the current OS/browser (so time track viewport can match channels body).
 * @returns {number}
 */
function getHorizontalScrollbarHeightPx() {
  const outer = document.createElement('div');
  outer.style.cssText = 'position:absolute;left:-9999px;overflow-x:scroll;overflow-y:hidden;width:100px;height:100px;visibility:hidden';
  const inner = document.createElement('div');
  inner.style.width = '200px';
  inner.style.height = '100px';
  outer.appendChild(inner);
  document.body.appendChild(outer);
  const height = outer.offsetHeight - outer.clientHeight;
  document.body.removeChild(outer);
  return Math.max(0, height);
}

/**
 * Measure vertical scrollbar width in pixels for the current OS/browser (so channel headers viewport can match channels body).
 * @returns {number}
 */
function getVerticalScrollbarWidthPx() {
  const outer = document.createElement('div');
  outer.style.cssText = 'position:absolute;left:-9999px;overflow-x:hidden;overflow-y:scroll;width:100px;height:100px;visibility:hidden';
  const inner = document.createElement('div');
  inner.style.width = '100px';
  inner.style.height = '200px';
  outer.appendChild(inner);
  document.body.appendChild(outer);
  const width = outer.offsetWidth - outer.clientWidth;
  document.body.removeChild(outer);
  return Math.max(0, width);
}

/**
 * Render the tracker grid
 */
function renderGrid() {
  if (!elements.grid) return;

  elements.grid.dataset.channels = String(state.channels);
  elements.grid.innerHTML = '';

  // ---- Headers row: time track (fixed) + channel headers in their own horizontal scroll ----
  const headersRow = document.createElement('div');
  headersRow.className = 'tracker-headers';

  const timeTrackHeaderEl = document.createElement('div');
  timeTrackHeaderEl.className = 'tracker-timetrack-header';

  const timeTrackSelectSpacer = document.createElement('div');
  timeTrackSelectSpacer.className = 'tracker-timetrack-select-spacer';

  timeTrackHeaderEl.appendChild(timeTrackSelectSpacer);
  headersRow.appendChild(timeTrackHeaderEl);

  const channelsHeaderScroll = document.createElement('div');
  channelsHeaderScroll.className = 'tracker-channels-header-scroll';

  const channelsHeaderInner = document.createElement('div');
  channelsHeaderInner.className = 'tracker-headers tracker-channels-header-inner';

  for (let ch = 0; ch < state.channels; ch++) {
    const headerEl = document.createElement('div');
    headerEl.className = 'tracker-channel-header';

    const selectEl = document.createElement('select');
    selectEl.className = 'tracker-channel-select';
    selectEl.dataset.channel = ch;
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Select instrument...';
    selectEl.appendChild(defaultOpt);
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

    headerEl.appendChild(headerRowEl);
    channelsHeaderInner.appendChild(headerEl);
  }

  channelsHeaderScroll.appendChild(channelsHeaderInner);
  headersRow.appendChild(channelsHeaderScroll);

  elements.grid.appendChild(headersRow);

  // ---- Body row: time track column (fixed) + channels body (horizontal + vertical scroll) ----
  const bodyRow = document.createElement('div');
  bodyRow.className = 'tracker-body-row';

  const timeTrackCol = document.createElement('div');
  timeTrackCol.className = 'tracker-timetrack-col';

  const timeTrackScroll = document.createElement('div');
  timeTrackScroll.className = 'tracker-timetrack-scroll';

  // Time track column (row numbers)
  const timeTrackEl = document.createElement('div');
  timeTrackEl.className = 'tracker-timetrack';

  for (let step = 0; step < state.steps; step++) {
    const stepEl = document.createElement('div');
    stepEl.className = 'tracker-timetrack-row';
    stepEl.dataset.step = step;
    stepEl.textContent = String(step + 1);
    if (step % 4 === 0) stepEl.classList.add('beat');
    if (step === state.focusedStep) stepEl.classList.add('active');
    stepEl.addEventListener('click', () => setFocus(state.focusedChannel, step));
    timeTrackEl.appendChild(stepEl);
  }

  timeTrackScroll.appendChild(timeTrackEl);
  timeTrackCol.appendChild(timeTrackScroll);
  bodyRow.appendChild(timeTrackCol);

  const channelsScroll = document.createElement('div');
  channelsScroll.className = 'tracker-channels-scroll tracker-body-scroll';

  const gridBody = document.createElement('div');
  gridBody.className = 'tracker-grid-body';
  for (let ch = 0; ch < state.channels; ch++) {
    const channelEl = document.createElement('div');
    channelEl.className = 'tracker-channel';
    channelEl.dataset.channel = ch;

    for (let step = 0; step < state.steps; step++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'tracker-row';
      rowEl.dataset.step = step;
      rowEl.dataset.channel = ch;

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

      setupNoteCellScrub(cellEl, ch, step);

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

      setupScrubInteraction(repsEl, { sensitivity: 0.1 });

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

      setupScrubInteraction(ndEl, { sensitivity: 0.1 });

      rowEl.appendChild(cellEl);
      rowEl.appendChild(volEl);
      rowEl.appendChild(repsEl);
      rowEl.appendChild(ndEl);
      channelEl.appendChild(rowEl);
    }

    gridBody.appendChild(channelEl);
  }

  channelsScroll.appendChild(gridBody);
  bodyRow.appendChild(channelsScroll);
  elements.grid.appendChild(bodyRow);

  // Sync vertical scroll: time track column <-> channels body
  let scrollSyncLock = false;
  timeTrackScroll.addEventListener('scroll', () => {
    if (scrollSyncLock) return;
    scrollSyncLock = true;
    channelsScroll.scrollTop = timeTrackScroll.scrollTop;
    scrollSyncLock = false;
  });
  channelsScroll.addEventListener('scroll', () => {
    if (scrollSyncLock) return;
    scrollSyncLock = true;
    timeTrackScroll.scrollTop = channelsScroll.scrollTop;
    scrollSyncLock = false;
  });

  // Sync horizontal scroll: channel headers <-> channels body (so headers scroll when user scrolls tracker)
  let hScrollSyncLock = false;
  channelsHeaderScroll.addEventListener('scroll', () => {
    if (hScrollSyncLock) return;
    hScrollSyncLock = true;
    channelsScroll.scrollLeft = channelsHeaderScroll.scrollLeft;
    hScrollSyncLock = false;
  });
  channelsScroll.addEventListener('scroll', () => {
    if (hScrollSyncLock) return;
    hScrollSyncLock = true;
    channelsHeaderScroll.scrollLeft = channelsScroll.scrollLeft;
    hScrollSyncLock = false;
  });

  // Align header column widths to body columns (for 5+ channels with flex width)
  function syncHeaderWidths() {
    const bodyChannels = elements.grid?.querySelectorAll('.tracker-grid-body .tracker-channel');
    const headerCells = elements.grid?.querySelectorAll('.tracker-channels-header-inner .tracker-channel-header');
    if (!bodyChannels?.length || bodyChannels.length !== headerCells?.length) return;
    bodyChannels.forEach((col, i) => {
      const w = col.getBoundingClientRect().width;
      if (headerCells[i] && w > 0) headerCells[i].style.width = `${w}px`;
    });
  }
  requestAnimationFrame(() => syncHeaderWidths());
  const resizeObs = new ResizeObserver(() => syncHeaderWidths());
  if (gridBody) resizeObs.observe(gridBody);

  // Measure horizontal and vertical scrollbar sizes for this OS/browser and align viewports (row strip + channel headers)
  function applyScrollbarGutter() {
    const grid = elements.grid;
    if (!grid) return;
    grid.style.setProperty('--tracker-h-scrollbar-height', `${getHorizontalScrollbarHeightPx()}px`);
    grid.style.setProperty('--tracker-v-scrollbar-width', `${getVerticalScrollbarWidthPx()}px`);
  }
  requestAnimationFrame(() => applyScrollbarGutter());
  const scrollbarResizeObs = new ResizeObserver(() => applyScrollbarGutter());
  if (elements.grid) scrollbarResizeObs.observe(elements.grid);
}

/**
 * Set focus to a specific cell
 * @param {object} [options] - { scroll: false } to update focus/active without scrolling the view
 */
function setFocus(channel, step, options = {}) {
  const shouldScroll = options.scroll !== false;
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
    if (shouldScroll) {
      const bodyScroll = newCell.closest('.tracker-body-scroll');
      const timeTrackScroll = bodyScroll?.closest('.tracker-grid')?.querySelector('.tracker-timetrack-scroll');
      if (bodyScroll) {
        const bodyRect = bodyScroll.getBoundingClientRect();
        const cellRect = newCell.getBoundingClientRect();
        const cellAbove = cellRect.top < bodyRect.top;
        const cellBelow = cellRect.bottom > bodyRect.bottom;
        if (cellAbove || cellBelow) {
          const targetTop = cellBelow
            ? bodyScroll.scrollTop + (cellRect.bottom - bodyRect.bottom)
            : bodyScroll.scrollTop + (cellRect.top - bodyRect.top);
          const maxTop = Math.max(bodyScroll.scrollHeight - bodyScroll.clientHeight, 0);
          const clampedTop = Math.min(Math.max(targetTop, 0), maxTop);
          bodyScroll.scrollTop = clampedTop;
          if (timeTrackScroll) timeTrackScroll.scrollTop = clampedTop;
        }
      } else {
        newCell.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
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
  // Modal close button — show unsaved-changes dialog when needed
  elements.closeBtn?.addEventListener('click', requestCloseTracker);
  elements.unsavedCancel?.addEventListener('click', closeUnsavedConfirmModal);
  elements.unsavedDontSave?.addEventListener('click', () => {
    closeUnsavedConfirmModal();
    closeTracker();
  });
  elements.unsavedSave?.addEventListener('click', () => {
    closeUnsavedConfirmModal();
    handleSaveBlock();
  });
  elements.unsavedConfirmModal?.addEventListener('click', (e) => {
    if (e.target === elements.unsavedConfirmModal) closeUnsavedConfirmModal();
  });

  // Clear button — show confirmation dialog
  elements.clearBtn?.addEventListener('click', () => {
    elements.clearConfirmModal?.classList.add('open');
  });
  elements.clearConfirmCancel?.addEventListener('click', closeClearConfirmModal);
  elements.clearConfirmOk?.addEventListener('click', () => {
    closeClearConfirmModal();
    clearAll();
  });
  elements.clearConfirmModal?.addEventListener('click', (e) => {
    if (e.target === elements.clearConfirmModal) closeClearConfirmModal();
  });

  // Copy button
  elements.copyBtn?.addEventListener('click', copyToClipboard);

  // Save button (for edit mode)
  elements.saveBtn?.addEventListener('click', handleSaveBlock);

  // Preview button
  elements.previewBtn?.addEventListener('click', togglePreview);
  elements.blockAdvancedSettingsBtn?.addEventListener('click', () => {
    if (!editMode.isEditing) return;
    if (DEMO_MODE) return;
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
      scheduleArrangementLiveEditUpdate();
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
        scheduleArrangementLiveEditUpdate();
      }
    });

    setupScrubInteraction(elements.blockBpmInput);
  }

  if (elements.blockNameInput) {
    elements.blockNameInput.addEventListener('input', (e) => {
      editMode.blockName = e.target.value;
      scheduleArrangementLiveEditUpdate();
    });
    elements.blockNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        elements.blockNameInput.blur();
      }
    });
    elements.blockNameInput.addEventListener('blur', () => {
      const name = (elements.blockNameInput?.value ?? '').trim();
      if (name !== (editMode.blockName ?? '').trim()) {
        editMode.blockName = name || editMode.blockName;
      }
    });
  }

  if (elements.blockRowsPreset && elements.blockRowsCustom) {
    elements.blockRowsPreset.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        elements.blockRowsCustom.classList.remove('hidden');
        elements.blockRowsCustom.value = String(state.steps);
        elements.blockRowsCustom.focus();
      } else {
        elements.blockRowsCustom.classList.add('hidden');
        setSteps(val);
      }
    });

    // Commit custom row count only on blur or Enter — not on every keypress (avoids applying "1" while typing "16" and stealing focus)
    elements.blockRowsCustom.addEventListener('blur', (e) => {
      if (elements.blockRowsPreset.value !== 'custom') return;
      const raw = e.target.value.trim();
      if (!raw) {
        e.target.value = String(state.steps);
        return;
      }
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) {
        const clamped = Math.min(Math.max(parsed, 1), 256);
        if (clamped !== state.steps) setSteps(String(clamped), { skipFocus: true });
        e.target.value = String(state.steps);
      }
    });

    elements.blockRowsCustom.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || elements.blockRowsPreset.value !== 'custom') return;
      e.preventDefault();
      const raw = elements.blockRowsCustom.value.trim();
      if (!raw) return;
      const parsed = parseInt(raw, 10);
      if (Number.isNaN(parsed)) return;
      const clamped = Math.min(Math.max(parsed, 1), 256);
      elements.blockRowsCustom.value = String(clamped);
      setSteps(String(clamped));
      focusNoteCell(state.focusedChannel, state.focusedStep);
    });
  }

  if (elements.blockChannels) {
    elements.blockChannels.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) setChannels(Number(val));
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

  document.addEventListener('arrangements:playhead', (e) => {
    handleArrangementPlayheadForTracker(e?.detail || {});
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

  // Note-only octave shift (Impulse Tracker-style): affects only the focused note cell.
  // Does NOT change octaveOffset (used for note entry).
  if (key === ',' || key === '.') {
    const activeEl = document.activeElement;
    const isNoteCellFocused = Boolean(activeEl && activeEl.classList && activeEl.classList.contains('tracker-cell'));
    if (isNoteCellFocused) {
      e.preventDefault();
      const current = state.grid?.[state.focusedChannel]?.[state.focusedStep]?.note;
      if (typeof current === 'string' && current && current !== '-' && current !== '~') {
        const delta = key === ',' ? -1 : 1;
        const next = applyOctaveOffset(current, delta);
        if (next && next !== current) {
          setNote(state.focusedChannel, state.focusedStep, next);
          focusNoteCell(state.focusedChannel, state.focusedStep);
        }
      }
      return;
    }
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

  // Note cut (Impulse Tracker-style)
  if (key === '1') {
    e.preventDefault();
    setNote(state.focusedChannel, state.focusedStep, '-');
    const newStep = (state.focusedStep + 1) % state.steps;
    setFocus(state.focusedChannel, newStep);
    return;
  }

  const isInsertKey = key === 'insert'
    || key === 'ins'
    || e.code === 'Insert'
    || e.keyCode === 45
    || e.which === 45;
  if (isInsertKey) {
    e.preventDefault();
    const bodyScroll = elements.grid?.querySelector('.tracker-body-scroll');
    const timeTrackScrollEl = elements.grid?.querySelector('.tracker-timetrack-scroll');
    const savedScrollTop = bodyScroll ? bodyScroll.scrollTop : 0;
    const savedTimeTrackScrollTop = timeTrackScrollEl ? timeTrackScrollEl.scrollTop : 0;
    insertBlankRowAtStep(state.focusedChannel, state.focusedStep);
    setFocus(state.focusedChannel, state.focusedStep, { scroll: false });
    requestAnimationFrame(() => {
      const body = elements.grid?.querySelector('.tracker-body-scroll');
      const timeTrack = elements.grid?.querySelector('.tracker-timetrack-scroll');
      if (body) body.scrollTop = savedScrollTop;
      if (timeTrack) timeTrack.scrollTop = savedTimeTrackScrollTop;
    });
    return;
  }

  if (key === ' ') {
    e.preventDefault();
    setNote(state.focusedChannel, state.focusedStep, null);
    const newStep = Math.min(state.focusedStep + 1, state.steps - 1);
    setFocus(state.focusedChannel, newStep);
    return;
  }

  if (key === 'delete') {
    e.preventDefault();
    const bodyScroll = elements.grid?.querySelector('.tracker-body-scroll');
    const timeTrackScrollEl = elements.grid?.querySelector('.tracker-timetrack-scroll');
    const savedScrollTop = bodyScroll ? bodyScroll.scrollTop : 0;
    const savedTimeTrackScrollTop = timeTrackScrollEl ? timeTrackScrollEl.scrollTop : 0;
    if (state.focusedStep === 0) {
      setNote(state.focusedChannel, state.focusedStep, null);
      setFocus(state.focusedChannel, 0, { scroll: false });
    } else {
      shiftColumnUpFromStep(state.focusedChannel, state.focusedStep - 1);
      setFocus(state.focusedChannel, state.focusedStep, { scroll: false });
    }
    requestAnimationFrame(() => {
      const body = elements.grid?.querySelector('.tracker-body-scroll');
      const timeTrack = elements.grid?.querySelector('.tracker-timetrack-scroll');
      if (body) body.scrollTop = savedScrollTop;
      if (timeTrack) timeTrack.scrollTop = savedTimeTrackScrollTop;
    });
    return;
  }

  // Clear note
  if (key === 'backspace') {
    e.preventDefault();
    setNote(state.focusedChannel, state.focusedStep, null);
    setFocus(state.focusedChannel, state.focusedStep);
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
 * Enable drag-to-change (scrub) on a tracker note cell. Drag up = higher note, down = lower; includes empty and rest.
 */
function setupNoteCellScrub(cellEl, ch, step) {
  if (cellEl._noteScrubInitialized) return;
  cellEl._noteScrubInitialized = true;
  cellEl.classList.add('scrub-input');

  let startY = 0;
  let startIndex = 0;
  let lastAppliedIndex = -1;
  let isDragging = false;
  let scrubPreviewTimeout = null;
  const len = SCRUB_NOTE_VALUES.length;
  const sensitivity = 8; // pixels per step

  const getCurrentIndex = () => {
    const note = state.grid[ch][step].note;
    const idx = SCRUB_NOTE_VALUES.indexOf(note);
    return idx === -1 ? 0 : idx;
  };

  const applyDelta = (clientY) => {
    const deltaY = startY - clientY;
    const steps = Math.round(deltaY / sensitivity);
    const newIndex = Math.max(0, Math.min(len - 1, startIndex + steps));
    if (newIndex !== lastAppliedIndex) {
      lastAppliedIndex = newIndex;
      const note = SCRUB_NOTE_VALUES[newIndex];
      setNote(ch, step, note, { skipRender: true });
      cellEl.textContent = note === null ? '·' : note;
      cellEl.classList.toggle('has-note', note && note !== '-');
      cellEl.classList.toggle('rest', note === '-');
      if (note && note !== '-') {
        if (scrubPreviewTimeout) clearTimeout(scrubPreviewTimeout);
        scrubPreviewTimeout = setTimeout(() => {
          scrubPreviewTimeout = null;
          playNotePreview(ch, step, note);
        }, NOTE_SCRUB_PREVIEW_DEBOUNCE_MS);
      } else if (scrubPreviewTimeout) {
        clearTimeout(scrubPreviewTimeout);
        scrubPreviewTimeout = null;
      }
    }
  };

  const clearScrubPreview = () => {
    if (scrubPreviewTimeout) {
      clearTimeout(scrubPreviewTimeout);
      scrubPreviewTimeout = null;
    }
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    if (state.focusedChannel !== ch || state.focusedStep !== step) return;
    startY = e.clientY;
    startIndex = getCurrentIndex();
    lastAppliedIndex = startIndex;
    isDragging = false;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.body.classList.add('scrubbing');
  };

  const onMouseMove = (e) => {
    const deltaY = startY - e.clientY;
    if (!isDragging && Math.abs(deltaY) < 3) return;
    if (!isDragging) {
      isDragging = true;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    }
    e.preventDefault();
    applyDelta(e.clientY);
  };

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    document.body.classList.remove('scrubbing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    clearScrubPreview();
    if (isDragging) renderGrid();
    isDragging = false;
  };

  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    if (state.focusedChannel !== ch || state.focusedStep !== step) return;
    startY = e.touches[0].clientY;
    startIndex = getCurrentIndex();
    lastAppliedIndex = startIndex;
    isDragging = false;
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    document.body.classList.add('scrubbing');
    e.preventDefault();
  };

  const onTouchMove = (e) => {
    if (e.touches.length !== 1) return;
    const clientY = e.touches[0].clientY;
    const deltaY = startY - clientY;
    if (!isDragging && Math.abs(deltaY) < 3) return;
    if (!isDragging) isDragging = true;
    e.preventDefault();
    applyDelta(clientY);
  };

  const onTouchEnd = () => {
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    document.body.classList.remove('scrubbing');
    clearScrubPreview();
    if (isDragging) renderGrid();
    else {
      setFocus(ch, step);
      cellEl.focus();
    }
    isDragging = false;
  };

  cellEl.addEventListener('mousedown', onMouseDown);
  cellEl.addEventListener('touchstart', onTouchStart, { passive: false });
}

/**
 * Update a single note cell in the DOM without re-rendering the whole grid (avoids scroll jump).
 */
function updateNoteCellInDOM(channel, step) {
  const cellEl = document.querySelector(
    `.tracker-cell[data-channel="${channel}"][data-step="${step}"]`
  );
  if (!cellEl) return false;
  const cellData = state.grid[channel][step];
  const note = cellData?.note;
  cellEl.textContent = note == null ? '·' : note === '-' ? '-' : note;
  cellEl.classList.toggle('has-note', !!note && note !== '-');
  cellEl.classList.toggle('rest', note === '-');
  return true;
}

/**
 * Set a note in the grid.
 * @param {object} [options] - { skipRender: true } to only update state (e.g. during note-cell scrub); caller must update UI and call renderGrid() when done.
 */
function setNote(channel, step, note, options = {}) {
  state.grid[channel][step].note = note;
  if (!options.skipRender) {
    if (!updateNoteCellInDOM(channel, step)) renderGrid();
  }
  updateOutput();
  if (options.skipRender) return;

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
  const params = [...instrument.params];
  while (params.length < 21) params.push(0);
  const intendedVol = params[0] !== undefined ? params[0] : 1;
  params[0] = 1;
  const mixTargetPeak = sanitizePlaybackMixSettings(arrangementPreviewState.mixSettings).targetPeak;
  const previewScalar = arrangementPreviewState.isPlaying
    ? TRACKER_NOTE_PREVIEW_DUCKED_GAIN
    : TRACKER_NOTE_PREVIEW_GAIN;
  const previewGain = Math.max(0, noteGain * intendedVol * mixTargetPeak * previewScalar);
  
  for (let r = 0; r < reps; r++) {
    const delay = delaySeconds + (r * repeatInterval);
    playTestNote(params, frequency, previewGain, delay, true);
  }
}

/**
 * Clear all tracker data
 */
function clearAll() {
  initGrid();
  state.channelInstruments = Array(MAX_CHANNELS).fill('');
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
    scheduleArrangementLiveEditUpdate();
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

  scheduleArrangementLiveEditUpdate();
}

function scheduleArrangementLiveEditUpdate() {
  if (!editMode.isEditing) return;
  if (!editMode.returnToArrangementsOnClose && !editMode.autoSaveOnInput) return;
  const hasTarget = !!editMode.blockFilename || Number.isInteger(editMode.arrangementInsertRowIndex);
  if (!hasTarget) return;
  if (liveArrangementUpdateTimeout) {
    clearTimeout(liveArrangementUpdateTimeout);
  }
  liveArrangementUpdateTimeout = setTimeout(() => {
    liveArrangementUpdateTimeout = null;
    const trackerState = serializeTrackerState();
    document.dispatchEvent(new CustomEvent('tracker:stateChanged', {
      detail: {
        filename: editMode.blockFilename,
        trackerState,
        arrangementInsertRowIndex: editMode.arrangementInsertRowIndex,
        isNewBlock: editMode.isNewBlock,
      }
    }));
  }, 120);
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
    // Avoid accidental start from click-through or focus when modal just opened
    if (Date.now() - trackerModalOpenedAt < TRACKER_OPEN_PREVIEW_GUARD_MS) {
      return;
    }
    playPreview();
  }
}

function stopArrangementForTrackerPreviewStart() {
  if (!arrangementPreviewState.isPlaying) return;
  stopArrangementPreview();
  document.dispatchEvent(new CustomEvent('arrangements:previewState', { detail: { playing: false } }));
}

/**
 * Play a preview of the current tracker pattern
 */
function playPreview(startOffset = 0) {
  stopArrangementForTrackerPreviewStart();

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
    previewState.audioContext = getAudioContext();
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
      // Cut at first later step that is a rest or has a note (not just the immediate next row)
      let cutAtStep = null;
      for (let t = step + 1; t < state.steps; t++) {
        const n = state.grid[ch][t].note;
        if (n === '-' || (n && n !== '~')) {
          cutAtStep = t;
          break;
        }
      }
      const stepEndSample = cutAtStep != null ? cutAtStep * samplesPerStep : patternSamples;
      for (let r = 0; r < reps; r++) {
        const subOffset = Math.floor(samplesPerStep * ((delaySteps + r * stepSize) / substepCount));
        const noteStart = step * samplesPerStep + subOffset;
        for (let j = 0; j < samples.length; j++) {
          const bufferIndex = noteStart + j;
          if (bufferIndex >= patternSamples) break;
          if (bufferIndex >= stepEndSample) break;
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

  const aliases = collectPlayableAliasesFromTrackerState({
    grid: state.grid,
    channelInstruments: state.channelInstruments,
  });
  emitTrackerPreviewInstruments({ playing: true, aliases });
  
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
  emitTrackerPreviewInstruments({ playing: false, aliases: [] });
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
      setPlayingStep(step);
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

function isPlayableTrackerNote(note) {
  return Boolean(note && note !== '-' && note !== '~');
}

function collectPlayableAliasesFromTrackerState(trackerState) {
  if (!trackerState) return [];
  const grid = Array.isArray(trackerState.grid) ? trackerState.grid : [];
  const channelInstruments = Array.isArray(trackerState.channelInstruments) ? trackerState.channelInstruments : [];
  const aliases = new Set();

  grid.forEach((channel, channelIndex) => {
    const alias = channelInstruments[channelIndex];
    if (!alias || !Array.isArray(channel)) return;
    const hasPlayableNote = channel.some((cell) => {
      const note = typeof cell === 'object' ? cell?.note : cell;
      return isPlayableTrackerNote(note);
    });
    if (hasPlayableNote) aliases.add(alias);
  });

  return Array.from(aliases).sort();
}

function emitTrackerPreviewInstruments({ playing = false, aliases = [] } = {}) {
  const normalized = Array.isArray(aliases)
    ? Array.from(new Set(aliases.filter((alias) => typeof alias === 'string' && alias.trim().length > 0)))
    : [];
  normalized.sort();

  const signature = `${playing ? '1' : '0'}|${normalized.join('|')}`;
  if (signature === previewState.instrumentSignature) return;
  previewState.instrumentSignature = signature;

  document.dispatchEvent(new CustomEvent('tracker:previewInstruments', {
    detail: {
      playing: Boolean(playing),
      aliases: normalized,
    }
  }));
}

function setPlayingStep(step) {
  const prev = previewState.playingStep;
  if (prev != null) {
    document.querySelectorAll(`.tracker-cell[data-step="${prev}"]`).forEach(el => {
      el.classList.remove('playing-step');
    });
    document.querySelectorAll(`.tracker-row[data-step="${prev}"]`).forEach(el => {
      el.classList.remove('playing-step');
    });
    const prevTime = document.querySelector(`.tracker-timetrack-row[data-step="${prev}"]`);
    prevTime?.classList.remove('playing-step');
  }

  previewState.playingStep = step;

  if (step == null) return;

  document.querySelectorAll(`.tracker-cell[data-step="${step}"]`).forEach(el => {
    el.classList.add('playing-step');
  });
  document.querySelectorAll(`.tracker-row[data-step="${step}"]`).forEach(el => {
    el.classList.add('playing-step');
  });
  const timeRow = document.querySelector(`.tracker-timetrack-row[data-step="${step}"]`);
  timeRow?.classList.add('playing-step');
}

/**
 * Update preview button UI based on playback state
 */
function updatePreviewUI() {
  if (!elements.previewBtn) return;

  if (previewState.isPlaying) {
    elements.previewBtn.innerHTML = '<i data-lucide="square" class="w-[18px] h-5 fill-current"></i>';
  } else {
    elements.previewBtn.innerHTML = '<i data-lucide="play" class="w-[18px] h-5 fill-current"></i>';
  }
  elements.previewBtn.classList.add('text-foreground');

  createIcons({ icons });
}

/**
 * Play a one-shot preview of a tracker state (no looping)
 */
export function previewTrackerStateOnce(trackerState, instrumentList, bpm = 120, mixSettings = null) {
  if (!trackerState || !instrumentList) return;

  stopArrangementForTrackerPreviewStart();
  stopPreview();

  if (!previewState.audioContext) {
    previewState.audioContext = getAudioContext();
  }

  const ctx = previewState.audioContext;
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const rendered = renderTrackerStateToMixBuffer(trackerState, instrumentList, bpm, {
    tailSeconds: 1,
    mixSettings,
  });
  if (!rendered) return;

  const { mixBuffer, sampleRate } = rendered;
  const aliases = collectPlayableAliasesFromTrackerState(trackerState);
  emitTrackerPreviewInstruments({ playing: true, aliases });
  playMixBuffer(mixBuffer, sampleRate);
}

function notifyVisualizerReady() {
  document.dispatchEvent(new CustomEvent('visualizer:ready'));
}

function connectPreviewSource(ctx, source) {
  source.connect(ctx.destination);
  const vizAnalyser = getVisualizerAnalyser(ctx);
  if (vizAnalyser) {
    try {
      source.connect(vizAnalyser);
    } catch (_e) {
      // ignore
    }
  }
  notifyVisualizerReady();
}

function playMixBuffer(mixBuffer, sampleRate) {
  if (!mixBuffer || mixBuffer.length === 0) return;

  if (!previewState.audioContext) {
    previewState.audioContext = getAudioContext();
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
  connectPreviewSource(ctx, source);
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
      emitTrackerPreviewInstruments({ playing: false, aliases: [] });
    }
  };
}

function renderTrackerStateToMixBuffer(trackerState, instrumentList, bpm, { tailSeconds = 0, normalizeMaster = true, mixSettings = null, applyMasterProcessing = true } = {}) {
  const resolvedMixSettings = sanitizePlaybackMixSettings(mixSettings || arrangementPreviewState.mixSettings);
  const targetPeak = resolvedMixSettings.targetPeak;
  const masterGain = dbToGain(resolvedMixSettings.masterGainDb);
  const clipDrive = resolvedMixSettings.softClipDrive;
  const channels = trackerState.channels || (Array.isArray(trackerState.grid) ? trackerState.grid.length : 0);
  const steps = trackerState.steps || (Array.isArray(trackerState.grid?.[0]) ? trackerState.grid[0].length : 0);
  const grid = trackerState.grid || [];
  const channelInstruments = Array.isArray(trackerState.channelInstruments) ? trackerState.channelInstruments : [];
  const repsGrid = Array.isArray(trackerState.reps) ? trackerState.reps : [];
  const ndGrid = Array.isArray(trackerState.nd) ? trackerState.nd : [];
  const volGrid = Array.isArray(trackerState.vol) ? trackerState.vol : [];
  const generatedSampleCache = new Map();
  const noteFreqCache = new Map();

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
    const cached = noteFreqCache.get(noteStr);
    if (cached !== undefined) return cached;
    
    const noteMap = {
      'c': 0, 'c#': 1, 'd': 2, 'd#': 3, 'e': 4, 'f': 5,
      'f#': 6, 'g': 7, 'g#': 8, 'a': 9, 'a#': 10, 'b': 11
    };
    
    const match = noteStr.match(/^([a-g]#?)(\d)$/i);
    if (!match) {
      noteFreqCache.set(noteStr, null);
      return null;
    }
    
    const noteName = match[1].toLowerCase();
    const octave = parseInt(match[2], 10);
    
    const noteOffset = noteMap[noteName];
    if (noteOffset === undefined) {
      noteFreqCache.set(noteStr, null);
      return null;
    }
    
    const midiNote = (octave + 1) * 12 + noteOffset;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    noteFreqCache.set(noteStr, freq);
    return freq;
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

      const sampleKey = `${instrumentId}|${freq.toFixed(6)}`;
      let samples = generatedSampleCache.get(sampleKey);
      if (!generatedSampleCache.has(sampleKey)) {
        const p = [...baseParams];
        while (p.length < 21) p.push(0);
        p[2] = freq;

        const intendedVol = p[0] !== undefined ? p[0] : 1;
        p[0] = 1;

        try {
          samples = zzfxG(...p);
        } catch (err) {
          console.error(`[Tracker] Failed to generate sound for ${instrumentId}:`, err);
          generatedSampleCache.set(sampleKey, null);
          continue;
        }

        if (!samples || samples.length === 0) {
          generatedSampleCache.set(sampleKey, null);
          continue;
        }

        let maxAmp = 0;
        for (let i = 0; i < samples.length; i++) {
          const abs = Math.abs(samples[i]);
          if (abs > maxAmp) maxAmp = abs;
        }
        if (maxAmp > 0) {
          const scale = (targetPeak / maxAmp) * intendedVol;
          for (let i = 0; i < samples.length; i++) {
            samples[i] *= scale;
          }
        }

        generatedSampleCache.set(sampleKey, samples);
      }
      if (!samples) continue;

      const repsVal = repsGrid[ch]?.[step];
      const ndVal = ndGrid[ch]?.[step];
      const volVal = volGrid[ch]?.[step];
      const { reps, delaySteps, substepCount } = resolveSubsteps(repsVal, ndVal);
      const noteGain = Number.isInteger(volVal) ? Math.min(Math.max(volVal, 1), 99) / 99 : 1;
      const stepSize = substepCount / reps;
      // Cut at first later step that is a rest or has a note (not just the immediate next row)
      let cutAtStep = null;
      for (let t = step + 1; t < steps; t++) {
        const cell = channel[t];
        const n = cell && typeof cell === 'object' ? cell.note : cell;
        if (n === '-' || (n && n !== '~')) {
          cutAtStep = t;
          break;
        }
      }
      const stepEndSample = cutAtStep != null ? cutAtStep * samplesPerStep : mixBuffer.length;
      for (let r = 0; r < reps; r++) {
        const subOffset = Math.floor(samplesPerStep * ((delaySteps + r * stepSize) / substepCount));
        const noteStart = step * samplesPerStep + subOffset;
        for (let j = 0; j < samples.length; j++) {
          const bufferIndex = noteStart + j;
          if (bufferIndex >= mixBuffer.length) break;
          if (bufferIndex >= stepEndSample) break;
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

  if (normalizeMaster) {
    let maxAmp = 0;
    for (let i = 0; i < mixBuffer.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(mixBuffer[i]));
    }
    if (maxAmp > 0) {
      const scale = targetPeak / maxAmp;
      for (let i = 0; i < mixBuffer.length; i++) {
        mixBuffer[i] *= scale;
      }
    }
  }

  if (applyMasterProcessing) {
    for (let i = 0; i < mixBuffer.length; i++) {
      mixBuffer[i] = softClipSample(mixBuffer[i] * masterGain, clipDrive);
    }
  }

  return { mixBuffer, sampleRate, samplesPerStep, mainSamples };
}

export function previewArrangementStateOnce(arrangementState, trackerStateByFilename, instrumentList, bpm = 120) {
  if (!arrangementState || !instrumentList) return;

  stopPreview();

  const rendered = renderArrangementStateToMixBuffer(arrangementState, trackerStateByFilename, instrumentList, bpm);
  if (!rendered?.mixBuffer) return;
  playMixBuffer(rendered.mixBuffer, rendered.sampleRate);
}

export function renderArrangementStateForExport(arrangementState, trackerStateByFilename, instrumentList, bpm = 120, { mixSettings = null } = {}) {
  if (!arrangementState || !instrumentList) return null;
  return renderArrangementStateToMixBuffer(arrangementState, trackerStateByFilename, instrumentList, bpm, {}, mixSettings);
}

function renderArrangementStateToMixBuffer(arrangementState, trackerStateByFilename, instrumentList, bpm = 120, overrides = {}, mixSettings = null) {
  if (!arrangementState || !instrumentList) return null;
  const resolvedMixSettings = sanitizePlaybackMixSettings(mixSettings || arrangementPreviewState.mixSettings);
  const targetPeak = resolvedMixSettings.targetPeak;
  const masterGain = dbToGain(resolvedMixSettings.masterGainDb);
  const clipDrive = resolvedMixSettings.softClipDrive;

  const secondsPerBeat = 60 / bpm;
  const secondsPerStep = secondsPerBeat / 4; // 16th notes (ideal)
  const sampleRate = 44100;
  const samplesPerStep = Math.floor(secondsPerStep * sampleRate);
  const secondsPerStepExact = samplesPerStep / sampleRate; // what we actually render/play

  const rows = Array.isArray(arrangementState.rows) ? arrangementState.rows : [];
  if (!rows.length) return null;

  const overridesByFilename = overrides?.byFilename instanceof Map ? overrides.byFilename : null;
  const overridesByRowIndex = overrides?.byRowIndex instanceof Map ? overrides.byRowIndex : null;

  // Strudel's arrange() treats the first number as the number of cycles the section lasts for.
  // In our tracker, 1 cycle == 16 steps (16th notes).
  const rowDescriptors = rows.map((r, rowIndex) => {
    const cycles = Number.isInteger(r?.repeats) ? Math.min(Math.max(r.repeats, 1), 16) : 1;
    const files = Array.isArray(r?.blocks) ? r.blocks.filter(Boolean) : [];
    const rowOverride = overridesByRowIndex?.get(rowIndex);
    const sources = files
      .map((f) => ({ filename: f, trackerState: overridesByFilename?.get(f) || trackerStateByFilename?.[f] }))
      .filter((entry) => Boolean(entry.trackerState));
    if (rowOverride) sources.push({ filename: null, trackerState: rowOverride });
    return { cycles, files, sources };
  });

  const totalCycles = rowDescriptors.reduce((sum, r) => sum + r.cycles, 0);
  if (!totalCycles) return null;

  // Render an exact-length musical loop + a post-loop tail region.
  // We do NOT wrap the tail into the start of the loop; instead, playback schedules
  // overlapping cycles so tails can ring out without "bleeding" into time 0.
  const loopSamples = totalCycles * 16 * samplesPerStep;
  if (loopSamples <= 0) return null;
  const tailSamples = Math.min(sampleRate, loopSamples); // <= 1 loop => at most 2 overlapping sources
  const totalSamples = loopSamples + tailSamples;
  const mixBuffer = new Float32Array(totalSamples);
  const renderedByFilename = new Map();
  const renderedByState = new WeakMap();

  const getRenderedSource = (filename, trackerState) => {
    if (!trackerState) return null;
    if (filename && renderedByFilename.has(filename)) {
      return renderedByFilename.get(filename);
    }
    if (renderedByState.has(trackerState)) {
      const cached = renderedByState.get(trackerState);
      if (filename && !renderedByFilename.has(filename)) {
        renderedByFilename.set(filename, cached);
      }
      return cached;
    }

    const rendered = renderTrackerStateToMixBuffer(trackerState, instrumentList, bpm, {
      tailSeconds: 1,
      normalizeMaster: false,
      mixSettings: resolvedMixSettings,
      applyMasterProcessing: false,
    });
    if (!rendered?.mixBuffer) return null;
    renderedByState.set(trackerState, rendered);
    if (filename) renderedByFilename.set(filename, rendered);
    return rendered;
  };

  let writeOffset = 0;
  let anyMixed = false;
  for (const row of rowDescriptors) {
    const rowMainSamples = row.cycles * 16 * samplesPerStep;
    const rowMix = new Float32Array(rowMainSamples + tailSamples);

    // Mix stacked blocks for this row
    for (const source of row.sources) {
      const rendered = getRenderedSource(source.filename, source.trackerState);
      if (!rendered?.mixBuffer || !rendered?.mainSamples) continue;
      const stateBuffer = rendered.mixBuffer;
      const stateMainSamples = rendered.mainSamples;
      if (stateMainSamples <= 0) continue;

      for (let segmentStart = 0; segmentStart < rowMainSamples; segmentStart += stateMainSamples) {
        const segmentMainSamples = Math.min(stateMainSamples, rowMainSamples - segmentStart);
        if (segmentMainSamples <= 0) break;

        for (let i = 0; i < segmentMainSamples; i++) {
          rowMix[segmentStart + i] += stateBuffer[i] || 0;
        }

        const tailSourceStart = segmentMainSamples;
        const tailDstStart = segmentStart + segmentMainSamples;
        const tailCount = Math.min(
          stateBuffer.length - tailSourceStart,
          rowMix.length - tailDstStart
        );
        for (let t = 0; t < tailCount; t++) {
          rowMix[tailDstStart + t] += stateBuffer[tailSourceStart + t] || 0;
        }
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
    return null;
  }
  if (maxAmp > 0) {
    const scale = targetPeak / maxAmp;
    for (let i = 0; i < mixBuffer.length; i++) {
      mixBuffer[i] *= scale;
    }
  }

  for (let i = 0; i < mixBuffer.length; i++) {
    mixBuffer[i] = softClipSample(mixBuffer[i] * masterGain, clipDrive);
  }

  return {
    mixBuffer,
    sampleRate,
    secondsPerStep: secondsPerStepExact,
    totalSteps: totalCycles * 16,
  };
}

function computeArrangementRowBounds(arrangementState) {
  const rows = Array.isArray(arrangementState?.rows) ? arrangementState.rows : [];
  let cursor = 0;
  return rows.map((row, index) => {
    const cycles = Number.isInteger(row?.repeats) ? Math.min(Math.max(row.repeats, 1), 16) : 1;
    const steps = cycles * 16;
    const start = cursor;
    const end = start + steps;
    cursor = end;
    return { index, start, end, steps };
  });
}

function emitArrangementPlayhead(rowIndex, progress, rowSteps = null, blocks = null) {
  document.dispatchEvent(new CustomEvent('arrangements:playhead', {
    detail: {
      rowIndex,
      progress,
      rowSteps,
      blocks,
    }
  }));
}

function handleArrangementPlayheadForTracker(detail = {}) {
  if (!isTrackerOpen()) return;
  if (previewState.isPlaying) return;

  const rowIndex = Number.isInteger(detail.rowIndex) ? detail.rowIndex : null;
  if (rowIndex == null) {
    setPlayingStep(null);
    return;
  }

  const rowBlocks = Array.isArray(detail.blocks) ? detail.blocks : [];
  const rowSteps = Number.isInteger(detail.rowSteps) && detail.rowSteps > 0 ? detail.rowSteps : null;
  const isEditingExistingBlock = Boolean(editMode.blockFilename);
  const matchesExistingBlock = isEditingExistingBlock && rowBlocks.includes(editMode.blockFilename);
  const matchesNewBlockRow = !isEditingExistingBlock
    && Number.isInteger(editMode.arrangementInsertRowIndex)
    && rowIndex === editMode.arrangementInsertRowIndex;

  if (!matchesExistingBlock && !matchesNewBlockRow) {
    setPlayingStep(null);
    return;
  }

  const trackerSteps = Number.isInteger(state.steps) && state.steps > 0 ? state.steps : 16;
  const cycleSteps = rowSteps || trackerSteps;
  const progress = typeof detail.progress === 'number' ? Math.max(0, Math.min(detail.progress, 0.999999)) : 0;
  const arrangementStep = Math.floor(progress * cycleSteps);
  const trackerStep = ((arrangementStep % trackerSteps) + trackerSteps) % trackerSteps;
  setPlayingStep(trackerStep);
}

function stopArrangementPlayhead() {
  if (arrangementPreviewState.playheadRafId != null) {
    cancelAnimationFrame(arrangementPreviewState.playheadRafId);
    arrangementPreviewState.playheadRafId = null;
  }
  if (arrangementPreviewState.playingRowIndex != null) {
    arrangementPreviewState.playingRowIndex = null;
    arrangementPreviewState.playingRowProgress = null;
    emitArrangementPlayhead(null, 0);
  }
}

function startArrangementPlayhead() {
  stopArrangementPlayhead();
  const ctx = arrangementPreviewState.audioContext;
  if (!ctx) return;

  const tick = () => {
    if (!arrangementPreviewState.isPlaying || arrangementPreviewState.startTime == null) return;
    const secondsPerStep = arrangementPreviewState.secondsPerStep;
    const totalSteps = arrangementPreviewState.totalSteps;
    const rowBounds = arrangementPreviewState.rowBounds || [];
    if (!secondsPerStep || !totalSteps || rowBounds.length === 0) {
      arrangementPreviewState.playheadRafId = requestAnimationFrame(tick);
      return;
    }

    const elapsed = ctx.currentTime - arrangementPreviewState.startTime;
    const elapsedSteps = ((elapsed / secondsPerStep) % totalSteps + totalSteps) % totalSteps;
    let current = rowBounds[rowBounds.length - 1];
    for (const row of rowBounds) {
      if (elapsedSteps < row.end) {
        current = row;
        break;
      }
    }
    const progress = current.steps > 0 ? (elapsedSteps - current.start) / current.steps : 0;
    const clamped = Math.min(Math.max(progress, 0), 1);
    const prevIndex = arrangementPreviewState.playingRowIndex;
    const prevProgress = arrangementPreviewState.playingRowProgress;
    if (prevIndex !== current.index || prevProgress == null || Math.abs(prevProgress - clamped) > 0.01) {
      const row = arrangementPreviewState.arrangementState?.rows?.[current.index];
      arrangementPreviewState.playingRowIndex = current.index;
      arrangementPreviewState.playingRowProgress = clamped;
      emitArrangementPlayhead(
        current.index,
        clamped,
        current.steps,
        Array.isArray(row?.blocks) ? row.blocks : []
      );
    }

    arrangementPreviewState.playheadRafId = requestAnimationFrame(tick);
  };

  arrangementPreviewState.playheadRafId = requestAnimationFrame(tick);
}

function stopArrangementPlaybackSources() {
  if (arrangementPreviewState.schedulerId) {
    clearTimeout(arrangementPreviewState.schedulerId);
    arrangementPreviewState.schedulerId = null;
  }
  arrangementPreviewState.nextStartTime = null;

  const sources = Array.isArray(arrangementPreviewState.playingSources)
    ? arrangementPreviewState.playingSources
    : [];
  for (const src of sources) {
    try {
      src.stop();
    } catch (_e) {
      // ignore
    }
  }
  arrangementPreviewState.playingSources = [];

  if (arrangementPreviewState.playingSource) {
    try {
      arrangementPreviewState.playingSource.stop();
    } catch (_e) {
      // ignore
    }
  }
  arrangementPreviewState.playingSource = null;
  arrangementPreviewState.audioBuffer = null;
}

function scheduleArrangementLoopStarts() {
  if (!arrangementPreviewState.isPlaying) return;

  const ctx = arrangementPreviewState.audioContext;
  const audioBuffer = arrangementPreviewState.audioBuffer;
  const loopDuration = arrangementPreviewState.loopDuration;
  if (!ctx || !audioBuffer || !loopDuration) return;

  const lookaheadSeconds = 0.25;
  const pollMs = 50;
  const now = ctx.currentTime;

  if (arrangementPreviewState.nextStartTime == null) {
    arrangementPreviewState.nextStartTime = now + loopDuration;
  }

  // If we fell behind (tab inactive, long task), jump to the next boundary.
  if (arrangementPreviewState.nextStartTime < now - 0.01) {
    const startTime = arrangementPreviewState.startTime ?? now;
    const loopsElapsed = Math.floor((now - startTime) / loopDuration);
    arrangementPreviewState.nextStartTime = startTime + (loopsElapsed + 1) * loopDuration;
  }

  while (arrangementPreviewState.nextStartTime < now + lookaheadSeconds) {
    const startAt = arrangementPreviewState.nextStartTime;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = false;
    connectPreviewSource(ctx, source);
    source.onended = () => {
      arrangementPreviewState.playingSources = arrangementPreviewState.playingSources.filter(s => s !== source);
      if (arrangementPreviewState.playingSource === source) {
        arrangementPreviewState.playingSource = null;
      }
    };

    try {
      source.start(startAt, 0);
    } catch (err) {
      console.warn('[Arranger] Failed to schedule loop start:', err);
      break;
    }

    arrangementPreviewState.playingSources.push(source);
    arrangementPreviewState.playingSource = source;
    arrangementPreviewState.nextStartTime += loopDuration;
  }

  arrangementPreviewState.schedulerId = setTimeout(scheduleArrangementLoopStarts, pollMs);
}

function playArrangementMixBuffer(mixBuffer, sampleRate, { keepPosition = false, startOffsetSeconds } = {}) {
  if (!mixBuffer || mixBuffer.length === 0) return false;

  const ctx = ensureArrangementAudioContext();
  if (!ctx) return false;

  const loopDuration = arrangementPreviewState.totalSteps && arrangementPreviewState.secondsPerStep
    ? arrangementPreviewState.totalSteps * arrangementPreviewState.secondsPerStep
    : 0;

  let phase = 0;
  if (Number.isFinite(startOffsetSeconds) && startOffsetSeconds >= 0 && loopDuration > 0) {
    phase = startOffsetSeconds % loopDuration;
  } else if (keepPosition && arrangementPreviewState.isPlaying && arrangementPreviewState.startTime != null && loopDuration > 0) {
    const elapsed = ctx.currentTime - arrangementPreviewState.startTime;
    phase = ((elapsed % loopDuration) + loopDuration) % loopDuration;
  }

  // Restart playback with the new buffer at the current musical phase.
  stopArrangementPlaybackSources();

  const audioBuffer = ctx.createBuffer(1, mixBuffer.length, sampleRate);
  audioBuffer.getChannelData(0).set(mixBuffer);

  arrangementPreviewState.loopDuration = loopDuration;
  arrangementPreviewState.bufferDuration = audioBuffer.duration;
  arrangementPreviewState.audioBuffer = audioBuffer;

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = false;
  connectPreviewSource(ctx, source);
  source.onended = () => {
    arrangementPreviewState.playingSources = arrangementPreviewState.playingSources.filter(s => s !== source);
    if (arrangementPreviewState.playingSource === source) {
      arrangementPreviewState.playingSource = null;
    }
  };

  const startAt = ctx.currentTime;
  const offsetSeconds = loopDuration > 0 ? (phase % loopDuration) : 0;
  try {
    source.start(startAt, offsetSeconds);
  } catch (err) {
    console.warn('[Arranger] Failed to start arrangement preview:', err);
    return false;
  }

  arrangementPreviewState.playingSources = [source];
  arrangementPreviewState.playingSource = source;
  arrangementPreviewState.isPlaying = true;
  arrangementPreviewState.startTime = startAt - offsetSeconds;
  arrangementPreviewState.nextStartTime = arrangementPreviewState.startTime + loopDuration;

  scheduleArrangementLoopStarts();
  return true;
}

export function startArrangementPreview(arrangementState, trackerStateByFilename, instrumentList, bpm = 120, { keepPosition = false, mixSettings = null, startRowIndex } = {}) {
  stopPreview();

  arrangementPreviewState.arrangementState = arrangementState || null;
  arrangementPreviewState.trackerStateByFilename = trackerStateByFilename || null;
  arrangementPreviewState.instrumentList = instrumentList || null;
  arrangementPreviewState.bpm = bpm || 120;
  arrangementPreviewState.mixSettings = sanitizePlaybackMixSettings(mixSettings || arrangementPreviewState.mixSettings);

  const rendered = renderArrangementStateToMixBuffer(
    arrangementPreviewState.arrangementState,
    arrangementPreviewState.trackerStateByFilename,
    arrangementPreviewState.instrumentList,
    arrangementPreviewState.bpm,
    { byFilename: arrangementPreviewState.overridesByFilename, byRowIndex: arrangementPreviewState.overridesByRowIndex },
    arrangementPreviewState.mixSettings
  );

  if (!rendered?.mixBuffer) return false;
  arrangementPreviewState.secondsPerStep = rendered.secondsPerStep || 0;
  arrangementPreviewState.totalSteps = rendered.totalSteps || 0;
  arrangementPreviewState.rowBounds = computeArrangementRowBounds(arrangementPreviewState.arrangementState);

  let startOffsetSeconds;
  if (Number.isInteger(startRowIndex) && startRowIndex >= 0) {
    const rowBounds = arrangementPreviewState.rowBounds || [];
    const bound = rowBounds[startRowIndex];
    const secondsPerStep = arrangementPreviewState.secondsPerStep || 0;
    if (bound && secondsPerStep > 0) {
      startOffsetSeconds = bound.start * secondsPerStep;
    }
  }

  const started = playArrangementMixBuffer(rendered.mixBuffer, rendered.sampleRate, { keepPosition, startOffsetSeconds });
  if (started) {
    startArrangementPlayhead();
  }
  return started;
}

export function updateArrangementPreview({ arrangementState, trackerStateByFilename, instrumentList, bpm, keepPosition = true, mixSettings } = {}) {
  if (arrangementState) arrangementPreviewState.arrangementState = arrangementState;
  if (trackerStateByFilename) arrangementPreviewState.trackerStateByFilename = trackerStateByFilename;
  if (instrumentList) arrangementPreviewState.instrumentList = instrumentList;
  if (Number.isFinite(bpm)) arrangementPreviewState.bpm = bpm;
  if (mixSettings) arrangementPreviewState.mixSettings = sanitizePlaybackMixSettings(mixSettings);

  if (!arrangementPreviewState.isPlaying) return false;

  const rendered = renderArrangementStateToMixBuffer(
    arrangementPreviewState.arrangementState,
    arrangementPreviewState.trackerStateByFilename,
    arrangementPreviewState.instrumentList,
    arrangementPreviewState.bpm,
    { byFilename: arrangementPreviewState.overridesByFilename, byRowIndex: arrangementPreviewState.overridesByRowIndex },
    arrangementPreviewState.mixSettings
  );
  if (!rendered?.mixBuffer) return false;
  arrangementPreviewState.secondsPerStep = rendered.secondsPerStep || 0;
  arrangementPreviewState.totalSteps = rendered.totalSteps || 0;
  arrangementPreviewState.rowBounds = computeArrangementRowBounds(arrangementPreviewState.arrangementState);
  const updated = playArrangementMixBuffer(rendered.mixBuffer, rendered.sampleRate, { keepPosition });
  if (updated) {
    startArrangementPlayhead();
  }
  return updated;
}

function scheduleArrangementPreviewUpdate() {
  if (!arrangementPreviewState.isPlaying) return;
  if (arrangementPreviewState.pendingUpdate) {
    clearTimeout(arrangementPreviewState.pendingUpdate);
  }
  arrangementPreviewState.pendingUpdate = setTimeout(() => {
    arrangementPreviewState.pendingUpdate = null;
    updateArrangementPreview({ keepPosition: true });
  }, 120);
}

export function setArrangementLiveOverride({ filename, rowIndex, trackerState }) {
  if (!trackerState) return;
  if (filename) {
    arrangementPreviewState.overridesByFilename.set(filename, trackerState);
  }
  if (Number.isInteger(rowIndex)) {
    arrangementPreviewState.overridesByRowIndex.set(rowIndex, trackerState);
  }
  scheduleArrangementPreviewUpdate();
}

export function clearArrangementLiveOverride({ filename, rowIndex, scheduleUpdate = true } = {}) {
  if (filename) arrangementPreviewState.overridesByFilename.delete(filename);
  if (Number.isInteger(rowIndex)) arrangementPreviewState.overridesByRowIndex.delete(rowIndex);
  if (scheduleUpdate) {
    scheduleArrangementPreviewUpdate();
  } else if (arrangementPreviewState.pendingUpdate) {
    clearTimeout(arrangementPreviewState.pendingUpdate);
    arrangementPreviewState.pendingUpdate = null;
  }
}

export function clearArrangementLiveOverrides({ scheduleUpdate = true } = {}) {
  arrangementPreviewState.overridesByFilename.clear();
  arrangementPreviewState.overridesByRowIndex.clear();
  if (scheduleUpdate) {
    scheduleArrangementPreviewUpdate();
  } else if (arrangementPreviewState.pendingUpdate) {
    clearTimeout(arrangementPreviewState.pendingUpdate);
    arrangementPreviewState.pendingUpdate = null;
  }
}

export function stopArrangementPreview() {
  stopArrangementPlaybackSources();
  stopArrangementPlayhead();
  if (arrangementPreviewState.pendingUpdate) {
    clearTimeout(arrangementPreviewState.pendingUpdate);
    arrangementPreviewState.pendingUpdate = null;
  }
  arrangementPreviewState.overridesByFilename.clear();
  arrangementPreviewState.overridesByRowIndex.clear();
  arrangementPreviewState.isPlaying = false;
  arrangementPreviewState.bufferDuration = 0;
  arrangementPreviewState.loopDuration = 0;
  arrangementPreviewState.startTime = null;
  arrangementPreviewState.nextStartTime = null;
  arrangementPreviewState.audioBuffer = null;
  arrangementPreviewState.secondsPerStep = 0;
  arrangementPreviewState.totalSteps = 0;
  arrangementPreviewState.rowBounds = [];
}

export function isArrangementPreviewPlaying() {
  return arrangementPreviewState.isPlaying;
}

/**
 * Open the tracker modal
 */
export function openTracker(instrumentList, options = {}) {
  // Reset edit mode
  resetEditMode();
  gridBackupsBySteps.clear();

  // Enable editing for new blocks so we can save them
  editMode.isEditing = true;
  editMode.isNewBlock = true;
  editMode.autoSaveOnInput = !!options.autoSaveOnInput;
  editMode.returnToArrangementsOnClose = !!options.returnToArrangementsOnClose;
  editMode.returnToBlocksOnClose = typeof options.returnToBlocksOnClose === 'boolean'
    ? options.returnToBlocksOnClose
    : !editMode.returnToArrangementsOnClose;
  editMode.arrangementInsertRowIndex = Number.isInteger(options.arrangementInsertRowIndex)
    ? options.arrangementInsertRowIndex
    : null;
  editMode.blockScope = 'user';
  state.bpm = 120;
  setSteps(16);
  
  // Update UI (save button will be visible now)
  updateEditModeUI();
  
  if (instrumentList) {
    state.instruments = instrumentList;
    renderGrid();
  }

  lastSavedSnapshot = getSnapshot();

  // Defer adding 'open' to next frame so the browser paints opacity-0 first;
  // otherwise the fade-in transition can fail on first open.
  requestAnimationFrame(() => {
    cancelEffectPreview();
    elements.modal?.classList.add('open');
    trackerModalOpenedAt = Date.now();
    setFocus(0, 0);
  });
}

/**
 * Open the tracker modal in edit mode for an existing block
 */
export function openTrackerForEdit(instrumentList, blockData) {
  // Save scroll and focus for the block we're leaving (if any)
  if (editMode.blockFilename) {
    const bodyScroll = elements.grid?.querySelector('.tracker-body-scroll');
    if (bodyScroll) {
      blockScrollPositions.set(editMode.blockFilename, {
        scrollTop: bodyScroll.scrollTop,
        channel: state.focusedChannel,
        step: state.focusedStep,
      });
    }
  }

  // Set edit mode
  editMode.isEditing = true;
  editMode.isNewBlock = false;
  editMode.autoSaveOnInput = !!blockData.autoSaveOnInput;
  editMode.returnToArrangementsOnClose = !!blockData.returnToArrangementsOnClose;
  editMode.returnToBlocksOnClose = typeof blockData.returnToBlocksOnClose === 'boolean'
    ? blockData.returnToBlocksOnClose
    : !editMode.returnToArrangementsOnClose;
  editMode.arrangementInsertRowIndex = Number.isInteger(blockData.arrangementInsertRowIndex)
    ? blockData.arrangementInsertRowIndex
    : null;
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

  lastSavedSnapshot = getSnapshot();

  // Defer adding 'open' to next frame so the browser paints opacity-0 first;
  // otherwise the fade-in transition can fail on first open.
  requestAnimationFrame(() => {
    cancelEffectPreview();
    elements.modal?.classList.add('open');
    trackerModalOpenedAt = Date.now();
    const saved = blockData.filename ? blockScrollPositions.get(blockData.filename) : undefined;
    const channel = saved && Number.isInteger(saved.channel) ? Math.max(0, Math.min(saved.channel, state.channels - 1)) : 0;
    const step = saved && Number.isInteger(saved.step) ? Math.max(0, Math.min(saved.step, state.steps - 1)) : 0;
    setFocus(channel, step);
    // Restore scroll after setFocus so it isn't overwritten by setFocus's scroll-into-view
    if (saved != null && saved.scrollTop != null) {
      const bodyScroll = elements.grid?.querySelector('.tracker-body-scroll');
      if (bodyScroll) bodyScroll.scrollTop = saved.scrollTop;
    }
  });
}

/**
 * Get a serializable snapshot of current state (for unsaved-changes comparison)
 */
function getSnapshot() {
  const name = (elements.blockNameInput?.value ?? editMode.blockName ?? '').trim();
  return JSON.stringify({
    trackerState: serializeTrackerState(),
    name,
  });
}

/**
 * Whether the user has made changes since opening or last save
 */
function hasUnsavedChanges() {
  if (!editMode.isEditing) return false;
  return getSnapshot() !== lastSavedSnapshot;
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
  editMode.autoSaveOnInput = false;
  editMode.returnToArrangementsOnClose = false;
  editMode.returnToBlocksOnClose = false;
  editMode.arrangementInsertRowIndex = null;
  lastSavedSnapshot = '';
}

/**
 * Update UI based on edit mode state
 */
function updateEditModeUI() {
  const isReadonlyExample = editMode.isEditing
    && editMode.blockScope === 'example'
    && !isDeveloperModeEnabled();
  const usesAutoSave = editMode.isEditing && editMode.autoSaveOnInput;

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
  if (elements.blockPropsRow1 && elements.blockPropsRow2) {
    if (editMode.isEditing) {
      elements.blockPropsRow1.classList.remove('hidden');
      elements.blockPropsRow2.classList.remove('hidden');
      if (elements.blockNameInput) {
        elements.blockNameInput.value = editMode.blockName || '';
        elements.blockNameInput.readOnly = isReadonlyExample;
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
      syncChannelsUI();
    } else {
      elements.blockPropsRow1.classList.add('hidden');
      elements.blockPropsRow2.classList.add('hidden');
    }

    // Ensure icons render when the block props row is revealed.
    createIcons({ icons });
  }

  if (elements.blockAdvancedSettingsBtn) {
    const shouldShow = editMode.isEditing && !DEMO_MODE;
    elements.blockAdvancedSettingsBtn.classList.toggle('dev-only-hidden', !shouldShow);
  }

  if (elements.previewBtn) {
    const shouldHide = editMode.isEditing && editMode.returnToArrangementsOnClose;
    elements.previewBtn.classList.toggle('hidden', shouldHide);
    elements.previewBtn.style.display = shouldHide ? 'none' : '';
  }
  
  // Show/hide save button
  if (elements.saveBtn) {
    if (editMode.isEditing && !usesAutoSave) {
      elements.saveBtn.classList.remove('hidden');
      elements.saveBtn.disabled = isReadonlyExample;
      elements.saveBtn.title = isReadonlyExample
        ? 'Enable developer mode to edit example blocks'
        : '';
    } else {
      elements.saveBtn.classList.add('hidden');
      elements.saveBtn.disabled = false;
      elements.saveBtn.title = '';
    }
  }
}

/**
 * Handle save button click in edit mode
 */
function handleSaveBlock() {
  if (!editMode.isEditing) return;
  if (editMode.blockScope === 'example' && !isDeveloperModeEnabled()) return;
  
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
      returnToArrangementsOnClose: editMode.returnToArrangementsOnClose,
      arrangementInsertRowIndex: editMode.arrangementInsertRowIndex,
    }
  });
  document.dispatchEvent(event);
}

function closeClearConfirmModal() {
  elements.clearConfirmModal?.classList.remove('open');
}

function closeUnsavedConfirmModal() {
  elements.unsavedConfirmModal?.classList.remove('open');
}

/**
 * Request to close the tracker; shows save-changes dialog if there are unsaved changes
 */
function requestCloseTracker() {
  if (hasUnsavedChanges()) {
    const isReadonlyExample = editMode.blockScope === 'example' && !isDeveloperModeEnabled();
    if (elements.unsavedSave) {
      elements.unsavedSave.classList.toggle('hidden', isReadonlyExample);
    }
    elements.unsavedConfirmModal?.classList.add('open');
    return;
  }
  closeTracker();
}

/**
 * Close the tracker modal
 */
export function closeTracker() {
  const shouldReturnToBlocks = !!editMode.returnToBlocksOnClose;
  const shouldReturnToArrangements = !!editMode.returnToArrangementsOnClose;
  // Save scroll and focus for current block so we can restore when reopening
  if (editMode.blockFilename) {
    const bodyScroll = elements.grid?.querySelector('.tracker-body-scroll');
    if (bodyScroll) {
      blockScrollPositions.set(editMode.blockFilename, {
        scrollTop: bodyScroll.scrollTop,
        channel: state.focusedChannel,
        step: state.focusedStep,
      });
    }
  }
  // Stop any playing preview
  stopPreview();

  closeClearConfirmModal();
  closeUnsavedConfirmModal();
  elements.modal?.classList.remove('open');
  
  // Reset edit mode when closing
  resetEditMode();
  updateEditModeUI();

  document.dispatchEvent(new CustomEvent('tracker:closed', { detail: { returnToBlocksOnClose: shouldReturnToBlocks, returnToArrangementsOnClose: shouldReturnToArrangements } }));
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
    gridBackupsBySteps.clear();

    const nextSteps = Number.isInteger(data.steps) ? Math.min(Math.max(data.steps, 1), 256) : state.steps;
    state.steps = nextSteps;
    const savedChannels = Number.isInteger(data.channels) ? Math.min(Math.max(data.channels, 1), MAX_CHANNELS) : null;
    const gridCols = Array.isArray(data.grid) ? data.grid.length : 0;
    state.channels = savedChannels ?? Math.min(Math.max(gridCols, 1), MAX_CHANNELS);
    initGrid();

    if (!Array.isArray(data.grid) || data.grid.length < 1) {
      console.warn('[Tracker] Invalid grid data');
      return false;
    }

    // Load grid data (copy up to MAX_CHANNELS columns; extra columns in data are preserved when we serialize again)
    const copyChannels = Math.min(data.grid.length, MAX_CHANNELS);
    for (let ch = 0; ch < copyChannels; ch++) {
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

    // Load instrument assignments (pad to MAX_CHANNELS)
    if (data.channelInstruments && Array.isArray(data.channelInstruments)) {
      state.channelInstruments = data.channelInstruments.slice(0, MAX_CHANNELS);
    }
    while (state.channelInstruments.length < MAX_CHANNELS) {
      state.channelInstruments.push('');
    }
    state.channelInstruments = state.channelInstruments.slice(0, MAX_CHANNELS);
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
    syncChannelsUI();

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
