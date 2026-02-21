import { note, s, stack, arrange, silence, slow, gain } from "@strudel/core";

export const bpm = 120;




// BLOCKS START
const block_bass_js = (note("c2 ~ ~ ~ ~ ~ ~ ~ a1 ~ ~ a1 ~ ~ a1 ~ c2 ~ ~ ~ c2 ~ ~ ~ g1 ~ ~ ~ ~ ~ ~ ~ a#1 ~ ~ ~ ~ ~ ~ ~ g1 ~ ~ g1 ~ ~ g1 ~ c2 ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ g1 ~ ~ ~").s("bass")).slow(4);
const block_chords_js = (stack(
  note("c2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ d#2 ~ ~ ~ ~ ~ ~ ~ g2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("pad"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ c4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ c3 ~ ~ ~ ~ ~ ~ ~ d4 ~ ~ ~ ~ ~ ~ ~").s("pad"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ f4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ d#4 ~ ~ ~ ~ ~ ~ ~ f4 ~ ~ ~ ~ ~ ~ ~").s("pad"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a#3 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a#4 ~ ~ ~ ~ ~ ~ ~ a4 ~ ~ ~ ~ ~ ~ ~").s("pad")
)).slow(4);
const block_drums_js = (stack(
  note("a#2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a#2 ~ ~ ~ a#2 ~ ~ ~ ~ ~ ~ ~ a#2 ~ a#2 ~ d4 ~ ~ ~").s("kickdrum"),
  note("~ ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ c2 ~ ~ ~").s("snare"),
  note("~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~").s("hh-open"),
  note("c3 ~ ~ c3 ~ c3 ~ ~ ~ ~ ~ c3 ~ c3 ~ ~ c3 ~ ~ c3 ~ c3 ~ ~ c3 ~ ~ c3 c3 ~ ~ ~").s("hh-closed")
)).slow(2);
const block_synths_js = (note("d4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~ f4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~ g4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~ d4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~").s("synth-stab")).slow(4);
// BLOCKS END

// ARRANGEMENTS START
const arr_arrangement = arrange(
  [4, stack(block_bass_js, block_chords_js)],
  [4, stack(block_drums_js, block_chords_js, block_bass_js)],
  [8, stack(block_drums_js, block_chords_js, block_synths_js, block_bass_js)]
);
// ARRANGEMENTS END
export const pattern = stack(arr_arrangement);
