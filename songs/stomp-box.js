import { stack, note, s } from "@strudel/core";

export const bpm = 110;

export const pattern = stack(
  // Bass drum-ish
  note("c1(3,8)").s("bd"),
  
  // HiHats
  note("~ c2 ~ c2").s("hh"),
  
  // Funky Lead
  note("g3 [bb3 c4] ~ [f4 eb4]").s("blur")
);
