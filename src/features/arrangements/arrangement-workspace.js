/**
 * Module: features/arrangements/arrangement-workspace
 * Purpose: Arrangement workspace rendering, playhead visuals, and row/chip interactions.
 * Deps keys: alphabetical.
 */

let deps = {
    applyArrangementPreviewAfterBlockRemoved: () => {},
    applyArrangementWorkspacePlayhead: () => {},
    buildArrangementStatePayload: () => ({ rows: [], bpm: 120, name: 'Arrangement' }),
    clearArrangementWorkspacePlayheadVisuals: () => {},
    closeExportMenu: () => {},
    confirmDialog: async () => false,
    createIcons: () => {},
    createUntitledBlock: () => {},
    dispatchArrangementPreview: () => {},
    dispatchArrangementPreviewState: () => {},
    dispatchResourceScopeOpen: () => {},
    emitArrangementStateChanged: () => {},
    escapeHtml: (value) => String(value),
    flushTrackerSaveForBlockSwitch: () => false,
    getActiveArrangementBlockFilename: () => null,
    getActiveArrangementRowIndex: () => null,
    getAppState: () => ({}),
    getArrangementMultitrackMode: () => false,
    getArrangementDraftState: () => null,
    getArrangementReadonly: () => false,
    getArrangementWorkspace: () => null,
    getArrangementWorkspacePane: () => null,
    getArrangementWorkspacePlayhead: () => ({ rowIndex: null, progress: 0, blocks: [] }),
    getArrangementWorkspacePlayingRowIndex: () => null,
    getArrangementPreviewPlayingFilename: () => null,
    getBlockByFilename: () => null,
    getBlocksLibraryCache: () => [],
    getCurrentArrangementFilename: () => null,
    getEditorContainer: () => null,
    getMainFooter: () => null,
    getMainHeader: () => null,
    getPatternNameInput: () => null,
    getRenameDebounceTimeout: () => null,
    getSelectedBlockForArrangement: () => null,
    getSidebarTitle: () => null,
    getWelcomeView: () => null,
    icons: {},
    isArrangementPreviewPlaying: () => false,
    isDemoMode: () => false,
    isPreviewPlaying: () => false,
    matchMedia: (query) => window.matchMedia(query),
    normalizeScope: (value) => (value === 'system' ? 'system' : 'user'),
    refreshZzFXTrackPreviewControlsVisibility: () => {},
    renameArrangement: () => {},
    renderTrackerWorkspace: () => {},
    renderBlocksLibrary: () => {},
    requestTrackerWorkspaceMultitrackAutoscroll: () => {},
    saveCurrentArrangement: () => {},
    scheduleArrangementAutoSave: () => {},
    setActiveArrangementBlockFilename: () => {},
    setActiveArrangementRowIndex: () => {},
    setArrangementMultitrackMode: () => {},
    setArrangementWorkspacePlayhead: () => {},
    setArrangementWorkspacePlayingRowIndex: () => {},
    setBlocksLibraryCache: () => {},
    setExportControlsDisabled: () => {},
    setRenameDebounceTimeout: () => {},
    setSelectedBlockForArrangement: () => {},
    setStatus: () => {},
    setupScrubInteraction: () => {},
    stopAllPlaybackForSelectionChange: () => {},
    stopArrangementPreview: () => {},
    stopEditorPlayback: () => {},
    stopTrackerPreviewPlayback: () => {},
    updateArrangementDisplayName: () => {},
    updateArrangementInstrumentUsage: () => {},
    updateArrangementListScopeVisualizer: () => {},
    updatePatternListVisualizer: () => {},
    updateAdvancedSettingsButtonsVisibility: () => {},
    updateFooterExportActionLabels: () => {},
    updatePatternSelectionState: () => {},
    updateArrangementSelectionState: () => {},
    updatePlayState: () => {},
    updatePreviewPlayButton: () => {},
};

export function configureArrangementWorkspace(options = {}) {
    deps = { ...deps, ...options };
}

export function showArrangementWorkspace() {
    deps.closeExportMenu();
    const welcomeView = deps.getWelcomeView();
    const editorContainer = deps.getEditorContainer();
    const arrangementWorkspace = deps.getArrangementWorkspace();
    const mainHeader = deps.getMainHeader();
    const mainFooter = deps.getMainFooter();
    const sidebarTitle = deps.getSidebarTitle();
    const patternNameInput = deps.getPatternNameInput();

    if (welcomeView) welcomeView.style.display = 'none';
    if (editorContainer) editorContainer.style.display = 'none';
    if (arrangementWorkspace) arrangementWorkspace.style.display = 'flex';
    mainHeader?.classList.add('hidden');
    if (mainFooter) {
        mainFooter.classList.remove('hidden');
        mainFooter.classList.remove('footer-intro-mode');
    }
    sidebarTitle?.classList.remove('active');
    patternNameInput?.classList.add('hidden');

    deps.updatePatternSelectionState(false);
    deps.updateArrangementSelectionState(Boolean(deps.getCurrentArrangementFilename()));
    deps.updateArrangementInstrumentUsage();
    deps.setExportControlsDisabled(false);
    deps.refreshZzFXTrackPreviewControlsVisibility();
    deps.updateAdvancedSettingsButtonsVisibility();
    deps.updateFooterExportActionLabels();
    deps.updatePatternListVisualizer();
    deps.updateArrangementListScopeVisualizer();
    updateArrangementWorkspacePreviewButtonState();
}

export function updateArrangementWorkspacePreviewButtonState() {
    const previewBtn = deps.getArrangementWorkspacePane()?.querySelector('#arrangementWorkspacePreviewBtn');
    if (!previewBtn) return;
    const selectedIsPlaying = deps.isArrangementPreviewPlaying()
        && deps.getArrangementPreviewPlayingFilename() === deps.getCurrentArrangementFilename();
    previewBtn.title = selectedIsPlaying ? 'Stop arrangement preview' : 'Preview arrangement';
    previewBtn.innerHTML = `<i data-lucide="${selectedIsPlaying ? 'square' : 'play'}" class="w-[18px] h-5 fill-current text-quaternary-foreground"></i>`;
    deps.createIcons({ icons: deps.icons });
}

function setArrangementWorkspaceRowPlayingVisual(rowEl, isPlaying) {
    if (!rowEl) return;
    const iconEl = rowEl.querySelector('.arr-row-play-icon');
    iconEl?.classList.add('hidden');
}

export function getBlockSteps(block) {
    const steps = Number.isInteger(block?.trackerState?.steps)
        ? block.trackerState.steps
        : (Array.isArray(block?.trackerState?.grid?.[0]) ? block.trackerState.grid[0].length : null);
    if (Number.isInteger(steps) && steps > 0) return steps;
    return 16;
}

