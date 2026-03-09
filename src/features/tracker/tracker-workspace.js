/**
 * Module: features/tracker/tracker-workspace
 * Purpose: Tracker workspace docking and workspace-pane render behavior.
 */

let deps = {
    getTrackerWorkspacePane: () => null,
    getActiveArrangementBlockFilename: () => null,
    getBlockByFilename: () => null,
    getTrackerWorkspaceLoadedFilename: () => null,
    setTrackerWorkspaceLoadedFilename: () => {},
    getTrackerWorkspaceLoadToken: () => 0,
    setTrackerWorkspaceLoadToken: () => {},
    isTrackerOpen: () => false,
    closeTracker: () => {},
    openTrackerModalForEdit: async () => {},
    setStatus: () => {},
    getActiveArrangementBlockFilenameForDrag: () => null,
    logError: () => {},
    getTrackerDockRestoreParent: () => null,
    setTrackerDockRestoreParent: () => {},
    getTrackerDockRestoreNextSibling: () => null,
    setTrackerDockRestoreNextSibling: () => {},
};

export function configureTrackerWorkspace(options = {}) {
    deps = { ...deps, ...options };
}

export function dockTrackerModalToWorkspace() {
    const trackerModal = document.getElementById('trackerModal');
    const pane = deps.getTrackerWorkspacePane();
    if (!trackerModal || !pane) return null;
    const alreadyDocked = trackerModal.classList.contains('workspace-docked')
        && trackerModal.parentElement === pane;
    if (alreadyDocked) return trackerModal;
    if (!deps.getTrackerDockRestoreParent()) {
        deps.setTrackerDockRestoreParent(trackerModal.parentElement);
        deps.setTrackerDockRestoreNextSibling(trackerModal.nextElementSibling);
    }
    pane.innerHTML = '';
    trackerModal.classList.add('workspace-docked');
    pane.appendChild(trackerModal);
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
    const activeFilename = deps.getActiveArrangementBlockFilename();
    const selectedBlock = activeFilename ? deps.getBlockByFilename(activeFilename) : null;
    if (!selectedBlock) {
        deps.setTrackerWorkspaceLoadedFilename(null);
        deps.setTrackerWorkspaceLoadToken(deps.getTrackerWorkspaceLoadToken() + 1);
        if (deps.isTrackerOpen()) deps.closeTracker();
        undockTrackerModalFromWorkspace();
        pane.innerHTML = `
            <div class="h-full p-4 text-sm text-muted-foreground">
                Select a block from the arrangement or the library to open it in tracker.
            </div>
        `;
        return;
    }

    dockTrackerModalToWorkspace();
    const shouldReload = deps.getTrackerWorkspaceLoadedFilename() !== selectedBlock.filename || !deps.isTrackerOpen();
    if (!shouldReload) return;

    deps.setTrackerWorkspaceLoadedFilename(selectedBlock.filename);
    deps.setTrackerWorkspaceLoadToken(deps.getTrackerWorkspaceLoadToken() + 1);
    const loadToken = deps.getTrackerWorkspaceLoadToken();

    deps.openTrackerModalForEdit(selectedBlock, selectedBlock.trackerState || null, {
        autoSaveOnInput: true,
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
        if (trackerHeader.dataset.arrTitleDragSetup) return;
        trackerHeader.dataset.arrTitleDragSetup = '1';
        trackerHeader.addEventListener('dragstart', (e) => {
            const filename = deps.getActiveArrangementBlockFilenameForDrag();
            if (!filename || !e.dataTransfer) return;
            e.dataTransfer.effectAllowed = 'copyMove';
            e.dataTransfer.setData('application/x-zzfxm-arr-chip', JSON.stringify({ filename }));
            e.dataTransfer.setData('text/plain', filename);
        });
    }).catch((err) => {
        if (loadToken !== deps.getTrackerWorkspaceLoadToken()) return;
        deps.logError('[Tracker] Failed to load block in workspace:', err);
        deps.setStatus('Failed to open tracker block', 'error');
    });
}
