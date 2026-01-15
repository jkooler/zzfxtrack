import { note, s, cat } from "@strudel/core";

export const bpm = 120;

export const pattern = // Plays C3-C6 arpeggios on each diagnostic wave shape
cat(
    // Reference Kick (Channel 0) - Confirms Audio Engine is working
    note("c3").s("bd"),

    // Sine Wave
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6").s("sine"),
    
    // Triangle Wave
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6").s("tri"),
    
    // Saw Wave
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6").s("saw"),
    
    // Tan Wave
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6").s("tan"),
    
    // Noise
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6").s("noise")
);
