# Modern ZzFX Backend Plan

Status: Draft  
Created: 2026-03-14

## Context

ZzFXTrack currently uses its own song/rendering model and that is still the right fit for the app.

Important distinction:

- the modernized `zzfxm.ts` version is optimized for familiarity with classic ZzFXM and the broader j13k / game-jam ecosystem
- ZzFXTrack is optimized for its own editor, export pipeline, and playback needs

So this plan is not about making ZzFXTrack ZzFXM-compatible.

It is about borrowing the useful architectural ideas:

- cleaner separation between music rendering and sample synthesis
- a more explicit build/play boundary
- a synth backend abstraction that can support the current in-repo generator and a future modern package-backed implementation

## Current State

Relevant current code:

- `src/zzfx-core.js`
- `src/zzfx-loader.js`
- `src/zzfxtrack-player.js`
- `src/tracker.js`
- `src/features/playback/export-preview.js`

Current observations:

- `src/zzfx-core.js` already implements a 21-parameter ZzFXMicro-style sample generator.
- `src/zzfxtrack-player.js` uses the app's own exported song semantics, not classic ZzFXM channel semantics.
- export/playback assumes explicit `[instrumentIndex, attenuation, semitone]` note events.
- the app intentionally has behavior beyond classic ZzFXM, such as:
  - explicit attenuation handling
  - monophonic note cutting
  - normalization and playback mix settings
  - app-specific arrangement rendering/export assumptions

## Problem Statement

The current audio pipeline works, but synthesis and rendering responsibilities are still more tightly coupled than they need to be.

That creates a few long-term problems:

- harder to swap synthesis implementations safely
- harder to test synthesis behavior independently from song rendering
- harder to reason about what is app song-format logic vs synth backend logic
- more friction if we ever want to validate playback against a more modern ZzFX implementation

## Goals

1. Keep ZzFXTrack's current song model and export semantics.
2. Introduce a small synth backend abstraction layer.
3. Separate sample building from playback more clearly.
4. Make future experimentation with a modern ZzFX package backend low-risk.
5. Preserve current audible behavior as closely as possible.

## Non-Goals

- adopting classic ZzFXM channel format
- changing exported song structure to match external tooling
- introducing stereo/panning behavior in this phase
- replacing the current player wholesale with external `zzfxm` code
- changing arrangement export semantics

## Key Insight From The Reference

The strongest idea to borrow from the modernized `zzfxm.ts` is not compatibility.

It is architectural separation:

- `build(...)` renders samples
- `play(...)` plays samples
- synthesis comes from a backend API rather than from hard-coded globals

That pattern fits ZzFXTrack well even if the app keeps its own music format.

## Proposed Direction

Introduce a backend boundary for synthesis while preserving the current renderer.

### Phase 1: Document and Isolate Current Responsibilities

Make the current pipeline boundaries explicit in code comments and module structure.

Tasks:

- identify the exact responsibilities of:
  - synth sample generation
  - note pitch adaptation
  - note attenuation
  - note mixing
  - normalization / master gain / soft clipping
  - playback node creation
- confirm which parts belong to:
  - synth backend
  - song renderer
  - playback/output adapter

Deliverable:

- a documented responsibility split across `src/zzfx-core.js` and `src/zzfxtrack-player.js`

### Phase 2: Add a Synth Backend Adapter

Create a narrow adapter module that the player and other rendering code call instead of importing the generator directly.

Suggested shape:

- `buildSamples(params)`
- optional metadata surface later if needed

Possible file:

- `src/audio/zzfx-backend.js`

Initial implementation:

- use the current in-repo `zzfxG` implementation underneath

Why first:

- no behavior change required
- enables controlled backend swaps later

Deliverable:

- player and related rendering paths call the adapter rather than calling `zzfxG` directly

### Phase 3: Separate Render and Playback APIs More Clearly

Refine the current player surface so "render samples" and "play rendered samples" are not conflated.

Current opportunities:

- `buildSong(...)` already renders PCM
- `playZzFXTrackSong(...)` already plays it

Needed refinement:

- make the render result shape explicit
- keep playback node creation focused only on Web Audio output
- make mono buffer assumptions obvious and centralized

Deliverable:

- clearer public API in `src/zzfxtrack-player.js`
- easier future comparison between rendered output and playback output

### Phase 4: Add a Modern Backend Experiment Path

Once the adapter exists, add an experimental backend implementation that calls a modern ZzFX package API.

Important constraint:

- this is for comparison and validation first
- not default adoption

Tasks:

- wrap modern `buildSamples` style API behind the same adapter contract
- compare sample behavior on a representative instrument set
- audit parameter compatibility carefully, especially:
  - bit crush
  - delay
  - sustain volume
  - decay
  - tremolo
  - filter

Deliverable:

- optional alternate backend for internal testing

### Phase 5: Behavioral Comparison Harness

Before any backend switch, add a small repeatable comparison workflow.

Compare:

- generated sample length
- peak level
- rough waveform similarity
- audible differences on a representative preset set

Recommended coverage:

- short percussive sounds
- long sustaining pads
- pitch slide sounds
- modulation-heavy sounds
- filtered sounds
- monophonic overlap cases

Deliverable:

- a small dev-only comparison script or manual checklist

### Phase 6: Decide Default Backend

Only after comparison:

- keep current backend if parity is poor or benefits are marginal
- switch default backend only if compatibility is good and maintenance value is clear

This decision should be evidence-based, not aspirational.

## Implementation Notes

### What Should Stay App-Specific

These behaviors should remain in ZzFXTrack even if the synth backend changes:

- explicit `[instrumentIndex, attenuation, semitone]` note event format
- export/song structure used by ZzFXTrack
- monophonic next-note cut behavior
- normalization policy
- master gain / soft clipping
- arrangement render/export behavior

### What Can Move Behind The Adapter

- raw sample generation from instrument parameter arrays
- any future package-backed synthesis call
- backend-specific compatibility normalization if needed

## Risks

### 1. Subtle Sound Regressions

Even if parameter lists look compatible, audible output may differ in:

- transients
- envelope shape
- filter behavior
- modulation behavior
- noise character

Mitigation:

- do not switch default backend before comparison testing

### 2. Over-Abstraction Too Early

Adding too many layers without a clear need could make the pipeline harder to follow.

Mitigation:

- keep the adapter very small
- do not abstract music rendering format

### 3. Mistaking Compatibility For A Goal

It would be easy to drift toward "classic ZzFXM compatibility" even though that is not needed for this app.

Mitigation:

- keep this plan explicitly scoped to backend separation and modernization

## Acceptance Criteria

Minimum success for this plan:

1. ZzFXTrack keeps its current song/export format.
2. Sample synthesis is routed through a dedicated adapter boundary.
3. Render vs playback responsibilities are clearer in code.
4. A modern backend can be tested without rewriting the song renderer.
5. No default backend switch happens without explicit parity review.

## Suggested File Ownership

- backend adapter:
  - `src/audio/zzfx-backend.js`
- current synth implementation:
  - `src/zzfx-core.js`
- player/render integration:
  - `src/zzfxtrack-player.js`
- live preview/instrument preview follow-up:
  - `src/zzfx-loader.js`
  - `src/instrument-preview.js`

## Recommended Order

1. isolate synthesis behind adapter
2. clean up render/play API surface
3. add experimental modern backend
4. compare behavior
5. decide whether to keep current backend or switch

## Decision Rule

If the modern backend does not produce clearly better maintainability with acceptable sound parity, keep the current backend and stop after the adapter cleanup.

That would still be a successful outcome because the architectural separation itself has value.
