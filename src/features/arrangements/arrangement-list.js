/**
 * Module: features/arrangements/arrangement-list
 * Purpose: Arrangement list loading, grouping, rendering, and active-state handling.
 * Deps keys: alphabetical.
 */

const TAB_VISUALIZER_CLASS = 'list-item-visualizer';

let deps = {
    attachVisualizer: () => {},
    createIcons: () => {},
    deleteArrangement: () => {},
    getBlocksTabElement: () => null,
    escapeHtml: (value) => String(value),
    getArrangementPreviewPlayingFilename: () => null,
    getCurrentArrangementFilename: () => null,
    getDemoArrangementFiles: () => [],
    getEntriesCache: () => [],
    getFolderState: () => ({ user: true, system: false }),
    getListElement: () => document.getElementById('arrangementList'),
    icons: {},
    isArrangementPreviewPlaying: () => false,
    isDemoMode: () => false,
    isDeveloperModeEnabled: () => false,
    listArrangements: async () => [],
    loadArrangement: () => {},
    logError: () => {},
    normalizeScope: (value) => (value === 'system' ? 'system' : 'user'),
    saveFolderState: () => {},
    setEntriesCache: () => {},
    setFolderState: () => {},
    setStatus: () => {},
};

export function configureArrangementList(options = {}) {
    deps = { ...deps, ...options };
}

export function normalizeArrangementEntries(payload) {
    if (!Array.isArray(payload)) return [];
    return payload
        .map((item) => {
            if (typeof item === 'string') {
                return { filename: item, name: item.replace(/\.js$/i, ''), scope: 'user', bpm: 120, arrangementState: null };
            }
            if (!item || typeof item !== 'object' || typeof item.filename !== 'string') {
                return null;
            }
            return {
                filename: item.filename,
                name: item.filename.replace(/\.js$/i, ''),
                scope: deps.normalizeScope(item.scope),
                bpm: Number.isFinite(Number(item.bpm)) ? Number(item.bpm) : 120,
                arrangementState: item.arrangementState ?? null,
            };
        })
        .filter(Boolean);
}

export function getArrangementEntry(filename) {
    return deps.getEntriesCache().find((entry) => entry.filename === filename) || null;
}

function isArrangementListVisible() {
    const list = deps.getListElement();
    return Boolean(list && !list.classList.contains('hidden'));
}

export function updateArrangementListScopeVisualizer() {
    const arrangementList = deps.getListElement();
    const listVisible = arrangementList && isArrangementListVisible();
    const playingFilename = deps.isArrangementPreviewPlaying()
        ? (deps.getArrangementPreviewPlayingFilename() ?? deps.getCurrentArrangementFilename())
        : null;

    if (!listVisible && playingFilename) {
        const blocksTab = deps.getBlocksTabElement();
        if (blocksTab) {
            let canvas = blocksTab.querySelector(`canvas.${TAB_VISUALIZER_CLASS}`);
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = TAB_VISUALIZER_CLASS;
                canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
                blocksTab.classList.add('relative');
                blocksTab.insertBefore(canvas, blocksTab.firstChild);
            }
            canvas.width = blocksTab.clientWidth;
            canvas.height = blocksTab.clientHeight;
            deps.attachVisualizer(canvas);
            return;
        }
    }

    const blocksTab = deps.getBlocksTabElement();
    if (blocksTab) {
        const tabCanvas = blocksTab.querySelector(`canvas.${TAB_VISUALIZER_CLASS}`);
        if (tabCanvas) {
            tabCanvas.remove();
            blocksTab.classList.remove('relative');
        }
    }

    if (!arrangementList || !isArrangementListVisible()) {
        if (!playingFilename) deps.attachVisualizer(null);
        return;
    }

    const playingEntry = deps.getEntriesCache().find((e) => e.filename === playingFilename);
    const playingScope = playingEntry ? deps.normalizeScope(playingEntry.scope) : null;
    let visualizerAttached = false;

    const folderRows = Array.from(arrangementList.children).filter((li) =>
        li.querySelector('[data-arrangement-folder]')
    );
    folderRows.forEach((folderLi) => {
        const folderButton = folderLi.querySelector('[data-arrangement-folder]');
        const scope = folderButton?.getAttribute('data-arrangement-folder');
        const itemsUl = folderLi.querySelector('[data-arrangement-folder-items]');
        const isCollapsed = itemsUl?.classList.contains('hidden');
        const isPlayingInThisFolder = playingScope === scope && playingFilename;

        if (isCollapsed && isPlayingInThisFolder) {
            let canvas = folderLi.querySelector('canvas.list-item-visualizer');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = 'list-item-visualizer';
                folderLi.classList.add('relative', 'overflow-hidden');
                folderLi.insertBefore(canvas, folderLi.firstChild);
            }
            canvas.width = folderLi.clientWidth;
            canvas.height = folderLi.clientHeight;
            deps.attachVisualizer(canvas);
            visualizerAttached = true;
        } else {
            const canvas = folderLi.querySelector('canvas.list-item-visualizer');
            if (canvas) canvas.remove();
            folderLi.classList.remove('relative', 'overflow-hidden');
        }
    });

    const listItems = Array.from(arrangementList.querySelectorAll('.list-item'));
    const target = playingFilename
        ? listItems.find((item) => item.dataset.filename === playingFilename) || null
        : null;

    listItems.forEach((item) => {
        if (item !== target) {
            item.classList.remove('relative', 'overflow-hidden');
            item.querySelector('canvas.list-item-visualizer')?.remove();
        }
    });

    if (target && !visualizerAttached) {
        target.classList.add('relative', 'overflow-hidden');
        let canvas = target.querySelector('canvas.list-item-visualizer');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'list-item-visualizer';
            target.insertBefore(canvas, target.firstChild);
        }
        canvas.width = target.clientWidth;
        canvas.height = target.clientHeight;
        deps.attachVisualizer(canvas);
        visualizerAttached = true;
    }

    if (!visualizerAttached) deps.attachVisualizer(null);
}

