/**
 * Module: features/project/project-export
 * Purpose: Project bundle download/export flow.
 * Deps keys: alphabetical.
 */

import JSZip from 'jszip';

let deps = {
    buildArrangementSourceFromApi: () => '',
    buildBlockSourceFromApi: () => '',
    getDom: () => ({}),
    editorToFile: (value) => value,
    getGeneratedSystemInstrumentsContent: () => '',
    getGeneratedUserInstrumentsContent: () => '',
    getArrangementOrNull: async () => null,
    getBlockDetailOrNull: async () => null,
    getBundleKind: () => 'strudel-project-bundle',
    getBundleManifestName: () => 'strudel-project-bundle.json',
    getCurrentPatternFilename: () => null,
    getDemoArrangementSourceByFile: () => new Map(),
    getDemoBlockSourceByFile: () => new Map(),
    getDemoPatternSourceByFile: () => new Map(),
    getEditorCode: () => '',
    getPatternMetaTextOrNull: async () => null,
    getPatternSourceOrEmpty: async () => '',
    isDemoMode: () => false,
    listArrangementsOrEmpty: async () => [],
    listBlocksOrEmpty: async () => [],
    listPatterns: async () => [],
    logError: () => {},
    normalizePatternEntries: (list) => list || [],
    setStatus: () => {},
    triggerFileDownload: () => {},
};

export function configureProjectExport(options = {}) {
    deps = { ...deps, ...options };
}

function normalizeBundleIdentifier(value) {
    return String(value || '').trim();
}

function countInstrumentDefinitionsInModule(content) {
    const source = String(content || '');
    if (!source.trim()) return 0;
    const mappingMatch = source.match(/export\s+const\s+instrumentMapping\s*=\s*\{([\s\S]*?)\};/);
    if (!mappingMatch) return 0;
    const entries = mappingMatch[1].match(/"[^"]+"\s*:/g);
    return Array.isArray(entries) ? entries.length : 0;
}

async function getInstrumentFileContent(cacheKey, path) {
    const generated = cacheKey === 'instruments-system-js-content'
        ? deps.getGeneratedSystemInstrumentsContent()
        : deps.getGeneratedUserInstrumentsContent();
    if (generated && generated.trim()) {
        sessionStorage.setItem(cacheKey, generated);
        return generated;
    }
    const cached = sessionStorage.getItem(cacheKey);
    if (cached && cached.trim()) {
        return cached;
    }
    const res = await fetch(path);
    if (!res.ok) return '';
    const fileCode = await res.text();
    return fileCode.trim() ? fileCode : '';
}

