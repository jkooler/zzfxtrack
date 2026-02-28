import { stack, arrange, note, s, slow, silence, gain } from "@strudel/core";

export const bpm = 120;

// This is the introduction song made with "Insert Blocks" -feature.

// This feature is found top right corner and is consider experimental alpha.
// Goal of the feature is to merge traditional tools with Strudel.

// The thing you see below is the output the feature spits out.

// BLOCKS START
const block_simple_chord_pattern_js = (stack(
  note("c2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ d#2 ~ ~ ~ ~ ~ ~ ~ g2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("demo-pad"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ c4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ c3 ~ ~ ~ ~ ~ ~ ~ d4 ~ ~ ~ ~ ~ ~ ~").s("demo-pad"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ f4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ d#4 ~ ~ ~ ~ ~ ~ ~ f4 ~ ~ ~ ~ ~ ~ ~").s("demo-pad"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a#3 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a#4 ~ ~ ~ ~ ~ ~ ~ a4 ~ ~ ~ ~ ~ ~ ~").s("demo-pad")
)).slow(4);
const block_simple_bass_line_js = (stack(
  note("c2 ~ ~ ~ ~ ~ ~ ~ a1 ~ ~ a1 ~ ~ a1 ~ c2 ~ ~ ~ c2 ~ ~ ~ g1 ~ ~ ~ ~ ~ ~ ~ a#1 ~ ~ ~ ~ ~ ~ ~ g1 ~ ~ g1 ~ ~ g1 ~ c2 ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ g1 ~ ~ ~").s("demo-bass"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("demo-pad"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("demo-pad"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("demo-pad")
)).slow(4);
const block_simple_beat_js = (stack(
  note("a#2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a#2 ~ ~ ~ a#2 ~ ~ ~ ~ ~ ~ ~ a#2 ~ a#2 ~ d4 ~ ~ ~").s("demo-kickdrum"),
  note("~ ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ c2 ~ ~ ~").s("demo-snare"),
  note("~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~").s("demo-hh-open"),
  note("c3 ~ ~ c3 ~ c3 ~ ~ ~ ~ ~ c3 ~ c3 ~ ~ c3 ~ ~ c3 ~ c3 ~ ~ c3 ~ ~ c3 c3 ~ ~ ~").s("demo-hh-closed")
)).slow(2);
const block_synth_stab_js = (note("d4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~ f4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~ g4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~ d4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~").s("demo-synth-stab")).slow(4);
// BLOCKS END

// ARRANGEMENTS START
const arr_test_arrangement = arrange(
  [4, stack(block_simple_chord_pattern_js, block_simple_bass_line_js)],
  [4, stack(block_simple_beat_js, block_simple_bass_line_js, block_simple_chord_pattern_js)],
  [8, stack(block_simple_bass_line_js, block_simple_beat_js, block_simple_chord_pattern_js, block_synth_stab_js)]
);
// ARRANGEMENTS END


export const pattern = stack(
  arr_test_arrangement
);