export function clearArrangementWorkspacePlayheadVisuals() {
    const rowsRoot = deps.getArrangementWorkspacePane()?.querySelector('#arrangementWorkspaceRows');
    if (rowsRoot) {
        const rows = rowsRoot.querySelectorAll('.arr-row');
        rows.forEach((rowEl) => {
            rowEl.classList.remove('playing');
            setArrangementWorkspaceRowPlayingVisual(rowEl, false);
            rowEl.style.removeProperty('--arr-row-play-progress');
            rowEl.querySelectorAll('.arr-chip').forEach((chip) => {
                chip.style.removeProperty('--arr-chip-play-progress');
            });
        });
    }
    deps.setArrangementWorkspacePlayingRowIndex(null);
    deps.setArrangementWorkspacePlayhead({ rowIndex: null, progress: 0, blocks: [] });
}

export function updateArrangementWorkspaceChipSteps(blocks = []) {
    if (!Array.isArray(blocks) || !blocks.length) return;
    const blockByFilename = new Map(blocks.map((block) => [block.filename, block]));
    const cache = deps.getBlocksLibraryCache();
    deps.setBlocksLibraryCache(cache.map((block) => {
        const update = blockByFilename.get(block.filename);
        return update?.trackerState ? { ...block, trackerState: update.trackerState } : block;
    }));

    const chips = deps.getArrangementWorkspacePane()?.querySelectorAll('.arr-chip[data-filename]') || [];
    chips.forEach((chip) => {
        const filename = chip.dataset.filename;
        const update = blockByFilename.get(filename);
        if (!update?.trackerState) return;
        chip.dataset.blockSteps = String(getBlockSteps(update));
    });
}

export function applyArrangementWorkspacePlayhead(detail = {}) {
    const rowIndex = Number.isInteger(detail.rowIndex) ? detail.rowIndex : null;
    const progress = typeof detail.progress === 'number' ? detail.progress : 0;
    deps.setArrangementWorkspacePlayhead({
        rowIndex,
        progress,
        blocks: Array.isArray(detail.blocks) ? detail.blocks : [],
    });

    const rowsRoot = deps.getArrangementWorkspacePane()?.querySelector('#arrangementWorkspaceRows');
    if (!rowsRoot) {
        deps.setArrangementWorkspacePlayingRowIndex(rowIndex);
        return;
    }

    const currentPlayingRowIndex = deps.getArrangementWorkspacePlayingRowIndex();
    if (currentPlayingRowIndex != null && currentPlayingRowIndex !== rowIndex) {
        const prevEl = rowsRoot.querySelector(`.arr-row[data-row-index="${currentPlayingRowIndex}"]`);
        if (prevEl) {
            prevEl.classList.remove('playing');
            setArrangementWorkspaceRowPlayingVisual(prevEl, false);
            prevEl.style.removeProperty('--arr-row-play-progress');
            prevEl.querySelectorAll('.arr-chip').forEach((chip) => {
                chip.style.removeProperty('--arr-chip-play-progress');
            });
        }
    }

    if (rowIndex == null) {
        deps.setArrangementWorkspacePlayingRowIndex(null);
        return;
    }

    const rowEl = rowsRoot.querySelector(`.arr-row[data-row-index="${rowIndex}"]`);
    if (!rowEl) {
        deps.setArrangementWorkspacePlayingRowIndex(rowIndex);
        return;
    }

    rowEl.classList.add('playing');
    setArrangementWorkspaceRowPlayingVisual(rowEl, true);
    const pct = Math.max(0, Math.min(progress, 1)) * 100;
    rowEl.style.setProperty('--arr-row-play-progress', `${pct.toFixed(2)}%`);

    const rowChanged = currentPlayingRowIndex !== rowIndex;
    if (rowChanged && deps.matchMedia('(max-width: 1023px)').matches) {
        rowEl.scrollIntoView({ block: 'center', behavior: 'smooth', inline: 'nearest' });
    }

    const row = deps.getArrangementDraftState()?.rows?.[rowIndex];
    const rowSteps = Number.isInteger(row?.repeats) ? Math.min(Math.max(row.repeats, 1), 16) * 16 : 16;
    const progressSteps = Math.max(0, Math.min(progress, 1)) * rowSteps;
    rowEl.querySelectorAll('.arr-chip').forEach((chip) => {
        const blockSteps = parseInt(chip.dataset.blockSteps || '16', 10);
        const steps = Number.isInteger(blockSteps) && blockSteps > 0 ? blockSteps : 16;
        const local = steps > 0 ? (progressSteps % steps) / steps : 0;
        const localPct = Math.max(0, Math.min(local, 1)) * 100;
        chip.style.setProperty('--arr-chip-play-progress', `${localPct.toFixed(2)}%`);
    });

    deps.setArrangementWorkspacePlayingRowIndex(rowIndex);
}

