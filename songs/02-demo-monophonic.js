import { stack, note, s, slow, arrange, silence, gain } from "@strudel/core";

export const bpm = 120;

// Testing monophonic test-horn instrument.

// This a custom feature to the pipeline and works with both Strudel and ZzFXM playback.
// Note: Chords will obviously not work if insturment is defined as monophonic.


export const pattern = stack(
note("e3[a3,c4,e4,b4]a2[g3,c4,e4,a4]d2[f3,c4,f4,b4]g2[b3,d4,g#4,b4]").s("test-elpiano").slow(4),
note("[a5 a4 g4][b5 a4 g4][a5 a4 g4][g5 e5 f5 g#5]").s("test-elpiano").slow(4),
note("<a2 e3 f3 [b2 g2 e2 g#2]>").s("test-horn")
  );
