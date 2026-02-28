# Cursor-Based Block Insertion Implementation Plan

Status: Partially implemented (last verified 2026-02-18)

## Overview
Block insertion is now non-destructive, but it is not truly "cursor-based". The current implementation inserts a block as a named layer and updates `export const pattern = ...` to include that layer, rather than mapping the editor cursor position into the stored file and inserting arbitrary code.

## Current Behavior
- Block insertion creates (or reuses) a `// BLOCKS START` ... `// BLOCKS END` section in the Strudel pattern file.
- The block is inserted as a `const <block_name> = ...` within that section.
- `export const pattern = ...` is updated to include the new layer:
  - If the existing pattern is `stack(...)`, the new layer is appended as another argument.
  - Otherwise, the exporter wraps the existing pattern in `stack(existing, newLayer)`.

## Desired Behavior
- Insert a block pattern at the current cursor position in the Strudel editor view.
- Preserve existing code even if the user is editing custom non-pattern helper code.
- Avoid relying on regex edits of `export const pattern = ...` where possible.
- Provide a clear fallback when insertion is ambiguous (for example, outside a pattern expression).

## Technical Challenges

### 1. Editor vs File Format Mismatch
The Strudel editor displays code in a simplified format (no exports), while the saved file uses ES module syntax with exports.

**Current flow:**
```
Editor Code (no exports) 
    ↓ editorToFile()
File Code (with exports)
    ↓ manipulate
File Code (modified)
    ↓ fileToEditor()
Editor Code (display)
```

**Challenge:** Cursor positions are in editor coordinates, but we need to insert into file coordinates.

### 2. Cursor Position Mapping
CodeMirror tracks cursor position in the editor view. When converting between editor format and file format:
- Line numbers shift (imports removed, exports added)
- Character positions change
- Need to map cursor position accurately between formats

### 3. Pattern Context
Blocks contain complete pattern expressions like:
```javascript
note("c4 ~*3 c4 ~*3").s("demo-kickdrum")
```

Inserting this at arbitrary cursor positions could break the syntax if not handled carefully.

## Proposed Implementation

### Phase 1: Cursor Position Tracking

**Files to modify:**
- `src/repl-app.js`

**Changes:**
1. Add function to get current cursor position from CodeMirror editor
2. Store cursor position before block insertion
3. Map cursor position between editor and file formats

```javascript
function getCursorPosition() {
    const editor = dom.repl.editor.editor; // CodeMirror EditorView
    const selection = editor.state.selection.main;
    return {
        line: editor.state.doc.lineAt(selection.head).number,
        column: selection.head - editor.state.doc.lineAt(selection.head).from
    };
}
```

### Phase 2: Smart Insertion Logic

**Files to modify:**
- `src/blocks.js` - `insertSelectedBlock()`
- `src/repl-app.js` - `setupBlocksEventListeners()`

**Changes:**
1. Detect if cursor is within a pattern expression
2. If yes: Insert block pattern at cursor (wrapped appropriately)
3. If no: Fall back to current behavior (replace entire pattern)

**Insertion strategies:**

**Strategy A: Inline Insertion (cursor inside pattern)**
```javascript
// Before:
note("c3 e3 g3").s("bd")
//        ^ cursor here

// After inserting block:
note("c3 e3 g3").s("bd").stack(note("c4 ~*3 c4 ~*3").s("demo-kickdrum"))
```

**Strategy B: Stack Combination (cursor at end of pattern)**
```javascript
// Before:
note("c3 e3 g3").s("bd")
//                            ^ cursor here

// After:
stack(
    note("c3 e3 g3").s("bd"),
    note("c4 ~*3 c4 ~*3").s("demo-kickdrum")
)
```

**Strategy C: Replace Pattern (cursor outside pattern - current behavior)**
Keep existing behavior as fallback.

### Phase 3: Pattern Wrapping Detection

**New file:** `src/block-insertion-utils.js`

