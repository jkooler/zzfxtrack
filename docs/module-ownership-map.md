# Module Ownership Map

This document is a quick handoff reference for the refactored architecture.

## App Core

- `src/main.js` - Composition root: wires modules, shared state, events, and startup flow.
- `src/app/dom.js` - Centralized DOM element registry for app-wide UI access.
- `src/app/state.js` - Shared mutable application state container.
- `src/app/api.js` - Client API wrappers for patterns, blocks, arrangements, and export persistence.

## Shared Utilities

- `src/shared/code-transform-utils.js` - Reusable code transformation helpers for pattern/block/arrangement source editing.
- `src/shared/formatters.js` - Small shared formatting helpers used across features.

## Feature Modules

### Patterns

- `src/features/patterns/pattern-list.js` - Pattern list loading/rendering and active state.
- `src/features/patterns/pattern-controller.js` - Pattern lifecycle actions (load/create/rename/delete/save).
- `src/features/patterns/pattern-editor.js` - Editor/file transforms, autosave, export validation hooks.
- `src/features/patterns/pattern-meta.js` - Pattern metadata and scope-related helpers.

### Arrangements

- `src/features/arrangements/arrangement-list.js` - Arrangement list rendering, sorting, and active state.
- `src/features/arrangements/arrangement-controller.js` - Arrangement lifecycle actions and modal operations.
- `src/features/arrangements/arrangement-persistence.js` - Arrangement payloads, autosave, recovery helpers.
- `src/features/arrangements/arrangement-workspace.js` - Arrangement workspace rendering/interactions/playhead visuals.
- `src/features/arrangements/arrangement-preview.js` - Preview prime/scheduling helpers and orchestration.
- `src/features/arrangements/arrangement-preview-runtime.js` - Runtime preview context updates and playback alias sync.
- `src/features/arrangements/arrangement-preview-events.js` - Event-driven arrangement preview orchestration.
- `src/features/arrangements/arrangement-export-context.js` - Builds arrangement export context and instrument usage data.

### Tracker

- `src/features/tracker/tracker-controller.js` - Tracker open/edit/save flows and autosave coordination.
- `src/features/tracker/tracker-workspace.js` - Tracker workspace mount/dock rendering behavior.
- `src/features/tracker/tracker-preview-sync.js` - Tracker preview context/instrument refresh synchronization.

### Blocks

- `src/features/blocks/block-library.js` - Block library cache/render/refresh behavior.
- `src/features/blocks/block-controller.js` - Block lifecycle operations and event wiring.

### Playback / Export

- `src/features/playback/playback-controller.js` - Playback helpers and shared playback state wiring.
- `src/features/playback/export-actions.js` - Export warning/estimation/formatting helpers.
- `src/features/playback/export-settings.js` - Export settings modal behavior and settings normalization.
- `src/features/playback/export-preview.js` - Export JSON/JS preview rendering and controls.
- `src/features/playback/export-wav.js` - WAV export utilities and pattern/arrangement WAV generation.
- `src/features/playback/export-execution.js` - Pattern/arrangement export execution orchestration.

### Project I/O

- `src/features/project/bundle-utils.js` - Bundle parsing/validation/source conversion helpers.
- `src/features/project/project-export.js` - Project bundle download flow.
- `src/features/project/project-import.js` - Project bundle upload/import flow.

### Settings / Shell UI

- `src/features/settings/dev-mode.js` - Developer mode state, UI visibility, and related guards.
- `src/features/settings/theme-controller.js` - Initial theme bootstrap and legacy theme migration.
- `src/features/settings/external-links.js` - External link interception/confirmation modal behavior.
- `src/features/settings/advanced-settings.js` - Advanced settings modal orchestration and scope updates.
- `src/features/settings/system-settings.js` - System settings modal, theme controls, and REPL theme sync.
- `src/features/ui/view-switching.js` - Main view switching (welcome/editor/arrangement) and export menu controls.
- `src/features/ui/static-modals.js` - About/license/changelog/technical/demo modal wiring.
- `src/features/ui/status-bar.js` - Footer status rendering and icon/status behavior.
- `src/features/ui/touch-activation.js` - Touch-specific list activation behavior.

## Deferred Product Bugs

Deferred product issues are tracked separately in:

- `bugfixes-after-project-structure-refactor.md`
