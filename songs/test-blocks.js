import { stack, note, s, slow, gain } from "@strudel/core";

export const bpm = 120;

// BLOCKS START
const block_bassline = note("c1 ~ c1 ~ ~ ~ ~ ~ ~ ~ ~ ~ g1 ~ ~ ~").s("demo-bass");
const block_lead = note("f4 ~ d4 ~ ~ ~ ~ ~ g3 ~ ~ a3 ~ ~ e4 ~").s("test-tri");
const block_simple_beat = stack(
  note("g1 ~ ~ ~ g1 ~ ~ ~ g1 ~ ~ ~ g1 ~ ~ g1").s("test-kick"),
  note("~ ~ ~ ~ c3 ~ ~ ~ ~ ~ ~ ~ c3 ~ ~ ~").s("demo-snare"),
  note("~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~").s("demo-hh-open"),
  note("c3 ~ ~ c3 ~ c3 ~ ~ ~ ~ ~ c3 ~ c3 ~ ~").s("demo-hh-closed")
);
const block_simple_chord_pattern = stack(
  note("c4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("demo-pad"),
  note("e4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("demo-pad"),
  note("a3 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("demo-pad"),
  note("b4 ~ ~ ~ ~ ~ ~ ~ g4 ~ ~ ~ ~ e4 ~ ~").s("demo-pad")
);
// BLOCKS END


export const pattern = stack(block_bassline, block_lead, block_simple_beat, block_simple_chord_pattern);
