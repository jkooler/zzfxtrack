# New Inclusive Blocks UI (Arrangements Workspace)

Status: Draft (created 2026-02-23)

## Summary

Evolve “Blocks” from a modal-first workflow into a first-class **arrangements workspace** that lives alongside Strudel patterns and Instruments.

- **Strudel patterns** remain Strudel-REPL-centric and keep the existing modal flow for inserting blocks/arrangements into a pattern (header button, renamed to **“+ Insert Blocks”**).
- **Arrangements** become their own editable artifact with a dedicated UI: **arranger editor + tracker side-by-side**, plus a **global block library** in a right sidebar.
- **Instruments** tab continues to behave as it does today (changes the list in the left sidebar; does not force a main-view switch).

This design is selection-driven (no explicit “mode” toggle): selecting a pattern shows the REPL; selecting an Arrangement shows the arrangements workspace.

---

## Goals

1. **Selection-driven main view**
   - Click Strudel pattern ⇒ show Strudel REPL view.
   - Click Arrangement ⇒ show Arranger+Tracker workspace.
   - Switching between Pattern/Arrangement stops any playback.

2. **Arrangements workspace layout**
   - Left sidebar: existing tabs **Patterns / Arranger / Instruments**.
   - Main view (only when an arrangement is selected): **40% arranger / 60% tracker**.
   - Right sidebar: **global block library** (create/open/delete blocks).
   - Instrument editor panel stays where it is today: when opened it sits between left sidebar and main view.

3. **Autosave-first**
   - Arrangement saves on any structural/name/BPM change (same mental model Strudel pattern rename/autosave).
   - Tracker saves with **200ms debounce**.
   - Add before-unload flush + close-confirmation when a debounced save is pending.

4. **Safety**
   - Example arrangements/blocks are **hard locked** (no edits).
   - Block deletion is **blocked** if the block is used by any arrangement(s) (must list the referencing arrangements in the dialog).

---

## Non-goals (v1)

- Responsive/mobile layout decisions (assume desktop-first; revisit later).
- Detachable “multi-target tracker” (single active block at a time).
- “Create user copy” UX for example resources (defer placement/flow).
- Full export-from-arrangements UX (may be added later; keep architecture open).

---

## UX Spec

### Left sidebar tabs

- Tabs: **Patterns / Arranger / Instruments**
- Tabs change *what list is visible*, not the main view.

**Blocks tab**
- Shows arrangements list with the same structure/behavior as patterns list today:
  - User/Examples folder grouping (scope-aware)
  - Active row highlight
  - Delete affordance only when deletable (not examples)
  - “New arrangement” button opens a name dialog (like New pattern)
  - Note: Clicking the item will not start playback, so that is also identical how it's in the patterns

### Main view switching (selection-driven)

**If a pattern is selected**
- Show current REPL view.
- Header is visible (including **+ Insert Blocks** button).

**If an Arrangement is selected**
- Hide the REPL header (and thus the + Insert Blocks button).
- Show arrangements workspace:
  - Arranger (left pane, 40%)
  - Tracker (right pane, 60%)
  - Global block library (right sidebar)
- Tracker is empty until:
  - a block chip is selected in the arranger, or
  - the user creates/adds a block.

### Playback rules

- Only one playback source at a time (Pattern OR Arrangement preview).
- On switching Pattern⇔Arrangement selection:
  - stop Strudel playback (if playing)
  - stop tracker preview / arrangement preview (if playing)
- Additionally:
  - In the new arrangement + tracker view. If user clicks the tracker's play button, it will stop the arrangement playback if it's playing and vice versa.

### Block creation + naming

- “Create new block” from arranger or from block library:
  - initializes tracker with name `Untitled-n` (auto-increment per session; persisted by save)
  - encourages renaming via tracker’s name input

### Deletion rules

- Deleting a block:
  - If referenced by any arrangement(s): **block deletion**.
  - Confirmation dialog includes: “Used in arrangements: …” listing arrangement names (and filenames for debugging).

---

## Data / State Model

### Global selection state (in the app shell)

- `selectedPattern`: `{ filename, scope } | null`
- `selectedArrangement`: `{ filename, scope } | null`
- `selectedBlock`: `{ filename, scope } | null` (the block currently loaded into tracker)

Invariant: `selectedPattern` and `selectedArrangement` are mutually exclusive.

### Arrangement model (existing)

Arrangements already serialize as `arrangementState`:

- `version`
- `name`
- `bpm`
- `rows[]: { repeats, blocks[] (filenames) }`

### Block model (existing)

Blocks are stored as separate modules:

- `name`
- `description`
- `pattern`
- optional `trackerState`
- `scope`

---

## Autosave + Unload Handling

### Autosave

- Arrangement:
  - Save immediately on any change (rows/chips/repeats/BPM/name), with a small debounce if needed to avoid request storms (start with 0–100ms).
  - LocalStorage backup for resilience (same approach as patterns: `unsaved_<resource>`).

- Block (tracker):
  - Save with **200ms debounce** on edits.
  - LocalStorage backup per block.

### Before-unload flush + confirmation

Use the shared unload handler (`src/unload.js`) to:

