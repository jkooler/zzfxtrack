/**
 * Module: features/patterns/pattern-list
 * Purpose: Pattern list loading, grouping, rendering, and active-state behavior.
 */

let getCurrentPatternFilename = () => null;
let getPatternListElement = () => document.getElementById('patternList');
let getPatternEntriesCache = () => [];
let normalizeScope = (value) => (value === 'system' ? 'system' : 'user');
let isDemoMode = () => false;
let getDemoPatternFiles = () => [];
let listPatterns = async () => [];
let setPatternEntriesCache = () => {};
let isDeveloperModeEnabled = () => false;
let getWelcomeViewVisible = () => false;
let loadPattern = () => {};
let showDeleteConfirmation = () => {};
let getPatternFolderState = () => ({ user: false, system: true });
let setPatternFolderState = () => {};
let savePatternFolderState = () => {};
let createIcons = () => {};
let icons = {};
let setStatus = () => {};
let getPlayingPatternFilename = () => null;
let getStrudelTabElement = () => null;
let attachVisualizer = () => {};
let isArrangementPreviewPlaying = () => false;

function scrollListItemIntoView(item) {
    if (!item) return;
    let container = item.parentElement;
    while (container && container !== document.body) {
        const style = window.getComputedStyle(container);
        const overflowY = style?.overflowY || '';
        if (/(auto|scroll|overlay)/.test(overflowY) && container.scrollHeight > container.clientHeight) {
            break;
        }
        container = container.parentElement;
    }
    if (!container || container === document.body) {
        item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
    }
    const padding = 80;
    const itemRect = item.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (itemRect.top < containerRect.top + padding) {
        container.scrollTop += itemRect.top - (containerRect.top + padding);
    } else if (itemRect.bottom > containerRect.bottom - padding) {
        container.scrollTop += itemRect.bottom - (containerRect.bottom - padding);
    }
}

function getVisiblePatternItems(patternList) {
    return Array.from(patternList?.querySelectorAll('.list-item') || [])
        .filter((item) => item.offsetParent !== null);
}

function focusPatternItem(item) {
    if (!item || typeof item.focus !== 'function') return;
    item.focus({ preventScroll: true });
}

export function configurePatternList(options = {}) {
    if (typeof options.getCurrentPatternFilename === 'function') {
        getCurrentPatternFilename = options.getCurrentPatternFilename;
    }
    if (typeof options.getPatternListElement === 'function') {
        getPatternListElement = options.getPatternListElement;
    }
    if (typeof options.getPatternEntriesCache === 'function') {
        getPatternEntriesCache = options.getPatternEntriesCache;
    }
    if (typeof options.normalizeScope === 'function') {
        normalizeScope = options.normalizeScope;
    }
    if (typeof options.isDemoMode === 'function') isDemoMode = options.isDemoMode;
    if (typeof options.getDemoPatternFiles === 'function') getDemoPatternFiles = options.getDemoPatternFiles;
    if (typeof options.listPatterns === 'function') listPatterns = options.listPatterns;
    if (typeof options.setPatternEntriesCache === 'function') setPatternEntriesCache = options.setPatternEntriesCache;
    if (typeof options.isDeveloperModeEnabled === 'function') isDeveloperModeEnabled = options.isDeveloperModeEnabled;
    if (typeof options.getWelcomeViewVisible === 'function') getWelcomeViewVisible = options.getWelcomeViewVisible;
    if (typeof options.loadPattern === 'function') loadPattern = options.loadPattern;
    if (typeof options.showDeleteConfirmation === 'function') showDeleteConfirmation = options.showDeleteConfirmation;
    if (typeof options.getPatternFolderState === 'function') getPatternFolderState = options.getPatternFolderState;
    if (typeof options.setPatternFolderState === 'function') setPatternFolderState = options.setPatternFolderState;
    if (typeof options.savePatternFolderState === 'function') savePatternFolderState = options.savePatternFolderState;
    if (typeof options.createIcons === 'function') createIcons = options.createIcons;
    if (options.icons) icons = options.icons;
    if (typeof options.setStatus === 'function') setStatus = options.setStatus;
    if (typeof options.getPlayingPatternFilename === 'function') getPlayingPatternFilename = options.getPlayingPatternFilename;
    if (typeof options.getStrudelTabElement === 'function') getStrudelTabElement = options.getStrudelTabElement;
    if (typeof options.attachVisualizer === 'function') attachVisualizer = options.attachVisualizer;
    if (typeof options.isArrangementPreviewPlaying === 'function') isArrangementPreviewPlaying = options.isArrangementPreviewPlaying;
}

/**
 * Re-apply active highlight to the currently selected pattern in the sidebar.
 * Used when user switches from introduction view to Strudel/Instruments tab.
 */
