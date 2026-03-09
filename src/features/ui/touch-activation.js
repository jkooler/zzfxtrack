/**
 * Module: features/ui/touch-activation
 * Purpose: Touch-specific single-tap activation behavior for list-driven UI controls.
 */

/** Selector for touch activation: list items + instrument drawer close (single-tap on iPad). */
const LIST_ITEM_SELECTOR = '.list-item, .instrument-item, .block-item, #closeDrawerBtn';
/** If touch started on one of these, we do not synthesize click (let the button handle it). */
const LIST_ITEM_BUTTON_SELECTOR = '.sidebar-del-btn, .sidebar-edit-btn, .list-item-actions button, .arr-chip-del';

/**
 * iPad / touch: make first tap activate list items instead of requiring double-tap.
 * Uses touchend to synthesize an immediate click so the item's handler runs on first tap.
 */
export function setupListTouchActivation() {
    let touchStartItem = null;
    let touchStartOnButton = false;

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.target;
        const item = t.closest(LIST_ITEM_SELECTOR);
        if (!item) return;
        touchStartItem = item;
        touchStartOnButton = t.closest(LIST_ITEM_BUTTON_SELECTOR) != null;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (e.changedTouches.length !== 1 || !touchStartItem) return;
        const endTarget = document.elementFromPoint(
            e.changedTouches[0].clientX,
            e.changedTouches[0].clientY
        );
        if (!endTarget || !touchStartItem.contains(endTarget)) return;
        if (touchStartOnButton) return;
        e.preventDefault();
        const clickTarget = touchStartItem.matches('.instrument-item')
            ? touchStartItem.querySelector('.instrument-info')
            : touchStartItem;
        (clickTarget || touchStartItem).click();
        touchStartItem = null;
    }, { passive: false });

    document.addEventListener('touchcancel', () => { touchStartItem = null; });
}
