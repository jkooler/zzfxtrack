/**
 * Module: app/dom
 * Purpose: Centralized DOM element registry used by feature modules and main composition.
 */

export const dom = {
    repl: document.getElementById('repl'),
    sidebarTitle: document.getElementById('sidebarTitle'),
    patternList: document.getElementById('patternList'),
    arrangementList: document.getElementById('arrangementList'),
    blocksTab: document.getElementById('blocksTab'),
    strudelTab: document.getElementById('strudelTab'),
    newArrangementBtn: document.getElementById('newArrangementBtn'),
    patternNameInput: document.getElementById('patternNameInput'),
    openPatternAdvancedSettingsBtn: document.getElementById('openPatternAdvancedSettingsBtn'),
    playBtn: document.getElementById('playBtn'),
    exportBtn: document.getElementById('exportBtn'),
    exportBtnLabel: document.getElementById('exportBtnLabel'),
    exportMenuWrap: document.getElementById('exportMenuWrap'),
    exportMenu: document.getElementById('exportMenu'),
    exportMenuTitle: document.getElementById('exportMenuTitle'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    exportWavBtn: document.getElementById('exportWavBtn'),
    newPatternBtn: document.getElementById('newPatternBtn'),
    statusMsg: document.getElementById('statusMsg'),
    footerStatusRow: document.getElementById('footerStatusRow'),
    demoModeBadge: document.getElementById('demoModeBadge'),
    devModeToolbarLabel: document.getElementById('devModeToolbarLabel'),

    // Views
    welcomeView: document.getElementById('welcomeView'),
    editorContainer: document.getElementById('editorContainer'),
    arrangementWorkspace: document.getElementById('arrangementWorkspace'),
    arrangementWorkspacePane: document.getElementById('arrangementWorkspacePane'),
    arrangementWorkspacePlaceholder: document.getElementById('arrangementWorkspacePlaceholder'),
    trackerWorkspacePane: document.getElementById('trackerWorkspacePane'),
    blocksLibrarySidebar: document.getElementById('blocksLibrarySidebar'),
    blocksLibraryList: document.getElementById('blocksLibraryList'),
    blocksLibraryToggle: document.getElementById('blocksLibraryToggle'),
    newSidebarBlockBtn: document.getElementById('newSidebarBlockBtn'),
    mainHeader: document.getElementById('mainHeader'),
    mainFooter: document.getElementById('mainFooter'),

    // Preview Panel
    previewJson: document.getElementById('previewJson'),
    previewPlayBtn: document.getElementById('previewPlayBtn'),
    downloadProjectBtn: document.getElementById('downloadProjectBtn'),
    exportProjectModal: document.getElementById('exportProjectModal'),
    exportProjectIdentifierInput: document.getElementById('exportProjectIdentifierInput'),
    closeExportProjectModalBtn: document.getElementById('closeExportProjectModalBtn'),
    cancelExportProjectBtn: document.getElementById('cancelExportProjectBtn'),
    confirmExportProjectBtn: document.getElementById('confirmExportProjectBtn'),
    uploadProjectBtn: document.getElementById('uploadProjectBtn'),
    uploadProjectInput: document.getElementById('uploadProjectInput'),
    uploadProjectModal: document.getElementById('uploadProjectModal'),
    uploadProjectDropzone: document.getElementById('uploadProjectDropzone'),
    closeUploadProjectModalBtn: document.getElementById('closeUploadProjectModalBtn'),
    cancelUploadProjectBtn: document.getElementById('cancelUploadProjectBtn'),
    confirmUploadProjectBtn: document.getElementById('confirmUploadProjectBtn'),
    uploadProjectFilename: document.getElementById('uploadProjectFilename'),
    uploadProjectSummary: document.getElementById('uploadProjectSummary'),
    uploadProjectFooterMessage: document.getElementById('uploadProjectFooterMessage'),

    // System Settings Modal
    openSystemSettingsModalBtn: document.getElementById('openSystemSettingsModalBtn'),
    systemSettingsModal: document.getElementById('systemSettingsModal'),
    closeSystemSettingsModalBtn: document.getElementById('closeSystemSettingsModalBtn'),
    closeSystemSettingsModalBottomBtn: document.getElementById('closeSystemSettingsModalBottomBtn'),
    systemSettingsDevModeToggle: document.getElementById('systemSettingsDevModeToggle'),
    systemSettingsThemeDetails: document.getElementById('systemSettingsThemeDetails'),
    systemSettingsThemeResetBtn: document.getElementById('systemSettingsThemeResetBtn'),
    systemSettingsThemeCopyBtn: document.getElementById('systemSettingsThemeCopyBtn'),
    systemSettingsThemeDefaultBtn: document.getElementById('systemSettingsThemeDefaultBtn'),
    systemSettingsThemeLegacyBtn: document.getElementById('systemSettingsThemeLegacyBtn'),
    systemSettingsThemeRomulanBtn: document.getElementById('systemSettingsThemeRomulanBtn'),
    systemSettingsThemeMonoBtn: document.getElementById('systemSettingsThemeMonoBtn'),
    systemSettingsThemeMilkBtn: document.getElementById('systemSettingsThemeMilkBtn'),
    systemSettingsThemeWhiteDebugBtn: document.getElementById('systemSettingsThemeWhiteDebugBtn'),
    systemSettingsReplThemeSelect: document.getElementById('systemSettingsReplThemeSelect'),

    // Modals
    newPatternModal: document.getElementById('newPatternModal'),
    newPatternName: document.getElementById('newPatternName'),
    confirmNewPattern: document.getElementById('confirmNewPattern'),
    cancelNewPattern: document.getElementById('cancelNewPattern'),
    newArrangementModal: document.getElementById('newArrangementModal'),
    newArrangementName: document.getElementById('newArrangementName'),
    confirmNewArrangement: document.getElementById('confirmNewArrangement'),
    cancelNewArrangement: document.getElementById('cancelNewArrangement'),

    // Delete Confirmation
    deleteConfirmModal: document.getElementById('deleteConfirmModal'),
    deleteConfirmText: document.getElementById('deleteConfirmText'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),

    // JSON Modal
    showJsonBtn: document.getElementById('showJsonBtn'),
    jsonPreviewModal: document.getElementById('jsonPreviewModal'),
    songDataJsonTab: document.getElementById('songDataJsonTab'),
    songDataJsTab: document.getElementById('songDataJsTab'),
    closeJsonModalBtn: document.getElementById('closeJsonModalBtn'),
    closeJsonModalBottomBtn: document.getElementById('closeJsonModalBottomBtn'),
    downloadJsonBtn: document.getElementById('downloadJsonBtn'),
    copyJsonBtn: document.getElementById('copyJsonBtn'),

    // About Modal
    openAboutModalBtn: document.getElementById('openAboutModalBtn'),
    aboutModal: document.getElementById('aboutModal'),
    closeAboutModalBtn: document.getElementById('closeAboutModalBtn'),
    closeAboutModalBottomBtn: document.getElementById('closeAboutModalBottomBtn'),

    // Licensing Modal
    openLicenseModalBtn: document.getElementById('openLicenseModalBtn'),
    licenseAttributionModal: document.getElementById('licenseAttributionModal'),
    closeLicenseModalBtn: document.getElementById('closeLicenseModalBtn'),
    closeLicenseModalBottomBtn: document.getElementById('closeLicenseModalBottomBtn'),

    // Technical Details Modal
    openTechnicalDetailsModalBtn: document.getElementById('openTechnicalDetailsModalBtn'),
    technicalDetailsModal: document.getElementById('technicalDetailsModal'),
    closeTechnicalDetailsModalBtn: document.getElementById('closeTechnicalDetailsModalBtn'),
    closeTechnicalDetailsModalBottomBtn: document.getElementById('closeTechnicalDetailsModalBottomBtn'),

    // Change Log Modal
    openChangelogModalBtn: document.getElementById('openChangelogModalBtn'),
    changelogModal: document.getElementById('changelogModal'),
    closeChangelogModalBtn: document.getElementById('closeChangelogModalBtn'),
    closeChangelogModalBottomBtn: document.getElementById('closeChangelogModalBottomBtn'),

    // Demo Mode Modal
    demoModeModal: document.getElementById('demoModeModal'),
    closeDemoModeModalBtn: document.getElementById('closeDemoModeModalBtn'),
    closeDemoModeModalBottomBtn: document.getElementById('closeDemoModeModalBottomBtn'),

    // External Link Modal
    externalLinkModal: document.getElementById('externalLinkModal'),
    confirmExternalLink: document.getElementById('confirmExternalLink'),
    cancelExternalLink: document.getElementById('cancelExternalLink'),

    // Export Settings Modal
    exportSettingsBtn: document.getElementById('exportSettingsBtn'),
    exportSettingsModal: document.getElementById('exportSettingsModal'),
    limitChannels: document.getElementById('limitChannels'),
    channelLimitGroup: document.getElementById('channelLimitGroup'),
    maxChannelsInput: document.getElementById('maxChannelsInput'),
    normalizeLayers: document.getElementById('normalizeLayers'),
    cancelExportSettings: document.getElementById('cancelExportSettings'),
    applyExportSettings: document.getElementById('applyExportSettings'),
    exportResolutionHint: document.getElementById('exportResolutionHint'),
    exportResolutionCustomWrap: document.getElementById('exportResolutionCustomWrap'),
    exportResolutionCustom: document.getElementById('exportResolutionCustom'),
    simpleExport: document.getElementById('simpleExport'),
    wavSampleRate: document.getElementById('wavSampleRate'),
    wavBitDepth: document.getElementById('wavBitDepth'),
    playbackLoudnessPreset: document.getElementById('playbackLoudnessPreset'),
    playbackTargetPeak: document.getElementById('playbackTargetPeak'),
    playbackMasterGainDb: document.getElementById('playbackMasterGainDb'),
    playbackSoftClipDrive: document.getElementById('playbackSoftClipDrive'),

    // Advanced Settings Modal
    advancedSettingsModal: document.getElementById('advancedSettingsModal'),
    advancedSettingsTitle: document.getElementById('advancedSettingsTitle'),
    advancedSettingsResourceLabel: document.getElementById('advancedSettingsResourceLabel'),
    advancedSettingsSystemToggle: document.getElementById('advancedSettingsSystemToggle'),
    advancedSettingsSystemLockIcon: document.getElementById('advancedSettingsSystemLockIcon'),
    advancedSettingsSystemLabel: document.getElementById('advancedSettingsSystemLabel'),
    advancedSettingsInstrumentTypeSection: document.getElementById('advancedSettingsInstrumentTypeSection'),
    advancedSettingsMetadataDetails: document.getElementById('advancedSettingsMetadataDetails'),
    advancedSettingsMetadataTitle: document.getElementById('advancedSettingsMetadataTitle'),
    advancedSettingsMetadataAuthor: document.getElementById('advancedSettingsMetadataAuthor'),
    advancedSettingsMetadataContact: document.getElementById('advancedSettingsMetadataContact'),
    advancedSettingsMetadataLicense: document.getElementById('advancedSettingsMetadataLicense'),
    closeAdvancedSettingsModalBtn: document.getElementById('closeAdvancedSettingsModalBtn'),
    cancelAdvancedSettingsBtn: document.getElementById('cancelAdvancedSettingsBtn'),
    saveAdvancedSettingsBtn: document.getElementById('saveAdvancedSettingsBtn'),
};