**Functions needed:**
```javascript
// Detect if cursor is inside a pattern expression
function isCursorInPattern(editorCode, cursorLine, cursorColumn) {
    // Parse the editor code to find pattern boundaries
    // Return true if cursor is within a pattern expression
}

// Wrap block pattern appropriately based on context
function wrapBlockPattern(blockPattern, surroundingContext) {
    // If inside existing pattern, use .stack() or other combinator
    // If at pattern boundary, create stack()
    // Return wrapped pattern
}

// Map editor cursor position to file cursor position
function mapEditorToFilePosition(editorPos, editorCode, fileCode) {
    // Account for import/export lines
    // Return adjusted position
}
```

### Phase 4: UI Enhancements

**Files to modify:**
- `index.html` - Blocks modal
- `src/blocks.js`

**Changes:**
1. Add insertion mode selector in blocks modal:
   - "Replace entire pattern" (current behavior)
   - "Insert at cursor"
   - "Combine with existing" (always uses stack)

2. Visual feedback:
   - Show preview of what will be inserted
   - Highlight insertion point in editor

### Phase 5: Testing Scenarios

**Test cases needed:**
1. Insert block at beginning of empty pattern
2. Insert block in middle of existing pattern
3. Insert block at end of existing pattern
4. Insert multiple blocks sequentially
5. Insert block outside pattern context (fallback)
6. Insert block with cursor on empty line
7. Undo/redo after block insertion

## Alternative Approaches

### Alternative 1: Template-Based Insertion
Instead of cursor-based, provide template slots in Strudel patterns:
```javascript
export const pattern = stack(
    note("c3 e3 g3").s("bd"),
    /* BLOCK_SLOT_1 */
    /* BLOCK_SLOT_2 */
);
```
Blocks would replace these comment markers.

**Pros:** Predictable, explicit
**Cons:** Requires users to prepare Strudel patterns with slots

### Alternative 2: Visual Block Arrangement
Drag-and-drop interface showing blocks as tiles that can be arranged visually.

**Pros:** Very user-friendly, WYSIWYG
**Cons:** Major UI overhaul, complex to implement

### Alternative 3: Pattern Library Sidebar
Blocks appear in sidebar, clicking inserts at cursor with smart wrapping.

**Pros:** Quick access, similar to current workflow
**Cons:** Still requires cursor position logic

## Recommendation

Keep the current "layer insertion" flow (it is robust and non-destructive) and implement cursor-based insertion as an optional mode:
1. Track cursor position
2. Implement safe insertion only when the cursor is clearly inside the `export const pattern = ...` expression in editor coordinates
3. Fall back to layer insertion when ambiguous

This provides immediate value while keeping complexity manageable. Phases 3-5 can be added incrementally based on user feedback.

## Files to Create/Modify

**New files:**
- `src/block-insertion-utils.js` - Helper functions for cursor mapping and pattern wrapping

**Modified files:**
- `src/blocks.js` - Update `insertSelectedBlock()` with cursor-aware logic
- `src/repl-app.js` - Update event handlers, add cursor tracking
- `index.html` - Add insertion mode UI to blocks modal
- `style.css` - Styles for insertion mode controls

## Success Criteria

- [ ] Block can be inserted at cursor position without destroying existing code
- [ ] Multiple blocks can be combined in a single pattern
- [ ] UI clearly indicates insertion mode
- [ ] Fallback to replace mode works when cursor is outside pattern
- [ ] Undo/redo works correctly after insertion
- [ ] No syntax errors generated by insertion

## Future Enhancements

1. **Block Preview:** Show mini-preview of block pattern in modal
2. **Drag & Drop:** Drag blocks from modal to editor
3. **Block Parameters:** Allow customizing block parameters before insertion
4. **Block Chains:** Save sequences of blocks as reusable chains
5. **Pattern Merging:** Intelligent merging of overlapping patterns

## Notes

- Keep the current "layer insertion" behavior as an option
- Consider adding keyboard shortcut for quick insertion (e.g., Ctrl+Shift+Enter)
- May need to expose more CodeMirror APIs from Strudel REPL component
- Test thoroughly with complex patterns containing nested functions
