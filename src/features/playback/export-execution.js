/**
 * Module: features/playback/export-execution
 * Purpose: Pattern/arrangement export execution orchestration for JSON and JS song output.
 * Deps keys: alphabetical.
 */

import { exportPattern } from '../../export-logic.js';

let deps = {
    buildArrangementExportContext: async () => null,
    buildExportLengthWarningMessage: () => '',
    buildZzFXTrackSongJsModule: () => '',
    clearStatusAfter: () => {},
    confirmDialog: async () => false,
    escapeHtml: (value) => String(value || ''),
    estimateExportSizeBytes: () => 0,
    formatExportSize: () => '',
    getCurrentArrangementDraftState: () => null,
    getCurrentArrangementFilename: () => null,
    getCurrentPatternFilename: () => null,
    getDefragmentedInstruments: () => [],
    getDom: () => ({}),
    getExportDurationSeconds: () => 0,
    getInstrumentsForExporter: async () => ({ array: [], mapping: {}, monophonicByIndex: [] }),
    getPlaybackMixSettings: () => ({}),
    inferArrangeCyclesFromCode: () => null,
    isDemoMode: () => false,
    logError: () => {},
    saveCurrentArrangement: async () => {},
    saveCurrentPattern: async () => {},
    saveExportedJsFile: async () => {},
    saveExportedJsonFile: async () => {},
    setStatus: () => {},
    setZzFXTrackPreviewData: () => {},
    shouldWarnExportLength: () => false,
    slugify: (value) => String(value || '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9_-]/g, ''),
    validateCodeForExport: () => {},
};

export function configureExportExecution(options = {}) {
    deps = { ...deps, ...options };
}

function getRowsPerCycle(dom) {
    const resolutionInput = document.querySelector('input[name="exportResolution"]:checked');
    if (resolutionInput?.value === '48') return 48;
    if (resolutionInput?.value === 'custom') {
        const parsed = parseInt(dom.exportResolutionCustom?.value, 10);
        if (parsed && !Number.isNaN(parsed)) return parsed;
    }
    return 96;
}

async function saveExportedSongFiles(jsonFilename, songData) {
    if (deps.isDemoMode()) return;
    await deps.saveExportedJsonFile(jsonFilename, songData);
    const baseName = jsonFilename.replace(/\.json$/i, '');
    const jsFilename = `${baseName}.js`;
    try {
        const moduleText = deps.buildZzFXTrackSongJsModule(songData);
        await deps.saveExportedJsFile(jsFilename, moduleText);
    } catch (e) {
        deps.logError('Failed to save JS song module', e);
    }
}

export async function exportCurrentPattern(options = {}) {
    const { revealZzFXTrackPreview = true } = options;
    const dom = deps.getDom();
    if (!deps.getCurrentPatternFilename()) return;

    deps.validateCodeForExport(dom.repl.editor.code, {
        setStatus: deps.setStatus,
        getStatusText: () => dom.statusMsg?.innerText || '',
    });
    if (dom.statusMsg.innerText.startsWith('⚠️')) {
        const confirmed = await deps.confirmDialog({
            title: 'Export With Warnings?',
            message: 'This code uses functions that ZzFXTrack Player format ignores (e.g. reverb/delay). Export anyway?',
            confirmLabel: 'Export',
            cancelLabel: 'Cancel',
            variant: 'danger',
        });
        if (!confirmed) return;
    }

    const code = dom.repl.editor.code;
    let bpmEarly = 120;
    const bpmMatch = code.match(/(?:const|let|var)\s+bpm\s*=\s*(\d+)/);
    if (bpmMatch) bpmEarly = Number(bpmMatch[1]);
    const inferredCycles = deps.inferArrangeCyclesFromCode(code);
    const baseExportCycles = Number.isFinite(inferredCycles) && inferredCycles > 0 ? inferredCycles : 4;

    if (deps.shouldWarnExportLength(baseExportCycles, bpmEarly)) {
        const rowsPerCyclePat = getRowsPerCycle(dom);
        const { array: instrumentsPat } = await deps.getInstrumentsForExporter();
        const limitEnabledPat = dom.limitChannels?.checked;
        const channelCountPat = limitEnabledPat ? (parseInt(dom.maxChannelsInput?.value, 10) || 16) : 24;
        const durationSec = deps.getExportDurationSeconds(baseExportCycles, bpmEarly);
        const estimatedBytes = deps.estimateExportSizeBytes(baseExportCycles, rowsPerCyclePat, instrumentsPat?.length ?? 0, channelCountPat);
        const message = deps.buildExportLengthWarningMessage({
            durationSec,
            cycles: baseExportCycles,
            bpm: bpmEarly,
            estimatedSizeText: deps.formatExportSize(estimatedBytes),
        });
        const confirmed = await deps.confirmDialog({
            title: 'Warning',
            message,
            confirmLabel: 'Proceed',
            cancelLabel: 'Cancel',
            variant: 'danger',
        });
        if (!confirmed) return;
    }

    deps.setStatus('Exporting...');
    try {
        await deps.saveCurrentPattern();
        const editor = dom.repl.editor;
        await editor.repl.evaluate(code, false);
        const pattern = editor.repl.scheduler.pattern;
        if (!pattern) throw new Error('No pattern found. Try playing the pattern first?');

        let bpm = 120;
        const match = code.match(/(?:const|let|var)\s+bpm\s*=\s*(\d+)/);
        if (match) bpm = Number(match[1]);

        const { array: instrumentArray, mapping: instrumentMapping, monophonicByIndex } = await deps.getInstrumentsForExporter();
        const isLimitEnabled = dom.limitChannels.checked;
        const maxChannels = isLimitEnabled ? (parseInt(dom.maxChannelsInput.value, 10) || 16) : Infinity;
        const normalizeLayers = dom.normalizeLayers?.checked || false;
        const rowsPerCycle = getRowsPerCycle(dom);

        const inferredArrangeCycles = deps.inferArrangeCyclesFromCode(code);
        const isArrangementSong = Number.isFinite(inferredArrangeCycles) && inferredArrangeCycles > 0;
        const cycles = inferredArrangeCycles || 4;
        const result = exportPattern(pattern, bpm, instrumentArray, instrumentMapping, cycles, {
            maxVoicesPerInstrument: maxChannels,
            normalizeUnisonLayers: normalizeLayers,
            rowsPerCycle,
            monophonicByInstrumentIndex: monophonicByIndex,
            forceCycles: isArrangementSong ? inferredArrangeCycles : null,
        });
        const exportData = { song: result.song, mix: deps.getPlaybackMixSettings() };
        const { channelCount, droppedNotes, unknownInstrumentNotes, unknownInstrumentAliases = [] } = result.stats;

        deps.setZzFXTrackPreviewData(exportData, { monophonicByInstrumentIndex: monophonicByIndex }, {
            type: 'pattern',
            filename: deps.getCurrentPatternFilename(),
            reveal: revealZzFXTrackPreview,
        });

        const jsonFilename = deps.getCurrentPatternFilename().replace('.js', '.json');
        await saveExportedSongFiles(jsonFilename, exportData);

        let statusMsg = `/output/${jsonFilename} (${channelCount} ch)`;
        if (droppedNotes > 0) statusMsg += ` • ${droppedNotes} notes dropped`;
        if (unknownInstrumentNotes > 0) {
            const incompatibleList = unknownInstrumentAliases.length ? unknownInstrumentAliases.join(', ') : `${unknownInstrumentNotes} unknown`;
            dom.statusMsg.innerHTML = `${deps.escapeHtml(statusMsg)} • <span class="text-destructive">Incompatible sounds: ${deps.escapeHtml(incompatibleList)}</span>`;
            dom.statusMsg.classList.remove('status-error', 'status-success', 'status-normal');
            dom.statusMsg.classList.add('status-normal');
            dom.statusMsg.style.opacity = '1';
            if (dom.footerStatusRow) {
                const r = dom.footerStatusRow;
                r.classList.remove('is-expanded');
                void r.offsetHeight;
                r.classList.add('is-expanded');
            }
            deps.clearStatusAfter();
        } else {
            if (deps.isDemoMode()) statusMsg += ' • Demo mode: not written to /output';
            deps.setStatus(statusMsg, 'success');
        }
    } catch (e) {
        deps.logError(e);
        deps.setStatus(`Export failed: ${e.message}`, 'error');
    }
}

export async function exportCurrentArrangement() {
    const dom = deps.getDom();
    if (!deps.getCurrentArrangementFilename() || !deps.getCurrentArrangementDraftState()) return;
    try {
        await deps.saveCurrentArrangement();
        const context = await deps.buildArrangementExportContext();
        if (!context) {
            deps.setStatus('Arrangement export failed: no arrangement selected.', 'error');
            return;
        }
        const arrangementState = context.arrangementState;
        const bpm = arrangementState.bpm || context.bpm || 120;
        const rows = Array.isArray(arrangementState.rows) ? arrangementState.rows : [];
        const arrangementCycles = rows.reduce((sum, row) => {
            const repeats = Number.isInteger(row?.repeats) ? Math.min(Math.max(row.repeats, 1), 16) : 1;
            return sum + repeats;
        }, 0);

        const rowsPerCycleForWarning = getRowsPerCycle(dom);
        const { array: instrumentsForCount } = await deps.getInstrumentsForExporter();
        const limitEnabledArr = dom.limitChannels?.checked;
        const channelCountForWarning = limitEnabledArr ? (parseInt(dom.maxChannelsInput?.value, 10) || 16) : 24;
        if (deps.shouldWarnExportLength(arrangementCycles, bpm)) {
            const durationSec = deps.getExportDurationSeconds(arrangementCycles, bpm);
            const estimatedBytes = deps.estimateExportSizeBytes(arrangementCycles, rowsPerCycleForWarning, instrumentsForCount?.length ?? 0, channelCountForWarning);
            const message = deps.buildExportLengthWarningMessage({
                durationSec,
                cycles: arrangementCycles,
                bpm,
                estimatedSizeText: deps.formatExportSize(estimatedBytes),
            });
            const confirmed = await deps.confirmDialog({
                title: 'Warning',
                message,
                confirmLabel: 'Proceed',
                cancelLabel: 'Cancel',
                variant: 'danger',
            });
            if (!confirmed) {
                deps.setStatus('');
                return;
            }
        }

        const toVarSlug = (str) => deps.slugify(str, { fallback: 'x', maxLength: 40 });

        const blockByFilename = new Map(context.blocks.map((block) => [block.filename, block]));
        const blockVarByFilename = {};
        const usedVarNames = new Set();
        const nextVar = (base) => {
            let candidate = base;
            let n = 2;
            while (usedVarNames.has(candidate)) {
                candidate = `${base}_${n}`;
                n += 1;
            }
            usedVarNames.add(candidate);
            return candidate;
        };

        const wantedBlockFiles = Array.from(new Set(
            rows.flatMap((row) => Array.isArray(row?.blocks) ? row.blocks : []).filter(Boolean)
        ));
        const blockDeclarations = [];
        for (const filename of wantedBlockFiles) {
            const block = blockByFilename.get(filename);
            if (!block) continue;
            const baseVar = `block_${toVarSlug(filename.replace(/\.js$/i, ''))}`;
            const varName = nextVar(baseVar);
            blockVarByFilename[filename] = varName;
            let scaledPattern = String(block.pattern || '').trim() || 'silence';
            const stepsInt = block?.trackerState?.steps;
            if (scaledPattern !== 'silence' && Number.isInteger(stepsInt) && stepsInt !== 16) {
                const stepFactor = stepsInt / 16;
                if (Number.isFinite(stepFactor) && stepFactor > 0 && stepFactor !== 1) {
                    scaledPattern = `(${scaledPattern}).slow(${Number(stepFactor.toFixed(4))})`;
                }
            }
            blockDeclarations.push(`const ${varName} = ${scaledPattern};`);
        }

        const arrangeLines = rows.map((row) => {
            const repeats = Number.isInteger(row?.repeats) ? Math.min(Math.max(row.repeats, 1), 16) : 1;
            const vars = (Array.isArray(row?.blocks) ? row.blocks : []).map((filename) => blockVarByFilename[filename]).filter(Boolean);
            if (!vars.length) return `  [${repeats}, silence]`;
            return `  [${repeats}, stack(${vars.join(', ')})]`;
        });
        const arrangementCode = [
            `const bpm = ${Math.max(20, Math.min(300, bpm))};`,
            'setcps(bpm/240);',
            '',
            ...(blockDeclarations.length ? blockDeclarations : ['const block_silence = silence;']),
            '',
            'const arrangement_pattern = arrange(',
            arrangeLines.join(',\n'),
            ');',
            '',
            'arrangement_pattern',
        ].join('\n');

        const rowCycleBoundaries = [0];
        for (const row of rows) {
            const repeats = Number.isInteger(row?.repeats) ? Math.min(Math.max(row.repeats, 1), 16) : 1;
            rowCycleBoundaries.push(rowCycleBoundaries[rowCycleBoundaries.length - 1] + repeats);
        }

        const editor = dom.repl.editor;
        await editor.repl.evaluate(arrangementCode, false);
        const pattern = editor.repl.scheduler.pattern;
        if (!pattern) throw new Error('No arrangement pattern found');

        const usedAliases = new Set();
        for (const block of context.blocks) {
            const ts = block.trackerState || context.trackerStateByFilename[block.filename];
            if (ts && Array.isArray(ts.channelInstruments)) {
                ts.channelInstruments.forEach((id) => { if (id) usedAliases.add(id); });
            }
        }
        const fullList = deps.getDefragmentedInstruments();
        const { array: fullInstrumentArray, mapping: fullMapping, monophonicByIndex: fullMonophonic } = await deps.getInstrumentsForExporter();
        const usedIndices = [];
        fullList.forEach((inst, i) => {
            if (usedAliases.has(inst.strudelAlias)) usedIndices.push(i);
        });
        const instrumentArray = usedIndices.length > 0 ? usedIndices.map((i) => fullInstrumentArray[i]) : fullInstrumentArray;
        const instrumentMapping = usedIndices.length > 0
            ? Object.fromEntries(usedIndices.map((oldIdx, newIdx) => [fullList[oldIdx].strudelAlias, newIdx]))
            : fullMapping;
        const monophonicByIndex = usedIndices.length > 0 ? usedIndices.map((i) => fullMonophonic[i]) : fullMonophonic;

        const isLimitEnabled = dom.limitChannels.checked;
        const maxChannels = isLimitEnabled ? (parseInt(dom.maxChannelsInput.value, 10) || 16) : Infinity;
        const normalizeLayers = dom.normalizeLayers?.checked || false;
        const rowsPerCycle = getRowsPerCycle(dom);

        const result = exportPattern(pattern, bpm, instrumentArray, instrumentMapping, arrangementCycles || 4, {
            maxVoicesPerInstrument: maxChannels,
            normalizeUnisonLayers: normalizeLayers,
            rowsPerCycle,
            monophonicByInstrumentIndex: monophonicByIndex,
            forceCycles: arrangementCycles || null,
            rowCycleBoundaries: rowCycleBoundaries.length >= 2 ? rowCycleBoundaries : null,
            simpleExport: Boolean(dom.simpleExport?.checked),
        });
        const exportData = { song: result.song, mix: deps.getPlaybackMixSettings() };
        const { channelCount, droppedNotes, unknownInstrumentNotes, unknownInstrumentAliases = [] } = result.stats;

        deps.setZzFXTrackPreviewData(exportData, { monophonicByInstrumentIndex: monophonicByIndex }, {
            type: 'arrangement',
            filename: deps.getCurrentArrangementFilename(),
            reveal: true,
        });

        const jsonFilename = deps.getCurrentArrangementFilename().replace(/\.js$/i, '.json');
        await saveExportedSongFiles(jsonFilename, exportData);

        let statusMsg = `/output/${jsonFilename} (${channelCount} ch)`;
        if (droppedNotes > 0) statusMsg += ` • ${droppedNotes} notes dropped`;
        if (unknownInstrumentNotes > 0) {
            const incompatibleList = unknownInstrumentAliases.length ? unknownInstrumentAliases.join(', ') : `${unknownInstrumentNotes} unknown`;
            deps.setStatus(`${statusMsg} • Incompatible sounds: ${incompatibleList}`, 'error');
        } else if (deps.isDemoMode()) {
            deps.setStatus(`${statusMsg} • Demo mode: not written to /output`, 'success');
        } else {
            deps.setStatus(statusMsg, 'success');
        }
    } catch (e) {
        deps.logError(e);
        deps.setStatus(`Arrangement export failed: ${e.message}`, 'error');
    }
}
