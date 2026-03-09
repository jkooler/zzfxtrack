/**
 * Module: features/blocks/block-library
 * Purpose: Block library rendering, cache updates, and list refresh behavior.
 */

let deps = {
    getBlocksLibraryList: () => null,
    getBlocksLibraryCache: () => [],
    setBlocksLibraryCache: () => {},
    getActiveArrangementBlockFilename: () => null,
    setActiveArrangementBlockFilename: () => {},
    getCurrentArrangementFilename: () => null,
    setSelectedBlockForArrangement: () => {},
    renderArrangementWorkspace: () => {},
    renderTrackerWorkspace: () => {},
    flushTrackerSaveForBlockSwitch: () => {},
    createIcons: () => {},
    icons: {},
    normalizeScope: (value) => (value === 'system' ? 'system' : 'user'),
    isDeveloperModeEnabled: () => false,
    escapeHtml: (value) => String(value || ''),
    listBlocksOrEmpty: async () => [],
    isDemoMode: () => false,
    getDemoBlockSourceKeys: () => [],
    deleteBlockFromLibrary: async () => {},
    getBlocksFolderStateKey: () => 'blocks-folder-state',
    setStatus: () => {},
    logError: () => {},
};

export function configureBlockLibrary(options = {}) {
    deps = { ...deps, ...options };
}

export function loadFolderState(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return { ...fallback };
        const parsed = JSON.parse(raw);
        return {
            user: typeof parsed?.user === 'boolean' ? parsed.user : fallback.user,
            system: typeof parsed?.system === 'boolean' ? parsed.system : fallback.system,
        };
    } catch (_e) {
        return { ...fallback };
    }
}

export function saveFolderState(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (_e) {
        // Ignore localStorage failures.
    }
}

export function renderBlocksLibraryFromCache() {
    const listEl = deps.getBlocksLibraryList();
    if (!listEl) return;
    listEl.innerHTML = '';

    const blocksCache = deps.getBlocksLibraryCache();
    if (!blocksCache.length) {
        listEl.innerHTML = '<div class="text-xs text-muted-foreground px-2 py-2">No blocks available.</div>';
        return;
    }

    const blockFolderState = loadFolderState(deps.getBlocksFolderStateKey(), { user: true, system: false });

    const appendFolder = (scope, label, entries) => {
        const isEmpty = entries.length === 0;
        const expanded = isEmpty ? true : (scope === 'system' ? blockFolderState.system : blockFolderState.user);
        const icon = expanded ? 'chevron-down' : 'chevron-right';
        const folder = document.createElement('div');
        folder.className = 'mb-0 py-px';
        folder.innerHTML = `
            <button type="button" class="w-full flex items-center justify-between px-0 py-2 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40 ${expanded ? '' : 'border-b border-border'}" data-block-folder="${scope}">
                <span class="inline-flex items-center gap-1.5">
                    <i data-lucide="${icon}" class="w-5 h-5 shrink-0 ${expanded ? 'text-primary' : 'text-muted-foreground'}"></i>
                    ${label}
                </span>
                <span class="opacity-70">${entries.length}</span>
            </button>
            <div class="space-y-2 mt-1 ${expanded ? '' : 'hidden'}" data-block-folder-items="${scope}"></div>
        `;
        const items = folder.querySelector(`[data-block-folder-items="${scope}"]`);
        folder.querySelector(`[data-block-folder="${scope}"]`)?.addEventListener('click', () => {
            if (isEmpty) return;
            const next = { ...blockFolderState };
            if (scope === 'system') next.system = !next.system;
            else next.user = !next.user;
            saveFolderState(deps.getBlocksFolderStateKey(), next);
            renderBlocksLibraryFromCache();
        });

        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'text-xs text-muted-foreground px-2 py-1';
            empty.textContent = scope === 'user'
                ? 'No user blocks yet. Click "+ New" to create one.'
                : 'No system blocks available.';
            items?.appendChild(empty);
        }

        entries.forEach((block) => {
            const li = document.createElement('div');
            const isSelected = block.filename === deps.getActiveArrangementBlockFilename();
            li.className = `list-item ${isSelected ? 'active' : ''}`;
            li.dataset.filename = block.filename;
            const isReadonly = deps.normalizeScope(block.scope) === 'system' && !deps.isDeveloperModeEnabled();
            li.innerHTML = `
                <span class="font-medium text-xs">${deps.escapeHtml(block.name || block.filename.replace(/\.js$/i, ''))}</span>
                ${isReadonly ? '' : `<div class="list-item-actions"><button class="sidebar-del-btn" title="Delete ${deps.escapeHtml(block.name || block.filename)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>`}
            `;
            li.draggable = true;
            li.addEventListener('dragstart', (e) => {
                if (e.target.closest('button')) return;
                if (!e.dataTransfer) return;
                e.dataTransfer.effectAllowed = 'copyMove';
                e.dataTransfer.setData('application/x-zzfxm-arr-chip', JSON.stringify({ filename: block.filename }));
                e.dataTransfer.setData('text/plain', block.filename);
            });
            li.addEventListener('click', () => {
                document.getElementById('trackerBlockName')?.blur();
                deps.flushTrackerSaveForBlockSwitch();
                deps.setActiveArrangementBlockFilename(block.filename);
                const arrangementFilename = deps.getCurrentArrangementFilename();
                if (arrangementFilename) deps.setSelectedBlockForArrangement(arrangementFilename, block.filename);
                deps.renderArrangementWorkspace();
                deps.renderTrackerWorkspace();
            });
            li.querySelector('.sidebar-del-btn')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await deps.deleteBlockFromLibrary(block.filename, block.name || block.filename);
            });
            items?.appendChild(li);
        });

        listEl.appendChild(folder);
    };

    const sorted = blocksCache
        .slice()
        .sort((a, b) => String(a?.name || a?.filename || '').localeCompare(String(b?.name || b?.filename || '')));
    const userEntries = sorted.filter((b) => deps.normalizeScope(b.scope) !== 'system');
    const systemEntries = sorted.filter((b) => deps.normalizeScope(b.scope) === 'system');
    appendFolder('user', 'User', userEntries);
    appendFolder('system', 'System', systemEntries);
    deps.createIcons({ icons: deps.icons });
}

export async function refreshBlocksLibrary() {
    const listEl = deps.getBlocksLibraryList();
    if (!listEl) return;
    try {
        const previousBlocksByFilename = new Map(
            (Array.isArray(deps.getBlocksLibraryCache()) ? deps.getBlocksLibraryCache() : [])
                .filter((block) => block?.filename)
                .map((block) => [block.filename, block])
        );
        const list = deps.isDemoMode()
            ? deps.getDemoBlockSourceKeys().map((filename) => ({
                filename,
                name: decodeURIComponent(filename.replace(/\.js$/i, '')),
                scope: 'system',
                trackerState: null,
            }))
            : await deps.listBlocksOrEmpty();
        const nextCache = (Array.isArray(list) ? list : []).map((block) => {
            const previous = previousBlocksByFilename.get(block?.filename);
            if (!previous) return block;
            return {
                ...previous,
                ...block,
                description: block?.description ?? previous.description,
                pattern: block?.pattern ?? previous.pattern,
                trackerState: block?.trackerState ?? previous.trackerState,
            };
        });
        deps.setBlocksLibraryCache(nextCache);
        renderBlocksLibraryFromCache();
    } catch (err) {
        deps.logError('[Blocks] Failed to refresh library:', err);
        listEl.innerHTML = '<div class="text-xs text-destructive px-2 py-2">Failed to load block library.</div>';
        deps.setStatus('Failed to load block library', 'error');
    }
}
