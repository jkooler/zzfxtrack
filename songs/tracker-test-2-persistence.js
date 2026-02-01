import { stack, note, s } from "@strudel/core";

export const bpm = 120;

export const pattern = /* @tracker-data {"version":1,"channels":4,"steps":16,"grid":[["c3",null,null,null,"c3",null,null,null,"c3",null,null,null,"c3",null,null,null],[null,null,null,null,"c3",null,null,null,null,null,null,null,null,"c3",null,null],[null,"b4","b4",null,"b4",null,"b4","b4",null,"b4","b4",null,"b4",null,"b4",null],[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]],"channelInstruments":["demo-bass","demo-snare","demo-synth-stab",""]} */

export const pattern =
stack(
  note("c3 ~*3 c3 ~*3 c3 ~*3 c3 ~*3").s("demo-bass"),
  note("~*4 c3 ~*8 c3 ~*2").s("demo-snare"),
  note("~ b4*2 ~ b4 ~ b4*2 ~ b4*2 ~ b4 ~ b4 ~").s("demo-synth-stab")
);;
