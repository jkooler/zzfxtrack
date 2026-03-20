/**
 * Module: features/blocks/block-controller
 * Purpose: Block lifecycle operations, safeguards, and block-related UI event orchestration.
 * Deps keys: alphabetical.
 */

let deps = {
    alertDialog: async () => {},
    closeTracker: () => {},
    confirmDialog: async () => false,
    deleteBlockByFilenameWithConflictInfo: async () => ({ ok: false }),
    dispatchBlocksTargetPatternScope: () => {},
    editorToFile: (value) => value,
    ensureArrangementsSection: (value) => value,
    ensureBlocksSection: (value) => value,
    fileToEditor: (value) => value,
    getActiveArrangementBlockFilename: () => null,
    getArrangementDraftState: () => null,
    getArrangementEntriesCache: () => [],
    getBlockByFilename: () => null,
    getBlockDetailOrNull: async () => null,
    getCurrentArrangementFilename: () => null,
    getCurrentArrangementScope: () => 'user',
    getCurrentPatternFilename: () => null,
    getCurrentPatternScope: () => 'user',
    getTrackerWorkspaceLoadedFilename: () => null,
    getDefragmentedInstruments: async () => [],
    getDeveloperModeHeaders: () => ({}),
    getPlaybackMixSettings: () => ({}),
    getReplEditor: () => null,
    isDemoMode: () => false,
    isDeveloperModeEnabled: () => false,
    logError: () => {},
    nextAvailableVarName: (_fileCode, baseVar) => baseVar,
    normalizePatternStack: (value) => value,
    normalizeScope: (value) => (value === 'system' ? 'system' : 'user'),
    openBlocksModal: () => {},
    openTrackerModal: async () => {},
    openTrackerModalForEdit: async () => {},
    previewTrackerStateOnce: () => {},
    refreshBlocksLibrary: async () => {},
    renderTrackerWorkspace: () => {},
    resolveTrackerStateChannelInstruments: (value) => value,
    restoreSuspendedBlocksModals: () => {},
    savePatternSource: async () => {},
    setActiveArrangementBlockFilename: () => {},
    setTrackerWorkspaceLoadedFilename: () => {},
    setStatus: () => {},
    slugify: (value) => String(value || ''),
    stopTrackerPreviewPlayback: () => {},
    updatePlayState: () => {},
    upsertPatternLayer: (value) => value,
};

export function configureBlockController(options = {}) {
    deps = { ...deps, ...options };
}

export function getArrangementReferencesForBlock(filename) {
    const refs = [];
    deps.getArrangementEntriesCache().forEach((entry) => {
        if (entry?.arrangementState?.rows?.some((row) => Array.isArray(row?.blocks) && row.blocks.includes(filename))) {
            refs.push(entry);
        }
    });
    const currentFilename = deps.getCurrentArrangementFilename();
    const draftState = deps.getArrangementDraftState();
    if (currentFilename && draftState?.rows?.some((row) => Array.isArray(row?.blocks) && row.blocks.includes(filename))) {
        const already = refs.some((entry) => entry.filename === currentFilename);
        if (!already) {
            refs.push({
                filename: currentFilename,
                name: draftState.name,
                scope: deps.getCurrentArrangementScope(),
            });
        }
    }
    return refs;
}

