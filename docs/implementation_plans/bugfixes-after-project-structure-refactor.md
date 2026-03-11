# Bugfix Regression Checklist After Project Structure Refactor

Status: Pending manual verification  
Last audited: 2026-03-11

This document no longer tracks open implementation work. The codebase has moved past the original deferred-bug snapshot, so the useful remaining task is to verify the behaviors in browser and either close or reopen them as concrete regressions.

## 1) Insert Blocks -> newly added arrangement row blocks do not preview

Original concern:

- Add a new arrangement row and place blocks into it.
- Arrangement preview did not immediately include the new row content.

Current code signals:

- Arrangement preview now reacts to `arrangements:stateChanged`.
- Added-row and added-block changes explicitly clear live overrides before preview update.
- Workspace and preview event handling now live in dedicated arrangement modules.

Relevant code:

- `src/features/arrangements/arrangement-preview-events.js`
- `src/features/arrangements/arrangement-workspace.js`

Manual verification:

- Create an arrangement.
- Add a new row.
- Add one or more blocks to that row.
- Start or continue arrangement preview.
- Confirm the new row is audible immediately without reopening anything.

Status call:

- Likely addressed in code, but not yet verified end-to-end.

## 2) Export channel limit appears ineffective

Original concern:

- Enabling `Limit channels` did not appear to change exported output behavior.

Current code signals:

- Export UI passes `maxVoicesPerInstrument` from export settings.
- Chord-aware export logic enforces voice allocation limits and counts dropped notes.
- Export status now reports channel count and dropped-note stats.

Relevant code:

- `src/features/playback/export-execution.js`
- `src/export-logic.js`

Manual verification:

- Export one pattern with `Limit channels` disabled.
- Export the same pattern with `Limit channels` enabled at a small value.
- Confirm channel count changes and, when expected, dropped-note stats appear.

Status call:

- Very likely fixed in code. Verify once, then close this item.

## 3) Arrangement preview uses stale block content after block edit/save

Original concern:

- Edit and save a block.
- Switch back to arrangement preview.
- Preview could continue using stale tracker state until another action forced refresh.

Current code signals:

- Tracker autosave refreshes blocks library cache.
- Arrangement preview prefers fresher in-memory block tracker state when available.
- Arrangement preview context and workspace state now have dedicated sync/update paths.

Relevant code:

- `src/features/tracker/tracker-controller.js`
- `src/features/arrangements/arrangement-preview-events.js`
- `src/features/tracker/tracker-preview-sync.js`

Manual verification:

- Open a block from arrangement context.
- Edit notes and wait for autosave.
- Return focus to arrangement preview.
- Confirm the changed block content is audible immediately.

Status call:

- Likely addressed indirectly by newer cache and preview-sync behavior, but still needs runtime verification.

## Closeout Rule

After one focused manual pass:

- If all three behaviors pass, archive this doc or mark it closed.
- If any behavior still fails, replace the section with a concrete reproduction and current file ownership.

## Archived Original Version

~~~markdown
# Bugfixes After Project Structure Refactor

This list tracks known issues intentionally deferred until after refactor completion.

## 1) Insert Blocks -> Arrangement rows do not play newly added row blocks

- Area: `Insert Blocks` modal, `Arrangement` tab
- Observed behavior:
  - Add a new arrangement row and add blocks to it.
  - Preview playback does not play blocks from that newly added row.
- Expected behavior:
  - Any row added in the arrangement should be included in arrangement preview playback immediately.
- Status: Deferred

## 2) Channel limit appears ineffective on export

- Area: Export settings (`Limit channels`)
- Observed behavior:
  - Enabling channel limit does not appear to change the exported output channel behavior.
  - May be a pre-existing issue, but currently still present.
- Expected behavior:
  - Export should enforce configured max channels/voices according to current channel limit setting.
- Status: Deferred

## 3) Insert Blocks stale arrangement preview after block edit/save

- Area: `Insert Blocks` modal -> `Block Library` edit flow -> `Arrangement` preview flow
- Observed behavior:
  - Edit a block in `Block Library` (e.g. add/remove a note) and save.
  - Block preview in library reflects changes.
  - Switch to `Arrangement` tab and preview arrangement using that block.
  - Arrangement preview does not immediately reflect the block edit.
  - Later opening the block from arrangement and returning can make preview catch up.
- Expected behavior:
  - Arrangement preview should immediately use latest saved block content after edit.
- Status: Deferred
~~~
