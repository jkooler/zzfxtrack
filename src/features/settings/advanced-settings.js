/**
 * Module: features/settings/advanced-settings
 * Purpose: Advanced-settings modal orchestration and scope-update actions.
 * Deps keys: alphabetical.
 */

let deps = {
    autoUpdateInstrumentsFile: async () => {},
    createIcons: () => {},
    dispatchResourceScopeChanged: () => {},
    getCurrentArrangementFilename: () => null,
    getCurrentPatternFilename: () => null,
    getDom: () => ({}),
    getIcons: () => ({}),
    getPatternEntry: () => null,
    isDemoMode: () => false,
    logError: () => {},
    normalizeScope: (value) => value,
    refreshArrangementList: async () => {},
    refreshBlocksLibrary: async () => {},
    refreshInstrumentListUI: () => {},
    refreshPatternList: async () => {},
    renderArrangementWorkspace: () => {},
    reloadInstruments: async () => {},
    setCurrentArrangementScope: () => {},
    setCurrentPatternScope: () => {},
    setInstrumentScope: () => false,
    setPatternNameReadOnly: () => {},
    setStatus: () => {},
    updateArrangementScope: async () => {},
    updateBlockScope: async () => {},
    updatePatternScope: async () => {},
};

let pendingAdvancedSettingsContext = null;

export function configureAdvancedSettings(options = {}) {
    deps = { ...deps, ...options };
}

export function openAdvancedSettingsModal(context) {
    if (!context) return;
    const dom = deps.getDom();
    pendingAdvancedSettingsContext = {
        ...context,
        scope: deps.normalizeScope(context.scope),
    };
    const typeLabel = String(context.type || 'resource');
    const resourceName = String(context.name || context.filename || context.id || '').trim();
    if (dom.advancedSettingsTitle) dom.advancedSettingsTitle.textContent = 'Advanced settings';
    if (dom.advancedSettingsResourceLabel) {
        dom.advancedSettingsResourceLabel.textContent = resourceName
            ? `${typeLabel[0].toUpperCase()}${typeLabel.slice(1)}: ${resourceName}`
            : `${typeLabel[0].toUpperCase()}${typeLabel.slice(1)}`;
    }
    if (dom.advancedSettingsSystemToggle) {
        dom.advancedSettingsSystemToggle.checked = pendingAdvancedSettingsContext.scope === 'system';
        dom.advancedSettingsSystemToggle.disabled = deps.isDemoMode();
    }
    if (dom.advancedSettingsSystemLockIcon) {
        dom.advancedSettingsSystemLockIcon.classList.add('hidden');
    }
    if (dom.advancedSettingsSystemLabel) {
        dom.advancedSettingsSystemLabel.classList.add('text-foreground');
        dom.advancedSettingsSystemLabel.classList.remove('text-muted-foreground');
    }
    if (dom.saveAdvancedSettingsBtn) dom.saveAdvancedSettingsBtn.disabled = deps.isDemoMode();
    dom.advancedSettingsModal?.classList.add('open');
    deps.createIcons({ icons: deps.getIcons() });
}

export function closeAdvancedSettingsModal() {
    deps.getDom().advancedSettingsModal?.classList.remove('open');
    pendingAdvancedSettingsContext = null;
}

async function applyAdvancedSettings() {
    const dom = deps.getDom();
    if (!pendingAdvancedSettingsContext) return;
    if (deps.isDemoMode()) {
        deps.setStatus('Demo mode: updating system visibility is disabled', 'normal');
        closeAdvancedSettingsModal();
        return;
    }
    const nextScope = dom.advancedSettingsSystemToggle?.checked ? 'system' : 'user';
    const context = pendingAdvancedSettingsContext;
    try {
        if (context.type === 'pattern') {
            if (!context.filename) throw new Error('No pattern selected');
            await deps.updatePatternScope(context.filename, nextScope);
            const entry = deps.getPatternEntry(context.filename);
            if (entry) entry.scope = nextScope;
            if (context.filename === deps.getCurrentPatternFilename()) {
                deps.setCurrentPatternScope(nextScope);
                deps.setPatternNameReadOnly();
            }
            await deps.refreshPatternList();
        } else if (context.type === 'instrument') {
            if (!context.id) throw new Error('No instrument selected');
            const updated = deps.setInstrumentScope(context.id, nextScope);
            if (!updated) throw new Error('Failed to update instrument scope');
            await deps.autoUpdateInstrumentsFile();
            await deps.reloadInstruments();
            deps.refreshInstrumentListUI();
            pendingAdvancedSettingsContext = {
                ...context,
                id: updated.id,
                name: updated.strudelAlias,
                scope: nextScope,
            };
        } else if (context.type === 'block') {
            if (context.filename) await deps.updateBlockScope(context.filename, nextScope);
            await deps.refreshBlocksLibrary();
        } else if (context.type === 'arrangement') {
            if (context.filename) {
                await deps.updateArrangementScope(context.filename, nextScope);
                if (context.filename === deps.getCurrentArrangementFilename()) {
                    deps.setCurrentArrangementScope(nextScope);
                }
            }
            await deps.refreshArrangementList();
            deps.renderArrangementWorkspace();
        } else {
            throw new Error('Unsupported resource type');
        }
        deps.dispatchResourceScopeChanged({
            ...context,
            id: pendingAdvancedSettingsContext?.id || context.id,
            previousId: context.id,
            name: pendingAdvancedSettingsContext?.name || context.name,
            scope: nextScope,
        });
        deps.setStatus('Advanced settings updated', 'success');
        closeAdvancedSettingsModal();
    } catch (e) {
        deps.logError(e);
        deps.setStatus(`Failed to update settings: ${e.message}`, 'error');
    }
}

export function installAdvancedSettingsHandlers() {
    const dom = deps.getDom();
    if (dom.closeAdvancedSettingsModalBtn) {
        dom.closeAdvancedSettingsModalBtn.addEventListener('click', closeAdvancedSettingsModal);
    }
    if (dom.cancelAdvancedSettingsBtn) {
        dom.cancelAdvancedSettingsBtn.addEventListener('click', closeAdvancedSettingsModal);
    }
    if (dom.saveAdvancedSettingsBtn) {
        dom.saveAdvancedSettingsBtn.addEventListener('click', () => { void applyAdvancedSettings(); });
    }
    if (dom.advancedSettingsModal) {
        dom.advancedSettingsModal.addEventListener('click', (e) => {
            if (e.target === dom.advancedSettingsModal) closeAdvancedSettingsModal();
        });
    }
}
