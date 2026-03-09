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
