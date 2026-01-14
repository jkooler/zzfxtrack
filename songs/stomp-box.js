import { stack, note } from "@strudel/core";

export const bpm = 110;

export const pattern = stack(
  // Bass drum-ish
  note("c1(3,8)").s("bd").gain(1.2),
  
  // Snare-ish / Perc
  note("~ c2 ~ c2").s("hh").gain(0.7),
  
  // Funky Lead
  note("g3 [bb3 c4] ~ [f4 eb4]").s("ld").gain(0.8)
);
