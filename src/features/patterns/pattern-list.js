let getCurrentPatternFilename = () => null;
let getPatternListElement = () => document.getElementById('patternList');

export function configurePatternList(options = {}) {
    if (typeof options.getCurrentPatternFilename === 'function') {
        getCurrentPatternFilename = options.getCurrentPatternFilename;
    }
    if (typeof options.getPatternListElement === 'function') {
        getPatternListElement = options.getPatternListElement;
    }
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
