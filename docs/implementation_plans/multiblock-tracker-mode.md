# Multiblock Tracker Mode

Status: Draft  
Created: 2026-03-14

## Context

The arrangement workspace currently requires block-by-block editing.

That works, but it creates flow friction when a user wants to edit a musical phrase that spans multiple adjacent blocks in one arrangement row.

Typical pain points:

- the user has to open blocks individually
- moving from one block to the next requires extra clicks and context switches
- block boundaries are part of the storage model, but not always the most natural editing unit for the user

The proposed feature is a stitched tracker view for one arrangement row at a time.

## Core Idea

When multiblock mode is enabled, clicking a block in an arrangement row should open the tracker as a stitched horizontal view of all blocks in that row.

Important constraints:

- only one arrangement row is edited at a time
- block boundaries must remain visible
- the app does not pretend the underlying block model changed
- active block context follows focused ownership, not a separate persistent selection highlight

## Goals

1. Reduce block-to-block editing friction in arrangement workflows.
2. Let users edit a row as one musically continuous timeline.
3. Preserve clear ownership of edits back to the correct block.
4. Keep the current single-block workflow available.
5. Make the mode explicit and understandable.

## Non-Goals

- replacing normal single-block editing
- hiding block boundaries completely
- editing multiple arrangement rows at once
- introducing arrangement-local block overrides in this phase
- redesigning block persistence rules

## Architecture Reality

The current tracker implementation is a single-block editor.

It has:

- one global tracker state object
- one rendered tracker grid
- one active block context
- one autosave/save pipeline
- one set of focus and keyboard handlers

That means true stitched multiblock editing is not a small extension of the existing tracker modal.

Important implication:

- showing all blocks side by side in one continuous tracker view will require either:
  - a dedicated stitched tracker renderer in the arrangement workspace
  - or a substantial refactor of the existing tracker so it can host multiple block segments at once

Recommendation:

- do not treat this as a small UI tweak
- implement it incrementally with explicit technical phases
- keep the current single-block tracker stable while the stitched surface is introduced

## User Experience Summary

### Entry Point

Add a multiblock mode toggle in the arranger header, next to the arrangement settings button.

Behavior:

- when toggle is off:
  - current behavior stays unchanged
- when toggle is on:
  - clicking a block in an arrangement row opens stitched tracker editing for that row

This makes the feature explicit before the user enters it.

### Editing Scope

Multiblock editing always targets one arrangement row at a time.

The selected arrangement row becomes the active editing row.

### Visual Model

In multiblock mode:

- all blocks from the active arrangement row are shown side by side in the tracker
- block boundaries remain visible
- for the first version, boundaries are shown by horizontal gaps between blocks
- there is no persistent selected-block highlight
- the active arrangement row container receives `input-bg` styling to show that it is the row currently being edited

### Ownership Model

The currently focused tracker cell determines the active block context.

That means when focus moves across block boundaries:

- the tracker header updates to the block that owns the focused cell
- block name field updates accordingly
- block actions and any block-specific controls update accordingly

This keeps the data model honest while allowing continuous editing.

## Interaction Rules

### Rule 1: Mode Toggle

The multiblock tracker is opt-in.

Suggested control:

- toggle button in arranger header
- placed next to the arrangement settings button

Rationale:

- this is a workspace mode, not a hidden shortcut
- the user should know they are entering a different editing mode

### Rule 2: Row Selection

The arrangement row is the editing target, not an individual block.

When multiblock mode is on and a block is clicked:

- the containing arrangement row becomes the active row
- the tracker opens stitched editing for that row

### Rule 3: Block Boundaries Stay Visible

The stitched tracker should not visually erase the fact that blocks are separate resources.

First-version boundary treatment:

- add visible horizontal gap between adjacent blocks

Possible later enhancements, if needed:

- block labels
- subtle separators
- segment headers

But the first version should stay visually light.

### Rule 4: Focus Determines Active Block

There is no independent persistent selected-block state in the stitched tracker.

Instead:

