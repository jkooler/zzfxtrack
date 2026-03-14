/**
 * Module: features/ui/view-switching
 * Purpose: Main-view switching and export-menu visibility/control behavior.
 * Deps keys: alphabetical.
 */

let deps = {
    clearZzFXTrackPreviewData: () => {},
    getCurrentArrangementFilename: () => null,
    getCurrentPatternFilename: () => null,
    getDom: () => ({}),
    getLastExportedContext: () => ({ type: null, filename: null }),
    getLastExportedData: () => null,
    refreshArrangementListActiveState: () => {},
    renderArrangementWorkspace: () => {},
    renderPlayButton: () => {},
    setActiveArrangementBlockFilename: () => {},
    setArrangementDraftState: () => {},
    setCurrentArrangementFilename: () => {},
    setCurrentArrangementScope: () => {},
    setCurrentPatternFilename: () => {},
    setCurrentPatternScope: () => {},
    setPlayingPatternFilename: () => {},
    undockTrackerModalFromWorkspace: () => {},
    updateAdvancedSettingsButtonsVisibility: () => {},
    updateArrangementListScopeVisualizer: () => {},
    updateArrangementSelectionState: () => {},
    updatePatternListVisualizer: () => {},
    updatePatternSelectionState: () => {},
};

export function configureViewSwitching(options = {}) {
    deps = { ...deps, ...options };
}

export function isArrangementWorkspaceActive() {
    const dom = deps.getDom();
    return Boolean(dom.arrangementWorkspace && dom.arrangementWorkspace.style.display === 'flex');
}

export function refreshZzFXTrackPreviewControlsVisibility() {
    const dom = deps.getDom();
    const lastExportedData = deps.getLastExportedData();
    const lastExportedContext = deps.getLastExportedContext();
    const currentPatternFilename = deps.getCurrentPatternFilename();
    const currentArrangementFilename = deps.getCurrentArrangementFilename();

    const hasExportedData = Boolean(lastExportedData);
    const matchesPattern = hasExportedData
        && lastExportedContext.type === 'pattern'
        && Boolean(currentPatternFilename)
        && lastExportedContext.filename === currentPatternFilename
        && !isArrangementWorkspaceActive();
    const matchesArrangement = hasExportedData
        && lastExportedContext.type === 'arrangement'
        && Boolean(currentArrangementFilename)
        && lastExportedContext.filename === currentArrangementFilename
        && isArrangementWorkspaceActive();
    const shouldShow = matchesPattern || matchesArrangement;

    if (dom.previewPlayBtn) {
        dom.previewPlayBtn.style.display = shouldShow ? '' : 'none';
        dom.previewPlayBtn.disabled = !shouldShow;
    }
    if (dom.showJsonBtn) {
        dom.showJsonBtn.style.display = shouldShow ? '' : 'none';
        dom.showJsonBtn.disabled = !shouldShow;
    }
}

export function updateFooterExportActionLabels() {
    const dom = deps.getDom();
    const arrangementMode = isArrangementWorkspaceActive();
    if (dom.exportBtnLabel) dom.exportBtnLabel.textContent = 'Export';
    if (dom.exportMenuTitle) {
        dom.exportMenuTitle.textContent = arrangementMode ? 'Export format' : 'Export Pattern to...';
    }
    if (dom.exportBtn) {
        dom.exportBtn.title = arrangementMode ? 'Export arrangement' : 'Export pattern';
        dom.exportBtn.classList.toggle('export-arrangement-mode', arrangementMode);
    }
    if (dom.exportJsonBtn) {
        dom.exportJsonBtn.title = arrangementMode ? 'Export arrangement to ZzFXTrack JSON' : 'Export pattern to ZzFXTrack JSON';
    }
    if (dom.exportWavBtn) {
        dom.exportWavBtn.title = arrangementMode ? 'Download arrangement mix as WAV' : 'Download pattern mix as WAV';
    }
}

export function closeExportMenu() {
    const dom = deps.getDom();
    if (dom.exportMenu) dom.exportMenu.classList.add('hidden');
    if (dom.exportBtn) dom.exportBtn.setAttribute('aria-expanded', 'false');
}

export function openExportMenu() {
    const dom = deps.getDom();
    if (!dom.exportMenu || !dom.exportBtn || dom.exportBtn.disabled) return;
    dom.exportMenu.classList.remove('hidden');
    dom.exportBtn.setAttribute('aria-expanded', 'true');
    dom.exportJsonBtn?.focus();
}

export function toggleExportMenu() {
    const dom = deps.getDom();
    if (!dom.exportMenu || !dom.exportBtn || dom.exportBtn.disabled) return;
    const isOpen = !dom.exportMenu.classList.contains('hidden');
    if (isOpen) closeExportMenu();
    else openExportMenu();
}

