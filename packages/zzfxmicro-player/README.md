# zzfxmicro-player

**ZzFXMicro Player** — play song data in your game or project. Uses the **ZzFXMicro** 21-parameter engine (sample-rate synthesis). No dependencies.

**Format:** This player expects song data in the format `[instruments, patterns, sequence, BPM]` with 21-param ZzFXMicro instrument arrays. It is **not** compatible with the canonical ZzFXM player (different engine and format). Use it with JSON exported from tools that target this format.

### Installation (alpha)

No npm package yet. Copy this entire folder (`zzfxmicro-player`) into your project, then import from it (e.g. `import { playZzfxmSong } from './zzfxmicro-player/index.js';`). The package has no dependencies.

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
import { playZzfxmSong, stopZzfxmSong } from './zzfxmicro-player/index.js';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const songData = [instruments, patterns, sequence, BPM]; // e.g. from JSON

playZzfxmSong(songData, audioCtx, () => console.log('Done'));
// later: stopZzfxmSong();
```

## Song format

- **song** = `[instruments, patterns, sequence, BPM]`
- **instruments** = array of 21-param ZzFXMicro arrays
- **patterns** = array of patterns; each pattern = array of channels; each channel = array of `[instrumentIndex, attenuation, semitone]` or null per row
- **sequence** = array of pattern indices
- **BPM** = number

## License

MIT. Adapted from ZzFXM (Keith Clark and Frank Force). See repository for attribution.