export async function deleteBlockFromLibrary(filename, displayName) {
    if (!filename) return;
    const block = deps.getBlockByFilename(filename);
    if (!block) return;
    if (deps.normalizeScope(block?.scope) === 'system' && !deps.isDeveloperModeEnabled()) {
        deps.setStatus('System blocks cannot be deleted. Enable developer mode to delete them.', 'normal');
        return;
    }

    const refs = getArrangementReferencesForBlock(filename);
    if (refs.length) {
        const list = refs.map((entry) => `${entry.name || entry.filename} (${entry.filename})`).join(', ');
        await deps.alertDialog({
            title: 'Cannot Delete Block',
            message: `This block is used in arrangements:\n${list}`,
            hideCancelCompletely: true,
        });
        return;
    }

    const confirmed = await deps.confirmDialog({
        title: 'Delete Block?',
        message: `Delete block "${displayName}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
    });
    if (!confirmed) return;

    try {
        const deleteResult = await deps.deleteBlockByFilenameWithConflictInfo(filename, deps.getDeveloperModeHeaders());
        if (!deleteResult.ok && deleteResult.status === 409) {
            const list = deleteResult.usedBy.length
                ? deleteResult.usedBy.map((entry) => `${entry.name || entry.filename} (${entry.filename})`).join(', ')
                : 'one or more arrangements';
            await deps.alertDialog({
                title: 'Cannot Delete Block',
                message: `This block is used in arrangements:\n${list}`,
                hideCancelCompletely: true,
            });
            return;
        }
        if (deps.getActiveArrangementBlockFilename() === filename) {
            deps.setActiveArrangementBlockFilename(null);
        }
        const trackerWorkspaceLoadedFilename = String(deps.getTrackerWorkspaceLoadedFilename() || '');
        if (trackerWorkspaceLoadedFilename === filename || trackerWorkspaceLoadedFilename.startsWith(`${filename}::`)) {
            deps.setTrackerWorkspaceLoadedFilename(null);
            deps.closeTracker();
        }
        await deps.refreshBlocksLibrary();
        deps.renderTrackerWorkspace();
        deps.setStatus('Block deleted', 'success');
    } catch (err) {
        deps.logError('[Blocks] Delete failed:', err);
        deps.setStatus('Failed to delete block', 'error');
    }
}

export function setupBlocksEventListeners() {
    const blocksBtn = document.getElementById('blocksBtn');
    blocksBtn?.addEventListener('click', () => {
        if (!deps.getCurrentPatternFilename()) return;
        deps.openBlocksModal();
    });

    document.addEventListener('blocks:modalOpen', () => {
        const editor = deps.getReplEditor();
        if (editor && editor.repl.scheduler.started) {
            editor.stop();
            deps.updatePlayState(false);
        }
        deps.dispatchBlocksTargetPatternScope({ scope: deps.getCurrentPatternScope() });
    });

    document.addEventListener('blocks:modalClose', (e) => {
        if (e?.detail?.reason === 'arrangement') return;
        deps.stopTrackerPreviewPlayback();
    });

    document.addEventListener('blocks:create', (e) => {
        const detail = e?.detail || {};
        Promise.resolve(deps.openTrackerModal({
            returnToArrangementsOnClose: Boolean(detail.returnToArrangementsOnClose),
            returnToBlocksOnClose: typeof detail.returnToBlocksOnClose === 'boolean' ? detail.returnToBlocksOnClose : undefined,
            arrangementInsertRowIndex: detail.arrangementInsertRowIndex,
        })).catch((err) => {
            deps.logError('[Blocks] Failed to open tracker for new block:', err);
            deps.restoreSuspendedBlocksModals({ arrangement: Boolean(detail.returnToArrangementsOnClose) });
            deps.setStatus('Failed to open tracker', 'error');
        });
    });

    document.addEventListener('blocks:edit', async (e) => {
        const { block, trackerState, returnToArrangementsOnClose, returnToBlocksOnClose } = e.detail || {};
        try {
            await deps.openTrackerModalForEdit(block, trackerState, { returnToArrangementsOnClose, returnToBlocksOnClose });
        } catch (err) {
            deps.logError('[Blocks] Failed to open tracker for edit:', err);
            deps.restoreSuspendedBlocksModals({ arrangement: Boolean(returnToArrangementsOnClose) });
            deps.setStatus('Failed to open block in tracker', 'error');
        }
    });

    document.addEventListener('blocks:insert', (e) => {
        const { pattern, name, preserveBlockBpm, blockBpm, blockSteps } = e.detail || {};
        const editor = deps.getReplEditor();
        if (!pattern || !editor) return;

        let fileCode = deps.editorToFile(editor.code || '');
        const toBlockSlug = (str) => deps.slugify(str, { fallback: 'block', maxLength: 32 });
        fileCode = deps.ensureBlocksSection(fileCode);

        const baseVar = `block_${toBlockSlug(name)}`;
        const varName = deps.nextAvailableVarName(fileCode, baseVar);
        let scaledPattern = pattern;

        if (preserveBlockBpm && blockBpm) {
            const bpmMatch = fileCode.match(/export\s+const\s+bpm\s*=\s*(\d+)/);
            const patternBpm = bpmMatch ? Number(bpmMatch[1]) : 120;
            const factor = patternBpm && blockBpm ? (patternBpm / blockBpm) : 1;
            if (Number.isFinite(factor) && factor !== 1) {
                const factorStr = Number(factor.toFixed(4));
                scaledPattern = `(${pattern}).slow(${factorStr})`;
            }
        }

        const stepsInt = Number.isInteger(blockSteps) ? blockSteps : null;
        if (stepsInt && stepsInt !== 16) {
            const stepFactor = stepsInt / 16;
            if (Number.isFinite(stepFactor) && stepFactor > 0 && stepFactor !== 1) {
                const stepFactorStr = Number(stepFactor.toFixed(4));
                scaledPattern = `(${scaledPattern}).slow(${stepFactorStr})`;
            }
        }

        fileCode = fileCode.replace(
            /\/\/ BLOCKS END/,
            `const ${varName} = ${scaledPattern};\n// BLOCKS END`
        );
        fileCode = deps.upsertPatternLayer(fileCode, varName, { validateExistingExpression: true });
        fileCode = deps.normalizePatternStack(fileCode);
        const editorCode = deps.fileToEditor(fileCode);
        editor.setCode(editorCode);
        deps.savePatternSource(deps.getCurrentPatternFilename(), fileCode, deps.getDeveloperModeHeaders()).catch(() => {});
        deps.setStatus(`Block "${name}" inserted into pattern`, 'success');
    });

    document.addEventListener('arrangements:insert', async (e) => {
        const { arrangement } = e.detail || {};
        const editor = deps.getReplEditor();
        if (!arrangement || !editor) return;

        let fileCode = deps.editorToFile(editor.code || '');
        const toVarSlug = (str) => deps.slugify(str, { fallback: 'x', maxLength: 32 });
        fileCode = deps.ensureBlocksSection(fileCode);
        fileCode = deps.ensureArrangementsSection(fileCode);

        const rows = arrangement.arrangementState?.rows || [];
        const wantedBlockFiles = Array.from(new Set(rows.flatMap((r) => Array.isArray(r.blocks) ? r.blocks : [])));
        const blockVarByFilename = {};
        const usedBlockVars = new Set();

        for (const filename of wantedBlockFiles) {
            try {
                const block = await deps.getBlockDetailOrNull(filename);
                if (!block) continue;
                const baseVar = `block_${toVarSlug(filename.replace(/\.js$/, ''))}`;
                const varName = usedBlockVars.has(baseVar) ? deps.nextAvailableVarName(fileCode, baseVar) : baseVar;
                blockVarByFilename[filename] = varName;
                usedBlockVars.add(varName);

                const already = new RegExp(`\\bconst\\s+${varName}\\b`).test(fileCode);
                if (already) continue;

                const stepsInt = block?.trackerState?.steps;
                let scaledPattern = block.pattern;
                if (Number.isInteger(stepsInt) && stepsInt !== 16) {
                    const stepFactor = stepsInt / 16;
                    if (Number.isFinite(stepFactor) && stepFactor > 0 && stepFactor !== 1) {
                        const stepFactorStr = Number(stepFactor.toFixed(4));
                        scaledPattern = `(${scaledPattern}).slow(${stepFactorStr})`;
                    }
                }
                fileCode = fileCode.replace(
                    /\/\/ BLOCKS END/,
                    `const ${varName} = ${scaledPattern};\n// BLOCKS END`
                );
            } catch (err) {
                console.warn('[Arranger] Failed to fetch block for insertion:', filename, err);
            }
        }

        const arrName = arrangement.name || arrangement.arrangementState?.name || 'arrangement';
        const baseArrVar = `arr_${toVarSlug(arrName)}`;
        const arrVar = new RegExp(`\\bconst\\s+${baseArrVar}\\b`).test(fileCode)
            ? deps.nextAvailableVarName(fileCode, baseArrVar)
            : baseArrVar;
        const arrangeLines = rows.map((r) => {
            const reps = Number.isInteger(r.repeats) ? r.repeats : 1;
            const blocks = Array.isArray(r.blocks) ? r.blocks : [];
            if (!blocks.length) return `  [${reps}, silence]`;
            const vars = blocks.map((f) => blockVarByFilename[f]).filter(Boolean);
            if (!vars.length) return `  [${reps}, silence]`;
            return `  [${reps}, stack(${vars.join(', ')})]`;
        });
        const arrangeExpr = `arrange(\n${arrangeLines.join(',\n')}\n)`;
        fileCode = fileCode.replace(
            /\/\/ ARRANGEMENTS END/,
            `const ${arrVar} = ${arrangeExpr};\n// ARRANGEMENTS END`
        );
        fileCode = deps.upsertPatternLayer(fileCode, arrVar);
        fileCode = deps.normalizePatternStack(fileCode);
        editor.setCode(deps.fileToEditor(fileCode));
        deps.savePatternSource(deps.getCurrentPatternFilename(), fileCode, deps.getDeveloperModeHeaders()).catch(() => {});
        deps.setStatus(`Arrangement "${arrName}" inserted into pattern`, 'success');
    });

    document.addEventListener('blocks:preview', async (e) => {
        const { trackerState } = e.detail || {};
        if (!trackerState) return;
        const instruments = await deps.getDefragmentedInstruments();
        const instrumentList = instruments.map((inst) => ({
            id: inst.strudelAlias,
            name: inst.strudelAlias,
            params: inst.params,
        }));
        const resolved = deps.resolveTrackerStateChannelInstruments(trackerState);
        deps.previewTrackerStateOnce(resolved, instrumentList, (resolved || trackerState).bpm || 120, deps.getPlaybackMixSettings());
    });

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
            if (!deps.getCurrentPatternFilename()) return;
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
                e.preventDefault();
                deps.openBlocksModal();
            }
        }
    });
}
