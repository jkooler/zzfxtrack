/**
 * Module: features/project/project-import
 * Purpose: Project bundle upload/import flow and import modal orchestration.
 * Deps keys: alphabetical.
 */

import JSZip from 'jszip';
import { buildArrangementSourceFromApi, buildBlockSourceFromApi, describeUploadBundle, getFilenameFromSection, getPatternMetaFilenameFromSection, normalizeZipEntryPath, parseArrangementSource, parseBlockSource, validateUploadBundle } from './bundle-utils.js';
import { applyInitialColorTheme, clearStoredUserThemeValues, writeStoredColorTheme, writeStoredUserThemeValues } from '../settings/theme-controller.js';
import { migrateFromFile, migrateSystemFromFile } from '../../instrument-manager.js';

let deps = {
    getArrangementOrNull: async () => null,
    getBlockDetailOrNull: async () => null,
    getBundleKind: () => 'strudel-project-bundle',
    getBundleManifestName: () => 'strudel-project-bundle.json',
    getDemoArrangementSourceByFile: () => new Map(),
    getDemoBlockSourceByFile: () => new Map(),
    getDemoPatternSourceByFile: () => new Map(),
    getDeveloperModeHeaders: () => ({}),
    getDom: () => ({}),
    getPatternSourceOrEmpty: async () => '',
    isDemoMode: () => false,
    listArrangementsOrEmpty: async () => [],
    listBlocksOrEmpty: async () => [],
    listPatterns: async () => [],
    logError: () => {},
    normalizePatternEntries: (list) => list || [],
    refreshArrangementList: async () => {},
    refreshBlocksLibrary: async () => {},
    refreshPatternList: async () => {},
    reloadInstruments: async () => {},
    saveArrangement: async () => {},
    saveBlockDetail: async () => {},
    savePatternMetaRecord: async () => {},
    savePatternSource: async () => {},
    setStatus: () => {},
    updateInstrumentsSourceFile: async () => {},
    updateSystemInstrumentsSourceFile: async () => {},
};

let pendingUploadBundle = null;

export function configureProjectImport(options = {}) {
    deps = { ...deps, ...options };
}

function parseInstrumentModuleContent(content) {
    const source = String(content || '').trim();
    if (!source) {
        return {
            instrumentMapping: {},
            instruments: {},
            instrumentMonophonic: {},
            instrumentScope: {},
            instrumentType: {},
        };
    }
    try {
        const executable = `${source.replace(/\bexport\s+const\b/g, 'const')}\nreturn {\n  instrumentMapping: typeof instrumentMapping !== 'undefined' ? instrumentMapping : {},\n  instruments: typeof instruments !== 'undefined' ? instruments : {},\n  instrumentMonophonic: typeof instrumentMonophonic !== 'undefined' ? instrumentMonophonic : {},\n  instrumentScope: typeof instrumentScope !== 'undefined' ? instrumentScope : {},\n  instrumentType: typeof instrumentType !== 'undefined' ? instrumentType : {},\n};`;
        // Evaluate the generated instruments module source so object exports can
        // reference earlier array constants like `zzfxtrack_pad_s`.
        // eslint-disable-next-line no-new-func
        return Function(`"use strict";\n${executable}`)();
    } catch (_e) {
        return {
            instrumentMapping: {},
            instruments: {},
            instrumentMonophonic: {},
            instrumentScope: {},
            instrumentType: {},
        };
    }
}