export function setExportControlsDisabled(disabled) {
    const dom = deps.getDom();
    if (dom.exportBtn) dom.exportBtn.disabled = disabled;
    if (dom.exportJsonBtn) dom.exportJsonBtn.disabled = disabled;
    if (dom.exportWavBtn) dom.exportWavBtn.disabled = disabled;
    if (disabled) closeExportMenu();
}

function isTrackerDocked() {
    const dom = deps.getDom();
    const trackerModal = document.getElementById('trackerModal');
    return Boolean(
        trackerModal?.classList.contains('workspace-docked')
        && dom.trackerWorkspacePane
        && dom.trackerWorkspacePane.contains(trackerModal)
    );
}

export function showWelcome() {
    const dom = deps.getDom();
    closeExportMenu();
    deps.undockTrackerModalFromWorkspace();
    dom.welcomeView.style.display = 'flex';
    dom.editorContainer.style.display = 'none';
    if (dom.arrangementWorkspace) dom.arrangementWorkspace.style.display = 'none';
    if (dom.mainHeader) dom.mainHeader.classList.add('hidden');
    if (dom.mainFooter) {
        dom.mainFooter.classList.remove('hidden');
        dom.mainFooter.classList.add('footer-intro-mode');
    }
    dom.playBtn.style.visibility = 'hidden';
    setExportControlsDisabled(true);

    deps.updatePatternSelectionState(false);
    dom.previewPlayBtn.style.display = 'none';
    dom.previewPlayBtn.disabled = true;
    if (dom.showJsonBtn) {
        dom.showJsonBtn.style.display = 'none';
        dom.showJsonBtn.disabled = true;
    }
    deps.updateAdvancedSettingsButtonsVisibility();

    deps.setCurrentPatternFilename(null);
    deps.setCurrentPatternScope('user');
    deps.setCurrentArrangementFilename(null);
    deps.setCurrentArrangementScope('user');
    deps.setArrangementDraftState(null);
    deps.setActiveArrangementBlockFilename(null);
    deps.setPlayingPatternFilename(null);
    dom.patternNameInput.classList.add('hidden');
    if (dom.repl.editor) dom.repl.editor.stop();
    deps.renderPlayButton();
    deps.updatePatternListVisualizer();
    deps.clearZzFXTrackPreviewData({ placeholder: '' });
    dom.sidebarTitle?.classList.remove('active');
    deps.refreshArrangementListActiveState();
    deps.renderArrangementWorkspace();
    updateFooterExportActionLabels();
}

export function showIntroduction() {
    const dom = deps.getDom();
    closeExportMenu();
    if (!deps.getCurrentPatternFilename()) {
        showWelcome();
        return;
    }
    deps.undockTrackerModalFromWorkspace();
    dom.welcomeView.style.display = 'flex';
    dom.editorContainer.style.display = 'none';
    if (dom.arrangementWorkspace) dom.arrangementWorkspace.style.display = 'none';
    if (dom.mainHeader) dom.mainHeader.classList.add('hidden');
    if (dom.mainFooter) {
        dom.mainFooter.classList.remove('hidden');
        dom.mainFooter.classList.add('footer-intro-mode');
    }
    dom.patternNameInput.classList.add('hidden');
    deps.updateArrangementSelectionState(false);
    deps.updateAdvancedSettingsButtonsVisibility();
    dom.playBtn.style.visibility = 'visible';
    setExportControlsDisabled(false);
    deps.renderPlayButton();
    deps.updatePatternListVisualizer();
    Array.from(dom.patternList.querySelectorAll('.list-item')).forEach((li) => li.classList.remove('active'));
    dom.sidebarTitle?.classList.add('active');
    refreshZzFXTrackPreviewControlsVisibility();
    updateFooterExportActionLabels();
}

export function showEditor() {
    const dom = deps.getDom();
    closeExportMenu();
    if (!isTrackerDocked()) deps.undockTrackerModalFromWorkspace();
    dom.welcomeView.style.display = 'none';
    dom.editorContainer.style.display = 'flex';
    if (dom.arrangementWorkspace) dom.arrangementWorkspace.style.display = 'none';
    if (dom.mainHeader) dom.mainHeader.classList.remove('hidden');
    if (dom.mainFooter) {
        dom.mainFooter.classList.remove('hidden');
        dom.mainFooter.classList.remove('footer-intro-mode');
    }
    deps.updateArrangementSelectionState(false);
    dom.playBtn.style.visibility = 'visible';
    setExportControlsDisabled(false);
    dom.patternNameInput.classList.remove('hidden');
    deps.updatePatternSelectionState(Boolean(deps.getCurrentPatternFilename()));
    refreshZzFXTrackPreviewControlsVisibility();
    deps.updateAdvancedSettingsButtonsVisibility();
    dom.sidebarTitle?.classList.remove('active');
    deps.updatePatternListVisualizer();
    deps.updateArrangementListScopeVisualizer();
    updateFooterExportActionLabels();
}
