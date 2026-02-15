# ZzFXM Chord Support Implementation Plan

## Problem Statement

Strudel supports chord notation like `note("[c, e, g]").s("piano")`, which plays multiple notes simultaneously on the same instrument. When exported to ZzFXM format, only **one note** is preserved because ZzFXM is a tracker format where each channel can only play one note at a time.

Currently in `export-logic.js`, when multiple events occur at the same grid position for the same instrument, subsequent events overwrite previous ones:

```javascript
// Current behavior (line 80)
tracks[instIndex][gridIndex] = [instIndex, attenuation, semitone];
// If two notes land on same gridIndex, second overwrites first
```

---

## Proposed Solution: Channel Expansion

Expand chords into multiple ZzFXM channels, each playing one note of the chord using the same instrument definition.

### Design Philosophy

**Unlimited by default.** ZzFXM has no inherent channel limit - it's a flexible JavaScript format. This tool should export full fidelity audio without artificial constraints.

For users targeting **js13k** or other size/performance-constrained scenarios, an **optional channel limiter** setting allows capping polyphony.

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

## Technical Design

### New Data Structure

Replace single-track storage with a voice-aware structure:

```javascript
// Current
const tracks = {}; // { instIndex: Array[totalRows] }

// Proposed
const voiceTracker = {}; // { instIndex: { gridIndex: voiceCount } }
const tracks = {}; // { "instIndex-voice": Array[totalRows] }
```

### Algorithm

```javascript
function getAvailableVoice(instIndex, gridIndex, maxVoices = Infinity) {
  const key = `${instIndex}`;
  if (!voiceTracker[key]) voiceTracker[key] = {};

  // Find next available voice for this instrument at this time
  let voice = 0;
  while (voiceTracker[key][`${gridIndex}-${voice}`]) {
    voice++;
  }

  // Apply limit if set (for js13k mode)
  if (voice >= maxVoices) {
    return -1; // Signal: cannot allocate, skip this note
  }

  voiceTracker[key][`${gridIndex}-${voice}`] = true;
  return voice;
}

// In event processing loop:
const voice = getAvailableVoice(instIndex, gridIndex, options.maxVoicesPerInstrument);
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

## File Changes

### [MODIFY] [export-logic.js](file:///Users/jkoole/dev/strudel-to-zzfxfm-exporter/src/export-logic.js)

| Section      | Change                                                            |
| ------------ | ----------------------------------------------------------------- |
| Lines 15-21  | Add `voiceTracker` data structure                                 |
| Lines 38-41  | Replace direct track assignment with voice-aware allocation       |
| Lines 83-109 | Update channel flattening to handle voice tracks                  |
| New function | Add `getAvailableVoice(instIndex, gridIndex, maxVoices)` helper   |
| Export       | Accept optional `options` parameter with `maxVoicesPerInstrument` |

### [MODIFY] [repl-app.js](file:///Users/jkoole/dev/strudel-to-zzfxfm-exporter/src/repl-app.js)

| Section       | Change                                               |
| ------------- | ---------------------------------------------------- |
| Export function | Pass limiter options to `exportPattern()`              |
| Status UI     | Display channel count (informational, not a warning) |

### [NEW] Export Settings UI

Add optional limiter controls to the export workflow:

| Element              | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| Channel Limit Toggle | Enable/disable channel limiting                              |
| Max Channels Input   | Number input (default: unlimited, suggested: 8-16 for js13k) |
| Per-Instrument Limit | Optional: max voices per instrument (e.g., 4)                |

---

## UI Enhancements

### Channel Usage Indicator

Add informational feedback after export:

```
✓ Exported: 12 channels
```

If limiter is enabled and notes were dropped:

```
✓ Exported: 16 channels (4 notes dropped due to limit)
```

### Export Statistics (JSON Preview)

Include in the preview modal:

- Total channels used
- Notes exported vs. dropped (if limiter active)
- Voice distribution per instrument

---

## Optional: js13k Mode Preset

Consider a quick toggle or preset:

```
[ ] js13k Mode (limit to 8 channels)
```

When enabled:

- Sets max channels to 8
- May enable other size optimizations in future

---

## Edge Cases

| Scenario                              | Handling                                              |
| ------------------------------------- | ----------------------------------------------------- |
| Empty chord `[]`                      | Skip (no notes to place)                              |
| Single note (not a chord)             | Works as before (voice 0)                             |
| Limiter active, note can't fit        | Skip the note, increment dropped counter              |
| Same note played twice simultaneously | Allocate separate voices (may be intentional)         |
| No limiter, 50+ channels              | Export all (user's choice, no artificial restriction) |

---

## Testing Strategy

### Unit Tests

1. **Single note** → 1 channel, correct pitch
2. **Two-note chord** → 2 channels, same instrument, different pitches
3. **Three-note chord** → 3 channels
4. **Multiple instruments** → Correct instrument indices preserved
5. **Chord + melody on same instrument** → Voices correctly allocated
6. **Limiter: 2 voices, 3-note chord** → 2 notes exported, 1 dropped
7. **No limiter: complex song** → All notes exported regardless of count

### Manual Testing

1. Create a song with `note("[c3, e3, g3]").s("piano")`
2. Export to ZzFXM (no limit)
3. Verify all 3 notes play
4. Enable limiter (max 2 voices)
5. Verify 2 notes play, status shows "1 note dropped"

---

## Implementation Phases

### Phase 1: Core Logic (Estimated: 2 hours)

- [ ] Implement `voiceTracker` and `getAvailableVoice()`
- [ ] Update event processing loop
- [ ] Update channel flattening
- [ ] Return channel count from `exportPattern()`

### Phase 2: Optional Limiter (Estimated: 1.5 hours)

- [ ] Add `options` parameter to `exportPattern()`
- [ ] Implement voice limiting logic
- [ ] Track and return dropped note count
- [ ] Add limiter UI controls (toggle + number input)

### Phase 3: UI Feedback (Estimated: 1 hour)

- [ ] Display channel count in status
- [ ] Show dropped notes if limiter active
- [ ] Update JSON preview with statistics

### Phase 4: Testing & Polish (Estimated: 1 hour)

- [ ] Test unlimited export
- [ ] Test with various limiter values
- [ ] Edge case testing
- [ ] Documentation update

---

## Risks & Mitigations

| Risk                         | Mitigation                                            |
| ---------------------------- | ----------------------------------------------------- |
| Performance with many voices | Inform user of channel count; they can enable limiter |
| Dropped notes confusing      | Clear UI feedback showing what was limited            |
| js13k users forget limiter   | Consider optional preset or reminder in export flow   |

---

## Future Enhancements

1. **Chord Arpeggiation Mode**: Convert chords to rapid arpeggios (stylistic choice)
2. **Smart Voice Reuse**: Reuse idle voice channels from earlier in the song
3. **Priority-based Limiting**: When limiting, keep root notes, drop higher chord tones
4. **Export Presets**: "Full Quality", "js13k Optimized", "Custom"

---

## Conclusion

This implementation preserves full harmonic content by default while providing optional limiting for constrained scenarios like js13k. Users get maximum flexibility without artificial restrictions.