async function buildUploadBundle(file) {
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);

    const patterns = new Map();
    const patternMetas = new Map();
    const blocks = new Map();
    const arrangements = new Map();
    let userInstrumentsContent = '';
    let systemInstrumentsContent = '';
    let themeContent = '';
    let manifest = null;
    let hasInvalidManifest = false;
    const unknownPaths = [];

    for (const entry of entries) {
        const normalized = normalizeZipEntryPath(entry.name);
        const normalizedLower = normalized.toLowerCase();
        const content = await entry.async('string');
        if (!content.trim()) continue;

        if (normalizedLower.endsWith(`/${deps.getBundleManifestName()}`) || normalizedLower === deps.getBundleManifestName()) {
            try {
                manifest = JSON.parse(content);
            } catch (_e) {
                hasInvalidManifest = true;
            }
            continue;
        }

        if (normalizedLower.endsWith('/instruments.js') || normalizedLower === 'instruments.js') {
            userInstrumentsContent = content;
            continue;
        }

        if (normalizedLower.endsWith('/instruments.system.js') || normalizedLower === 'instruments.system.js') {
            systemInstrumentsContent = content;
            continue;
        }

        if (normalizedLower.endsWith('/theme.json') || normalizedLower === 'theme.json') {
            themeContent = content;
            continue;
        }

        const patternFile = getFilenameFromSection(normalized, 'patterns');
        if (patternFile) {
            patterns.set(patternFile, content);
            continue;
        }

        const patternMetaFile = getPatternMetaFilenameFromSection(normalized);
        if (patternMetaFile) {
            patternMetas.set(patternMetaFile, content);
            continue;
        }

        const blockFile = getFilenameFromSection(normalized, 'blocks');
        if (blockFile) {
            blocks.set(blockFile, content);
            continue;
        }

        const arrangementFile = getFilenameFromSection(normalized, 'arrangements');
        if (arrangementFile) {
            arrangements.set(arrangementFile, content);
            continue;
        }

        unknownPaths.push(normalized);
    }

    return {
        fileName: file.name || 'upload.zip',
        patterns: Array.from(patterns, ([filename, content]) => ({ filename, content })),
        patternMetas: Array.from(patternMetas, ([filename, content]) => ({ filename, content })),
        blocks: Array.from(blocks, ([filename, content]) => ({ filename, content })),
        arrangements: Array.from(arrangements, ([filename, content]) => ({ filename, content })),
        userInstrumentsContent,
        systemInstrumentsContent,
        themeContent,
        manifest,
        hasInvalidManifest,
        unknownPaths,
    };
}

function setUploadProjectFooterMessage(message, type = 'normal') {
    const dom = deps.getDom();
    if (!dom.uploadProjectFooterMessage) return;
    dom.uploadProjectFooterMessage.classList.remove('text-muted-foreground', 'text-destructive', 'text-primary');
    if (type === 'error') {
        dom.uploadProjectFooterMessage.classList.add('text-destructive');
    } else if (type === 'success') {
        dom.uploadProjectFooterMessage.classList.add('text-primary');
    } else {
        dom.uploadProjectFooterMessage.classList.add('text-muted-foreground');
    }
    dom.uploadProjectFooterMessage.textContent = message || '';
}

function setUploadProjectValidationState(bundle) {
    const dom = deps.getDom();
    pendingUploadBundle = bundle || null;
    if (dom.confirmUploadProjectBtn) {
        dom.confirmUploadProjectBtn.disabled = !bundle;
    }
    if (!bundle) {
        if (dom.uploadProjectFilename) dom.uploadProjectFilename.textContent = '';
        if (dom.uploadProjectSummary) dom.uploadProjectSummary.textContent = '';
        return;
    }
    if (dom.uploadProjectFilename) {
        dom.uploadProjectFilename.textContent = `File: ${bundle.fileName}`;
    }
    if (dom.uploadProjectSummary) {
        dom.uploadProjectSummary.textContent = describeUploadBundle(bundle);
    }
}

async function getExistingNamesBySection() {
    if (deps.isDemoMode()) {
        return {
            patterns: new Set(Array.from(deps.getDemoPatternSourceByFile().keys(), (f) => f.toLowerCase())),
            blocks: new Set(Array.from(deps.getDemoBlockSourceByFile().keys(), (f) => f.toLowerCase())),
            arrangements: new Set(Array.from(deps.getDemoArrangementSourceByFile().keys(), (f) => f.toLowerCase())),
        };
    }
    const [patternsList, blocks, arrangements] = await Promise.all([
        deps.listPatterns().catch(() => []),
        deps.listBlocksOrEmpty(),
        deps.listArrangementsOrEmpty(),
    ]);
    return {
        patterns: new Set(deps.normalizePatternEntries(patternsList || []).map((entry) => String(entry.filename || '').toLowerCase())),
        blocks: new Set((blocks || []).map((b) => String(b?.filename || '').toLowerCase())),
        arrangements: new Set((arrangements || []).map((a) => String(a?.filename || '').toLowerCase())),
    };
}

