# Export & playback test matrix

Use this to sanity-check arrangement export (cycle-based vs simple) and the ZzFXTrack player after changes to export logic or sparse channels.

## Setup

- **Export settings:** Resolution 96 (or 48 for smaller files). Toggle **Use simple export** to compare behaviours.
- **What to check:** Playback length and content match Strudel; JSON `patternCount` / `sequence` length; file size.

---

## 1. Repeats (cycle-based export)

| Test | Steps | Expected (optimized, simple export off) | Expected (simple export on) |
|------|--------|------------------------------------------|-----------------------------|
| **1a** | One arrangement row, one block, **4 repeats** | `sequence.length === 4`, one pattern if cycles identical; playback = 4 cycles | One pattern, `sequence === [0]`; playback = 4 cycles; larger pattern data |
| **1b** | Same row, **8 repeats** | `sequence.length === 8`; same pattern count as 1a; file size barely larger (only sequence grows) | One pattern, `sequence === [0]`; pattern 2× size of 1a |
| **1c** | Playback | Preview plays full 4 or 8 cycles, no cut-off or silence at end | Same total length as 1a/1b |

---

## 2. Multiple rows, dedupe

| Test | Steps | Check |
|------|--------|--------|
| **2a** | Two rows, same block/content, 2 repeats each | Optimized: 4 sequence entries, 1 pattern (deduped). Simple: 2 sequence entries, 1 pattern (deduped). |
| **2b** | Three rows, different blocks, 2 repeats each | Optimized: 6 sequence entries, 3 patterns (or fewer if any cycle repeats). Simple: 3 sequence entries, 3 patterns. |

---

## 3. Edge cases

| Test | Steps | What to verify |
|------|--------|----------------|
| **3a** | **Empty arrangement** (no rows or one row with no blocks) | Export doesn’t throw; playback is empty or one full pattern depending on implementation. |
| **3b** | One row, **monophonic instrument**, several repeats | No clicks or wrong cut-off; next-note logic works with sparse channels. |
| **3c** | **Resolution 48** vs 96 | Same arrangement: 48 gives smaller JSON, slightly less timing precision; playback length and structure match. |

---

## 4. JSON shape (both modes)

- **Song array:** `[instruments, patterns, sequence, BPM]`.
- **Patterns:** Each pattern is an array of channels. Each channel is **sparse**: `{ _: <length>, "<rowIndex>": [inst, atten, semi], ... }`.
- **Sequence:** List of pattern indices; length = number of “steps” (cycles in optimized, rows in simple).

---

## 5. Quick regression checklist

After changing `export-logic.js` or `zzfxtrack-player.js`:

- [ ] 1a + 1b: repeats change only sequence length (optimized), playback correct.
- [ ] 2a: identical row content dedupes to one pattern.
- [ ] 3a: empty arrangement doesn’t crash.
- [ ] 3b: monophonic + repeats, no clicks.
- [ ] Simple export on: one pattern per row, larger file, same total playback length.
