import { stack, note, s } from "@strudel/core";

export const bpm = 120;

export const pattern = stack(
  note("c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ c3").s("demo-kickdrum"),
  note("~ ~ ~ ~ c3 ~ ~ ~ ~ ~ ~ ~ c3 ~ ~ ~").s("demo-snare"),
  note("~ ~ c3 ~ ~ ~ [c3 c3] [c4 c4] [c4 c4] ~ [c3 c3 c3] ~ ~ ~ [c3 c3 c3 c3] ~").s("demo-hh-open"),
  note("c3 ~ ~ c3 ~ c3 ~ ~ ~ ~ ~ c3 ~ c3 ~ ~").s("demo-hh-closed")
);
