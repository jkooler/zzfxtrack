import { stack, note, s, arrange, silence, slow, gain } from "@strudel/core";

export const bpm = 120;


export const pattern = stack(
note("c3 e3 g3").s("casio"),
note("c2 c2 c2").s("bd")
);
