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
- “Create user copy” flow for example resources.
- Export-from-arrangements feature work.
