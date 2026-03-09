# Project Structure Refactor Plan

Status: Draft  
Created: 2026-03-09

## Context

`src/repl-app.js` currently acts as the entrypoint, feature controller, state container, DOM registry, event bus wiring layer, and a large amount of feature implementation. The file is now large enough that simple changes carry unnecessary risk because unrelated concerns are tightly coupled.

The goal of this refactor is to reduce `repl-app.js` into a thin composition root, rename it to `src/main.js`, and move feature-owned logic into dedicated modules without changing product behavior.

## Goals

1. Rename `src/repl-app.js` to `src/main.js`.
2. Make `src/main.js` primarily responsible for startup and feature composition.
3. Split feature-heavy logic into modules with clear ownership boundaries.
4. Remove direct cross-feature imports from the app entrypoint where possible.
5. Preserve current behavior during the refactor.
6. Leave the codebase in a shape that supports later incremental TypeScript adoption.

## Non-Goals

- Rewriting the app architecture during the same pass.
- Changing user-visible behavior unless needed for bug fixes discovered during refactor.
- Migrating the entire app to TypeScript in this refactor.
- Replacing the current event-driven coordination model in one step.

## Guiding Principles

1. Refactor by ownership, not by arbitrary file size.
2. Prefer small, behavior-preserving moves.
3. Extract shared helpers before extracting the most coupled feature modules.
4. Keep cross-feature dependencies explicit through imports, callbacks, or state accessors.
5. Avoid turning `main.js` into a renamed copy of the current monolith.

## Target Structure

```text
src/
  main.js

  app/
    api.js
    bootstrap.js
    constants.js
    dom.js
    events.js
    state.js

  features/
    arrangements/
      arrangement-controller.js
      arrangement-list.js
      arrangement-persistence.js
      arrangement-preview.js
      arrangement-workspace.js

    blocks/
      block-controller.js
      block-library.js

    instruments/
      instrument-reference-sync.js
      instrument-runtime.js

    patterns/
      pattern-controller.js
      pattern-editor.js
      pattern-insertions.js
      pattern-list.js
      pattern-meta.js

    playback/
      export-actions.js
      export-preview.js
      export-settings.js
      playback-controller.js

    project/
      bundle-utils.js
      project-export.js
      project-import.js

    settings/
      advanced-settings.js
      dev-mode.js
      external-links.js
      theme-controller.js

    tracker/
      tracker-controller.js
      tracker-preview-sync.js
      tracker-workspace.js

    ui/
      icons.js
      modals.js
      status-bar.js
      touch-activation.js
      view-switching.js

  shared/
    code-transform-utils.js
    dom-utils.js
    filename-utils.js
    formatters.js
```

## Entry Point Design

After the refactor, `src/main.js` should own:

- top-level imports
- startup sequencing
- app bootstrap
- feature setup calls
- final `init()` invocation

`src/main.js` should not remain the default home for feature logic, DOM-heavy rendering, or reusable helpers.

## Existing Dependency Breaks To Resolve Early

`src/instrument-ui.js` currently imports app functionality directly from `./repl-app.js`. That dependency must be removed as part of the rename.

Current imported functions:

- `reloadInstruments`
- `isStrudelPlaybackActive`
- `refreshPatternListActiveState`
- `updateInstrumentReferencesInPatternsAndBlocks`

Target destinations:

- `reloadInstruments` -> `src/features/instruments/instrument-runtime.js`
- `isStrudelPlaybackActive` -> `src/features/playback/playback-controller.js`
- `refreshPatternListActiveState` -> `src/features/patterns/pattern-list.js`
- `updateInstrumentReferencesInPatternsAndBlocks` -> `src/features/instruments/instrument-reference-sync.js`

## Concrete Module Ownership

### `src/app/dom.js`

Owns the centralized DOM lookup object currently defined in `src/repl-app.js`.

Responsibilities:

- create and export the `dom` object
- keep selectors centralized
- avoid feature logic

### `src/app/state.js`

Owns app-wide mutable state currently defined near the top of `src/repl-app.js`.

Responsibilities:

- current pattern selection
- current arrangement selection
- caches for patterns, arrangements, and blocks
- preview/playback flags
- arrangement draft state
- tracker workspace state
- timeout handles

### `src/app/api.js`

Owns API-facing `fetch('/api/...')` calls.

Responsibilities:

- pattern API calls
- arrangement API calls
- block API calls
- rename endpoints
- import/export support endpoints

### `src/features/ui/status-bar.js`

Responsibilities:

- `setStatus`
- status fade/collapse timing
- footer status row updates

### `src/features/settings/dev-mode.js`

Responsibilities:

