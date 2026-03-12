/**
 * Module: features/project/bundle-utils
 * Purpose: Project bundle parsing, validation, and source conversion helper utilities.
 */

function normalizeScope(value) {
    return value === 'system' ? 'system' : 'user';
}

function countInstrumentDefinitionsInModule(content) {
    const source = String(content || '');
    if (!source.trim()) return 0;
    const mappingMatch = source.match(/export\s+const\s+instrumentMapping\s*=\s*\{([\s\S]*?)\};/);
    if (!mappingMatch) return 0;
    const entries = mappingMatch[1].match(/"[^"]+"\s*:/g);
    return Array.isArray(entries) ? entries.length : 0;
}

export function buildBlockSourceFromApi(item) {
    const name = item?.name || 'Block';
    const description = item?.description || '';
    const pattern = item?.pattern || '';
    const trackerState = item?.trackerState ?? null;
    const scope = normalizeScope(item?.scope);
    return `// Block: ${name}
// ${description || 'No description'}

export const name = "${String(name).replace(/"/g, '\\"')}";
export const description = "${String(description).replace(/"/g, '\\"')}";
export const scope = "${scope}";

export const pattern = \`${String(pattern).replace(/`/g, '\\`')}\`;

// Optional: Tracker state for re-editing
export const trackerState = ${JSON.stringify(trackerState, null, 2)};
`;
}

export function buildArrangementSourceFromApi(item) {
    const name = item?.name || 'Arrangement';
    const arrangementState = item?.arrangementState ?? null;
    const scope = normalizeScope(item?.scope);
    return `// Arrangement: ${name}

export const name = "${String(name).replace(/"/g, '\\"')}";
export const scope = "${scope}";

export const arrangementState = ${JSON.stringify(arrangementState, null, 2)};
`;
}

