/**
 * Module: features/tracker/tracker-workspace
 * Purpose: Tracker workspace docking and workspace-pane render behavior.
 * Deps keys: alphabetical.
 */

let deps = {
    closeTracker: () => {},
    getActiveArrangementBlockFilename: () => null,
    getActiveArrangementRowIndex: () => null,
    getActiveArrangementBlockFilenameForDrag: () => null,
    getArrangementMultitrackMode: () => false,
    getArrangementDraftState: () => null,
    getBlockByFilename: () => null,
    flushTrackerSaveForBlockSwitch: () => false,
    getTrackerDockRestoreNextSibling: () => null,
    getTrackerDockRestoreParent: () => null,
    getTrackerWorkspaceLoadedFilename: () => null,
    getTrackerWorkspaceLoadToken: () => 0,
    getTrackerWorkspacePane: () => null,
    isTrackerOpen: () => false,
    logError: () => {},
    openTrackerModalForEdit: async () => {},
    setActiveArrangementBlockFilename: () => {},
    setStatus: () => {},
    setTrackerDockRestoreNextSibling: () => {},
    setTrackerDockRestoreParent: () => {},
    setTrackerWorkspaceLoadedFilename: () => {},
    setTrackerWorkspaceLoadToken: () => {},
};

let multitrackActiveBlockListenerInstalled = false;
let pendingArrangementMultitrackScrollFilename = null;
let workspaceMultitrackActiveFilename = null;

export function requestTrackerWorkspaceMultitrackAutoscroll(filename = null) {
    pendingArrangementMultitrackScrollFilename = filename || null;
    if (filename) workspaceMultitrackActiveFilename = filename;
}

function scrollTrackerWorkspaceMultitrackSegmentIntoView(filename) {
    if (!filename) return;
    const trackerModal = document.getElementById('trackerModal');
    const container = trackerModal?.querySelector('.tracker-grid.tracker-grid-multitrack-mode');
    const segment = container?.querySelector(`.multitrack-tracker-segment[data-filename="${CSS?.escape ? CSS.escape(filename) : String(filename).replace(/[^a-zA-Z0-9_-]/g, '\\$&')}"]`);
    if (!container || !segment) return;

    const margin = 48;
    const segmentLeft = segment.offsetLeft;
    const segmentRight = segmentLeft + segment.offsetWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;

    let nextScrollLeft = null;
    if (segmentLeft - margin < viewLeft) {
        nextScrollLeft = Math.max(segmentLeft - margin, 0);
    } else if (segmentRight + margin > viewRight) {
        nextScrollLeft = Math.max(segmentRight - container.clientWidth + margin, 0);
    }

    if (nextScrollLeft != null) {
        container.scrollLeft = nextScrollLeft;
    }
}