- developer mode persistence
- dev mode headers
- dev-only UI visibility toggles

### `src/features/ui/touch-activation.js`

Responsibilities:

- iPad/touch first-tap list activation

### `src/shared/code-transform-utils.js`

Responsibilities:

- shared code-string transforms and parser helpers
- remove duplicated helpers from block and arrangement insertion flows

Expected extracted helpers:

- `stripQuotedStrings`
- `escapeHtml`
- `slugify`
- `nextAvailableVarName`
- `findMatchingParen`
- `parseTopLevelArgs`
- `ensureBlocksSection`
- `ensureArrangementsSection`
- `upsertPatternLayer`
- `normalizePatternStack`

### `src/features/patterns/pattern-insertions.js`

Responsibilities:

- block insertion into a pattern file
- arrangement insertion into a pattern file
- shared orchestration around editor/file transforms

### `src/features/patterns/pattern-controller.js`

Responsibilities:

- load pattern
- save current pattern
- create new pattern
- rename pattern
- delete pattern

### `src/features/patterns/pattern-list.js`

Responsibilities:

- fetch and normalize pattern list
- render pattern list
- update active-state visuals
- expose `refreshPatternListActiveState`

### `src/features/patterns/pattern-editor.js`

Responsibilities:

- `fileToEditor`
- `editorToFile`
- validation helpers
- autosave wiring

### `src/features/patterns/pattern-meta.js`

Responsibilities:

- load/save pattern metadata
- pattern-specific advanced settings support

### `src/features/arrangements/arrangement-controller.js`

Responsibilities:

- load arrangement
- save current arrangement
- create new arrangement
- rename arrangement
- delete arrangement

### `src/features/arrangements/arrangement-list.js`

Responsibilities:

- fetch and normalize arrangement list
- render arrangement list
- scope folder visuals
- arrangement display-name updates

### `src/features/arrangements/arrangement-workspace.js`

Responsibilities:

- arrangement workspace rendering
- row editing
- block chip interactions
- workspace playhead visuals
- preview button state in workspace

### `src/features/arrangements/arrangement-persistence.js`

Responsibilities:

- arrangement draft payload builders
- autosave scheduling
- unsaved recovery
- localStorage backups

### `src/features/arrangements/arrangement-preview.js`

Responsibilities:

- arrangement preview preparation
- block resolution for preview
- arrangement preview state updates
- arrangement export context building

### `src/features/blocks/block-library.js`

Responsibilities:

- blocks library refresh and rendering
- block display name updates
- block reference lookups

### `src/features/blocks/block-controller.js`

Responsibilities:

- untitled block creation flow
- block deletion support
- block save/duplicate listeners now defined at the bottom of `repl-app.js`

### `src/features/tracker/tracker-controller.js`

Responsibilities:

- initialize tracker with instruments
- open tracker
- open tracker for edit
- setup tracker event listeners

### `src/features/tracker/tracker-workspace.js`

Responsibilities:

- dock tracker into arrangement workspace
- undock tracker
- render tracker workspace

### `src/features/tracker/tracker-preview-sync.js`

Responsibilities:

- tracker preview reference context
- tracker preview instrument refresh scheduling
- tracker autosave scheduling
- live override coordination

### `src/features/playback/playback-controller.js`

Responsibilities:

- Strudel play/stop toggling
- play button state
- playback state helpers
- exported `isStrudelPlaybackActive`

### `src/features/playback/export-preview.js`

Responsibilities:

- generated song preview data
- preview player button state
- JSON/JS modal presentation

### `src/features/playback/export-settings.js`

Responsibilities:

- playback mix settings
- WAV export settings
- export settings modal state
- loudness presets and snapshot helpers

### `src/features/playback/export-actions.js`

Responsibilities:

- pattern export actions
- arrangement export actions
- WAV export actions
- export length and size estimates

### `src/features/project/bundle-utils.js`

Responsibilities:

- bundle parsing helpers
- source builders for blocks and arrangements
- zip path normalization

### `src/features/project/project-export.js`

Responsibilities:

- project download flow
- instrument file export support

### `src/features/project/project-import.js`

Responsibilities:

- upload bundle parsing
- validation
- import application flow
- upload modal state

### `src/features/settings/theme-controller.js`

Responsibilities:

- theme sync with Strudel/CodeMirror
- theme color picker logic
- theme reset/copy/apply flows

### `src/features/settings/advanced-settings.js`

Responsibilities:

- open/close advanced settings modal
- apply advanced scope/settings changes

### `src/features/settings/external-links.js`

Responsibilities:

- external link interception
- external link confirmation modal flow

### `src/features/ui/view-switching.js`

Responsibilities:

- welcome/editor/arrangement view switching
- sidebar-title behavior
- tracker docking helpers if not moved to tracker workspace

## Phased Implementation Plan

### Phase 1: Entry Point Preparation

1. Rename `src/repl-app.js` to `src/main.js`.
2. Update `index.html` to load `src/main.js`.
3. Remove direct imports of app helpers from `instrument-ui.js` by extracting the four functions it currently consumes.

Acceptance criteria:

- app boots from `src/main.js`
- no module still imports `./repl-app.js`

### Phase 2: Shared Foundations

1. Extract `src/app/dom.js`.
2. Extract `src/app/state.js`.
3. Extract `src/features/ui/status-bar.js`.
4. Extract `src/features/settings/dev-mode.js`.
5. Extract `src/features/ui/touch-activation.js`.
6. Extract `src/app/api.js` for common `fetch` calls where practical.

Acceptance criteria:

- startup still works
- state is still readable/writable from feature modules
- no behavior change in status messages or dev mode UI

### Phase 3: Shared Code Transform Helpers

1. Move duplicated pattern insertion helpers into `src/shared/code-transform-utils.js`.
2. Extract pattern insertion orchestration into `src/features/patterns/pattern-insertions.js`.
3. Replace inline duplicated logic in block and arrangement insertion flows.

Acceptance criteria:

- block insertion still works
- arrangement insertion still works
- generated code output remains stable

### Phase 4: Settings, Shell, and Import/Export

1. Extract theme, advanced settings, and external-link handling.
2. Extract project import/export modules.
3. Extract generic shell UI helpers as needed.

Acceptance criteria:

- theme controls still work
- upload/download project flows still work
- no regressions in modal behavior

### Phase 5: Pattern and Arrangement Lists

1. Extract pattern list/controller/editor/meta modules.
2. Extract arrangement list/controller modules.
3. Keep `main.js` responsible only for wiring these setup functions together.

Acceptance criteria:

- pattern load/save/create/rename/delete still work
- arrangement load/save/create/rename/delete still work
- active list states remain correct

### Phase 6: Arrangement Workspace

1. Extract arrangement persistence helpers.
2. Extract arrangement workspace rendering and interactions.
3. Extract arrangement preview preparation logic.

Acceptance criteria:

- arrangement workspace still renders correctly
- row edits, block chips, and row reordering still work
- arrangement preview still follows current behavior

### Phase 7: Tracker and Blocks Integration

1. Extract tracker controller and workspace modules.
2. Extract tracker preview sync/autosave/live override logic.
3. Extract block library/controller logic.
4. Keep cross-feature event wiring narrow and explicit.

Acceptance criteria:

- tracker opens and edits blocks correctly
- tracker preview and arrangement preview still coordinate correctly
- block creation/update/duplicate flows still work

### Phase 8: Cleanup and Consolidation

1. Remove dead helpers and duplicate state access paths.
2. Standardize imports and naming.
3. Confirm `main.js` is a thin orchestration file.

Acceptance criteria:

- `main.js` is clearly smaller and less feature-heavy
- no duplicate helpers remain in extracted modules

## Verification Checklist

Run this checklist after each phase that touches related behavior:

- app boot
- theme initialization
- developer mode toggle
- pattern list renders
- arrangement list renders
- pattern load/save
- arrangement load/save
- tracker open/edit/save
- block create/update/duplicate/delete
- block insertion into pattern
- arrangement insertion into pattern
- arrangement preview
- tracker preview
- project download/upload
- advanced settings modal

## Implementation Risks

- Hidden coupling through shared mutable state.
- Cross-feature event handlers that assume globals remain local.
- Refactor drift where `main.js` stays monolithic under a new filename.
- Regressions in arrangement workspace and tracker coordination due to high interaction density.

## Risk Mitigation

- Refactor in small slices.
- Verify behavior after each phase.
- Extract shared helpers before moving the hardest feature modules.
- Avoid mixing structural refactors with feature changes.

## TypeScript Follow-Up

TypeScript should be treated as a second stage after this JS refactor stabilizes.

Recommended order:

1. shared helper modules
2. app state and API response types
3. playback/export data structures
4. arrangement and tracker shared data shapes
5. UI/controller modules
6. entrypoint last, if still useful

Priority types to define first:

- arrangement state
- tracker state
- block metadata
- pattern metadata
- export settings
- preview context
- custom event payloads

## Success Criteria

The refactor is complete when:

- `src/main.js` is the app entrypoint and composition root.
- the major feature areas have clear module ownership.
- `instrument-ui.js` no longer imports from the app entrypoint.
- duplicated code transform logic is centralized.
- the app behavior matches current behavior closely.
- the resulting structure supports gradual TypeScript adoption.