export function sortBlocksForPicker(blocks = []) {
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
    return blocks.slice().sort((a, b) => {
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
}

export function createRowBlockFilenameComparator(blockByFilename) {
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
    return (aFilename, bFilename) => {
        const aBlock = blockByFilename.get(aFilename);
        const bBlock = blockByFilename.get(bFilename);
        const aGroup = groupKey(aBlock ? aBlock.name : aFilename);
        const bGroup = groupKey(bBlock ? bBlock.name : bFilename);
        if (collator) {
            const byGroup = collator.compare(aGroup, bGroup);
            if (byGroup) return byGroup;
            return collator.compare(String(aFilename || ''), String(bFilename || ''));
        }
        if (aGroup < bGroup) return -1;
        if (aGroup > bGroup) return 1;
        return String(aFilename || '').localeCompare(String(bFilename || ''));
    };
}

export function createCopyModifierDetector() {
    const isMac = (() => {
        try {
            const platform = String(navigator?.platform || '');
            const ua = String(navigator?.userAgent || '');
            return /Mac/i.test(platform) || /Mac OS X/i.test(ua);
        } catch (_e) {
            return false;
        }
    })();
    return (event) => (isMac ? Boolean(event.altKey) : Boolean(event.ctrlKey));
}

export function escapeCssValue(value) {
    try {
        return window.CSS && typeof window.CSS.escape === 'function'
            ? window.CSS.escape(String(value))
            : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    } catch (_e) {
        return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }
}

export function shakeArrangementChip(rowEl, filename, { escapeCssValueFn = escapeCssValue } = {}) {
    if (!rowEl || !filename) return;
    const selector = `.arr-chip[data-filename="${escapeCssValueFn(filename)}"]`;
    const chip = rowEl.querySelector(selector);
    if (!chip) return;
    chip.classList.remove('shake');
    void chip.offsetWidth;
    chip.classList.add('shake');
    chip.addEventListener('animationend', () => chip.classList.remove('shake'), { once: true });
}

export function handleArrangementBlockDrop({
    filename,
    fromRowIndex,
    toRowIndex,
    copy,
    targetRowEl = null,
    exitTransitionMs = 0,
    getRows = () => [],
    setActiveArrangementBlockFilename = () => {},
    renderArrangementWorkspace = () => {},
    scheduleArrangementAutoSave = () => {},
    emitArrangementStateChanged = () => {},
    escapeCssValueFn = escapeCssValue,
} = {}) {
    if (!filename || !Number.isInteger(toRowIndex)) return;
    const rows = getRows();
    const targetRow = rows?.[toRowIndex];
    if (!targetRow) return;
    if (!Array.isArray(targetRow.blocks)) targetRow.blocks = [];

    const normalizedFrom = Number.isInteger(fromRowIndex) ? fromRowIndex : null;
    const normalizedTo = toRowIndex;
    const shouldCopy = Boolean(copy);

    if (normalizedFrom === normalizedTo) {
        if (targetRow.blocks.includes(filename)) {
            shakeArrangementChip(targetRowEl, filename, { escapeCssValueFn });
        }
        return;
    }
    if (targetRow.blocks.includes(filename)) {
        shakeArrangementChip(targetRowEl, filename, { escapeCssValueFn });
        return;
    }

    if (!shouldCopy && normalizedFrom != null) {
        const srcRow = rows?.[normalizedFrom];
        if (srcRow && Array.isArray(srcRow.blocks)) {
            const idx = srcRow.blocks.indexOf(filename);
            if (idx >= 0) srcRow.blocks.splice(idx, 1);
        }
    }

    targetRow.blocks.push(filename);
    setActiveArrangementBlockFilename(filename);
    const doRender = () => {
        renderArrangementWorkspace();
        scheduleArrangementAutoSave();
        emitArrangementStateChanged({ addedRowIndex: normalizedTo, addedFilename: filename });
    };
    if (exitTransitionMs > 0) setTimeout(doRender, exitTransitionMs);
    else doRender();
}

export function renderArrangementWorkspaceShell({
    pane,
    draftName,
    bpm,
    multitrackMode = false,
    readonly,
    isPreviewPlaying,
    escapeHtml,
} = {}) {
    if (!pane) return null;
    pane.innerHTML = `
        <div class="h-full flex flex-col p-0">
            <div class="flex flex-col xl:flex-row xl:items-center gap-2 px-2 py-2">
                <div class="flex gap-2 items-center min-w-0 flex-1">
                    <button
                        id="arrangementWorkspacePreviewBtn"
                        type="button"
                        class="inline-flex items-center justify-center shrink-0 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border-0 bg-quaternary text-quaternary-foreground hover:bg-quaternary/80 w-8 h-8 p-0 shadow-sm"
                        title="${isPreviewPlaying ? 'Stop arrangement preview' : 'Preview arrangement'}"
                    >
                        <i data-lucide="${isPreviewPlaying ? 'square' : 'play'}" class="w-[18px] h-5 fill-current text-quaternary-foreground"></i>
                    </button>
                    <label for="arrangementWorkspaceName" class="hidden lg:inline text-xs font-bold text-muted-foreground uppercase shrink-0">Arrang.</label>
                    <input
                        type="text"
                        id="arrangementWorkspaceName"
                        value="${escapeHtml(draftName || '')}"
                        placeholder="Arrangement Name"
                        class="min-w-0 flex-1 h-8 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        ${readonly ? 'readonly' : ''}
                    >
                </div>
                <div class="flex gap-2 items-center shrink-0">
                    <label for="arrangementWorkspaceBpm" class="text-xs font-bold text-muted-foreground uppercase">BPM</label>
                    <input
                        type="number"
                        id="arrangementWorkspaceBpm"
                        min="20"
                        max="300"
                        step="1"
                        value="${bpm}"
                        class="bpm-input w-12 h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        ${readonly ? 'readonly' : ''}
                    >
                    <button
                        id="arrangementWorkspaceMultitrackBtn"
                        type="button"
                        aria-pressed="${multitrackMode ? 'true' : 'false'}"
                        class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border h-8 w-8 p-0 ${multitrackMode ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'}"
                        title="Toggle Multitrack mode"
                        aria-label="Toggle Multitrack mode"
                    >
                        <i data-lucide="columns-2" class="w-4 h-4"></i>
                    </button>
                    <button
                        id="arrangementWorkspaceAdvancedSettingsBtn"
                        type="button"
                        class="dev-only-hidden inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 w-8 p-0"
                        title="Advanced settings"
                    >
                        <i data-lucide="settings" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>

            <div class="flex-1 min-h-0 overflow-auto rounded-md p-0 bg-card/30">
                <div class="arr-rows-header">
                    <span class="arr-rows-header-spacer" aria-hidden="true"></span>
                    <span class="arr-rows-header-repeat" title="1 repeat = 16 steps" aria-hidden="true"></span>
                    <span class="arr-rows-header-blocks" aria-hidden="true"></span>
                </div>
                <div id="arrangementWorkspaceRows" class="flex flex-col"></div>
            </div>
            <footer class="flex items-center justify-between border-t border-border p-2 shrink-0 bg-card/30">
                <button
                    id="arrangementWorkspaceAddRowBtn"
                    type="button"
                    class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-2 py-2 ${readonly ? 'opacity-40 cursor-not-allowed' : ''}"
                    ${readonly ? 'disabled' : ''}
                >
                    <i data-lucide="plus" class="w-4 h-4 mr-2"></i> Add Row
                </button>
                <div class="arr-trash-dropzone-wrap relative inline-flex shrink-0">
                    <span id="arrangementWorkspaceTrashTooltip" class="arr-trash-tooltip" role="tooltip" aria-hidden="true">Drag blocks here to remove</span>
                    <div
                        id="arrangementWorkspaceTrashDropzone"
                        class="arr-trash-dropzone inline-flex items-center justify-center rounded-md border border-transparent text-muted-foreground hover:text-destructive h-9 w-9 ${readonly ? 'opacity-40 pointer-events-none' : ''}"
                        role="img"
                        aria-label="Drag blocks here to remove"
                        aria-describedby="arrangementWorkspaceTrashTooltip"
                    >
                        <i data-lucide="trash" class="w-4 h-4"></i>
                    </div>
                </div>
            </footer>
        </div>
    `;

    return {
        nameInput: pane.querySelector('#arrangementWorkspaceName'),
        bpmInput: pane.querySelector('#arrangementWorkspaceBpm'),
        addRowBtn: pane.querySelector('#arrangementWorkspaceAddRowBtn'),
        previewBtn: pane.querySelector('#arrangementWorkspacePreviewBtn'),
        multitrackBtn: pane.querySelector('#arrangementWorkspaceMultitrackBtn'),
        advancedSettingsBtn: pane.querySelector('#arrangementWorkspaceAdvancedSettingsBtn'),
        rowsRoot: pane.querySelector('#arrangementWorkspaceRows'),
        trashDropzone: pane.querySelector('#arrangementWorkspaceTrashDropzone'),
        trashTooltip: pane.querySelector('#arrangementWorkspaceTrashTooltip'),
    };
}

export function bindArrangementWorkspaceTopControls({
    nameInput,
    bpmInput,
    addRowBtn,
    multitrackBtn,
    advancedSettingsBtn,
    readonly,
    isDemoMode = false,
    getDraftState = () => null,
    getCurrentArrangementFilename = () => null,
    getActiveArrangementBlockFilename = () => null,
    getActiveArrangementRowIndex = () => null,
    getCurrentArrangementScope = () => 'user',
    normalizeScope = (value) => (value === 'system' ? 'system' : 'user'),
    dispatchResourceScopeOpen = () => {},
    getArrangementReadonly = () => false,
    getArrangementMultitrackMode = () => false,
    saveCurrentArrangement = () => {},
    renameArrangement = () => {},
    setStatus = () => {},
    setActiveArrangementRowIndex = () => {},
    setArrangementMultitrackMode = () => {},
    updateArrangementDisplayName = () => {},
    scheduleArrangementAutoSave = () => {},
    emitArrangementStateChanged = () => {},
    renderArrangementWorkspace = () => {},
    setupScrubInteraction = () => {},
    getRenameDebounceTimeout = () => null,
    setRenameDebounceTimeout = () => {},
} = {}) {
    if (advancedSettingsBtn) {
        advancedSettingsBtn.addEventListener('click', () => {
            const draftState = getDraftState();
            const name = String(nameInput?.value ?? draftState?.name ?? '').trim();
            dispatchResourceScopeOpen({
                applyDraftSettings: ({ metadata, scope }) => {
                    const nextDraftState = getDraftState();
                    if (!nextDraftState) return;
                    nextDraftState.metadata = { ...metadata };
                    if (typeof scope === 'string') {
                        nextDraftState.scope = normalizeScope(scope);
                    }
                },
                getArrangementStatePayload: (metadataOverride) => {
                    const nextDraftState = getDraftState();
                    if (!nextDraftState) return null;
                    return {
                        ...nextDraftState,
                        metadata: metadataOverride ? { ...metadataOverride } : { ...(nextDraftState.metadata || {}) },
                    };
                },
                metadata: draftState?.metadata || {},
                type: 'arrangement',
                filename: getCurrentArrangementFilename(),
                name,
                scope: normalizeScope(getCurrentArrangementScope()),
            });
        });
    }

    multitrackBtn?.addEventListener('click', () => {
        const next = !getArrangementMultitrackMode();
        setArrangementMultitrackMode(next);
        if (!next) {
            setActiveArrangementRowIndex(null);
        } else if (!Number.isInteger(getActiveArrangementRowIndex())) {
            const draftState = getDraftState();
            const activeFilename = getActiveArrangementBlockFilename();
            const rows = Array.isArray(draftState?.rows) ? draftState.rows : [];
            const rowIndex = activeFilename
                ? rows.findIndex((row) => Array.isArray(row?.blocks) && row.blocks.includes(activeFilename))
                : -1;
            if (rowIndex >= 0) setActiveArrangementRowIndex(rowIndex);
        }
        renderArrangementWorkspace();
    });

    if (nameInput) {
        nameInput.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; });
        nameInput.addEventListener('drop', (e) => { e.preventDefault(); });
    }
    nameInput?.addEventListener('input', () => {
        const draftState = getDraftState();
        if (!draftState) return;
        draftState.name = String(nameInput.value || '').trim() || draftState.name;
    });
    nameInput?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const timeout = getRenameDebounceTimeout();
        if (timeout) {
            clearTimeout(timeout);
            setRenameDebounceTimeout(null);
        }
        nameInput.blur();
    });
    nameInput?.addEventListener('blur', () => {
        const draftState = getDraftState();
        if (!draftState) return;
        const newName = String(nameInput?.value ?? '').trim() || draftState.name;
        draftState.name = newName;
        const timeout = getRenameDebounceTimeout();
        if (timeout) {
            clearTimeout(timeout);
            setRenameDebounceTimeout(null);
        }
        const currentFilename = getCurrentArrangementFilename();
        const currentScope = getCurrentArrangementScope();
        if (currentFilename && !getArrangementReadonly()) {
            void saveCurrentArrangement();
            void renameArrangement({ quiet: true });
        } else if (currentFilename && currentScope === 'system') {
            setStatus('System arrangements cannot be renamed', 'normal');
            updateArrangementDisplayName(currentFilename, newName);
        } else if (currentFilename) {
            updateArrangementDisplayName(currentFilename, newName);
        }
    });

    bpmInput?.addEventListener('input', () => {
        const draftState = getDraftState();
        if (!draftState) return;
        const bpm = parseInt(bpmInput.value || '120', 10);
        draftState.bpm = Number.isFinite(bpm) ? Math.max(20, Math.min(300, bpm)) : 120;
        scheduleArrangementAutoSave();
        emitArrangementStateChanged();
    });
    bpmInput?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        bpmInput.blur();
    });
    bpmInput?.addEventListener('blur', () => {
        if (getCurrentArrangementFilename() && !getArrangementReadonly()) {
            void saveCurrentArrangement();
        }
    });
    if (bpmInput) setupScrubInteraction(bpmInput);

    addRowBtn?.addEventListener('click', () => {
        if (readonly) return;
        const draftState = getDraftState();
        if (!draftState?.rows) return;
        draftState.rows.push({ repeats: 1, blocks: [], loop: false });
        renderArrangementWorkspace();
        scheduleArrangementAutoSave();
        emitArrangementStateChanged({ addedRowIndex: draftState.rows.length - 1 });
    });
}