- flush any pending debounced saves on `beforeunload`
- trigger the browser’s native “Do you want to leave?” prompt when there is a pending save

Notes:
- Browsers do not allow custom text anymore; this is a generic confirmation prompt.
- The prompt may be suppressed in some cases; flush should still run.

---

## API / Backend Updates (Vite middleware)

Current endpoints exist:
- `/api/arrangements` (GET, POST)
- `/api/arrangements/:filename` (GET, PUT, DELETE)
- `/api/blocks` (GET, POST)
- `/api/blocks/:filename` (GET, PUT, DELETE)

### Required for safe block deletion

Add server-side enforcement so deletion cannot happen even if UI is bypassed:

- On `DELETE /api/blocks/:filename`:
  - scan all arrangements for references to the block filename
  - if referenced: respond `409` (Conflict) with JSON payload like:
    - `{ error: 'Block is used', usedBy: [{ filename, name, scope }] }`

Client should use the payload to render the confirmation message.

---

## Architecture / Refactor Strategy

The current arrangements and blocks UIs live inside `blocksModal` (`src/blocks.js` + `index.html` modal markup).

To ship incrementally and keep risk low:

1. **Keep the existing modal insertion flow** for Patterns (now labeled **+ Insert Blocks**).
2. Build the new arrangements workspace as new UI surfaces, reusing as much rendering and state logic from `src/blocks.js` and `src/tracker.js` as possible.
3. Only after parity is reached, consider extracting shared “arranger editor” logic out of `src/blocks.js`.

---

## Implementation Phases

### Phase 0 — Prep + plumbing

- Add app-level selection state for `selectedArrangement`.
- Centralize playback stopping when selection changes.
- Add unload-flush registration for arrangements and blocks (parallel to patterns).

Likely files:
- `src/repl-app.js` (selection, playback stop, autosave flush registration)
- `src/unload.js` (already exists; extend usage)

### Phase 1 — Left sidebar: arrangements list (Blocks tab)

- Add “Blocks” tab button and list container in sidebar.
- Implement arrangements list rendering to match patterns UX:
  - scope grouping (User/Examples)
  - delete button where allowed
  - create arrangement (name dialog)
  - select arrangement (sets `selectedArrangement`, clears `selectedPattern`)

Likely files:
- `index.html` (sidebar tabs and list containers)
- `src/repl-app.js` (render + events)
- `style.css` (minor tab layout updates)

### Phase 2 — Arrangements workspace container (main view)

- Add a new main-view container for the workspace.
- Toggle REPL view vs workspace view based on selection.
- Hide the REPL header when workspace is active.
- Implement a 40/60 split layout for arranger/tracker panes.

Likely files:
- `index.html` (workspace DOM)
- `style.css` (grid/split layout)
- `src/repl-app.js` (view switching)

### Phase 3 — Arranger pane (reuse existing arranger editor)

- Move/duplicate arranger editor UI from the modal into the new pane.
- Ensure preview controls work unchanged.
- Ensure any edit emits `arrangements:stateChanged` and triggers autosave.

Likely files:
- `src/blocks.js` (extract “arranger editor” functions or expose a mount API)
- (or) new `src/arranger-ui.js` (mounted into the pane)

### Phase 4 — Tracker pane (inline, not modal)

- Render tracker permanently in the workspace pane.
- Tracker starts empty; selecting a chip or library block loads it.
- Editing triggers:
  - `tracker:stateChanged` (already exists) for live arrangement preview updates
  - autosave for the active block (200ms debounce)

Likely files:
- `src/tracker.js` (support “inline open” vs modal open)
- `index.html` (tracker container)

### Phase 5 — Right sidebar: global block library

- Blocks list styled like Patterns/Arrangements lists.
- Actions:
  - create block (Untitled-n)
  - open block (loads into tracker)
  - delete block (blocked if used by arrangements; show list)

Likely files:
- `index.html` (right sidebar markup)
- new `src/blocks-library-ui.js` (render + events)
- `vite.config.js` (DELETE enforcement + usedBy payload)

### Phase 6 — Parity + cleanup

- Keep modal insertion flow intact for patterns.
- Update labels/tooltips/shortcuts for clarity.
- Add/verify autosave status feedback for arrangements/blocks.
- Manual QA pass (see below).

---

## Manual QA Checklist

1. Select pattern; play; switch to arrangement ⇒ playback stops.
2. Select arrangement; preview; switch to pattern ⇒ preview stops.
3. Edit arrangement name/BPM/rows ⇒ autosaves (and survives refresh).
4. Select chip ⇒ tracker loads correct block; edits autosave with 200ms debounce.
5. Create new block from arranger ⇒ appears as Untitled-n; rename in tracker; arrangement reflects updated name.
6. Attempt delete block used in an arrangement ⇒ blocked + list of arrangements shown.
7. Close tab immediately after edits ⇒ browser prompt appears (when save pending) and server receives final save best-effort.

---

## Open Questions / Future Work

- Where to place “Create user copy” for examples (context menu vs header action).
- Export-from-arrangements UX (direct export without inserting to a pattern).
- Responsive/narrow layout behavior.
- Potential “detached edits” (browse/edit blocks without changing the current arranger selection).
