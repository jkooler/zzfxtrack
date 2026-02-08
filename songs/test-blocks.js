import { stack, arrange, note, s, slow, silence, gain } from "@strudel/core";

export const bpm = 120;

// BLOCKS START
const block_bassline_js = note("c1 ~ c1 ~ ~ ~ ~ ~ ~ ~ ~ ~ g1 ~ ~ ~").s("demo-bass");
const block_simple_chord_pattern_js = (stack(
  note("c4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ b3 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("demo-pad"),
  note("e4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ d4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("demo-pad"),
  note("a3 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ e3 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("demo-pad"),
  note("b4 ~ ~ ~ ~ ~ ~ ~ g4 ~ ~ ~ ~ e4 ~ ~ a4 ~ ~ ~ ~ ~ ~ ~ b4 ~ ~ ~ c5 ~ ~ ~").s("demo-pad")
)).slow(2);
// BLOCKS END

// ARRANGEMENTS START
const arr_testing_arrangement = arrange(
  [1, stack(block_bassline_js)],
  [4, stack(block_bassline_js, block_simple_chord_pattern_js)]
);
// ARRANGEMENTS END


export const pattern = stack(arr_testing_arrangement);