export function refreshArrangementListActiveState() {
    const arrangementList = deps.getListElement();
    if (!arrangementList) return;
    Array.from(arrangementList.querySelectorAll('.list-item')).forEach((li) => {
        li.classList.toggle('active', li.dataset.filename === deps.getCurrentArrangementFilename());
    });
    updateArrangementListScopeVisualizer();
}

export async function refreshArrangementList() {
    const arrangementList = deps.getListElement();
    if (!arrangementList) return;

    try {
        const sortByLeadingNumber = (a, b) => {
            const padNum = (s) => {
                const m = (s || '').match(/^(\d+)/);
                return m ? m[1].padStart(8, '0') + s : `\x00${s}`;
            };
            return padNum(a.filename || '').localeCompare(padNum(b.filename || ''));
        };
        const entries = deps.isDemoMode()
            ? deps.getDemoArrangementFiles()
                .map((filename) => ({ filename, name: decodeURIComponent(filename.replace(/\.js$/i, '')), scope: 'system' }))
                .sort(sortByLeadingNumber)
            : await (async () => {
                const payload = await deps.listArrangements();
                const normalized = normalizeArrangementEntries(payload);
                normalized.sort(sortByLeadingNumber);
                return normalized;
            })();

        deps.setEntriesCache(entries);
        arrangementList.innerHTML = '';

        const appendFolder = (scope, label, items) => {
            const isEmpty = items.length === 0;
            const folderState = deps.getFolderState();
            const expanded = isEmpty ? true : (scope === 'system' ? folderState.system : folderState.user);
            const folderIcon = expanded ? 'chevron-down' : 'chevron-right';
            const folderLi = document.createElement('li');
            folderLi.className = 'mt-1 pb-1';
            folderLi.innerHTML = `
                <button type="button" class="w-full flex items-center justify-between py-1 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40" data-arrangement-folder="${scope}">
                    <span class="inline-flex items-center gap-1.5">
                        <i data-lucide="${folderIcon}" class="w-5 h-5 shrink-0 ${expanded ? 'text-primary' : 'text-muted-foreground opacity-70'}"></i>
                        ${label}
                    </span>
                    <span class="opacity-70">${items.length}</span>
                </button>
                <ul class="list-none m-0 p-0 space-y-1 mt-1 ${expanded ? '' : 'hidden'}" data-arrangement-folder-items="${scope}"></ul>
            `;
            const list = folderLi.querySelector(`[data-arrangement-folder-items="${scope}"]`);
            folderLi.querySelector(`[data-arrangement-folder="${scope}"]`)?.addEventListener('click', () => {
                if (isEmpty) return;
                const next = { ...deps.getFolderState() };
                if (scope === 'system') next.system = !next.system;
                else next.user = !next.user;
                deps.setFolderState(next);
                deps.saveFolderState(next);
                refreshArrangementList();
            });

            if (isEmpty) {
                const empty = document.createElement('li');
                empty.className = 'text-xs text-muted-foreground px-2 py-1';
                empty.textContent = scope === 'user'
                    ? 'Create a new arrangement to get started.'
                    : 'No system arrangements available.';
                list?.appendChild(empty);
            }

            items.forEach((entry) => {
                const isSystem = deps.normalizeScope(entry.scope) === 'system';
                const canDelete = !deps.isDemoMode() && (!isSystem || deps.isDeveloperModeEnabled());
                const li = document.createElement('li');
                li.className = `list-item ${entry.filename === deps.getCurrentArrangementFilename() ? 'active' : ''}`;
                li.dataset.scope = deps.normalizeScope(entry.scope);
                li.dataset.filename = entry.filename;

                const displayName = decodeURIComponent((entry.filename || '').replace(/\.js$/i, ''));
                li.innerHTML = deps.isDemoMode()
                    ? `<span class="font-medium">${deps.escapeHtml(displayName)}</span>`
                    : `<span class="font-medium">${deps.escapeHtml(displayName)}</span>${canDelete ? `<div class="list-item-actions"><button class="sidebar-del-btn" title="Delete ${deps.escapeHtml(displayName)}"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>` : ''}`;

                li.querySelector('span')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deps.loadArrangement(entry.filename);
                });
                li.addEventListener('click', () => deps.loadArrangement(entry.filename));

                if (canDelete) {
                    li.querySelector('.sidebar-del-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deps.deleteArrangement(entry.filename);
                    });
                }
                list?.appendChild(li);
            });

            arrangementList.appendChild(folderLi);
        };

        const userItems = [...entries.filter((entry) => deps.normalizeScope(entry.scope) === 'user')].sort(sortByLeadingNumber);
        const systemItems = [...entries.filter((entry) => deps.normalizeScope(entry.scope) === 'system')].sort(sortByLeadingNumber);
        appendFolder('user', 'Your arrangements', userItems);
        appendFolder('system', 'System', systemItems);
        deps.createIcons({ icons: deps.icons });
        updateArrangementListScopeVisualizer();
    } catch (err) {
        deps.logError('[Arrangements] Failed to refresh list:', err);
        deps.setEntriesCache([]);
        arrangementList.innerHTML = '<li class="text-xs text-destructive px-3 py-2">Failed to load arrangements.</li>';
    }
}