export async function downloadProjectBundle({ identifier = '' } = {}) {
    try {
        const zip = new JSZip();
        const normalizedIdentifier = normalizeBundleIdentifier(identifier);

        let downloadedUserInstruments = 0;
        let downloadedSystemInstruments = 0;
        const [userInstrumentsContent, systemInstrumentsContent] = await Promise.all([
            getInstrumentFileContent('instruments-js-content', '/instruments.js'),
            getInstrumentFileContent('instruments-system-js-content', '/instruments.system.js'),
        ]);
        if (userInstrumentsContent) {
            zip.file('instruments.js', userInstrumentsContent);
            downloadedUserInstruments = 1;
        }
        if (systemInstrumentsContent) {
            zip.file('instruments.system.js', systemInstrumentsContent);
            downloadedSystemInstruments = 1;
        }
        const exportedUserInstrumentCount = countInstrumentDefinitionsInModule(userInstrumentsContent);
        const exportedSystemInstrumentCount = countInstrumentDefinitionsInModule(systemInstrumentsContent);
        const exportedInstrumentCount = exportedUserInstrumentCount + exportedSystemInstrumentCount;

        const files = deps.isDemoMode()
            ? Array.from(deps.getDemoPatternSourceByFile().keys()).sort()
            : deps.normalizePatternEntries(await deps.listPatterns()).map((entry) => entry.filename);

        let downloadedPatterns = 0;
        for (const filename of files) {
            let fileCode = '';
            if (filename === deps.getCurrentPatternFilename() && deps.getEditorCode()) {
                fileCode = deps.editorToFile(deps.getEditorCode());
            } else if (deps.isDemoMode()) {
                fileCode = deps.getDemoPatternSourceByFile().get(filename) || '';
            } else {
                fileCode = await deps.getPatternSourceOrEmpty(filename);
                if (!fileCode.trim()) continue;
            }

            if (!fileCode.trim()) continue;
            zip.file(`patterns/${decodeURIComponent(filename)}`, fileCode);
            downloadedPatterns++;

            if (deps.isDemoMode()) {
                const metaFilename = filename.replace(/\.js$/i, '.meta.json');
                zip.file(`patterns/${decodeURIComponent(metaFilename)}`, JSON.stringify({ scope: 'system' }, null, 2));
            } else {
                const metaText = await deps.getPatternMetaTextOrNull(filename);
                if (metaText) {
                    const metaFilename = filename.replace(/\.js$/i, '.meta.json');
                    zip.file(`patterns/${decodeURIComponent(metaFilename)}`, metaText);
                }
            }
        }

        let downloadedBlocks = 0;
        if (deps.isDemoMode()) {
            const blockFiles = Array.from(deps.getDemoBlockSourceByFile().keys()).sort();
            for (const filename of blockFiles) {
                const code = deps.getDemoBlockSourceByFile().get(filename) || '';
                if (!code.trim()) continue;
                zip.file(`blocks/${decodeURIComponent(filename)}`, code);
                downloadedBlocks++;
            }
        } else {
            const blockItems = await deps.listBlocksOrEmpty();
            for (const item of blockItems || []) {
                const filename = item?.filename;
                if (!filename) continue;
                let code = '';
                const rawRes = await fetch(`/blocks/${filename}`);
                if (rawRes.ok) {
                    code = await rawRes.text();
                } else {
                    const detail = await deps.getBlockDetailOrNull(filename);
                    if (detail) {
                        code = deps.buildBlockSourceFromApi(detail);
                    }
                }
                if (!code.trim()) continue;
                zip.file(`blocks/${decodeURIComponent(filename)}`, code);
                downloadedBlocks++;
            }
        }

        let downloadedArrangements = 0;
        if (deps.isDemoMode()) {
            const arrangementFiles = Array.from(deps.getDemoArrangementSourceByFile().keys()).sort();
            for (const filename of arrangementFiles) {
                const code = deps.getDemoArrangementSourceByFile().get(filename) || '';
                if (!code.trim()) continue;
                zip.file(`arrangements/${decodeURIComponent(filename)}`, code);
                downloadedArrangements++;
            }
        } else {
            const arrangementItems = await deps.listArrangementsOrEmpty();
            for (const item of arrangementItems || []) {
                const filename = item?.filename;
                if (!filename) continue;
                let code = '';
                const rawRes = await fetch(`/arrangements/${filename}`);
                if (rawRes.ok) {
                    code = await rawRes.text();
                } else {
                    const detail = await deps.getArrangementOrNull(filename);
                    if (detail) {
                        code = deps.buildArrangementSourceFromApi(detail);
                    }
                }
                if (!code.trim()) continue;
                zip.file(`arrangements/${decodeURIComponent(filename)}`, code);
                downloadedArrangements++;
            }
        }

        const downloadedInstruments = downloadedUserInstruments + downloadedSystemInstruments;
        if (!downloadedPatterns && !downloadedBlocks && !downloadedArrangements && !downloadedInstruments) {
            deps.setStatus('Nothing to download', 'error');
            return;
        }

        const stampIso = new Date().toISOString();
        zip.file(
            deps.getBundleManifestName(),
            JSON.stringify(
                {
                    kind: deps.getBundleKind(),
                    identifier: normalizedIdentifier,
                    version: 3,
                    generatedAt: stampIso,
                    counts: {
                        patterns: downloadedPatterns,
                        blocks: downloadedBlocks,
                        arrangements: downloadedArrangements,
                        instruments: exportedInstrumentCount,
                        userInstruments: exportedUserInstrumentCount,
                        systemInstruments: exportedSystemInstrumentCount,
                        instrumentFiles: downloadedInstruments,
                        userInstrumentFiles: downloadedUserInstruments,
                        systemInstrumentFiles: downloadedSystemInstruments,
                    },
                },
                null,
                2
            )
        );
        const stamp = stampIso.replace(/[:]/g, '-').replace(/\..+/, '');
        const zipName = `strudel-project-bundle-${stamp}.zip`;
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        deps.triggerFileDownload(zipName, zipBlob, 'application/zip');

        const instrumentLabels = [];
        if (downloadedUserInstruments) instrumentLabels.push('instruments.js');
        if (downloadedSystemInstruments) instrumentLabels.push('instruments.system.js');
        const instrumentsLabel = instrumentLabels.length ? ` + ${instrumentLabels.join(' + ')}` : ' (no instruments files)';
        deps.setStatus(
            `Downloaded ZIP: ${downloadedPatterns} pattern${downloadedPatterns === 1 ? '' : 's'}, ${downloadedBlocks} block${downloadedBlocks === 1 ? '' : 's'}, ${downloadedArrangements} arrangement${downloadedArrangements === 1 ? '' : 's'}${instrumentsLabel}`,
            'success'
        );
    } catch (e) {
        deps.logError(e);
        deps.setStatus(`Download failed: ${e.message}`, 'error');
    }
}

