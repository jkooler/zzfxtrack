# Inclusive Blocks UI - Focused Manual QA (Refresh + Autosave Recovery)

Status: Ready to execute, not yet recorded as run  
Last audited: 2026-03-11

## Scope

Focused validation for the high-risk reliability paths:

1. arrangement autosave + refresh recovery
2. tracker block autosave + refresh recovery
3. beforeunload confirmation + flush behavior
4. block deletion guard when arrangement references exist

## Audit Note

The code paths required for these checks exist today:

- arrangement recovery and autosave
- block recovery and autosave
- beforeunload flush/confirmation
- server-backed block deletion conflict response

What is still missing is execution evidence. Treat this as an active manual QA checklist, not as a completed task.

## Preconditions

- run in non-demo mode
- open the app via `npm run dev`
- use disposable test pattern, arrangement, and block data
- keep DevTools open

## Test Data Setup

1. Create arrangement `qa-arrangement`.
2. Add one new block from the arrangement workspace so `Untitled-n` is created.
3. Rename that block in tracker to `qa-block`.
4. Confirm the arrangement row references the same block.

## Case A - Arrangement autosave

1. Select `qa-arrangement`.
2. Change arrangement name to `qa-arrangement-a`.
3. Change BPM to `137`.
4. Add a new row and set repeats to `2`.
5. Wait 1 second.

Expected:

- arrangement save request succeeds
- reload shows updated name, BPM, rows, and repeats

## Case B - Arrangement refresh recovery from cache

1. Select `qa-arrangement`.
2. Edit name, BPM, or rows quickly.
3. Hard refresh before debounce save finishes.
4. Re-open the same arrangement.

Expected:

- recovery status appears
- arrangement loads with recovered edits
- cache clears after best-effort save

## Case C - Block autosave

1. Open `qa-block` in tracker.
2. Modify notes or pattern content.
3. Wait 1 second.

Expected:

- block save request succeeds after debounce
- re-opening the block preserves edits

## Case D - Block refresh recovery from cache

1. Open `qa-block` in tracker.
2. Make edits.
3. Hard refresh before debounce save finishes.
4. Re-open the same block.

Expected:

- recovery status appears
- tracker opens with recovered state
- cache clears after best-effort save

## Case E - beforeunload confirm + flush

1. Make a pending arrangement edit or tracker edit.
2. Immediately close the tab or window.

Expected:

- browser shows native unload confirmation
- pending save is sent best-effort
- local cache still protects against save failure

## Case F - Block deletion conflict guard

1. Ensure `qa-block` is referenced by `qa-arrangement`.
2. Try deleting `qa-block` from both the sidebar library and blocks modal.

Expected:

- deletion is blocked in both places
- UI explains that the block is used in arrangements
- server responds with `409` and `usedBy`

## Pass Criteria

- all cases A-F pass
- no uncaught console errors during the flow
- no data loss in refresh or close scenarios

## Archived Original Version

~~~markdown
# Inclusive Blocks UI — Focused Manual QA (Refresh + Autosave Recovery)

Status: Ready to execute  
Created: 2026-02-23

## Scope

Focused validation for the remaining high-risk reliability paths:

1. Arrangement autosave + refresh recovery
2. Tracker block autosave + refresh recovery
3. beforeunload confirmation + flush behavior
4. Block deletion guard when arrangement references exist

## Preconditions

- Run in non-demo mode.
- Open the app in a local browser from `npm run dev`.
- Use a test Strudel pattern + test arrangement + test block you can freely edit/delete.
- Keep DevTools open (`Console` + `Network` + `Application > Local Storage`).

## Test Data Setup

1. Create arrangement `qa-arrangement`.
2. In arrangement workspace, add one new block from row action (`New`) so `Untitled-n` is created.
3. Rename the block in tracker to `qa-block`.
4. Confirm arrangement row references the same block.

## Case A — Arrangement autosave

Steps:

1. Select `qa-arrangement`.
2. Change arrangement name to `qa-arrangement-a`.
3. Change BPM to `137`.
4. Add a new row and set repeats to `2`.
5. Wait 1 second.

Expected:

- `PUT /api/arrangements/<filename>` succeeds.
- Reloading arrangement shows updated name, BPM, rows, repeats.

## Case B — Arrangement refresh recovery from cache

Steps:

1. Select `qa-arrangement`.
2. Edit name/BPM/rows quickly.
3. Immediately hard refresh the tab before debounce save finishes.
4. Re-open same arrangement.

Expected:

- Status shows cache recovery message.
- Arrangement loads with recovered edits.
- Within ~1 second, a save request is sent and local cache key `unsaved_arrangement_<filename>` clears.

## Case C — Block autosave

Steps:

1. Open `qa-block` in tracker (from arrangement chip or right library).
2. Modify notes/pattern content.
3. Wait 1 second.

Expected:

- `PUT /api/blocks/<filename>` succeeds after ~200ms debounce.
- Re-opening block preserves edits.

## Case D — Block refresh recovery from cache

Steps:

1. Open `qa-block` in tracker.
2. Make edits.
3. Immediately hard refresh before debounce save finishes.
4. Re-open the same block in tracker.

Expected:

- Status shows block cache recovery message.
- Tracker opens with recovered state.
- Within ~1 second, save request is sent and `unsaved_block_<filename>` clears.

## Case E — beforeunload confirm + flush

Steps:

1. Make a pending arrangement edit (or tracker edit) and immediately close tab/window.
2. Observe browser behavior.

Expected:

- Browser shows native unload confirmation prompt.
- If user stays, data remains in current tab state.
- If user leaves, pending save is sent best-effort (`keepalive`), and cache fallback remains if network save fails.

## Case F — Block deletion conflict guard

Steps:

1. Ensure `qa-block` is still referenced by `qa-arrangement`.
2. Try deleting `qa-block` from right library list and from Blocks modal list.

Expected:

- Deletion is blocked in both locations.
- Dialog states block is used in arrangements and lists `qa-arrangement`.
- Server responds with `409` and `usedBy`.

## Pass Criteria

- All cases A–F pass exactly as expected.
- No uncaught errors in browser console during flow.
- No data loss in refresh/close scenarios.

## Known Non-Goals During This QA

- Narrow/responsive layout behavior.
- “Create user copy” flow for system resources.
- Export-from-arrangements feature work.
~~~