export function parseBlockSource(content) {
    const nameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
    const descMatch = content.match(/export\s+const\s+description\s*=\s*["']([^"']*)["']/);
    const scopeMatch = content.match(/export\s+const\s+scope\s*=\s*["']([^"']+)["']/);
    const patternMatch = content.match(/export\s+const\s+pattern\s*=\s*([`"'])([\s\S]*?)\1\s*;?/);
    const trackerStateMatch = content.match(/export\s+const\s+trackerState\s*=\s*(\{[\s\S]*?\})\s*;/);

    let trackerState = null;
    if (trackerStateMatch) {
        try { trackerState = JSON.parse(trackerStateMatch[1]); } catch (_e) { trackerState = null; }
    }

    return {
        name: nameMatch ? nameMatch[1] : 'Block',
        description: descMatch ? descMatch[1] : '',
        scope: normalizeScope(scopeMatch ? scopeMatch[1] : 'user'),
        pattern: patternMatch ? patternMatch[2].trim() : '',
        trackerState,
    };
}

export function parseArrangementSource(content) {
    const nameMatch = content.match(/export\s+const\s+name\s*=\s*["']([^"']+)["']/);
    const scopeMatch = content.match(/export\s+const\s+scope\s*=\s*["']([^"']+)["']/);
    const arrangementStateMatch = content.match(/export\s+const\s+arrangementState\s*=\s*(\{[\s\S]*?\})\s*;/);
    let arrangementState = { version: 1, name: nameMatch ? nameMatch[1] : 'Arrangement', bpm: 120, rows: [] };
    if (arrangementStateMatch) {
        try { arrangementState = JSON.parse(arrangementStateMatch[1]); } catch (_e) { /* keep fallback */ }
    }
    return {
        name: nameMatch ? nameMatch[1] : arrangementState?.name || 'Arrangement',
        scope: normalizeScope(scopeMatch ? scopeMatch[1] : 'user'),
        arrangementState,
    };
}

export function normalizeZipEntryPath(name) {
    return String(name || '').replace(/\\/g, '/').replace(/^\.?\//, '');
}

export function getFilenameFromSection(pathname, section) {
    const match = pathname.match(new RegExp(`(?:^|/)${section}/(.+\\.js)$`, 'i'));
    if (!match) return '';
    const file = match[1].split('/').pop() || '';
    if (!file || file.includes('..') || !file.endsWith('.js')) return '';
    return file;
}

export function describeUploadBundle(bundle) {
    if (!bundle) return '';
    const instrumentLabels = [];
    if (bundle.userInstrumentsContent) instrumentLabels.push('instruments.js');
    if (bundle.systemInstrumentsContent) instrumentLabels.push('instruments.system.js');
    const instrumentsSuffix = instrumentLabels.length ? `, ${instrumentLabels.join(' + ')}` : '';
    return `${bundle.patterns.length} patterns, ${bundle.blocks.length} blocks, ${bundle.arrangements.length} arrangements${instrumentsSuffix}`;
}

export function validateUploadBundle(bundle, { expectedKind }) {
    if (!bundle) return 'No file selected.';

    const userInstrumentFileCount = Number(Boolean(bundle.userInstrumentsContent));
    const systemInstrumentFileCount = Number(Boolean(bundle.systemInstrumentsContent));
    const instrumentFileCount = userInstrumentFileCount + systemInstrumentFileCount;
    const userInstrumentCount = countInstrumentDefinitionsInModule(bundle.userInstrumentsContent);
    const systemInstrumentCount = countInstrumentDefinitionsInModule(bundle.systemInstrumentsContent);
    const instrumentCount = userInstrumentCount + systemInstrumentCount;
    const legacyInstrumentCount = instrumentFileCount;
    const hasAnyData = Boolean(bundle.patterns.length || bundle.blocks.length || bundle.arrangements.length || instrumentCount);
    if (!hasAnyData) return 'Incompatible ZIP: no importable app data found.';

    if (bundle.hasInvalidManifest) {
        return 'Incompatible ZIP: metadata is corrupted.';
    }
    if (bundle.unknownPaths.length) {
        return 'Incompatible ZIP: contains unsupported files.';
    }

    if (bundle.manifest) {
        if (bundle.manifest.kind !== expectedKind || ![1, 2, 3].includes(bundle.manifest.version)) {
            return 'Incompatible ZIP: invalid bundle metadata.';
        }
        const expected = bundle.manifest.counts || {};
        const countChecks = bundle.manifest.version >= 3
            ? [
                ['patterns', bundle.patterns.length],
                ['blocks', bundle.blocks.length],
                ['arrangements', bundle.arrangements.length],
                ['instruments', instrumentCount],
                ['userInstruments', userInstrumentCount],
                ['systemInstruments', systemInstrumentCount],
                ['instrumentFiles', instrumentFileCount],
                ['userInstrumentFiles', userInstrumentFileCount],
                ['systemInstrumentFiles', systemInstrumentFileCount],
            ]
            : [
                ['patterns', bundle.patterns.length],
                ['blocks', bundle.blocks.length],
                ['arrangements', bundle.arrangements.length],
                ['instruments', legacyInstrumentCount],
                ['userInstruments', userInstrumentFileCount],
                ['systemInstruments', systemInstrumentFileCount],
            ];
        for (const [key, actual] of countChecks) {
            const value = expected[key];
            if (Number.isFinite(value) && value !== actual) {
                return 'Incompatible ZIP: bundle integrity check failed.';
            }
        }
        return '';
    }

    const patternsLookValid = bundle.patterns.every((item) => /export\s+default\b/.test(item.content));
    if (!patternsLookValid) return 'Incompatible ZIP: patterns payload is invalid.';

    const blocksLookValid = bundle.blocks.every((item) => /export\s+const\s+name\b/.test(item.content) && /export\s+const\s+pattern\b/.test(item.content));
    if (!blocksLookValid) return 'Incompatible ZIP: blocks payload is invalid.';

    const arrangementsLookValid = bundle.arrangements.every((item) => /export\s+const\s+arrangementState\b/.test(item.content));
    if (!arrangementsLookValid) return 'Incompatible ZIP: arrangements payload is invalid.';

    return '';
}