let pendingExportResolver = null;

function closeExportProjectModal(resolveValue = null) {
    const dom = deps.getDom();
    dom.exportProjectModal?.classList.remove('open');
    const resolver = pendingExportResolver;
    pendingExportResolver = null;
    if (resolver) resolver(resolveValue);
}

function openExportProjectModal() {
    const dom = deps.getDom();
    if (!dom.exportProjectModal) return Promise.resolve(null);
    if (pendingExportResolver) closeExportProjectModal(null);
    if (dom.exportProjectIdentifierInput) {
        dom.exportProjectIdentifierInput.value = '';
    }
    dom.exportProjectModal.classList.add('open');
    requestAnimationFrame(() => {
        dom.exportProjectIdentifierInput?.focus();
        dom.exportProjectIdentifierInput?.select();
    });
    return new Promise((resolve) => {
        pendingExportResolver = resolve;
    });
}

export function installProjectExportHandlers() {
    const dom = deps.getDom();
    if (dom.downloadProjectBtn) {
        dom.downloadProjectBtn.addEventListener('click', async () => {
            const identifier = await openExportProjectModal();
            if (identifier == null) return;
            await downloadProjectBundle({ identifier });
        });
    }
    if (dom.closeExportProjectModalBtn) {
        dom.closeExportProjectModalBtn.addEventListener('click', () => closeExportProjectModal(null));
    }
    if (dom.cancelExportProjectBtn) {
        dom.cancelExportProjectBtn.addEventListener('click', () => closeExportProjectModal(null));
    }
    if (dom.confirmExportProjectBtn) {
        dom.confirmExportProjectBtn.addEventListener('click', () => {
            closeExportProjectModal(normalizeBundleIdentifier(dom.exportProjectIdentifierInput?.value));
        });
    }
    if (dom.exportProjectIdentifierInput) {
        dom.exportProjectIdentifierInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                closeExportProjectModal(normalizeBundleIdentifier(dom.exportProjectIdentifierInput?.value));
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeExportProjectModal(null);
            }
        });
    }
    if (dom.exportProjectModal) {
        dom.exportProjectModal.addEventListener('click', (e) => {
            if (e.target === dom.exportProjectModal) {
                closeExportProjectModal(null);
            }
        });
    }
}
