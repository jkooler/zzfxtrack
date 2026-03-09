/**
 * Module: features/settings/external-links
 * Purpose: External-link interception and confirmation-modal behavior.
 */

let deps = {
    getDocument: () => document,
    getWindow: () => window,
    getExternalLinkModal: () => null,
    getConfirmExternalLinkButton: () => null,
    getCancelExternalLinkButton: () => null,
};

let pendingExternalUrl = null;

export function configureExternalLinks(options = {}) {
    deps = { ...deps, ...options };
}

function closeExternalLinkModal() {
    const modal = deps.getExternalLinkModal();
    if (modal) modal.classList.remove('open');
    pendingExternalUrl = null;
}

export function setupExternalLinkInterception() {
    const doc = deps.getDocument();
    const win = deps.getWindow();
    const modal = deps.getExternalLinkModal();
    const confirmBtn = deps.getConfirmExternalLinkButton();
    const cancelBtn = deps.getCancelExternalLinkButton();
    if (!doc || !modal || !confirmBtn || !cancelBtn) return;

    doc.addEventListener('click', (e) => {
        const link = e.target?.closest?.('a');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href) return;
        const isExternal = href.startsWith('http') || href.startsWith('//');
        const isSameOrigin = href.startsWith(win.location.origin) || (href.startsWith('/') && !href.startsWith('//'));
        if (isExternal && !isSameOrigin) {
            e.preventDefault();
            pendingExternalUrl = href;
            modal.classList.add('open');
        }
    });

    confirmBtn.addEventListener('click', () => {
        if (pendingExternalUrl) {
            deps.getWindow().open(pendingExternalUrl, '_blank', 'noopener,noreferrer');
        }
        closeExternalLinkModal();
    });

    cancelBtn.addEventListener('click', closeExternalLinkModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeExternalLinkModal();
    });
}
