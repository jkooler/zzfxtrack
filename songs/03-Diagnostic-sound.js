import { note, s, stack, arrange, silence, slow, gain } from "@strudel/core";

export const bpm = 140;

// Note to self:
// Go to the instruments and try to change the parameters of "test-minimal" instrument.
// Listen carefully how each parameter affect the sound, to see if there are apparent bugs.
// Then export this song and listen if the output matches 1:1 with the ZzFXM exported song.


export const pattern = note("c3").s("test-minimal");
