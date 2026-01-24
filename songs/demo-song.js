import { stack, note, s, slow } from "@strudel/core";

export const bpm = 122;

export const pattern = // Demo song for Strudel to ZzFXM
// Audio processing effects will not carry on to exported .json file that ZzFXM plays.
// Note that in this early alpha version, there could be other issues as well.

stack(
  // Kick
  note("bb2(3,8)").s("demo-kickdrum"),

  // Bass
  note("c2 a1(3,8) c2(2,8) g1(3,8)").slow(2).s("demo-bass"),
  
  // Snare
  note("~ c2 ~ c2").s("demo-clap"),
  
  // Funky Lead
  note("g4 [bb3 c4] f3 [f4 eb4]").s("demo-lead"),

  // Test pad
  note("<[c4,f4,bb3]@2 [d4,g4,b4] [d4,f4,a4]>*2").s("demo-pad")
);