export function refreshPatternListActiveState() {
    const currentPatternFilename = getCurrentPatternFilename();
    const patternList = getPatternListElement();
    if (!currentPatternFilename || !patternList) return;
    Array.from(patternList.querySelectorAll('.list-item')).forEach((li) => {
        li.classList.toggle('active', li.dataset.filename === currentPatternFilename);
    });
    const activeItem = patternList.querySelector('.list-item.active');
    scrollListItemIntoView(activeItem);
    if (document.activeElement && patternList.contains(document.activeElement)) {
        focusPatternItem(activeItem);
    }
}

export function normalizePatternEntries(payload) {
    if (!Array.isArray(payload)) return [];
    return payload
        .map((item) => {
            if (typeof item === 'string') {
                return { filename: item, scope: 'user' };
            }
            if (!item || typeof item !== 'object' || typeof item.filename !== 'string') {
                return null;
            }
            return {
                filename: item.filename,
                scope: normalizeScope(item.scope),
            };
        })
        .filter(Boolean);
}

export function getPatternEntry(filename) {
    return getPatternEntriesCache().find((entry) => entry.filename === filename) || null;
}

export async function refreshPatternList() {
    const patternList = getPatternListElement();
    if (!patternList) return;
    try {
        const collator = typeof Intl !== 'undefined' && Intl.Collator
            ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
            : null;
        const compareEntries = (a, b) =>
            collator ? collator.compare(a.filename, b.filename) : a.filename.localeCompare(b.filename);
        const userEntries = normalizePatternEntries(await listPatterns());
        const entries = isDemoMode()
            ? (() => {
                const merged = new Map(userEntries.map((entry) => [entry.filename, entry]));
                getDemoPatternFiles().sort().forEach((filename) => {
                    if (!merged.has(filename)) merged.set(filename, { filename, scope: 'system' });
                });
                return Array.from(merged.values()).sort(compareEntries);
            })()
            : userEntries.sort(compareEntries);

        setPatternEntriesCache(entries);
        patternList.innerHTML = '';

        if (!entries.length) {
            patternList.innerHTML = '<li class="text-xs text-muted-foreground px-3 py-2">No patterns available.</li>';
            updatePatternListVisualizer();
            createIcons({ icons });
            return;
        }

        const appendFolder = (scope, label, items) => {
            const isEmpty = items.length === 0;
            const folderState = getPatternFolderState();
            const expanded = scope === 'system' ? folderState.system : folderState.user;
            const folderIcon = expanded ? 'chevron-down' : 'chevron-right';

            const folderLi = document.createElement('li');
            folderLi.className = scope === 'user'
                ? 'mt-1 mb-1 pb-2 border-b border-border/80'
                : 'mt-1 pb-1';
            folderLi.innerHTML = `
                <button type="button" class="w-full flex items-center justify-between py-1 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40" data-pattern-folder="${scope}">
                    <span class="inline-flex items-center gap-1.5">
                        <i data-lucide="${folderIcon}" class="w-5 h-5 shrink-0 ${expanded ? 'text-primary' : 'text-muted-foreground opacity-70'}"></i>
                        ${label}
                    </span>
                    <span class="opacity-70">${items.length}</span>
                </button>
                <ul class="list-none m-0 p-0 space-y-1 mt-1 ${expanded ? '' : 'hidden'}" data-pattern-folder-items="${scope}"></ul>
            `;
            const list = folderLi.querySelector(`[data-pattern-folder-items="${scope}"]`);
            folderLi.querySelector(`[data-pattern-folder="${scope}"]`)?.addEventListener('click', () => {
                const next = { ...getPatternFolderState() };
                if (scope === 'system') next.system = !next.system;
                else next.user = !next.user;
                setPatternFolderState(next);
                savePatternFolderState(next);
                refreshPatternList();
            });

            if (items.length === 0) {
                const empty = document.createElement('li');
                empty.className = 'text-xs text-muted-foreground px-2 py-1';
                empty.textContent = scope === 'user'
                    ? 'None was found'
                    : 'No system patterns available.';
                list?.appendChild(empty);
            }

            items.forEach((entry) => {
                const file = entry.filename;
                const fileName = decodeURIComponent(file.replace('.js', ''));
                const isSystem = normalizeScope(entry.scope) === 'system';
                const devMode = isDeveloperModeEnabled();
                const canDelete = !isSystem || devMode;
                const deleteActionMarkup = canDelete
                    ? `<button class="sidebar-del-btn" title="Delete ${fileName}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`
                    : '<button class="sidebar-del-btn invisible pointer-events-none" type="button" tabindex="-1" aria-hidden="true"><i data-lucide="trash-2" class="w-4 h-4"></i></button>';
                const li = document.createElement('li');
                li.className = `list-item ${file === getCurrentPatternFilename() && !getWelcomeViewVisible() ? 'active' : ''}`;
                li.tabIndex = 0;
                li.dataset.scope = normalizeScope(entry.scope);
                li.dataset.filename = file;

                li.innerHTML = `<span class="font-medium">${fileName}</span><div class="list-item-actions">${deleteActionMarkup}</div>`;

                li.querySelector('span')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    focusPatternItem(li);
                    loadPattern(file);
                });
                li.addEventListener('click', () => {
                    focusPatternItem(li);
                    loadPattern(file);
                });
                li.addEventListener('keydown', (e) => {
                    const items = getVisiblePatternItems(patternList);
                    const index = items.indexOf(li);
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const next = items[Math.min(items.length - 1, index + 1)];
                        if (next && next !== li) {
                            focusPatternItem(next);
                            loadPattern(next.dataset.filename);
                        }
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prev = items[Math.max(0, index - 1)];
                        if (prev && prev !== li) {
                            focusPatternItem(prev);
                            loadPattern(prev.dataset.filename);
                        }
                    } else if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        loadPattern(file);
                    }
                });

                if (canDelete) {
                    li.querySelector('.sidebar-del-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showDeleteConfirmation(file);
                    });
                }
                list?.appendChild(li);
            });

            patternList.appendChild(folderLi);
        };

        appendFolder('user', 'Your patterns', entries.filter((entry) => normalizeScope(entry.scope) !== 'system'));
        appendFolder('system', 'System', entries.filter((entry) => normalizeScope(entry.scope) === 'system'));
        scrollListItemIntoView(patternList.querySelector('.list-item.active'));
        updatePatternListVisualizer();
        createIcons({ icons });
    } catch (e) {
        setStatus('Error loading patterns', 'error');
    }
}

