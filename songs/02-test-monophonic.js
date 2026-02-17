import { stack, arrange, note, s, slow, cat, silence, gain } from "@strudel/core";

export const bpm = 120;

// Feature test: Monophonic horn instrument with polyphonic epiano.

// This uses the external ZzFXMicro pipeline and works with both Strudel and ZzFXM playback.
// Note: Chords will obviously not work if instrument is defined as monophonic.

// Monophonic horn
const horn_fill = note("[b2 g2 e2 g#2]").s("demo-horn");
const horn = note("<a2 e2 a2 [b2 g2 e2 g#2] a2 e3 f2 [b2 g2 e2 d2]>").s("demo-horn");
// Polyphonic epiano
const epiano_harmony = note("a2[a3,c4,e4,b4]e2[g3,c4,e4,a4]d2[f3,c4,f4,b4]g2[b3,d4,g#4,b4]e3[a3,c4,e4,b4]a2[g3,c4,e4,a4]d2[f3,c4,f4,b4]g2[b3,d4,g#4,b4]").s("demo-elpiano").slow(8);
const epiano_melody = note("[c5 a4 g4][a4 e5 g4][f4 a4 g4][g5 e5 f5 g#5][a5 a4 g4][b5 a4 g4][a5 a4 g4][g5 e5 d5 c5]").s("demo-elpiano").slow(8);


export const pattern = arrange(
 [4, stack(epiano_harmony, cat("~", "~", "~", horn_fill))],
 [4, stack(epiano_harmony, horn)],
 [16, stack(epiano_harmony, epiano_melody, horn)]
);
