/**
 * Module: features/project/project-export
 * Purpose: Project bundle download/export flow.
 */

import JSZip from 'jszip';

let deps = {
    isDemoMode: () => false,
    getDemoPatternSourceByFile: () => new Map(),
    getDemoBlockSourceByFile: () => new Map(),
    getDemoArrangementSourceByFile: () => new Map(),
    normalizePatternEntries: (list) => list || [],
    listPatterns: async () => [],
    listBlocksOrEmpty: async () => [],
    listArrangementsOrEmpty: async () => [],
    getPatternSourceOrEmpty: async () => '',
    getPatternMetaTextOrNull: async () => null,
    getBlockDetailOrNull: async () => null,
    getArrangementOrNull: async () => null,
    buildBlockSourceFromApi: () => '',
    buildArrangementSourceFromApi: () => '',
    getCurrentPatternFilename: () => null,
    getEditorCode: () => '',
    editorToFile: (value) => value,
    triggerFileDownload: () => {},
    setStatus: () => {},
    getBundleManifestName: () => 'strudel-project-bundle.json',
    getBundleKind: () => 'strudel-project-bundle',
    logError: () => {},
};

export function configureProjectExport(options = {}) {
    deps = { ...deps, ...options };
}

async function getInstrumentsFileContent() {
    const cached = sessionStorage.getItem('instruments-js-content');
    if (cached && cached.trim()) {
        return cached;
    }
    const res = await fetch('/instruments.js');
    if (!res.ok) return '';
    const fileCode = await res.text();
    return fileCode.trim() ? fileCode : '';
}

export async function downloadProjectBundle() {
    try {
        const zip = new JSZip();

        let downloadedInstruments = 0;
        const instrumentsContent = await getInstrumentsFileContent();
        if (instrumentsContent) {
            zip.file('instruments.js', instrumentsContent);
            downloadedInstruments = 1;
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
                    version: 1,
                    generatedAt: stampIso,
                    counts: {
                        patterns: downloadedPatterns,
                        blocks: downloadedBlocks,
                        arrangements: downloadedArrangements,
                        instruments: downloadedInstruments,
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

        const instrumentsLabel = downloadedInstruments ? ' + instruments.js' : ' (no instruments.js)';
        deps.setStatus(
            `Downloaded ZIP: ${downloadedPatterns} pattern${downloadedPatterns === 1 ? '' : 's'}, ${downloadedBlocks} block${downloadedBlocks === 1 ? '' : 's'}, ${downloadedArrangements} arrangement${downloadedArrangements === 1 ? '' : 's'}${instrumentsLabel}`,
            'success'
        );
    } catch (e) {
        deps.logError(e);
        deps.setStatus(`Download failed: ${e.message}`, 'error');
    }
}