function createRowBlockFilenameComparator(blockByFilename) {
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

export function configureTrackerWorkspace(options = {}) {
    deps = { ...deps, ...options };
    if (!multitrackActiveBlockListenerInstalled) {
        document.addEventListener('tracker:multitrackActiveBlockChanged', (event) => {
            const filename = event?.detail?.filename;
            if (!filename) return;
            workspaceMultitrackActiveFilename = filename;
        });
        multitrackActiveBlockListenerInstalled = true;
    }
}

function preserveDockedTrackerModal(pane) {
    const trackerModal = document.getElementById('trackerModal');
    if (!trackerModal || !pane?.contains(trackerModal)) return;
    document.body.appendChild(trackerModal);
}

export function dockTrackerModalToWorkspace() {
    const trackerModal = document.getElementById('trackerModal');
    const pane = deps.getTrackerWorkspacePane();
    if (!trackerModal || !pane) return null;
    const dockHost = pane.querySelector('[data-tracker-dock-host]') || pane;
    const alreadyDocked = trackerModal.classList.contains('workspace-docked')
        && trackerModal.parentElement === dockHost;
    if (alreadyDocked) return trackerModal;
    if (!deps.getTrackerDockRestoreParent()) {
        deps.setTrackerDockRestoreParent(trackerModal.parentElement);
        deps.setTrackerDockRestoreNextSibling(trackerModal.nextElementSibling);
    }
    dockHost.innerHTML = '';
    trackerModal.classList.add('workspace-docked');
    dockHost.appendChild(trackerModal);
    return trackerModal;
}

export function undockTrackerModalFromWorkspace() {
    const trackerModal = document.getElementById('trackerModal');
    if (!trackerModal || !trackerModal.classList.contains('workspace-docked')) return;
    trackerModal.classList.remove('workspace-docked');
    trackerModal.classList.remove('open');
    const restoreParent = deps.getTrackerDockRestoreParent() || document.body;
    const restoreSibling = deps.getTrackerDockRestoreNextSibling();
    if (restoreSibling && restoreSibling.parentElement === restoreParent) {
        restoreParent.insertBefore(trackerModal, restoreSibling);
    } else {
        restoreParent.appendChild(trackerModal);
    }
    deps.setTrackerDockRestoreParent(null);
    deps.setTrackerDockRestoreNextSibling(null);
}

export function renderTrackerWorkspace() {
    const pane = deps.getTrackerWorkspacePane();
    if (!pane) return;
    preserveDockedTrackerModal(pane);
    const multitrackMode = deps.getArrangementMultitrackMode();
    const activeRowIndex = deps.getActiveArrangementRowIndex();
    const draftState = deps.getArrangementDraftState();
    const activeRow = Number.isInteger(activeRowIndex) ? draftState?.rows?.[activeRowIndex] : null;
    const rowBlocks = Array.isArray(activeRow?.blocks) ? activeRow.blocks : [];
    const blockByFilename = new Map(rowBlocks.map((filename) => [filename, deps.getBlockByFilename(filename)]));
    const compareRowBlockFilenames = createRowBlockFilenameComparator(blockByFilename);
    const multitrackRowBlocks = multitrackMode && rowBlocks.length
        ? rowBlocks.slice().sort(compareRowBlockFilenames)
        : [];
    let activeFilename = multitrackMode
        ? (workspaceMultitrackActiveFilename || deps.getActiveArrangementBlockFilename())
        : deps.getActiveArrangementBlockFilename();
    if (multitrackMode && multitrackRowBlocks.length && !multitrackRowBlocks.includes(activeFilename)) {
        activeFilename = multitrackRowBlocks[0];
        workspaceMultitrackActiveFilename = activeFilename;
    } else if (!multitrackMode) {
        workspaceMultitrackActiveFilename = null;
    }
    if (multitrackMode && activeFilename) workspaceMultitrackActiveFilename = activeFilename;
    const selectedBlock = activeFilename ? deps.getBlockByFilename(activeFilename) : null;
    if (!selectedBlock) {
        workspaceMultitrackActiveFilename = null;
        deps.setTrackerWorkspaceLoadedFilename(null);
        deps.setTrackerWorkspaceLoadToken(deps.getTrackerWorkspaceLoadToken() + 1);
        if (deps.isTrackerOpen()) deps.closeTracker();
        undockTrackerModalFromWorkspace();
        pane.innerHTML = `
            <div class="h-full p-4 text-sm text-muted-foreground">
                ${multitrackMode
                    ? 'Enable Multitrack mode and click a block in an arrangement row to open its row context here.'
                    : 'Select a block from the arrangement or the library to open it in tracker.'}
            </div>
        `;
        return;
    }

    pane.innerHTML = '<div data-tracker-dock-host class="min-h-0 h-full"></div>';

    dockTrackerModalToWorkspace();
    const workspaceLoadKey = multitrackMode && multitrackRowBlocks.length > 1
        ? `${selectedBlock.filename}::multitrack::${multitrackRowBlocks.join('|')}`
        : selectedBlock.filename;
    const shouldReload = deps.getTrackerWorkspaceLoadedFilename() !== workspaceLoadKey || !deps.isTrackerOpen();
    if (!shouldReload) {
        if (pendingArrangementMultitrackScrollFilename === selectedBlock.filename) {
            pendingArrangementMultitrackScrollFilename = null;
            requestAnimationFrame(() => scrollTrackerWorkspaceMultitrackSegmentIntoView(selectedBlock.filename));
        }
        return;
    }

    deps.setTrackerWorkspaceLoadedFilename(workspaceLoadKey);
    deps.setTrackerWorkspaceLoadToken(deps.getTrackerWorkspaceLoadToken() + 1);
    const loadToken = deps.getTrackerWorkspaceLoadToken();

    deps.openTrackerModalForEdit(selectedBlock, selectedBlock.trackerState || null, {
        autoSaveOnInput: true,
        multitrackSegments: multitrackMode && multitrackRowBlocks.length > 1
            ? multitrackRowBlocks.map((filename) => {
                const block = deps.getBlockByFilename(filename);
                return block
                    ? {
                        description: block.description || '',
                        filename: block.filename,
                        name: block.name || block.filename.replace(/\.js$/i, ''),
                        pattern: block.pattern || '',
                        scope: block.scope === 'system' ? 'system' : 'user',
                        trackerState: block.trackerState || null,
                    }
                    : null;
            }).filter(Boolean)
            : null,
        returnToArrangementsOnClose: false,
        returnToBlocksOnClose: false,
    }).then(() => {
        if (loadToken !== deps.getTrackerWorkspaceLoadToken()) return;
        const trackerModal = document.getElementById('trackerModal');
        if (!trackerModal?.classList.contains('workspace-docked')) return;
        const trackerHeader = trackerModal.querySelector('h2');
        if (!trackerHeader) return;
        trackerHeader.textContent = selectedBlock.name || selectedBlock.filename.replace(/\.js$/i, '');
        trackerHeader.draggable = true;
        if (!trackerHeader.dataset.arrTitleDragSetup) {
            trackerHeader.dataset.arrTitleDragSetup = '1';
            trackerHeader.addEventListener('dragstart', (e) => {
                const filename = deps.getActiveArrangementBlockFilenameForDrag();
                if (!filename || !e.dataTransfer) return;
                e.dataTransfer.effectAllowed = 'copyMove';
                e.dataTransfer.setData('application/x-zzfxtrack-arr-chip', JSON.stringify({ filename }));
                e.dataTransfer.setData('text/plain', filename);
            });
        }
        if (pendingArrangementMultitrackScrollFilename === selectedBlock.filename) {
            pendingArrangementMultitrackScrollFilename = null;
            requestAnimationFrame(() => scrollTrackerWorkspaceMultitrackSegmentIntoView(selectedBlock.filename));
        }
    }).catch((err) => {
        if (loadToken !== deps.getTrackerWorkspaceLoadToken()) return;
        deps.logError('[Tracker] Failed to load block in workspace:', err);
        deps.setStatus('Failed to open tracker block', 'error');
    });
}