- the active block is inferred from the currently focused note/cell
- keyboard navigation can move naturally across block boundaries
- when focus enters another block, the header context changes immediately

This avoids three competing selection states:

- selected row
- selected block
- focused note

### Rule 5: Keyboard Navigation Crosses Boundaries

Arrow-key movement should be allowed to move from one block segment into the next.

Cross-boundary navigation should:

- feel continuous in the stitched view
- update active block context immediately when focus changes ownership

### Rule 6: Header Context Follows Focus

When focus changes to a note inside another block segment:

- block name field updates
- block actions update
- any save/settings context updates

The focused note is the source of truth for block ownership.

## Proposed MVP

### Phase 1: Mode and Entry

Add the explicit toggle in the arranger header.

Tasks:

- add multiblock mode toggle UI
- persist toggle state if appropriate, or keep it session-only for the first pass
- keep default off

Deliverable:

- user can turn multiblock mode on or off

### Phase 2: Row Activation Flow

When multiblock mode is on and the user clicks a block in a row:

- identify the row
- mark it as the active arrangement row
- open tracker in stitched-row mode

Deliverable:

- row click path enters multiblock editing for one row

### Phase 3: Row-Context Switching Baseline

Before true stitched rendering, provide a safe baseline that improves flow without changing tracker internals.

Behavior:

- the active arrangement row is stored
- the tracker workspace shows the active row context
- blocks in the row can be switched quickly from the row rail
- row-level highlight replaces selected-block emphasis in multiblock mode

Deliverable:

- row-aware block switching in the arrangement workspace

Note:

- this phase is not the final multiblock tracker
- it exists to improve workflow safely while the stitched surface is designed

### Phase 4: Stitched Tracker Layout

Introduce a dedicated stitched tracker surface in the arrangement workspace instead of trying to force the existing tracker modal to render multiple blocks directly.

Render all blocks of the active row side by side in the tracker workspace.

Requirements:

- visible gap between block segments
- preserve tracker readability
- allow horizontal scrolling
- keep block ownership metadata available per segment

Implementation note:

- this should be a workspace-level renderer driven from tracker state snapshots per block
- the existing tracker modal can remain the authoritative editor logic until the stitched surface reaches parity

Deliverable:

- one-row stitched tracker layout

### Phase 5: Focus Ownership Wiring

Map each visible tracker cell back to its owning block.

Tasks:

- attach ownership metadata per stitched segment/cell
- update header context on focus move
- support cross-block arrow navigation
- ensure focus changes do not destroy or rebuild the whole workspace unexpectedly

Deliverable:

- focused cell correctly drives active block context

### Phase 6: Editing Writeback

Allow edits from the stitched surface to write back to the correct underlying block.

Tasks:

- route note/effect edits to the owning block state
- preserve existing autosave behavior per block
- keep shared-block semantics explicit
- handle switching between stitched view focus and single-block tracker state safely

Deliverable:

- stitched view is not only visual; it edits the real underlying blocks

### Phase 7: Row-Level Visual Feedback

Replace selected-block emphasis with row-level emphasis.

Tasks:

- apply `input-bg` styling to the active arrangement row container
- remove persistent selected-block highlight in multiblock mode

Deliverable:

- clean row-level editing signal

## Delivery Strategy

To avoid destabilizing the current tracker, treat the feature as three distinct delivery levels:

### Level 1: Row Context

- explicit multiblock/combine mode
- active arrangement row
- fast block switching within that row
- row-level highlight

This is useful, low-risk, and can ship independently.

### Level 2: Stitched Viewing Surface

- all blocks of the row shown side by side
- visible boundaries
- horizontal scrolling
- focusable segments

This gives the intended visual model, but may still rely on the existing tracker for some editing operations during development.

### Level 3: Full Stitched Editing

- direct note/effect editing across block boundaries
- focus-owned header context
- cross-block keyboard movement
- per-block save/writeback from one stitched surface

This is the true end-state and should be treated as a larger implementation effort.

## Data Model Considerations