function makeImportedFilename(originalFilename, existingSet) {
    const safe = String(originalFilename || 'imported.js');
    const ext = safe.endsWith('.js') ? '.js' : '';
    const base = ext ? safe.slice(0, -3) : safe;
    let i = 1;
    let candidate = `${base}-import-${i}.js`;
    while (existingSet.has(candidate.toLowerCase())) {
        i++;
        candidate = `${base}-import-${i}.js`;
    }
    return candidate;
}

function normalizeContent(content) {
    return String(content || '').replace(/\r\n/g, '\n').trim();
}

async function fetchExistingContent(section, filename) {
    if (deps.isDemoMode()) {
        if (section === 'patterns') return deps.getDemoPatternSourceByFile().get(filename) || '';
        if (section === 'blocks') return deps.getDemoBlockSourceByFile().get(filename) || '';
        if (section === 'arrangements') return deps.getDemoArrangementSourceByFile().get(filename) || '';
        return '';
    }
    if (section === 'patterns') return await deps.getPatternSourceOrEmpty(filename);
    if (section === 'blocks') {
        const res = await fetch(`/blocks/${encodeURIComponent(filename)}`);
        if (res.ok) return res.text();
        const detail = await deps.getBlockDetailOrNull(filename);
        if (detail) return buildBlockSourceFromApi(detail);
    }
    if (section === 'arrangements') {
        const res = await fetch(`/arrangements/${encodeURIComponent(filename)}`);
        if (res.ok) return res.text();
        const detail = await deps.getArrangementOrNull(filename);
        if (detail) return buildArrangementSourceFromApi(detail);
    }
    return '';
}

async function writeImportedFile(section, filename, content) {
    if (section === 'patterns') {
        try {
            await deps.savePatternSource(filename, content, deps.getDeveloperModeHeaders());
            return true;
        } catch (_e) {
            return false;
        }
    }
    if (section === 'blocks') {
        const parsed = parseBlockSource(content);
        try {
            await deps.saveBlockDetail(filename, parsed, deps.getDeveloperModeHeaders());
            return true;
        } catch (_e) {
            return false;
        }
    }
    if (section === 'arrangements') {
        const parsed = parseArrangementSource(content);
        try {
            await deps.saveArrangement(filename, parsed, deps.getDeveloperModeHeaders());
            return true;
        } catch (_e) {
            return false;
        }
    }
    return false;
}

function closeUploadProjectModal() {
    const dom = deps.getDom();
    setUploadProjectValidationState(null);
    setUploadProjectFooterMessage('Select or drag a ZIP file to validate.', 'normal');
    if (dom.uploadProjectInput) dom.uploadProjectInput.value = '';
    dom.uploadProjectDropzone?.classList.remove('is-dragover');
    dom.uploadProjectModal?.classList.remove('open');
}

function openUploadProjectModal() {
    const dom = deps.getDom();
    setUploadProjectValidationState(null);
    setUploadProjectFooterMessage('Select or drag a ZIP file to validate.', 'normal');
    dom.uploadProjectModal?.classList.add('open');
}

async function importSectionItems(section, items, include, mode, existingSet) {
    const stats = { written: 0, renamed: 0, replaced: 0, skipped: 0, filenameMap: new Map() };
    if (!include || !Array.isArray(items) || !items.length) return stats;

    for (const item of items) {
        const originalFilename = item.filename;
        let targetFilename = originalFilename;
        const exists = existingSet.has(originalFilename.toLowerCase());
        if (exists && mode === 'merge') {
            const existingContent = await fetchExistingContent(section, originalFilename);
            if (normalizeContent(existingContent) === normalizeContent(item.content)) {
                stats.skipped++;
                stats.filenameMap.set(originalFilename, originalFilename);
                continue;
            }
            targetFilename = makeImportedFilename(originalFilename, existingSet);
            stats.renamed++;
        } else if (exists && mode === 'replace') {
            stats.replaced++;
        }

        const ok = await writeImportedFile(section, targetFilename, item.content);
        if (ok) {
            stats.written++;
            existingSet.add(targetFilename.toLowerCase());
            stats.filenameMap.set(originalFilename, targetFilename);
        }
    }
    return stats;
}

