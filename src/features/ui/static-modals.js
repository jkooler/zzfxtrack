/**
 * Module: features/ui/static-modals
 * Purpose: Wiring for static informational modals (about/license/changelog/demo/etc.).
 */

let deps = {
    getDom: () => ({}),
    createIcons: () => {},
    getIcons: () => ({}),
    isDemoMode: () => false,
};

export function configureStaticModals(options = {}) {
    deps = { ...deps, ...options };
}

function wireModal({ openBtn, closeBtn, closeBottomBtn, modal, onOpen }) {
    if (openBtn) openBtn.addEventListener('click', () => {
        modal?.classList.add('open');
        if (typeof onOpen === 'function') onOpen();
    });
    if (closeBtn) closeBtn.addEventListener('click', () => modal?.classList.remove('open'));
    if (closeBottomBtn) closeBottomBtn.addEventListener('click', () => modal?.classList.remove('open'));
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('open');
        });
    }
}

export function installStaticModalHandlers() {
    const dom = deps.getDom();
    wireModal({
        openBtn: dom.openAboutModalBtn,
        closeBtn: dom.closeAboutModalBtn,
        closeBottomBtn: dom.closeAboutModalBottomBtn,
        modal: dom.aboutModal,
        onOpen: () => deps.createIcons({ icons: deps.getIcons() }),
    });
    wireModal({
        openBtn: dom.openLicenseModalBtn,
        closeBtn: dom.closeLicenseModalBtn,
        closeBottomBtn: dom.closeLicenseModalBottomBtn,
        modal: dom.licenseAttributionModal,
    });
    wireModal({
        openBtn: dom.openTechnicalDetailsModalBtn,
        closeBtn: dom.closeTechnicalDetailsModalBtn,
        closeBottomBtn: dom.closeTechnicalDetailsModalBottomBtn,
        modal: dom.technicalDetailsModal,
        onOpen: () => deps.createIcons({ icons: deps.getIcons() }),
    });
    wireModal({
        openBtn: dom.openChangelogModalBtn,
        closeBtn: dom.closeChangelogModalBtn,
        closeBottomBtn: dom.closeChangelogModalBottomBtn,
        modal: dom.changelogModal,
    });
    if (dom.demoModeBadge) {
        dom.demoModeBadge.addEventListener('click', () => {
            if (!deps.isDemoMode()) return;
            dom.demoModeModal?.classList.add('open');
        });
    }
    if (dom.closeDemoModeModalBtn) dom.closeDemoModeModalBtn.addEventListener('click', () => dom.demoModeModal?.classList.remove('open'));
    if (dom.closeDemoModeModalBottomBtn) dom.closeDemoModeModalBottomBtn.addEventListener('click', () => dom.demoModeModal?.classList.remove('open'));
    if (dom.demoModeModal) {
        dom.demoModeModal.addEventListener('click', (e) => {
            if (e.target === dom.demoModeModal) dom.demoModeModal.classList.remove('open');
        });
    }
}
