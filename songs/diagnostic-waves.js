import { note, s, cat } from "@strudel/core";

export const bpm = 120;

export const pattern = // Plays C3-C8 arpeggios on each diagnostic wave shape

cat(
    // Test kick
    note("c2").s("test-kick"),

    // Sine Wave
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7 g7 c8").s("test-sine"),
    
    // Triangle Wave
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7 g7 c8").s("test-tri"),
    
    // Saw Wave
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7 g7 c8").s("test-saw"),
    
    // Tan Wave
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7 g7 c8").s("test-tan"),
    
    // Noise
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7 g7 c8").s("test-noise"),

    // Square
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7 g7 c8").s("test-square")
);