export function renderArrangementWorkspace() {
    const pane = deps.getArrangementWorkspacePane();
    const appState = deps.getAppState();
    if (!pane) return;
    if (!appState?.arrangementDraftState) {
        pane.innerHTML = `
            <div class="h-full p-4 text-sm text-muted-foreground" id="arrangementWorkspacePlaceholder">
                Select an arrangement from the Blocks list to open the arranger workspace.
            </div>
        `;
        deps.renderBlocksLibrary();
        deps.renderTrackerWorkspace();
        return;
    }

    deps.renderBlocksLibrary();

    const readonly = deps.getArrangementReadonly();
    const isPreviewPlaying = deps.isArrangementPreviewPlaying();
    const multitrackMode = deps.getArrangementMultitrackMode();
    let activeMultitrackRowIndex = deps.getActiveArrangementRowIndex();
    if (multitrackMode && Number.isInteger(activeMultitrackRowIndex)) {
        const rowsLength = Array.isArray(appState.arrangementDraftState?.rows) ? appState.arrangementDraftState.rows.length : 0;
        if (activeMultitrackRowIndex < 0 || activeMultitrackRowIndex >= rowsLength) {
            deps.setActiveArrangementRowIndex(null);
            activeMultitrackRowIndex = null;
        }
    }
    // User arrangements can reference both user and system blocks. Showing the
    // full library keeps the add-block picker useful even before any user blocks exist.
    const blocksForPicker = sortBlocksForPicker(appState.blocksLibraryCache);
    const blockByFilename = new Map(appState.blocksLibraryCache.map((b) => [b.filename, b]));
    const compareRowBlockFilenames = createRowBlockFilenameComparator(blockByFilename);
    const isCopyModifier = createCopyModifierDetector();

    const shell = renderArrangementWorkspaceShell({
        pane,
        draftName: appState.arrangementDraftState.name,
        bpm: appState.arrangementDraftState.bpm,
        multitrackMode,
        readonly,
        isPreviewPlaying,
        escapeHtml: deps.escapeHtml,
    });
    const nameInput = shell?.nameInput;
    const bpmInput = shell?.bpmInput;
    const addRowBtn = shell?.addRowBtn;
    const previewBtn = shell?.previewBtn;
    const multitrackBtn = shell?.multitrackBtn;
    const advancedSettingsBtn = shell?.advancedSettingsBtn;
    const rowsRoot = shell?.rowsRoot;

    bindArrangementWorkspaceTopControls({
        nameInput,
        bpmInput,
        addRowBtn,
        multitrackBtn,
        advancedSettingsBtn,
        readonly,
        isDemoMode: deps.isDemoMode(),
        getDraftState: () => deps.getAppState().arrangementDraftState,
        getCurrentArrangementFilename: deps.getCurrentArrangementFilename,
        getActiveArrangementBlockFilename: deps.getActiveArrangementBlockFilename,
        getActiveArrangementRowIndex: deps.getActiveArrangementRowIndex,
        getCurrentArrangementScope: deps.getCurrentArrangementScope,
        normalizeScope: deps.normalizeScope,
        dispatchResourceScopeOpen: deps.dispatchResourceScopeOpen,
        getArrangementReadonly: deps.getArrangementReadonly,
        getArrangementMultitrackMode: deps.getArrangementMultitrackMode,
        saveCurrentArrangement: deps.saveCurrentArrangement,
        renameArrangement: deps.renameArrangement,
        setStatus: deps.setStatus,
        setActiveArrangementRowIndex: deps.setActiveArrangementRowIndex,
        setArrangementMultitrackMode: deps.setArrangementMultitrackMode,
        updateArrangementDisplayName: deps.updateArrangementDisplayName,
        scheduleArrangementAutoSave: deps.scheduleArrangementAutoSave,
        emitArrangementStateChanged: deps.emitArrangementStateChanged,
        renderArrangementWorkspace,
        setupScrubInteraction: deps.setupScrubInteraction,
        getRenameDebounceTimeout: deps.getRenameDebounceTimeout,
        setRenameDebounceTimeout: deps.setRenameDebounceTimeout,
    });

    const trashDropzone = shell?.trashDropzone;
    const trashTooltip = shell?.trashTooltip;
    if (trashDropzone && !readonly) {
        trashDropzone.addEventListener('click', (event) => {
            event.preventDefault();
            const wrap = trashDropzone.closest('.arr-trash-dropzone-wrap');
            let portal = document.getElementById('arrangementWorkspaceTrashTooltipPortal');
            const isShowing = portal && portal.isConnected;
            if (isShowing && portal) {
                portal.remove();
                if (trashTooltip?._arrTrashTooltipHide) {
                    document.removeEventListener('click', trashTooltip._arrTrashTooltipHide);
                    trashTooltip._arrTrashTooltipHide = null;
                }
                return;
            }
            const rect = trashDropzone.getBoundingClientRect();
            portal = document.createElement('div');
            portal.id = 'arrangementWorkspaceTrashTooltipPortal';
            portal.className = 'arr-trash-tooltip-portal';
            portal.setAttribute('role', 'tooltip');
            portal.textContent = 'Drag blocks here to remove';
            document.body.appendChild(portal);
            const tw = portal.offsetWidth;
            const th = portal.offsetHeight;
            const gap = 8;
            portal.style.left = `${rect.left + rect.width / 2 - tw / 2}px`;
            portal.style.top = `${rect.top - th - gap}px`;
            const hide = () => {
                const p = document.getElementById('arrangementWorkspaceTrashTooltipPortal');
                if (p) p.remove();
                if (trashTooltip?._arrTrashTooltipHide) {
                    document.removeEventListener('click', trashTooltip._arrTrashTooltipHide);
                    trashTooltip._arrTrashTooltipHide = null;
                }
            };
            const onDocClick = (e) => {
                if (wrap && wrap.contains(e.target)) return;
                hide();
            };
            if (trashTooltip) trashTooltip._arrTrashTooltipHide = onDocClick;
            requestAnimationFrame(() => document.addEventListener('click', onDocClick));
            setTimeout(hide, 4000);
        });
        trashDropzone.addEventListener('dragover', (event) => {
            const types = event.dataTransfer?.types;
            const isChip = types?.includes('application/x-zzfxtrack-arr-chip');
            const isRow = types?.includes('application/x-zzfxtrack-arr-row');
            if (!isChip && !isRow) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            trashDropzone.classList.add('arr-trash-dropzone-dragover');
        });
        trashDropzone.addEventListener('dragleave', (event) => {
            const related = event.relatedTarget;
            if (related && related instanceof Node && trashDropzone.contains(related)) return;
            trashDropzone.classList.remove('arr-trash-dropzone-dragover');
        });
        trashDropzone.addEventListener('drop', async (event) => {
            if (!event.dataTransfer || readonly) return;
            event.preventDefault();
            trashDropzone.classList.remove('arr-trash-dropzone-dragover');
            window.__arrRowDragFromIndex = undefined;
            let rowPayload = null;
            try { rowPayload = JSON.parse(event.dataTransfer.getData('application/x-zzfxtrack-arr-row') || 'null'); } catch (_e) {}
            const fromRowIndex = Number.isInteger(rowPayload?.fromRowIndex) ? rowPayload.fromRowIndex : null;
            if (fromRowIndex != null) {
                if (appState.arrangementDraftState.rows.length === 1) return;
                const confirmed = await deps.confirmDialog({
                    title: 'Delete row?',
                    message: 'Delete this row? This cannot be undone.',
                    cancelLabel: 'No! Abort.',
                    confirmLabel: 'Delete',
                    confirmIcon: 'trash-2',
                    variant: 'danger',
                    overlayLight: true,
                });
                if (!confirmed) return;
                if (appState.arrangementDraftState.rows.length === 1) appState.arrangementDraftState.rows[0] = { repeats: 1, blocks: [], loop: false };
                else appState.arrangementDraftState.rows.splice(fromRowIndex, 1);
                renderArrangementWorkspace();
                deps.scheduleArrangementAutoSave();
                deps.emitArrangementStateChanged({ removedRowIndex: fromRowIndex });
                await deps.saveCurrentArrangement();
                return;
            }
            let payload = null;
            try { payload = JSON.parse(event.dataTransfer.getData('application/x-zzfxtrack-arr-chip') || 'null'); } catch (_e) {}
            const filename = payload?.filename || event.dataTransfer.getData('text/plain') || '';
            const fromRowIndexChip = Number.isInteger(payload?.fromRowIndex) ? payload.fromRowIndex : null;
            if (filename && fromRowIndexChip != null) {
                const row = appState.arrangementDraftState.rows?.[fromRowIndexChip];
                if (row?.blocks) {
                    const idx = row.blocks.indexOf(filename);
                    if (idx >= 0) row.blocks.splice(idx, 1);
                    if (deps.getActiveArrangementBlockFilename() === filename) deps.setActiveArrangementBlockFilename(null);
                    renderArrangementWorkspace();
                    deps.renderTrackerWorkspace();
                    deps.scheduleArrangementAutoSave();
                    deps.emitArrangementStateChanged({ removedFilename: filename });
                    deps.applyArrangementPreviewAfterBlockRemoved(filename);
                    await deps.saveCurrentArrangement();
                }
            }
        });
    }

    previewBtn?.addEventListener('click', () => {
        const selectedIsPlaying = deps.isArrangementPreviewPlaying() && deps.getArrangementPreviewPlayingFilename() === deps.getCurrentArrangementFilename();
        if (selectedIsPlaying) {
            deps.stopArrangementPreview();
            deps.dispatchArrangementPreviewState({ playing: false });
            return;
        }
        deps.stopAllPlaybackForSelectionChange();
        deps.dispatchArrangementPreview({
            arrangement: { name: appState.arrangementDraftState.name, arrangementState: deps.buildArrangementStatePayload() },
            filename: deps.getCurrentArrangementFilename(),
        });
    });

    if (rowsRoot) {
        appState.arrangementDraftState.rows.forEach((row, rowIndex) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'arr-row';
            rowEl.dataset.rowIndex = String(rowIndex);
            rowEl.classList.toggle('arr-row-multitrack-active', multitrackMode && activeMultitrackRowIndex === rowIndex);
            const rowDragOver = (event) => {
                if (!event.dataTransfer || readonly) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = isCopyModifier(event) ? 'copy' : 'move';
                rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below', 'arr-row-block-drop-target');
                const isRowDrag = event.dataTransfer.types.includes('application/x-zzfxtrack-arr-row');
                const fromIndex = isRowDrag ? window.__arrRowDragFromIndex : undefined;
                if (typeof fromIndex === 'number') {
                    if (fromIndex > rowIndex) rowEl.classList.add('arr-row-drop-target-above');
                    else if (fromIndex < rowIndex) rowEl.classList.add('arr-row-drop-target-below');
                } else rowEl.classList.add('arr-row-block-drop-target');
            };
            rowEl.addEventListener('dragenter', (event) => {
                if (!event.dataTransfer || readonly) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = isCopyModifier(event) ? 'copy' : 'move';
            });
            rowEl.addEventListener('dragover', rowDragOver);
            rowEl.addEventListener('dragleave', (event) => {
                const related = event.relatedTarget;
                if (related && related instanceof Node && rowEl.contains(related)) return;
                const hadBlock = rowEl.classList.contains('arr-row-block-drop-target');
                const hadAbove = rowEl.classList.contains('arr-row-drop-target-above');
                const hadBelow = rowEl.classList.contains('arr-row-drop-target-below');
                rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below', 'arr-row-block-drop-target');
                if (hadBlock) rowEl.classList.add('arr-row-drop-target-exit-block');
                if (hadAbove) rowEl.classList.add('arr-row-drop-target-exit-above');
                if (hadBelow) rowEl.classList.add('arr-row-drop-target-exit-below');
                setTimeout(() => rowEl.classList.remove('arr-row-drop-target-exit-block', 'arr-row-drop-target-exit-above', 'arr-row-drop-target-exit-below'), 220);
            });
            const ARR_ROW_DROP_EXIT_MS = 200;
            const removeDropTargetAndAfter = (afterMs, run) => {
                const hadBlock = rowEl.classList.contains('arr-row-block-drop-target');
                const hadAbove = rowEl.classList.contains('arr-row-drop-target-above');
                const hadBelow = rowEl.classList.contains('arr-row-drop-target-below');
                rowEl.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below', 'arr-row-block-drop-target');
                if (hadBlock) rowEl.classList.add('arr-row-drop-target-exit-block');
                if (hadAbove) rowEl.classList.add('arr-row-drop-target-exit-above');
                if (hadBelow) rowEl.classList.add('arr-row-drop-target-exit-below');
                setTimeout(() => {
                    rowEl.classList.remove('arr-row-drop-target-exit-block', 'arr-row-drop-target-exit-above', 'arr-row-drop-target-exit-below');
                    run();
                }, afterMs + 20);
            };
            rowEl.addEventListener('drop', (event) => {
                if (!event.dataTransfer || readonly) return;
                event.preventDefault();
                window.__arrRowDragFromIndex = undefined;
                let rowPayload = null;
                try { rowPayload = JSON.parse(event.dataTransfer.getData('application/x-zzfxtrack-arr-row') || 'null'); } catch (_e) {}
                const fromRowIndex = Number.isInteger(rowPayload?.fromRowIndex) ? rowPayload.fromRowIndex : null;
                if (fromRowIndex != null && fromRowIndex !== rowIndex) {
                    removeDropTargetAndAfter(ARR_ROW_DROP_EXIT_MS, () => {
                        const moved = appState.arrangementDraftState.rows.splice(fromRowIndex, 1)[0];
                        if (moved) {
                            appState.arrangementDraftState.rows.splice(rowIndex, 0, moved);
                            renderArrangementWorkspace();
                            deps.scheduleArrangementAutoSave();
                            deps.emitArrangementStateChanged();
                        }
                    });
                    return;
                }
                let payload = null;
                try { payload = JSON.parse(event.dataTransfer.getData('application/x-zzfxtrack-arr-chip') || 'null'); } catch (_e) {}
                const filename = payload?.filename || event.dataTransfer.getData('text/plain') || '';
                const fromRowIndexChip = Number.isInteger(payload?.fromRowIndex) ? payload.fromRowIndex : null;
                removeDropTargetAndAfter(ARR_ROW_DROP_EXIT_MS, () => {
                    handleArrangementBlockDrop({
                        filename,
                        fromRowIndex: fromRowIndexChip,
                        toRowIndex: rowIndex,
                        copy: isCopyModifier(event),
                        targetRowEl: rowEl,
                        getRows: () => deps.getAppState().arrangementDraftState?.rows || [],
                        setActiveArrangementBlockFilename: deps.setActiveArrangementBlockFilename,
                        renderArrangementWorkspace,
                        scheduleArrangementAutoSave: deps.scheduleArrangementAutoSave,
                        emitArrangementStateChanged: deps.emitArrangementStateChanged,
                        escapeCssValueFn: escapeCssValue,
                    });
                });
            });

            const rowNumberEl = document.createElement('span');
            rowNumberEl.className = 'arr-row-number';
            rowNumberEl.setAttribute('aria-label', `Row ${rowIndex + 1} (click to play from here, drag to reorder)`);
            rowNumberEl.title = 'Click to play from this row';
            if (!readonly) {
                rowNumberEl.draggable = appState.arrangementDraftState.rows.length > 1;
                rowNumberEl.addEventListener('dragstart', (e) => {
                    if (appState.arrangementDraftState.rows.length === 1) {
                        e.preventDefault();
                        return;
                    }
                    if (!e.dataTransfer) return;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/x-zzfxtrack-arr-row', JSON.stringify({ fromRowIndex: rowIndex }));
                    window.__arrRowDragFromIndex = rowIndex;
                });
                rowNumberEl.addEventListener('dragend', () => {
                    window.__arrRowDragFromIndex = undefined;
                    window.__arrRowDragJustEnded = true;
                    setTimeout(() => { window.__arrRowDragJustEnded = false; }, 100);
                    rowsRoot.querySelectorAll('.arr-row').forEach((el) => {
                        el.classList.remove('arr-row-drop-target-above', 'arr-row-drop-target-below', 'arr-row-block-drop-target');
                    });
                });
            }
            rowNumberEl.addEventListener('click', () => {
                if (window.__arrRowDragJustEnded) return;
                deps.stopAllPlaybackForSelectionChange();
                const payload = deps.buildArrangementStatePayload();
                deps.dispatchArrangementPreview({
                    arrangement: { name: deps.getAppState().arrangementDraftState.name, arrangementState: payload },
                    startRowIndex: rowIndex,
                    filename: deps.getCurrentArrangementFilename(),
                });
            });
            rowNumberEl.innerHTML = `<span class="arr-row-number-value">${rowIndex + 1}</span><i data-lucide="play" class="arr-row-play-icon hidden w-2.5 h-2.5 fill-current"></i>`;

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
            if (readonly) loopRowBtn.disabled = true;
            loopRowBtn.addEventListener('click', () => {
                if (readonly) return;
                if (row.loop) row.loop = false;
                else {
                    appState.arrangementDraftState.rows.forEach((r) => { r.loop = false; });
                    row.loop = true;
                }
                rowsRoot.querySelectorAll('.arr-row').forEach((rowNode) => {
                    const i = parseInt(rowNode.dataset.rowIndex, 10);
                    const r = appState.arrangementDraftState.rows?.[i];
                    const btn = rowNode.querySelector('.arr-loop-row-btn');
                    if (btn && r != null) {
                        btn.dataset.loop = r.loop ? 'true' : 'false';
                        btn.setAttribute('aria-label', r.loop ? 'Loop row (on)' : 'Loop row (off)');
                        btn.title = btn.getAttribute('aria-label');
                    }
                });
                if (window.lucide?.createIcons) window.lucide.createIcons();
                document.dispatchEvent(new CustomEvent('arrangements:previewLoopChanged', {
                    detail: { arrangementState: deps.buildArrangementStatePayload() },
                }));
            });
            rowNumberWrap.appendChild(loopRowBtn);

            const repeatsEl = document.createElement('input');
            repeatsEl.type = 'number';
            repeatsEl.min = '1';
            repeatsEl.max = '16';
            repeatsEl.step = '1';
            repeatsEl.value = String(row.repeats || 1);
            repeatsEl.className = 'arr-repeats';
            if (readonly) repeatsEl.readOnly = true;
            repeatsEl.addEventListener('input', () => {
                const val = parseInt(repeatsEl.value, 10);
                row.repeats = Number.isFinite(val) ? Math.min(Math.max(val, 1), 16) : 1;
                deps.scheduleArrangementAutoSave();
                deps.emitArrangementStateChanged({ addedRowIndex: rowIndex + 1 });
            });
            const repeatsWrap = document.createElement('div');
            repeatsWrap.className = 'arr-repeats-wrap';
            repeatsWrap.appendChild(repeatsEl);
            const chipsEl = document.createElement('div');
            chipsEl.className = 'arr-chips';
            const updateSelectDisabled = (selectEl) => {
                if (!selectEl) return;
                Array.from(selectEl.querySelectorAll('option')).forEach((opt) => {
                    if (!opt.value || opt.value === '__create__') return;
                    opt.disabled = row.blocks.includes(opt.value);
                });
            };

            const selectEl = document.createElement('select');
            selectEl.className = 'arr-block-select';
            selectEl.setAttribute('aria-label', 'Add block or row');
            selectEl.title = 'Add block or row';
            if (readonly) selectEl.disabled = true;
            selectEl.innerHTML = `<option value="" selected></option><option value="__new_row__">+ New row</option><option value="__create__">+ New block</option>` + blocksForPicker
                .map((block) => {
                    const disabled = row.blocks.includes(block.filename) ? ' disabled' : '';
                    return `<option value="${deps.escapeHtml(block.filename)}"${disabled}>${deps.escapeHtml(block.name || block.filename.replace(/\.js$/i, ''))}</option>`;
                }).join('');
            selectEl.addEventListener('change', () => {
                if (readonly) return;
                const val = selectEl.value;
                if (!val) return;
                if (val === '__new_row__') {
                    appState.arrangementDraftState.rows.splice(rowIndex + 1, 0, {
                        repeats: 1,
                        blocks: [],
                        loop: false,
                    });
                    selectEl.selectedIndex = 0;
                    renderArrangementWorkspace();
                    deps.scheduleArrangementAutoSave();
                    deps.emitArrangementStateChanged({ addedRowIndex: rowIndex + 1 });
                    return;
                }
                if (val === '__create__') {
                    selectEl.selectedIndex = 0;
                    void deps.createUntitledBlock({ rowIndex });
                    return;
                }
                if (!row.blocks.includes(val)) row.blocks.push(val);
                deps.setActiveArrangementBlockFilename(val);
                if (deps.getCurrentArrangementFilename()) deps.setSelectedBlockForArrangement(deps.getCurrentArrangementFilename(), val);
                selectEl.selectedIndex = 0;
                renderArrangementWorkspace();
                deps.scheduleArrangementAutoSave();
                deps.emitArrangementStateChanged({ addedRowIndex: rowIndex, addedFilename: val });
            });

            const selectWrap = document.createElement('div');
            selectWrap.className = 'arr-block-select-wrap';
            selectWrap.innerHTML = '<span class="arr-block-select-plus-label" aria-hidden="true">+</span>';
            selectWrap.appendChild(selectEl);

            const duplicateRowBtn = document.createElement('button');
            duplicateRowBtn.type = 'button';
            duplicateRowBtn.className = 'arr-row-del arr-row-dup';
            duplicateRowBtn.title = 'Duplicate row';
            duplicateRowBtn.innerHTML = '<i data-lucide="copy-plus" class="w-4 h-4"></i>';
            duplicateRowBtn.disabled = readonly;
            duplicateRowBtn.classList.toggle('opacity-40', readonly);
            duplicateRowBtn.classList.toggle('cursor-not-allowed', readonly);
            duplicateRowBtn.addEventListener('click', () => {
                if (readonly) return;
                const sourceRow = appState.arrangementDraftState.rows?.[rowIndex];
                if (!sourceRow) return;
                appState.arrangementDraftState.rows.splice(rowIndex + 1, 0, {
                    repeats: Number.isInteger(sourceRow.repeats) ? sourceRow.repeats : 1,
                    blocks: Array.isArray(sourceRow.blocks) ? sourceRow.blocks.slice() : [],
                    loop: Boolean(sourceRow.loop),
                });
                renderArrangementWorkspace();
                deps.scheduleArrangementAutoSave();
                deps.emitArrangementStateChanged({ addedRowIndex: rowIndex + 1 });
            });

            const removeRowBtn = document.createElement('button');
            removeRowBtn.type = 'button';
            removeRowBtn.className = 'arr-row-del';
            removeRowBtn.title = appState.arrangementDraftState.rows.length === 1 ? 'Cannot remove the only row' : 'Remove row';
            removeRowBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
            const cannotRemoveRow = appState.arrangementDraftState.rows.length === 1;
            removeRowBtn.disabled = readonly || cannotRemoveRow;
            removeRowBtn.classList.toggle('opacity-40', readonly || cannotRemoveRow);
            removeRowBtn.classList.toggle('cursor-not-allowed', readonly || cannotRemoveRow);
            removeRowBtn.addEventListener('click', async () => {
                if (readonly) return;
                const confirmed = await deps.confirmDialog({
                    title: 'Delete row?',
                    message: 'Delete this row? This cannot be undone.',
                    cancelLabel: 'No! Abort.',
                    confirmLabel: 'Delete',
                    confirmIcon: 'trash-2',
                    variant: 'danger',
                    overlayLight: true,
                });
                if (!confirmed) return;
                if (appState.arrangementDraftState.rows.length === 1) appState.arrangementDraftState.rows[0] = { repeats: 1, blocks: [], loop: false };
                else appState.arrangementDraftState.rows.splice(rowIndex, 1);
                renderArrangementWorkspace();
                deps.scheduleArrangementAutoSave();
                deps.emitArrangementStateChanged({ removedRowIndex: rowIndex });
            });

            const renderChips = () => {
                chipsEl.innerHTML = '';
                const isMultitrackRowSelection = multitrackMode && activeMultitrackRowIndex === rowIndex;
                const activeFilename = deps.getActiveArrangementBlockFilename();
                row.blocks.slice().sort(compareRowBlockFilenames).forEach((filename) => {
                    const block = deps.getBlockByFilename(filename);
                    const chip = document.createElement('div');
                    const chipSelectionClass = isMultitrackRowSelection
                        ? (filename === activeFilename
                            ? 'ring-1 ring-primary border-primary bg-input-bg'
                            : 'ring-1 ring-quaternary border-quaternary bg-input-bg')
                        : (!multitrackMode && filename === activeFilename
                            ? 'ring-1 ring-primary border-primary'
                            : '');
                    chip.className = `arr-chip ${chipSelectionClass}`;
                    chip.dataset.filename = filename;
                    chip.dataset.blockSteps = String(getBlockSteps(block));
                    chip.draggable = !readonly;
                    chip.addEventListener('dragstart', (event) => {
                        if (!event.dataTransfer || readonly) return;
                        event.dataTransfer.effectAllowed = 'copyMove';
                        event.dataTransfer.setData('application/x-zzfxtrack-arr-chip', JSON.stringify({ filename, fromRowIndex: rowIndex }));
                        event.dataTransfer.setData('text/plain', filename);
                    });
                    chip.innerHTML = `<span class="arr-chip-label">${deps.escapeHtml(block?.name || filename)}</span><button type="button" class="arr-chip-del" title="Remove"><i data-lucide="x" class="w-3 h-3"></i></button>`;
                    chip.addEventListener('click', (event) => {
                        if (event.target?.closest('.arr-chip-del')) return;
                        deps.flushTrackerSaveForBlockSwitch();
                        if (multitrackMode) {
                            deps.setActiveArrangementRowIndex(rowIndex);
                            deps.requestTrackerWorkspaceMultitrackAutoscroll(filename);
                        }
                        deps.setActiveArrangementBlockFilename(filename);
                        if (deps.getCurrentArrangementFilename()) deps.setSelectedBlockForArrangement(deps.getCurrentArrangementFilename(), filename);
                        renderArrangementWorkspace();
                        deps.renderTrackerWorkspace();
                    });
                    chip.querySelector('.arr-chip-del')?.addEventListener('click', async (event) => {
                        event.stopPropagation();
                        if (readonly) return;
                        const idx = row.blocks.indexOf(filename);
                        if (idx >= 0) row.blocks.splice(idx, 1);
                        if (deps.getActiveArrangementBlockFilename() === filename) {
                            deps.setActiveArrangementBlockFilename(null);
                            if (deps.getCurrentArrangementFilename()) deps.setSelectedBlockForArrangement(deps.getCurrentArrangementFilename(), null);
                        }
                        renderArrangementWorkspace();
                        deps.renderTrackerWorkspace();
                        deps.scheduleArrangementAutoSave();
                        deps.emitArrangementStateChanged({ removedFilename: filename });
                        deps.applyArrangementPreviewAfterBlockRemoved(filename);
                        await deps.saveCurrentArrangement();
                    });
                    chipsEl.appendChild(chip);
                });
            };

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
            rowsRoot.appendChild(rowEl);
            renderChips();
            updateSelectDisabled(selectEl);
        });
    }

    deps.createIcons({ icons: deps.icons });
    deps.updateAdvancedSettingsButtonsVisibility();
    if (deps.isArrangementPreviewPlaying()) applyArrangementWorkspacePlayhead(deps.getArrangementWorkspacePlayhead());
    else clearArrangementWorkspacePlayheadVisuals();
    deps.renderTrackerWorkspace();
    deps.updateArrangementInstrumentUsage();
}
