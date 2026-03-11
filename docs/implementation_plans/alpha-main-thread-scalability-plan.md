# Alpha Main-Thread Scalability Plan (Arrangement Playback)

Status: Deferred beyond observability  
Last audited: 2026-03-11

## Decision

Do not implement the original full adaptive-mode plan right now.

The current codebase already contains meaningful tactical hardening:

- worker render path and fallback accounting
- render stats exposed via `window.__arrangementRenderStats`
- live-swap debouncing and boundary-apply behavior
- short crossfade handling around live swap boundaries

Those pieces live primarily in `src/tracker.js`.

What is missing from the original plan:

- no visible diagnostics panel
- no stress harness
- no adaptive `LIVE_STEP` / `LIVE_ROW` / `IDLE_APPLY` policy engine
- no complexity budget score
- no user-facing safety toggles

## Revised Recommendation

Limit future work to Phase 1 only unless real alpha usage shows clear instability:

1. Add a dev-mode diagnostics panel for the existing render stats.
2. Add a short repeatable stress checklist to testing docs.
3. Measure actual failure and stutter cases before building more policy.

Do not build the adaptive degradation engine yet. It would add state complexity before there is evidence that the simpler mitigations are insufficient.

## When To Reopen

Reopen this plan only if at least one of these becomes true:

- repeated user reports of arrangement-preview stutter
- clear internal repros on mid-range hardware
- worker fallback/error rates show consistent instability

If reopened later, start from the current runtime code rather than from the original draft structure.

## Archived Original Version

~~~markdown
# Alpha Main-Thread Scalability Plan (Arrangement Playback)

Status: Draft  
Created: 2026-03-01

## Context

The alpha build currently relies on main-thread playback handoff and UI coordination for arrangement preview. While worker rendering has reduced heavy mix computation cost, the playback swap path can still stutter under stress (rapid edits, loop toggles, heavy arrangements with many blocks and dense tracker states).

This is acceptable for alpha experimentation, but if user adoption increases and arrangements become more complex, we need guardrails and staged hardening.

## Problem Statement

Known alpha weakness:

- Real-time arrangement preview still requires main-thread source handoff (`AudioBufferSourceNode` replacement, timing sync, playhead updates).
- Under high interaction density (rapid block switching, loop toggles, monkey testing), occasional stutter can still occur.
- Worst-case complexity (large arrangement + many stacked blocks + frequent live edits) may exceed smooth UX thresholds on mid-range hardware.

## Goals

1. Prevent user-facing audio instability in complex projects.
2. Detect high-risk runtime conditions early and react automatically.
3. Preserve current fast workflow for normal projects while degrading gracefully when needed.
4. Keep implementation incremental and reversible for alpha.

## Non-Goals

- Full rewrite to an AudioWorklet sequencer in this phase.
- Perfect zero-latency live-edit playback under all stress conditions.
- Device-specific low-level performance tuning per browser/OS.

## Runtime Risk Signals

Track and monitor these indicators during arrangement preview:

- `workerRequested / workerFallback / workerErrors`
- Live swap frequency (swaps per second)
- Time from edit event to applied swap (latency)
- Boundary misses (swap applied outside intended boundary window)
- Audible interruption incidents (heuristic: swap retries + repeated pending queue growth)

## Mitigation Strategy (Phased)

### Phase 1: Observability + Stress Harness

- Add a visible diagnostics panel (dev mode) for arrangement render/swap stats.
- Add synthetic stress presets for QA:
  - high block count per row
  - dense note edits while looping
  - rapid loop toggle + block switching
- Define baseline thresholds on reference machines.

Deliverables:

- In-app diagnostics view (based on existing `window.__arrangementRenderStats` source)
- Repeatable stress test checklist in docs

### Phase 2: Adaptive Degradation Modes

Add runtime policy that selects one of these modes:

- `LIVE_STEP` (current fast mode): apply edits quickly at step boundaries.
- `LIVE_ROW` (stability mode): apply at row boundaries only.
- `IDLE_APPLY` (safe mode): queue edits and apply after short input idle timeout.

Automatic mode switching triggers (example defaults):

- If swap rate > threshold for N seconds -> degrade one level.
- If fallback/error count increases -> degrade one level.
- If stable for M seconds -> cautiously restore one level.

Deliverables:

- Policy engine with hysteresis (avoid mode flapping)
- UI status hint when degraded mode is active

### Phase 3: Complexity Budget + User Safeguards

- Compute and surface arrangement complexity score from:
  - rows
  - blocks per row
  - active notes density
  - loop usage + live edit rate
- If above budget, warn and recommend stable mode.
- Add explicit user toggle:
  - “Disable live arrangement updates while editing”
  - “Apply changes on row boundary only”

Deliverables:

- Complexity scoring utility
- User-facing advanced playback safety settings

### Phase 4: Post-Alpha Hardening Decision

Based on telemetry and user reports:

- If incidents remain low: keep adaptive approach.
- If incidents remain high at scale: plan AudioWorklet/event-driven playback architecture (major version scope).

## Rollout Plan

1. Ship diagnostics + stress harness behind developer mode.
2. Validate thresholds internally with complex demo arrangements.
3. Enable adaptive degradation for all users (quietly, with status messages).
4. Add explicit user controls in Advanced Settings.
5. Reassess after first wave of external alpha feedback.

## Acceptance Criteria

Minimum acceptance for alpha stability:

- No loop-escape regressions during aggressive live editing.
- Stutter incidents reduced to rare edge cases in internal stress tests.
- App remains responsive (no prolonged UI freeze) under heavy arrangements.
- Clear fallback behavior exists when runtime pressure spikes.

## Risks

- Over-aggressive degradation can make edits feel laggy.
- Too-conservative thresholds may allow avoidable stutter.
- Added policy complexity can introduce state bugs if not tested thoroughly.

## QA Focus

- Loop row on/off while editing active blocks.
- Rapid block switching during playback.
- High-density note add/remove bursts.
- Long arrangements with repeated block stacks.
- Recovery behavior when switching between adaptive modes.

## Implementation Notes

- Keep all thresholds configurable constants for quick tuning.
- Keep diagnostics data lightweight and sample-based.
- Ensure every degradation decision is observable in logs/stats.
- Avoid introducing blocking work on the main thread in policy evaluation.
~~~
