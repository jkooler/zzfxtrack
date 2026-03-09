import { stack, arrange, note, s, slow, silence, gain } from "@strudel/core";

export const bpm = 120;

// This is the introduction pattern made with "Insert Blocks" -feature.

// This feature is found top right corner and is consider experimental alpha.
// Goal of the feature is to merge traditional tools with Strudel.

// The thing you see below is the output the feature spits out.

// BLOCKS START
const block_351_chords = (stack(
  note("c2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ d#2 ~ ~ ~ ~ ~ ~ ~ g2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").s("pad-s"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ c4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ c3 ~ ~ ~ ~ ~ ~ ~ d4 ~ ~ ~ ~ ~ ~ ~").s("pad-s"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ f4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ d#4 ~ ~ ~ ~ ~ ~ ~ f4 ~ ~ ~ ~ ~ ~ ~").s("pad-s"),
  note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a#3 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a#4 ~ ~ ~ ~ ~ ~ ~ a4 ~ ~ ~ ~ ~ ~ ~").s("pad-s")
)).slow(4);
const block_351_bass = (note("c2 ~ ~ ~ ~ ~ ~ ~ a1 ~ ~ a1 ~ ~ a1 ~ c2 ~ ~ ~ c2 ~ ~ ~ g1 ~ ~ ~ ~ ~ ~ ~ a#1 ~ ~ ~ ~ ~ ~ ~ g1 ~ ~ g1 ~ ~ g1 ~ c2 ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ g1 ~ ~ ~").s("bass-s")).slow(4);
const block_351_drums = (stack(
  note("a#2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a#2 ~ ~ ~ a#2 ~ ~ ~ ~ ~ ~ ~ a#2 ~ a#2 ~ d4 ~ ~ ~").s("kickdrum-s"),
  note("~ ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ c2 ~ ~ ~ ~ ~ ~ ~ c2 ~ ~ ~").s("snare-s"),
  note("~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~").s("hh-open-s"),
  note("c3 ~ ~ c3 ~ c3 ~ ~ ~ ~ ~ c3 ~ c3 ~ ~ c3 ~ ~ c3 ~ c3 ~ ~ c3 ~ ~ c3 c3 ~ ~ ~").s("hh-closed-s")
)).slow(2);
const block_351_synths = (note("d4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~ f4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~ g4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~ d4 ~ ~ ~ a#3 ~ c4 ~ f3 ~ ~ ~ f4 ~ d#4 ~").s("synth-stab-s")).slow(4);
const block_351_cowbell = (note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ c4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ c4 ~ c4 ~ ~ ~").s("cowbell-s")).slow(4);
// BLOCKS END

// ARRANGEMENTS START
const arr_01_introduction_demo = arrange(
  [4, stack(block_351_chords, block_351_bass)],
  [4, stack(block_351_drums, block_351_chords, block_351_bass)],
  [8, stack(block_351_drums, block_351_chords, block_351_synths, block_351_bass, block_351_cowbell)]
);
// ARRANGEMENTS END


export const pattern = stack(
  // This is the introduction pattern made with "Insert Blocks" -feature.

// This feature is found top right corner and is consider experimental alpha.
// Goal of the feature is to merge traditional tools with Strudel.

// The thing you see below is the output the feature spits out.,
  arr_01_introduction_demo
);
