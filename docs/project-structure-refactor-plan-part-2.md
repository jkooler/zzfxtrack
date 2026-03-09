# Project Structure Refactor Plan Part 2

Status: In progress  
Created: 2026-03-09  
Depends on: `docs/project-structure-refactor-plan.md`

## Current State Snapshot

Completed so far:

1. `src/repl-app.js` renamed to `src/main.js`.
2. `index.html` entry script updated to `/src/main.js`.
3. `instrument-ui` dependency on entrypoint removed.
4. Extracted modules:
   - `src/features/instruments/instrument-runtime.js`
   - `src/features/instruments/instrument-reference-sync.js`
   - `src/features/patterns/pattern-list.js` (active-state helper + configuration)
   - `src/features/playback/playback-controller.js` (playback-active helper + configuration)
   - `src/app/dom.js`
   - `src/features/settings/dev-mode.js`
   - `src/features/ui/status-bar.js`
   - `src/features/ui/touch-activation.js`
   - `src/app/state.js` (initial fields only)
5. Build validation currently passes with `npx vite build`.

Open constraints:

- `src/main.js` is still feature-heavy and should continue shrinking.
- `src/app/state.js` currently tracks only a subset of global state.
- Large logic duplication remains in insertion and source-transform flows.

Agent's comment:

Added remaining-step doc: project-structure-refactor-plan-part-2.md.
Expanded appState and migrated these fields out of main locals:
currentPatternScope, currentArrangementScope
patternEntriesCache, arrangementEntriesCache
arrangementDraftState, blocksLibraryCache, activeArrangementBlockFilename
Added API layer file: api.js and migrated a larger first+second batch of calls in main.js:
list/get/create/save/delete/rename for arrangements
list/get/save/delete/rename + meta read/write for patterns
list blocks (safe read path)
Validation:

npx vite build passes after each migration batch.

You should continue next with the remaining direct /api/* calls in main.js and then start extracting shared code-transform helpers unless you want to reprioritize.

## Remaining Refactor Steps

## Phase A: Finish Core App Foundations

1. Expand `src/app/state.js` in controlled slices:
   - Slice A1: pattern and arrangement scope + entry caches.
   - Slice A2: arrangement workspace mutable state (`arrangementDraftState`, `activeArrangementBlockFilename`, `blocksLibraryCache`).
   - Slice A3: preview/session state (`arrangementPreviewContext`, `arrangementLiveEditSession`, related timers/tokens).
   - Slice A4: export-related state (`lastExportedData`, `lastExportedMeta`, `lastExportedContext`, `songDataViewMode`).
2. Extract `src/app/api.js` with wrappers for:
   - patterns list/detail/save/meta/delete/rename
   - arrangements list/detail/save/delete/rename
   - blocks list/detail/save/update/delete
   - shared response and error handling helpers
3. Replace direct `fetch('/api/...')` calls in `main.js` with API module calls incrementally.
4. Keep current behavior for headers and developer mode handling.

Exit criteria:

- `main.js` no longer contains raw API endpoint strings except temporary adapters.
- Shared state mutations happen through `appState`.

## Phase B: Shared Helpers and Duplication Removal

1. Create `src/shared/code-transform-utils.js`.
2. Move duplicated parser and insertion helpers used in:
   - block insert flow
   - arrangement insert flow
3. Keep all transformations behavior-preserving:
   - stack append behavior
   - stack normalization
   - section injection (`BLOCKS`/`ARRANGEMENTS`)

Exit criteria:

- No duplicated implementations of `findMatchingParen`, `parseTopLevelArgs`, `upsertPatternLayer`, `normalizePatternStack` in `main.js`.

## Phase C: Pattern Modules

1. Extract `src/features/patterns/pattern-controller.js`:
   - load/save/create/rename/delete
2. Extract `src/features/patterns/pattern-editor.js`:
   - file/editor transforms
   - autosave setup
   - validation hooks
3. Keep `src/features/patterns/pattern-list.js` focused on list rendering and active-state behavior.
4. Add `src/features/patterns/pattern-meta.js` for pattern metadata and scope-related utilities.

Exit criteria:

- `main.js` calls setup/controller methods instead of owning pattern lifecycle details.

## Phase D: Arrangement Modules

1. Extract `src/features/arrangements/arrangement-controller.js`:
   - load/save/create/rename/delete
2. Extract `src/features/arrangements/arrangement-list.js`:
   - list loading, sorting, active-state updates
3. Extract `src/features/arrangements/arrangement-persistence.js`:
   - autosave, payload builders, recovery
4. Extract `src/features/arrangements/arrangement-workspace.js`:
   - rendering + interactions
5. Extract `src/features/arrangements/arrangement-preview.js`:
   - preview preparation and runtime update paths

Exit criteria:

- Arrangement workspace and preview are no longer implemented inline in `main.js`.

## Phase E: Tracker and Blocks Integration

1. Extract `src/features/tracker/tracker-controller.js`.
2. Extract `src/features/tracker/tracker-workspace.js`.
3. Extract `src/features/tracker/tracker-preview-sync.js`.
4. Extract `src/features/blocks/block-library.js`.
5. Extract `src/features/blocks/block-controller.js`.

Exit criteria:

- Tracker open/edit/save/preview wiring is encapsulated and called from `main.js`.
- Block library state and operations are not mixed with arrangement workspace code.

## Phase F: Playback, Export, Project I/O

1. Expand playback module split:
   - `playback-controller.js`
   - `export-preview.js`
   - `export-settings.js`
   - `export-actions.js`
2. Create project I/O modules:
   - `project-import.js`
   - `project-export.js`
   - `bundle-utils.js`
3. Ensure status and error messaging remain consistent.

Exit criteria:

- `main.js` no longer owns import/export implementation details.

## Phase G: Settings and Shell UI

1. Extract:
   - `settings/theme-controller.js`
   - `settings/advanced-settings.js`
   - `settings/external-links.js`
   - `ui/view-switching.js`
2. Keep shell-level behavior stable:
   - welcome/editor/arrangement transitions
   - modal open/close wiring
   - toolbar/dev-mode indicators

Exit criteria:

- Settings and shell behavior are modular, with `main.js` as composition only.

## Phase H: Consolidation and Cleanup

1. Remove dead code and leftover compatibility shims.
2. Normalize import paths and naming.
3. Add/refresh docs references from `repl-app.js` to `main.js` where needed.
4. Final pass for accidental cross-feature coupling.

Exit criteria:

- `main.js` is substantially smaller and orchestrator-focused.
- Ownership boundaries are clear across modules.

## Validation Strategy

Run after each phase:

1. `npx vite build`
2. Manual smoke checklist:
   - app boot
   - pattern load/save/rename/delete
   - arrangement load/save/rename/delete
   - tracker open/edit/save
   - block create/update/delete/duplicate
   - block insert into pattern
   - arrangement insert into pattern
   - arrangement preview
   - tracker preview
   - project download/upload
   - settings and modals

## TypeScript Follow-Up (After Refactor Stabilizes)

Order:

1. `shared/*`
2. `app/state` + API response types
3. playback/export data types
4. arrangement/tracker state types
5. UI/controller modules
6. `main` last

Key initial type targets:

- arrangement state
- tracker state
- block metadata
- pattern metadata
- export settings
- preview context
- custom event payloads
