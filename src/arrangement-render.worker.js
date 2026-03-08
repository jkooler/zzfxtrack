import { zzfxG } from './zzfx-core.js';
import { dbToGain, sanitizePlaybackMixSettings, softClipSample } from './mix-settings.js';

const workerSourceRenderCacheByFilename = new Map();
const workerSourceRenderCacheByStateKey = new Map();
const MAX_SOURCE_CACHE_ENTRIES = 256;
const ARRANGEMENT_RENDER_PROFILE_EXPORT = 'export';
const ARRANGEMENT_RENDER_PROFILE_LIVE = 'live_export_match';

const REFERENCE_MIX_SETTINGS = Object.freeze({ targetPeak: 1, masterGainDb: 0, softClipDrive: 1 });

function pruneMap(map, maxEntries) {
  while (map.size > maxEntries) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
}

function getMixSettingsSignature(mixSettings) {
  return `${mixSettings.targetPeak}|${mixSettings.masterGainDb}|${mixSettings.softClipDrive}`;
}

function getInstrumentListSignature(instrumentList) {
  if (!Array.isArray(instrumentList) || instrumentList.length === 0) return 'none';
  return instrumentList
    .map((inst) => {
      const id = String(inst?.id || '');
      const params = Array.isArray(inst?.params) ? inst.params.join(',') : '';
      return `${id}:${params}`;
    })
    .join('|');
}

function resolveSubsteps(repsValue, ndValue) {
  const reps = Number.isInteger(repsValue) && repsValue > 1 ? repsValue : 1;
  const nd = Number.isInteger(ndValue) && ndValue > 0 ? ndValue : 0;
  const gcd = (a, b) => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
      const t = y;
      y = x % y;
      x = t;
    }
    return x || 1;
  };
  const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);
  const substepCount = lcm(4, reps);
  const stepSize = substepCount / reps;
  const maxDelay = Math.max(substepCount - (reps - 1) * stepSize - 1, 0);
  const desiredDelay = Math.round((nd / 4) * substepCount);
  const delaySteps = Math.min(Math.max(desiredDelay, 0), maxDelay);
  return { reps, delaySteps, substepCount };
}

