/**
 * Module: app/state
 * Purpose: Shared mutable app state consumed by feature modules.
 */

export const appState = {
    currentPatternFilename: null,
    currentArrangementFilename: null,
    currentPatternScope: 'user',
    currentArrangementScope: 'user',
    currentPatternMetadata: {
        title: '',
        author: '',
        contact: '',
        license: '',
    },
    patternEntriesCache: [],
    arrangementEntriesCache: [],
    arrangementDraftState: null,
    blocksLibraryCache: [],
    activeArrangementBlockFilename: null,
};
