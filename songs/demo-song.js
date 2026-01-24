import { stack, note, s, slow } from "@strudel/core";

export const bpm = 120;

export const pattern = // Demo song for Strudel to ZzFXM

// 1. Audio processing effects will not carry on to exported .json file that ZzFXM plays.
// 2. Make sure to use the "Instruments" instead of the synthesis provided by Strudel.
// 3. Any sound produced by Strudel will not carry on to the exported ZzFXM songs.

// This is an early alpha version, so there could be other issues as well.

stack(
  // Kick
  note("bb2(3,8)").s("demo-kickdrum"),

  // Bass
  note("c2 a1(3,8) c2(2,8) g1(3,8)").slow(2).s("demo-bass"),

  // Hi-hat
  sound("demo-hh-closed(16,16), [- demo-hh-open]*4"),

  // Cowbell
  sound("- - - - - - - [demo-cowbell]*2").slow(2),
  
  // Snare
  note("~ c2 ~ c2").s("demo-snare"),
  
  // Synth stab
  note("g4 [bb3 c4] f3 [f4 eb4]").s("demo-synth-stab"),

  // Test pad
  note("<[c4,f4,bb3]@2 [d4,g4,b4] [d4,f4,a4]>*2").s("demo-pad")
);