function renderTrackerStateToMixBuffer(trackerState, instrumentList, bpm, { tailSeconds = 0, normalizeMaster = true, mixSettings = null, applyMasterProcessing = true } = {}) {
  const resolvedMixSettings = sanitizePlaybackMixSettings(mixSettings || {});
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

  const hasPlayableNote = (cell) => {
    const n = cell && typeof cell === 'object' ? cell.note : cell;
    return n && n !== '~' && n !== '-';
  };
  const hasContent = grid.some((channel, ch) => {
    const instId = channelInstruments[ch];
    if (!instId) return false;
    return Array.isArray(channel) && channel.some(hasPlayableNote);
  });
  if (!hasContent) return null;

  const secondsPerBeat = 60 / bpm;
  const secondsPerStep = secondsPerBeat / 4;
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
      c: 0, 'c#': 1, d: 2, 'd#': 3, e: 4, f: 5,
      'f#': 6, g: 7, 'g#': 8, a: 9, 'a#': 10, b: 11,
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

  const instrumentById = new Map((instrumentList || []).map(inst => [inst.id, inst]));
  let mixedNotes = 0;

  for (let ch = 0; ch < channels; ch++) {
    const instrumentId = channelInstruments[ch];
    if (!instrumentId) continue;

    const instrument = instrumentById.get(instrumentId);
    if (!instrument || !instrument.params) continue;

    const baseParams = instrument.params;
    const channel = grid[ch] || [];

    for (let step = 0; step < steps; step++) {
      const cell = channel[step];
      const note = cell && typeof cell === 'object' ? cell.note : cell;
      const freq = noteToFreq(note);
      if (freq == null) continue;

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
        } catch (_err) {
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

  if (mixedNotes === 0) return null;

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

function getArrangementRowScale(rowMix, targetPeakPerRow, renderProfile) {
  let rowMax = 0;
  for (let i = 0; i < rowMix.length; i++) {
    rowMax = Math.max(rowMax, Math.abs(rowMix[i]));
  }
  if (rowMax <= 0) return 1;
  if (renderProfile === ARRANGEMENT_RENDER_PROFILE_LIVE) {
    return 1;
  }
  return targetPeakPerRow / rowMax;
}

function renderArrangementStateToMixBuffer(
  arrangementState,
  trackerStateByFilename,
  instrumentList,
  bpm = 120,
  overrides = {},
  mixSettings = null,
  renderProfile = ARRANGEMENT_RENDER_PROFILE_EXPORT
) {
  if (!arrangementState || !instrumentList) return null;
  const resolvedMixSettings = sanitizePlaybackMixSettings(mixSettings || {});
  const forBuffer = renderProfile === ARRANGEMENT_RENDER_PROFILE_LIVE ? REFERENCE_MIX_SETTINGS : resolvedMixSettings;
  const targetPeak = forBuffer.targetPeak;
  const masterGain = dbToGain(forBuffer.masterGainDb);
  const clipDrive = forBuffer.softClipDrive;
  const applyMasterAtPlayback = renderProfile === ARRANGEMENT_RENDER_PROFILE_LIVE;

  const secondsPerBeat = 60 / bpm;
  const secondsPerStep = secondsPerBeat / 4;
  const sampleRate = 44100;
  const samplesPerStep = Math.floor(secondsPerStep * sampleRate);
  const secondsPerStepExact = samplesPerStep / sampleRate;

  const rows = Array.isArray(arrangementState.rows) ? arrangementState.rows : [];
  if (!rows.length) return null;

  const overridesByFilename = overrides?.byFilename instanceof Map ? overrides.byFilename : null;
  const overridesByRowIndex = overrides?.byRowIndex instanceof Map ? overrides.byRowIndex : null;

  const rowDescriptors = rows.map((r, rowIndex) => {
    const cycles = Number.isInteger(r?.repeats) ? Math.min(Math.max(r.repeats, 1), 16) : 1;
    const files = Array.isArray(r?.blocks) ? r.blocks.filter(Boolean) : [];
    const rowOverride = overridesByRowIndex?.get(rowIndex);
    const sources = files
      .map((f) => ({ filename: f, trackerState: overridesByFilename?.get(f) || trackerStateByFilename?.[f] }))
      .filter((entry) => Boolean(entry.trackerState));
    if (rowOverride) sources.push({ filename: null, trackerState: rowOverride });
    return { cycles, sources, loop: Boolean(r?.loop) };
  });

  let lastLoopIndex = -1;
  for (let i = 0; i < rowDescriptors.length; i++) {
    if (rowDescriptors[i].loop) lastLoopIndex = i;
  }
  const effectiveDescriptors = lastLoopIndex >= 0 ? rowDescriptors.slice(0, lastLoopIndex + 1) : rowDescriptors;

  const totalCycles = effectiveDescriptors.reduce((sum, r) => sum + r.cycles, 0);
  if (!totalCycles) return null;

  const loopSamples = totalCycles * 16 * samplesPerStep;
  if (loopSamples <= 0) return null;
  const tailSamples = Math.min(sampleRate, loopSamples);
  const totalSamples = loopSamples + tailSamples;
  const mixBuffer = new Float32Array(totalSamples);

  const sourceSignature = `${renderProfile}|${bpm}|${getMixSettingsSignature(forBuffer)}|${getInstrumentListSignature(instrumentList)}`;
  const getRenderedSource = (filename, trackerState) => {
    if (!trackerState) return null;

    const trackerStateKey = JSON.stringify({
      channels: trackerState.channels,
      steps: trackerState.steps,
      grid: trackerState.grid,
      channelInstruments: trackerState.channelInstruments,
      reps: trackerState.reps,
      nd: trackerState.nd,
      vol: trackerState.vol,
    });

    if (filename) {
      const cachedByFilename = workerSourceRenderCacheByFilename.get(filename);
      if (
        cachedByFilename
        && cachedByFilename.signature === sourceSignature
        && cachedByFilename.trackerStateKey === trackerStateKey
      ) {
        return cachedByFilename.rendered;
      }
    }

    const stateCacheKey = `${sourceSignature}|${trackerStateKey}`;
    if (workerSourceRenderCacheByStateKey.has(stateCacheKey)) {
      const cached = workerSourceRenderCacheByStateKey.get(stateCacheKey);
      if (filename) {
        workerSourceRenderCacheByFilename.set(filename, {
          signature: sourceSignature,
          trackerStateKey,
          rendered: cached,
        });
        pruneMap(workerSourceRenderCacheByFilename, MAX_SOURCE_CACHE_ENTRIES);
      }
      return cached;
    }

    const rendered = renderTrackerStateToMixBuffer(trackerState, instrumentList, bpm, {
      tailSeconds: 1,
      normalizeMaster: false,
      mixSettings: forBuffer,
      applyMasterProcessing: false,
    });
    if (!rendered?.mixBuffer) return null;

    workerSourceRenderCacheByStateKey.set(stateCacheKey, rendered);
    pruneMap(workerSourceRenderCacheByStateKey, MAX_SOURCE_CACHE_ENTRIES);

    if (filename) {
      workerSourceRenderCacheByFilename.set(filename, {
        signature: sourceSignature,
        trackerStateKey,
        rendered,
      });
      pruneMap(workerSourceRenderCacheByFilename, MAX_SOURCE_CACHE_ENTRIES);
    }

    return rendered;
  };

  let writeOffset = 0;
  let anyMixed = false;
  const numRows = effectiveDescriptors.length;
  const targetPeakPerRow = numRows > 0 ? targetPeak / numRows : targetPeak;

  for (const row of effectiveDescriptors) {
    const rowMainSamples = row.cycles * 16 * samplesPerStep;
    const rowMix = new Float32Array(rowMainSamples + tailSamples);

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

    const rowScale = getArrangementRowScale(
      rowMix,
      targetPeakPerRow,
      renderProfile
    );
    if (rowScale !== 1) {
      for (let i = 0; i < rowMix.length; i++) rowMix[i] *= rowScale;
    }

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
  if (!anyMixed || maxAmp === 0) return null;

  if (maxAmp > 0) {
    const scale = targetPeak / maxAmp;
    for (let i = 0; i < mixBuffer.length; i++) {
      mixBuffer[i] *= scale;
    }
  }

  if (!applyMasterAtPlayback) {
    for (let i = 0; i < mixBuffer.length; i++) {
      mixBuffer[i] = softClipSample(mixBuffer[i] * masterGain, clipDrive);
    }
  }

  return {
    mixBuffer,
    sampleRate,
    secondsPerStep: secondsPerStepExact,
    totalSteps: totalCycles * 16,
    loopSegment: lastLoopIndex >= 0,
    loopRowIndex: lastLoopIndex >= 0 ? lastLoopIndex : undefined,
  };
}

self.onmessage = (event) => {
  const data = event.data || {};
  if (data.type === 'clearSourceCache') {
    workerSourceRenderCacheByFilename.clear();
    workerSourceRenderCacheByStateKey.clear();
    return;
  }
  const { id, payload } = data;
  if (!id || !payload) return;

  try {
    const {
      arrangementState,
      trackerStateByFilename,
      instrumentList,
      bpm,
      mixSettings,
      renderProfile = ARRANGEMENT_RENDER_PROFILE_EXPORT,
      overridesByFilenameEntries,
      overridesByRowIndexEntries,
    } = payload;

    const overrides = {
      byFilename: new Map(Array.isArray(overridesByFilenameEntries) ? overridesByFilenameEntries : []),
      byRowIndex: new Map(Array.isArray(overridesByRowIndexEntries) ? overridesByRowIndexEntries : []),
    };

    const rendered = renderArrangementStateToMixBuffer(
      arrangementState,
      trackerStateByFilename,
      instrumentList,
      bpm,
      overrides,
      mixSettings,
      renderProfile
    );

    if (!rendered?.mixBuffer) {
      self.postMessage({ id, ok: true, rendered: null });
      return;
    }

    self.postMessage(
      {
        id,
        ok: true,
        rendered: {
          ...rendered,
          mixBuffer: rendered.mixBuffer.buffer,
        },
      },
      [rendered.mixBuffer.buffer]
    );
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