const TAB_VISUALIZER_CLASS = 'list-item-visualizer';

function clearPatternScopeVisualizers(patternList = getPatternListElement()) {
    const strudelTab = getStrudelTabElement();
    if (strudelTab) {
        const tabCanvas = strudelTab.querySelector(`canvas.${TAB_VISUALIZER_CLASS}`);
        if (tabCanvas) tabCanvas.remove();
        strudelTab.classList.remove('relative');
    }

    if (!patternList) return;

    Array.from(patternList.querySelectorAll('canvas.list-item-visualizer')).forEach((canvas) => canvas.remove());
    Array.from(patternList.children).forEach((row) => {
        row.classList.remove('relative', 'overflow-hidden');
    });
}

export function updatePatternListVisualizer() {
    const patternList = getPatternListElement();
    const playingPatternFilename = getPlayingPatternFilename();
    const arrangementPlaying = isArrangementPreviewPlaying();
    const listVisible = patternList && !patternList.classList.contains('hidden');

    if (arrangementPlaying) {
        clearPatternScopeVisualizers(patternList);
        return;
    }

    if (!listVisible && playingPatternFilename) {
        const strudelTab = getStrudelTabElement();
        if (strudelTab) {
            let canvas = strudelTab.querySelector(`canvas.${TAB_VISUALIZER_CLASS}`);
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = TAB_VISUALIZER_CLASS;
                canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
                strudelTab.classList.add('relative');
                strudelTab.insertBefore(canvas, strudelTab.firstChild);
            }
            canvas.width = strudelTab.clientWidth;
            canvas.height = strudelTab.clientHeight;
            attachVisualizer(canvas);
            return;
        }
    }

    clearPatternScopeVisualizers(patternList);

    if (!patternList) return;
    if (patternList.classList.contains('hidden')) {
        attachVisualizer(null);
        return;
    }

    const playingEntry = getPatternEntriesCache().find((e) => e.filename === playingPatternFilename);
    const playingScope = playingEntry ? normalizeScope(playingEntry.scope) : null;
    let visualizerAttached = false;

    const folderRows = Array.from(patternList.children).filter((li) =>
        li.querySelector('[data-pattern-folder]')
    );
    folderRows.forEach((folderLi) => {
        const folderButton = folderLi.querySelector('[data-pattern-folder]');
        const scope = folderButton?.getAttribute('data-pattern-folder');
        const itemsUl = folderLi.querySelector('[data-pattern-folder-items]');
        const isCollapsed = itemsUl?.classList.contains('hidden');
        const isPlayingInThisFolder = playingScope === scope && playingPatternFilename;

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
            attachVisualizer(canvas);
            visualizerAttached = true;
        } else {
            const canvas = folderLi.querySelector('canvas.list-item-visualizer');
            if (canvas) canvas.remove();
            folderLi.classList.remove('relative', 'overflow-hidden');
        }
    });

    const listItems = Array.from(patternList.querySelectorAll('.list-item'));
    listItems.forEach((li) => {
        const span = li.querySelector('span');
        const isPlayingTarget =
            span &&
            playingPatternFilename &&
            span.innerText === decodeURIComponent(playingPatternFilename.replace('.js', ''));

        let canvas = li.querySelector('canvas.list-item-visualizer');

        if (isPlayingTarget && !visualizerAttached) {
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = 'list-item-visualizer';
                canvas.width = li.clientWidth;
                canvas.height = li.clientHeight;
                li.insertBefore(canvas, li.firstChild);
            }
            attachVisualizer(canvas);
            visualizerAttached = true;
        } else if (canvas) {
            canvas.remove();
        }
    });

    if (!visualizerAttached && !arrangementPlaying) {
        attachVisualizer(null);
    }
}
