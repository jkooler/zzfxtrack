/**
 * Module: features/project/project-export
 * Purpose: Project bundle download/export flow.
 * Deps keys: alphabetical.
 */

import JSZip from 'jszip';

let deps = {
    buildArrangementSourceFromApi: () => '',
    buildBlockSourceFromApi: () => '',
    editorToFile: (value) => value,
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

async function getInstrumentFileContent(cacheKey, path) {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached && cached.trim()) {
        return cached;
    }
    const res = await fetch(path);
    if (!res.ok) return '';
    const fileCode = await res.text();
    return fileCode.trim() ? fileCode : '';
}

export async function downloadProjectBundle() {
    try {
        const zip = new JSZip();

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
                    version: 2,
                    generatedAt: stampIso,
                    counts: {
                        patterns: downloadedPatterns,
                        blocks: downloadedBlocks,
                        arrangements: downloadedArrangements,
                        instruments: downloadedInstruments,
                        userInstruments: downloadedUserInstruments,
                        systemInstruments: downloadedSystemInstruments,
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
