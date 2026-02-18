# ZzFXM Chord Support

Status: Implemented (last verified 2026-02-18)

## Problem Statement

Strudel supports chord notation like `note("[c, e, g]").s("piano")`, which plays multiple notes simultaneously on the same instrument.

Historically, exports could lose notes when multiple events landed on the same row. This repo addresses that by expanding chords into multiple ZzFXM channels ("voices") because ZzFXM is monophonic per channel.

ZzFXM is monophonic per channel, so exporting chords requires expanding a single Strudel instrument into multiple ZzFXM channels ("voices") when multiple notes land on the same row.

This repo implements voice expansion in `src/export-logic.js` and exposes controls in the UI (`src/repl-app.js`) to limit voices and optionally force specific instruments to be monophonic.

---

## Current Implementation: Voice Expansion

Expand chords into multiple ZzFXM channels, each playing one note of the chord using the same instrument definition.

### Design Philosophy

**Unlimited by default.** ZzFXM has no inherent channel limit - it's a flexible JavaScript format. This tool should export full fidelity audio without artificial constraints.

For users targeting **js13k** or other size/performance-constrained scenarios, an optional channel limiter allows capping polyphony (dropping notes when the limit is reached).

### How It Works

1. **Detect Chord Collisions**: When placing a note, check if the grid position already has a note for that instrument.
2. **Allocate Additional Channels**: If a collision occurs, find or create an additional "voice" channel for the same instrument.
3. **Preserve Instrument Mapping**: Additional voice channels reuse the same instrument definition but occupy separate ZzFXM channels.

### Example

**Strudel Input:**

```javascript
note("[c3, e3, g3]").s("piano");
```

**Current ZzFXM Output (broken):**

```
Channel 0 (piano): [only G3 plays - others overwritten]
```

**Proposed ZzFXM Output:**

```
Channel 0 (piano): C3
Channel 1 (piano): E3
Channel 2 (piano): G3
```

---

## Notes On The Implementation

### Data Structures

Replace single-track storage with a voice-aware structure:

```javascript
// Voice-aware track storage
const tracks = {}; // { "instIndex-voice": Array[totalRows] }
const voiceTracker = {}; // { instIndex: { "gridIndex-voice": true } }
```

### Allocation Algorithm (Conceptual)

```javascript
const voice = getAvailableVoice(voiceTracker, instIndex, gridIndex, options.maxVoicesPerInstrument);
if (voice === -1) continue; // Skip note if limit reached

const trackKey = `${instIndex}-${voice}`;
if (!tracks[trackKey]) tracks[trackKey] = Array(totalRows).fill(0);
tracks[trackKey][gridIndex] = [instIndex, attenuation, semitone];
```

### Channel Flattening

When building final `patternData`:

1. Collect all track keys (e.g., `"0-0"`, `"0-1"`, `"0-2"`, `"1-0"`)
2. Sort by instrument index, then voice number
3. Build continuous channel array
4. **Important**: The `[instIndex, ...]` tuple in each note must reference the _original_ instrument index, not the channel number

---

## Where To Look In This Repo

- `src/export-logic.js`: `getAvailableVoice()` + voice-aware track flattening, plus stats like `channelCount` and `droppedNotes`.
- `src/repl-app.js`: export UI that wires:
  - `maxVoicesPerInstrument` (via "Limit channels")
  - `normalizeUnisonLayers`
  - `rowsPerCycle` (export resolution)
  - `monophonicByInstrumentIndex` (per-instrument monophonic toggle)

## Remaining Gaps (If You Still Want "True" Chords)

- ZzFXM has no single-channel polyphony, so any "true chord" export still has to be represented as multiple channels (voices).
- If you want deterministic voice assignment across exports (for diff-friendly output), consider persisting voice allocation choices per instrument and time region.

## Future Enhancements

1. **Chord Arpeggiation Mode**: Convert chords to rapid arpeggios (stylistic choice)
2. **Smart Voice Reuse**: Reuse idle voice channels from earlier in the song
3. **Priority-based Limiting**: When limiting, keep root notes, drop higher chord tones
4. **Export Presets**: "Full Quality", "js13k Optimized", "Custom"

---

## Conclusion

This implementation preserves full harmonic content by default while providing optional limiting for constrained scenarios like js13k. Users get maximum flexibility without artificial restrictions.
