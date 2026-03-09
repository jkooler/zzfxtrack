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
let getPatternFolderState = () => ({ user: true, system: false });
let setPatternFolderState = () => {};
let savePatternFolderState = () => {};
let createIcons = () => {};
let icons = {};
let setStatus = () => {};
let getPlayingPatternFilename = () => null;
let attachVisualizer = () => {};

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
    if (typeof options.attachVisualizer === 'function') attachVisualizer = options.attachVisualizer;
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
        const entries = isDemoMode()
            ? getDemoPatternFiles().sort().map((filename) => ({ filename, scope: 'system' }))
            : await (async () => {
                const payload = await listPatterns();
                const collator = typeof Intl !== 'undefined' && Intl.Collator
                    ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
                    : null;
                return normalizePatternEntries(payload).sort((a, b) =>
                    collator ? collator.compare(a.filename, b.filename) : a.filename.localeCompare(b.filename)
                );
            })();

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
            const expanded = isEmpty ? true : (scope === 'system' ? folderState.system : folderState.user);
            const folderIcon = expanded ? 'chevron-down' : 'chevron-right';

            const folderLi = document.createElement('li');
            folderLi.className = 'mt-1 pb-1 border-b border-border/40';
            folderLi.innerHTML = `
                <button type="button" class="w-full flex items-center justify-between py-1 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40" data-pattern-folder="${scope}">
                    <span class="inline-flex items-center gap-1.5">
                        <i data-lucide="${folderIcon}" class="w-5 h-5 shrink-0 ${expanded ? 'text-primary' : 'text-muted-foreground'}"></i>
                        ${label}
                    </span>
                    <span class="opacity-70">${items.length}</span>
                </button>
                <ul class="list-none m-0 p-0 space-y-1 mt-1 ${expanded ? '' : 'hidden'}" data-pattern-folder-items="${scope}"></ul>
            `;
            const list = folderLi.querySelector(`[data-pattern-folder-items="${scope}"]`);
            folderLi.querySelector(`[data-pattern-folder="${scope}"]`)?.addEventListener('click', () => {
                if (isEmpty) return;
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
                    ? 'Create a new pattern to get started.'
                    : 'No system patterns available.';
                list?.appendChild(empty);
            }

            items.forEach((entry) => {
                const file = entry.filename;
                const fileName = decodeURIComponent(file.replace('.js', ''));
                const isSystem = normalizeScope(entry.scope) === 'system';
                const devMode = isDeveloperModeEnabled();
                const isImmutable = isSystem && !devMode;
                const li = document.createElement('li');
                li.className = `list-item ${file === getCurrentPatternFilename() && !getWelcomeViewVisible() ? 'active' : ''}`;
                li.dataset.scope = normalizeScope(entry.scope);
                li.dataset.filename = file;

                li.innerHTML = (isDemoMode() || isImmutable)
                    ? `<span class="font-medium">${fileName}</span>`
                    : `<span class="font-medium">${fileName}</span><div class="list-item-actions"><button class="sidebar-del-btn" title="Delete ${fileName}"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>`;

                li.querySelector('span')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadPattern(file);
                });
                li.addEventListener('click', () => loadPattern(file));

                if (!isDemoMode() && !isImmutable) {
                    li.querySelector('.sidebar-del-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showDeleteConfirmation(file);
                    });
                }
                list?.appendChild(li);
            });

            patternList.appendChild(folderLi);
        };

        const userEntries = entries.filter((entry) => normalizeScope(entry.scope) !== 'system');
        const systemEntries = entries.filter((entry) => normalizeScope(entry.scope) === 'system');
        appendFolder('user', 'Your patterns', userEntries);
        appendFolder('system', 'System', systemEntries);
        updatePatternListVisualizer();
        createIcons({ icons });
    } catch (e) {
        setStatus('Error loading patterns', 'error');
    }
}

export function updatePatternListVisualizer() {
    const patternList = getPatternListElement();
    if (!patternList || patternList.classList.contains('hidden')) return;

    const playingPatternFilename = getPlayingPatternFilename();
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

    if (!visualizerAttached) {
        attachVisualizer(null);
    }
}
