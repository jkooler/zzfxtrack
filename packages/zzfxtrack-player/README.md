# ZzFXTrack Player

**ZzFXTrack Player** — play song data in your game or project. Uses the **ZzFXMicro** 21-parameter engine (sample-rate synthesis). No dependencies.

**Format:** This player accepts either:
- **Legacy:** `[instruments, patterns, sequence, BPM]` (21-param ZzFXMicro instrument arrays), or
- **With mix (exported by this app):** `{ song: [instruments, patterns, sequence, BPM], mix: { targetPeak, masterGainDb, softClipDrive } }`. When present, the stored mix is applied so your game or project sounds like the in-app preview. Caller `options` override stored mix.

It is **not** compatible with the canonical ZzFXM player (different engine and format).

### Installation (alpha)

No npm package yet. Copy this entire folder (`zzfxtrack-player`) into your project, then import from it (e.g. `import { playZzfxmSong } from './zzfxtrack-player/index.js';`). The package has no dependencies.

## API

- **`buildSong(song, options?)`** → `Float32Array`  
  Renders the song to a mono PCM buffer (44.1 kHz). Use this for offline export (e.g. to WAV) or custom playback.

- **`playZzfxmSong(songData, audioCtx, onEnded?, options?)`**  
  Renders and plays the song through the given `AudioContext`. Stops any previously started playback. `onEnded` is called when playback finishes.

- **`stopZzfxmSong()`**  
  Stops current playback.

- **`sanitizePlaybackMixSettings(raw?)`**  
  Returns validated mix settings (targetPeak, masterGainDb, softClipDrive). Pass as `options` to `buildSong` / `playZzfxmSong` if you need to override defaults.

## Example

```js
// Copy this folder into your project, then import (adjust path as needed):
import { playZzfxmSong, stopZzfxmSong } from './zzfxtrack-player/index.js';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const songData = [instruments, patterns, sequence, BPM]; // e.g. from JSON

playZzfxmSong(songData, audioCtx, () => console.log('Done'));
// later: stopZzfxmSong();
```

## Song format

**Accepted input:**

1. **Array (legacy):** `[instruments, patterns, sequence, BPM]`
2. **Object with mix:** `{ song: [instruments, patterns, sequence, BPM], mix?: { targetPeak, masterGainDb, softClipDrive } }` — JSON/JS exported from this app include `mix` so the bundled player applies the same loudness/limiting by default. You can still pass `options` to override.

**Array shape:**

- **song** = `[instruments, patterns, sequence, BPM]`
- **instruments** = array of 21-param ZzFXMicro arrays
- **patterns** = array of patterns; each pattern = array of channels; each channel = array of `[instrumentIndex, attenuation, semitone]` or null per row
- **sequence** = array of pattern indices
- **BPM** = number
- **mix** (optional) = `{ targetPeak (0.1–0.99), masterGainDb (-24–24), softClipDrive (1–8) }`

## License

MIT. Adapted from ZzFXM (Keith Clark and Frank Force). See repository for attribution.
