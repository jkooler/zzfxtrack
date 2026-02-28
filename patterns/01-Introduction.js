import { stack, arrange, note, s, slow, silence, gain } from "@strudel/core";

export const bpm = 120;

// Welcome to the introduction pattern

// If you're new to Strudel, it's recommended to read the official docs.
// https://patterns.slab.org/learn/getting-started/

const pattern = stack(
  note("bb2 bb2(-1,2) bb2 [bb2(2,8) d4] bb2 bb2(-1,2) bb2(3,8) [[bb2 bb4] bb2 d4 bb2]").s("kickdrum").slow(4),
  note("c2 a1(3,8) c2(2,8) g1 bb1 g1(3,8) c2(2,8) [- g1]").s("bass").slow(4),
  sound("hh-closed(16,16), [- hh-open]*4"),
  sound("- - - - - - - [cowbell] - - - - - - [- cowbell] [cowbell]").slow(4),
  note("[- c2]*2").s("snare"),
  note("[d4|f4|g4] [bb3 c4] f3 [f4 eb4]").s("synth-stab"),
  note("<c2 [eb2 g2]> <[c4,f4,bb3]@2 [c3,eb4,bb4] [d4,f4,a4]>*2").s("pad").slow(2)
)


export const pattern = arrange([16, pattern])

// If you look down, you'll see the "Song to ZzFXM" button.
// Clicking it will generate the song data as .json, that is compatible with ZzFXM.

// 1. Audio processing effects will not carry over to exported .json file.
// 2. Some more advanced Strudel pattern logic may also be only partially compatible.
// 3. Make sure to use the "Instruments" instead of the synthesis provided by Strudel.
// 4. Sounds produced by Strudel's inherit sound engines will not carry to ZzFXM export.;