This mode should not change the block storage model.

Edits still write directly to the owning block.

That means:

- if a block is reused elsewhere, editing it here still edits the real shared block
- multiblock mode is a stitched editing surface, not an arrangement-local copy

This must stay true in both implementation and user-facing behavior.

## Risks

### 1. Tracker Singleton Assumptions

The current tracker assumes one block at a time.

Risk:

- trying to stretch it directly into multiblock rendering can create regressions in focus, docking, autosave, and selection behavior

### 2. Focus Ownership Complexity

The stitched surface needs focus to determine active block context.

Risk:

- header context, save target, and keyboard behavior can drift apart if ownership mapping is not explicit and reliable

### 3. Shared Block Semantics

A block may appear in multiple rows or arrangements.

Risk:

- stitched editing can feel row-local even though edits are globally shared to the underlying block

### 4. Repeated Block Instances In One Row

The same block filename may appear more than once in a single row.

Risk:

- instance identity cannot rely on filename alone; row-position/segment identity is also needed

## Open Questions

### 1. Toggle Persistence

Need a product decision:

- session-only toggle
- or persisted preference

Recommendation:

- start persisted if the implementation is simple
- otherwise start session-only and upgrade later

### 2. First True Stitched Step

Need an implementation decision:

- build a stitched read/edit surface in the workspace first
- or refactor the tracker modal itself to become segment-aware

Recommendation:

- build the stitched workspace surface first
- keep the existing tracker modal stable as the source of current editor behavior

### 2. Initial Focus Placement

When the user clicks a block in a row to enter multiblock mode:

- should focus go to the clicked block's first meaningful note cell
- or to its currently last-focused cell if there is remembered state

Recommendation:

- first meaningful cell in the clicked block for MVP

### 3. Blockless Rows

Need a rule for rows with no blocks.

Recommendation:

- clicking empty row area should not enter stitched mode
- require a block click to activate multiblock editing

## Risks

### 1. Ownership Confusion

If the stitched tracker feels too continuous, users may forget they are editing separate reusable blocks.

Mitigation:

- keep visible gaps
- make header context follow focus immediately

### 2. Save/Dirty-State Confusion

If multiple blocks become dirty during one editing session, the UI must still clearly reflect that.

Mitigation:

- preserve existing save state behavior
- ensure the active block context always matches focused ownership

### 3. Layout Complexity

A stitched tracker may grow very wide.

Mitigation:

- support horizontal scrolling from the start
- keep MVP scoped to one row only

### 4. Too Many Simultaneous Signals

Selection, focus, row activation, and block ownership can become visually noisy.

Mitigation:

- row highlight only
- no persistent selected-block highlight
- use focus as the strongest local signal

## Acceptance Criteria

Minimum success for the MVP:

1. User can toggle multiblock mode on and off from the arranger header.
2. With multiblock mode on, clicking a block opens stitched editing for that row.
3. Tracker shows all blocks in the row side by side with visible gaps.
4. Keyboard navigation can move across block boundaries.
5. Focused cell determines active block header context.
6. Active arrangement row is visually highlighted with `input-bg`.
7. Turning multiblock mode off restores current behavior cleanly.

## Suggested Source Areas

- arrangement workspace:
  - `src/features/arrangements/arrangement-workspace.js`
- legacy arranger interactions:
  - `src/blocks.js`
- tracker workspace / tracker ownership behavior:
  - `src/features/tracker/tracker-workspace.js`
  - `src/tracker.js`
- styling:
  - `style.css`
- workspace header UI:
  - `index.html`

## Recommended Order

1. define explicit toggle and activation state
2. implement stitched row rendering shell
3. add visible gaps between block segments
4. wire focused-cell ownership
5. update header context on boundary crossing
6. add row-level visual treatment
7. test keyboard navigation and save behavior

## Decision Rule

If the stitched mode becomes hard to reason about without heavier ownership UI, stop at a lightweight prototype and reassess before making it a default workflow.

The value of this feature comes from lowering editing friction, not from hiding the block model.
