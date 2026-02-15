import { stack, note, s, slow, arrange, silence, gain } from "@strudel/core";

export const bpm = 120;

// Demo song for Strudel to ZzFXM

// If you're new to Strudel, it's recommended to read the official docs.
// https://patterns.slab.org/learn/getting-started/


export const pattern = stack(
  note("bb2 bb2(-1,2) bb2 [bb2(2,8) d4] bb2 bb2(-1,2) bb2(3,8) [[bb2 bb4] bb2 d4 bb2]").s("demo-kickdrum").slow(4),
  note("c2 a1(3,8) c2(2,8) g1 bb1 g1(3,8) c2(2,8) [- g1]").slow(4).s("demo-bass"),
  sound("demo-hh-closed(16,16), [- demo-hh-open]*4"),
  sound("- - - - - - - [demo-cowbell] - - - - - - [- demo-cowbell] [demo-cowbell]").slow(4),
  note("- c2 - c2").s("demo-snare"),
  note("g4 [bb3 c4] f3 [f4 eb4]").s("demo-synth-stab"),
  note("<c2 [eb2 g2]> <[c4,f4,bb3]@2 [c3,eb4,bb4] [d4,f4,a4]>*2").s("demo-pad").slow(2)
)

// If you look down, you'll see the "Export ZzFXM" button.
// Clicking it will generate the song data as .json, that is compatible with ZzFXM.

// 1. Audio processing effects will not carry over to exported .json file.
// 2. Some more advanced Strudel pattern logic may also be only partially compatible.
// 3. Make sure to use the "Instruments" instead of the synthesis provided by Strudel.
// 4. Sounds produced by Strudel's inherit sound engines will not carry as well.;