async function applyPatternMetaItems(items, filenameMap) {
    if (!Array.isArray(items) || !items.length) return 0;
    let applied = 0;
    for (const item of items) {
        const targetFilename = filenameMap.get(item.filename);
        if (!targetFilename) continue;
        try {
            const parsed = JSON.parse(item.content);
            await deps.savePatternMetaRecord(targetFilename, parsed);
            applied++;
        } catch (_e) {
            // Ignore malformed meta entries and continue.
        }
    }
    return applied;
}

async function applyUploadProject() {
    const dom = deps.getDom();
    if (!pendingUploadBundle) return;
    const includePatterns = pendingUploadBundle.patterns.length > 0;
    const includeBlocks = pendingUploadBundle.blocks.length > 0;
    const includeArrangements = pendingUploadBundle.arrangements.length > 0;
    const includeUserInstruments = Boolean(pendingUploadBundle.userInstrumentsContent);
    const includeSystemInstruments = Boolean(pendingUploadBundle.systemInstrumentsContent);
    const mode = 'merge';
    const replaceInstruments = true;

    try {
        if (dom.confirmUploadProjectBtn) dom.confirmUploadProjectBtn.disabled = true;
        setUploadProjectFooterMessage('Uploading...', 'normal');
        deps.setStatus('Importing ZIP...', 'normal');
        const existing = await getExistingNamesBySection();

        const patternsStats = await importSectionItems('patterns', pendingUploadBundle.patterns, includePatterns, mode, existing.patterns);
        const blocksStats = await importSectionItems('blocks', pendingUploadBundle.blocks, includeBlocks, mode, existing.blocks);
        const arrangementsStats = await importSectionItems('arrangements', pendingUploadBundle.arrangements, includeArrangements, mode, existing.arrangements);
        const patternMetaImported = await applyPatternMetaItems(pendingUploadBundle.patternMetas, patternsStats.filenameMap);

        let userInstrumentsImported = 0;
        let systemInstrumentsImported = 0;
        let themeImported = 0;
        if (includeUserInstruments && pendingUploadBundle.userInstrumentsContent && replaceInstruments) {
            if (deps.isDemoMode()) {
                migrateFromFile(parseInstrumentModuleContent(pendingUploadBundle.userInstrumentsContent));
                userInstrumentsImported = 1;
            } else {
                try {
                    await deps.updateInstrumentsSourceFile(pendingUploadBundle.userInstrumentsContent);
                    userInstrumentsImported = 1;
                } catch (_e) {
                    userInstrumentsImported = 0;
                }
            }
        }

        if (includeSystemInstruments && pendingUploadBundle.systemInstrumentsContent && replaceInstruments) {
            if (deps.isDemoMode()) {
                migrateSystemFromFile(parseInstrumentModuleContent(pendingUploadBundle.systemInstrumentsContent));
                systemInstrumentsImported = 1;
            } else {
                try {
                    await deps.updateSystemInstrumentsSourceFile(pendingUploadBundle.systemInstrumentsContent);
                    systemInstrumentsImported = 1;
                } catch (_e) {
                    systemInstrumentsImported = 0;
                }
            }
        }

        if (pendingUploadBundle.themeContent) {
            try {
                const parsedTheme = JSON.parse(pendingUploadBundle.themeContent);
                const activeTheme = typeof parsedTheme?.activeTheme === 'string' ? parsedTheme.activeTheme : 'phantom';
                const userThemeValues = parsedTheme?.userThemeValues && typeof parsedTheme.userThemeValues === 'object'
                    ? parsedTheme.userThemeValues
                    : {};
                clearStoredUserThemeValues();
                writeStoredUserThemeValues(userThemeValues);
                writeStoredColorTheme(activeTheme);
                applyInitialColorTheme();
                themeImported = 1;
            } catch (_e) {
                themeImported = 0;
            }
        }

        await deps.refreshPatternList();
        await deps.refreshBlocksLibrary();
        await deps.refreshArrangementList();
        if (userInstrumentsImported || systemInstrumentsImported) await deps.reloadInstruments();

        deps.setStatus(
            `Imported patterns ${patternsStats.written} (renamed ${patternsStats.renamed}, skipped ${patternsStats.skipped}), pattern metadata ${patternMetaImported}, blocks ${blocksStats.written} (renamed ${blocksStats.renamed}, skipped ${blocksStats.skipped}), arrangements ${arrangementsStats.written} (renamed ${arrangementsStats.renamed}, skipped ${arrangementsStats.skipped}), user instruments ${userInstrumentsImported}, system instruments ${systemInstrumentsImported}, theme ${themeImported}`,
            'success'
        );
        closeUploadProjectModal();
    } catch (e) {
        deps.logError(e);
        setUploadProjectFooterMessage(`Upload failed: ${e.message}`, 'error');
        deps.setStatus(`Upload failed: ${e.message}`, 'error');
    } finally {
        if (dom.uploadProjectModal?.classList.contains('open') && dom.confirmUploadProjectBtn) {
            dom.confirmUploadProjectBtn.disabled = !pendingUploadBundle;
        }
    }
}

