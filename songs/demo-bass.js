import { stack, note, s } from "@strudel/core";

export const bpm = 122;

export const pattern = stack(
  // Kick
  note("c2(3,8)").s("test-kick"),
  
  // Snare
  note("~ c2 ~ c2").s("test-clap"),
  
  // Funky Lead
  note("g4 [bb3 c4] f3 [f4 eb4]").s("test-lead")
);
