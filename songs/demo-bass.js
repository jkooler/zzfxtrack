import { stack, note } from "@strudel/core";

export const bpm = 125;

export const pattern = stack(
  // Bass
  note("c2 ~ [c2 g2] ~ f2 ~ ~ ~").s("bd"),
  
  // Lead
  note("~ ~ e4 g4 [b4 c5] ~ ~ ~").s("ld").gain("0.8 1 0.6 1"),
  
  // HiHats
  note("[c c] [c c*3] c [c c]").s("hh").gain(0.5)
);