import { stack, note, s } from "@strudel/core";

export const bpm = 90;

export const pattern = stack(
  // Bass
  note("c5 ~ [c5 g5] ~ f5 ~ ~ ~").s("blip"),
  
  // Lead
  note("~ ~ e2 g2 [b2 c2] ~ ~ ~").s("ld"),
  
  // HiHats
  note("[c c] [c c*3] c [c c]").s("zzfx_hh")
);
