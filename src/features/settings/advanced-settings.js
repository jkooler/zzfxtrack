/**
 * Module: features/settings/advanced-settings
 * Purpose: Advanced-settings modal orchestration and scope-update actions.
 * Deps keys: alphabetical.
 */

let deps = {
    autoUpdateInstrumentsFile: async () => {},
    createIcons: () => {},
    dispatchResourceScopeChanged: () => {},
    getDeveloperModeHeaders: () => ({}),
    getCurrentArrangementFilename: () => null,
    getCurrentArrangementDraftState: () => null,
    getCurrentPatternFilename: () => null,
    getCurrentPatternMetadata: () => ({
        title: '',
        author: '',
        contact: '',
        license: '',
    }),
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
    setCurrentArrangementDraftState: () => {},
    setCurrentPatternScope: () => {},
    setCurrentPatternMetadata: () => {},
    setInstrumentScope: () => false,
    setPatternNameReadOnly: () => {},
    savePatternAdvancedSettings: async () => {},
    saveArrangementSettings: async () => {},
    setStatus: () => {},
    updateArrangementScope: async () => {},
    updateBlockScope: async () => {},
    updatePatternScope: async () => {},
};

let pendingAdvancedSettingsContext = null;

export function configureAdvancedSettings(options = {}) {
    deps = { ...deps, ...options };
}

function normalizeArrangementMetadata(value) {
    return {
        title: String(value?.title || '').trim(),
        author: String(value?.author || '').trim(),
        contact: String(value?.contact || '').trim(),
        license: String(value?.license || '').trim(),
    };
}

function setArrangementMetadataInputs(dom, metadata = {}) {
    if (dom.advancedSettingsMetadataTitle) dom.advancedSettingsMetadataTitle.value = metadata.title || '';
    if (dom.advancedSettingsMetadataAuthor) dom.advancedSettingsMetadataAuthor.value = metadata.author || '';
    if (dom.advancedSettingsMetadataContact) dom.advancedSettingsMetadataContact.value = metadata.contact || '';
    if (dom.advancedSettingsMetadataLicense) dom.advancedSettingsMetadataLicense.value = metadata.license || '';
}

function readArrangementMetadataInputs(dom) {
    return normalizeArrangementMetadata({
        title: dom.advancedSettingsMetadataTitle?.value,
        author: dom.advancedSettingsMetadataAuthor?.value,
        contact: dom.advancedSettingsMetadataContact?.value,
        license: dom.advancedSettingsMetadataLicense?.value,
    });
}

export function openAdvancedSettingsModal(context) {
    if (!context) return;
    const dom = deps.getDom();
    pendingAdvancedSettingsContext = {
        ...context,
        metadata: normalizeArrangementMetadata(
            context.metadata
            || (context.type === 'pattern' ? deps.getCurrentPatternMetadata() : null)
        ),
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
    if (dom.advancedSettingsMetadataDetails) {
        const showMetadata = pendingAdvancedSettingsContext.type === 'arrangement'
            || pendingAdvancedSettingsContext.type === 'pattern';
        dom.advancedSettingsMetadataDetails.classList.toggle('hidden', !showMetadata);
    }
    setArrangementMetadataInputs(dom, pendingAdvancedSettingsContext.metadata);
    if (dom.saveAdvancedSettingsBtn) dom.saveAdvancedSettingsBtn.disabled = deps.isDemoMode();
    dom.advancedSettingsModal?.querySelectorAll('details').forEach((el) => {
        el.open = false;
    });
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
        deps.setStatus('Demo mode: advanced settings are disabled', 'normal');
        closeAdvancedSettingsModal();
        return;
    }
    const nextScope = dom.advancedSettingsSystemToggle?.checked ? 'system' : 'user';
    const context = pendingAdvancedSettingsContext;
    const nextMetadata = context.type === 'arrangement' || context.type === 'pattern'
        ? readArrangementMetadataInputs(dom)
        : normalizeArrangementMetadata();
    try {
        if (context.type === 'pattern') {
            if (!context.filename) throw new Error('No pattern selected');
            await deps.savePatternAdvancedSettings(context.filename, {
                scope: nextScope,
                metadata: nextMetadata,
            });
            const entry = deps.getPatternEntry(context.filename);
            if (entry) entry.scope = nextScope;
            if (context.filename === deps.getCurrentPatternFilename()) {
                deps.setCurrentPatternScope(nextScope);
                deps.setCurrentPatternMetadata(nextMetadata);
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
            if (typeof context.applyDraftSettings === 'function') {
                context.applyDraftSettings({
                    metadata: nextMetadata,
                    scope: nextScope,
                });
            } else if (context.filename && context.filename === deps.getCurrentArrangementFilename()) {
                const currentDraftState = deps.getCurrentArrangementDraftState();
                if (currentDraftState) {
                    deps.setCurrentArrangementDraftState({
                        ...currentDraftState,
                        metadata: nextMetadata,
                    });
                }
            }
            if (context.filename) {
                const arrangementState = typeof context.getArrangementStatePayload === 'function'
                    ? context.getArrangementStatePayload(nextMetadata)
                    : null;
                if (arrangementState) {
                    await deps.saveArrangementSettings(context.filename, {
                        name: context.filename.replace(/\.js$/i, ''),
                        arrangementState,
                        scope: nextScope,
                    }, deps.getDeveloperModeHeaders());
                } else {
                    await deps.updateArrangementScope(context.filename, nextScope);
                }
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
            metadata: nextMetadata,
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
