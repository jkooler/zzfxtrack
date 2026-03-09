let deps = {
    getCurrentArrangementFilename: () => null,
    getArrangementDraftState: () => null,
    buildArrangementStatePayload: () => ({ rows: [], bpm: 120 }),
    getBlocksLibraryCache: () => [],
    isDemoMode: () => false,
    getDemoBlockSource: () => null,
    parseBlockSource: () => null,
    normalizeScope: (value) => (value === 'system' ? 'system' : 'user'),
    getBlockDetailOrNull: async () => null,
    resolveTrackerStateChannelInstruments: (trackerState) => trackerState,
    updateInstrumentUsage: () => {},
    getDefragmentedInstruments: async () => [],
};

export function configureArrangementExportContext(options = {}) {
    deps = { ...deps, ...options };
}

function getBlockByFilename(filename) {
    return deps.getBlocksLibraryCache().find((block) => block.filename === filename) || null;
}

export async function getArrangementInstrumentList() {
    const instruments = await deps.getDefragmentedInstruments();
    return instruments.map((inst) => ({
        id: inst.strudelAlias,
        name: inst.strudelAlias,
        params: inst.params,
    }));
}

export async function resolveBlockDetailForArrangement(filename) {
    if (!filename) return null;
    const cached = getBlockByFilename(filename);
    const hasTrackerState = Boolean(cached?.trackerState);
    const hasPattern = typeof cached?.pattern === 'string';
    const hasDescription = typeof cached?.description === 'string';
    if (hasTrackerState && hasPattern && hasDescription) return cached;

    if (deps.isDemoMode()) {
        const source = deps.getDemoBlockSource(filename);
        if (!source) return cached || null;
        const parsed = deps.parseBlockSource(source);
        return {
            filename,
            name: parsed?.name || cached?.name || filename.replace(/\.js$/i, ''),
            description: parsed?.description || cached?.description || '',
            pattern: parsed?.pattern || cached?.pattern || '',
            trackerState: parsed?.trackerState || cached?.trackerState || null,
            scope: deps.normalizeScope(parsed?.scope || cached?.scope),
        };
    }

    try {
        const detail = await deps.getBlockDetailOrNull(filename);
        if (!detail) return cached || null;
        return {
            filename,
            name: detail?.name || cached?.name || filename.replace(/\.js$/i, ''),
            description: detail?.description || cached?.description || '',
            pattern: detail?.pattern || cached?.pattern || '',
            trackerState: detail?.trackerState || cached?.trackerState || null,
            scope: deps.normalizeScope(detail?.scope || cached?.scope),
        };
    } catch (_e) {
        return cached || null;
    }
}

export async function updateArrangementInstrumentUsage() {
    if (!deps.getCurrentArrangementFilename() || !deps.getArrangementDraftState()) return;
    const arrangementState = deps.buildArrangementStatePayload();
    const blockFiles = Array.from(new Set(
        (arrangementState.rows || []).flatMap((row) => Array.isArray(row?.blocks) ? row.blocks : []).filter(Boolean)
    ));
    const patterns = [];
    for (const filename of blockFiles) {
        const block = await resolveBlockDetailForArrangement(filename);
        if (block?.pattern) patterns.push(block.pattern);
    }
    deps.updateInstrumentUsage(patterns.join('\n'));
}

export async function buildArrangementExportContext() {
    if (!deps.getCurrentArrangementFilename() || !deps.getArrangementDraftState()) return null;
    const arrangementState = deps.buildArrangementStatePayload();
    const blockFiles = Array.from(new Set(
        (arrangementState.rows || []).flatMap((row) => Array.isArray(row?.blocks) ? row.blocks : []).filter(Boolean)
    ));

    const blocks = [];
    const trackerStateByFilename = {};
    for (const filename of blockFiles) {
        const block = await resolveBlockDetailForArrangement(filename);
        if (!block) continue;
        blocks.push({
            filename,
            name: block.name || filename.replace(/\.js$/i, ''),
            description: block.description || '',
            scope: deps.normalizeScope(block.scope),
            pattern: block.pattern || '',
            trackerState: block.trackerState || null,
        });
        if (block.trackerState) {
            trackerStateByFilename[filename] = deps.resolveTrackerStateChannelInstruments(block.trackerState);
        }
    }

    const instrumentList = await getArrangementInstrumentList();
    const bpm = arrangementState.bpm || 120;
    return { arrangementState, blocks, trackerStateByFilename, instrumentList, bpm };
}
