# User Guide (ZzFXTrack) Implementation Plan

Status: Proposed (not implemented)

## Problem Statement

This app is not trying to teach “general Strudel mastery”. It’s a Strudel-assisted workflow for authoring **ZzFXTrack Player-ready game music**.

Users need:
- A short, focused guide tailored to this app’s export constraints.
- Small, copyable examples that are known to export reliably to ZzFXTrack Player format.
- A way to use the guide even in the hosted/demo build (offline-friendly, no web dependency).

## Goals

- Provide an in-app “User Guide” that works offline.
- Include short **export-safe** Strudel examples (mini-notation) that users can copy quickly.
- Keep the guide content versioned in the repo as plain Markdown so it’s easy to evolve.
- Make “what exports reliably” explicit and hard to miss.

## Non-Goals

- Mirror/host all Strudel documentation.
- Guarantee that every Strudel feature shown in the guide exports 1:1 (the guide should avoid preview-only features).
- Build a full documentation site generator.

## Proposed Content Structure

Create a new documentation section focused on game-music authoring patterns:

- `docs/user-guide/index.md`
  - 2-minute quickstart
  - What exports reliably (supported subset)
  - Common loop templates (4-bar, intro+loop+outro)
  - Mixing/loudness presets (Safe/Balanced/Loud/Very Loud) and when to use them
  - Export: ZzFXTrack Player vs WAV download settings (sample rate/bit depth)
  - Troubleshooting (quiet, clipping, “arrange doesn’t repeat”, preview vs export)
- `docs/user-guide/recipes/*.md`
  - “Drums + bass + chords + lead” loop skeletons
  - “Stinger” / one-shot patterns
  - “Intensity layers” (variations/mutes)

### Example Requirements

Every code snippet should be:
- Short (ideally 1-8 lines)
- Clearly labeled
- Tagged as `Export-safe` by default

If the guide later includes examples that are preview-only, they must be explicitly tagged `Preview-only` with a warning.

## In-App UX Proposal

### Entry Point

Add a new “Guide” button in an existing, discoverable place:
- Option A (recommended): next to “Technical details” / “Licenses & Credits” in the header area.
- Option B: inside the Export Settings modal.

### Guide Modal

Add a modal similar to existing modals (Song Data, Licensing, etc.):
- Title: `User Guide`
- Left: section navigation (simple list)
- Right: rendered Markdown content (scrollable)
- Top-right: close button

### Code Snippets: Copy / Insert

Detect fenced code blocks in rendered Markdown and add actions:
- `Copy` button: copies the snippet to clipboard.
- `Insert` button (optional, but high value): inserts snippet into the editor at cursor.
  - If insertion is ambiguous, fall back to appending at end and show a status message.

Implementation detail: treat code blocks as plain text; do not attempt to execute code in the guide renderer.

## Technical Approach

### Phase 1: Content Files

- Add `docs/user-guide/index.md`
- Add 3-6 initial recipe files under `docs/user-guide/recipes/`
- Add an index list (either hard-coded in JS or derived from a small JSON manifest)

Recommended: use a `docs/user-guide/manifest.json` so navigation and ordering are explicit.

### Phase 2: Markdown Rendering

Add a lightweight Markdown renderer for the guide content.

Options:
1. Minimal custom renderer (headings, paragraphs, lists, inline code, fenced code blocks).
   - Pros: no new dependency
   - Cons: less complete Markdown support
2. Add a small Markdown library (e.g. `marked`).
   - Pros: robust Markdown
   - Cons: new dependency and sanitization work

Recommendation: start with option (1) if the guide keeps Markdown simple.

### Phase 3: Snippet Actions

When rendering code blocks:
- Wrap in a container with buttons.
- Wire `Copy` via `navigator.clipboard.writeText`.
- Wire `Insert` by calling an editor helper (CodeMirror insert at selection head).

### Phase 4: Demo/Hosted Mode

The guide must not rely on server endpoints:
- Content should be bundled with the app (Vite).
- Avoid fetches to remote URLs.

### Phase 5: Testing / Acceptance Criteria

Manual checks:
1. Guide opens and closes without impacting playback.
2. Navigation switches sections.
3. Code snippets copy correctly.
4. Insert (if implemented) places text into the editor reliably.
5. Works in demo/hosted build.
6. No XSS risk: guide renderer must not allow arbitrary HTML injection from Markdown.

## Alternatives Considered

1. Embed Strudel official docs
   - Pros: comprehensive
   - Cons: not aligned to ZzFXTrack Player workflow; licensing/maintenance; encourages preview-only features

2. Link out to Strudel docs
   - Pros: zero work
   - Cons: breaks offline/hosted; context switching; mismatched goals

3. “Examples only” (no prose)
   - Pros: fast
   - Cons: users won’t learn what exports reliably, mixing/export gotchas, and workflow patterns

## Recommendation

Implement an offline, in-app **User Guide** that is intentionally scoped to “ZzFXTrack game music”.

Start with:
- A small set of export-safe recipes
- A simple Markdown viewer modal
- Per-snippet `Copy` (and optionally `Insert`) actions

Then iterate based on user feedback and export edge cases.