async function handleUploadSelection(file) {
    const dom = deps.getDom();
    if (!file) return;
    if (!String(file.name || '').toLowerCase().endsWith('.zip')) {
        setUploadProjectValidationState(null);
        setUploadProjectFooterMessage('Incompatible file: only .zip is accepted.', 'error');
        return;
    }

    try {
        setUploadProjectValidationState(null);
        setUploadProjectFooterMessage('Validating ZIP...', 'normal');
        const bundle = await buildUploadBundle(file);
        const validationError = validateUploadBundle(bundle, { expectedKind: deps.getBundleKind() });
        if (validationError) {
            setUploadProjectValidationState(null);
            setUploadProjectFooterMessage(validationError, 'error');
            return;
        }
        setUploadProjectValidationState(bundle);
        setUploadProjectFooterMessage('Data validation successful', 'success');
    } catch (e) {
        deps.logError(e);
        setUploadProjectValidationState(null);
        setUploadProjectFooterMessage(`Validation failed: ${e.message}`, 'error');
    } finally {
        if (dom.uploadProjectInput) dom.uploadProjectInput.value = '';
    }
}

export function installProjectImportHandlers() {
    const dom = deps.getDom();
    if (dom.uploadProjectBtn) dom.uploadProjectBtn.addEventListener('click', openUploadProjectModal);
    if (dom.uploadProjectInput) {
        dom.uploadProjectInput.addEventListener('change', (e) => {
            const file = e.target?.files?.[0];
            if (file) handleUploadSelection(file);
        });
    }
    if (dom.uploadProjectDropzone) {
        dom.uploadProjectDropzone.addEventListener('click', () => dom.uploadProjectInput?.click());
        dom.uploadProjectDropzone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dom.uploadProjectDropzone?.classList.add('is-dragover');
        });
        dom.uploadProjectDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dom.uploadProjectDropzone?.classList.add('is-dragover');
        });
        dom.uploadProjectDropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dom.uploadProjectDropzone?.classList.remove('is-dragover');
        });
        dom.uploadProjectDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dom.uploadProjectDropzone?.classList.remove('is-dragover');
            const file = e.dataTransfer?.files?.[0];
            if (file) handleUploadSelection(file);
        });
    }
    if (dom.closeUploadProjectModalBtn) dom.closeUploadProjectModalBtn.addEventListener('click', closeUploadProjectModal);
    if (dom.cancelUploadProjectBtn) dom.cancelUploadProjectBtn.addEventListener('click', closeUploadProjectModal);
    if (dom.confirmUploadProjectBtn) dom.confirmUploadProjectBtn.addEventListener('click', applyUploadProject);
    if (dom.uploadProjectModal) {
        dom.uploadProjectModal.addEventListener('click', (e) => {
            if (e.target === dom.uploadProjectModal) {
                closeUploadProjectModal();
            }
        });
    }
}
