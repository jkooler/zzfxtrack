import { note, s, cat } from "@strudel/core";

export const bpm = 120;

export const pattern = // Plays C3-C8 arpeggios on each diagnostic wave shape
// Uses 16 notes to align perfectly with ZzFXM 16-row grid (prevents quantization swing)
cat(
    // Reference Kick (Channel 0) - Confirms Audio Engine is working
    note("c3").s("test-kick"),

    // Sine Wave
    note("c1 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7 g7").s("z-sine"),
    
    // Triangle Wave
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7 g7 c8").s("z-tri"),
    
    // Saw Wave
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7").s("z-saw"),
    
    // Tan Wave
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7 g7 c8").s("z-tan"),
    
    // Noise
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7 g7 c8").s("z-noise"),

    // Square
    note("c3 e3 g3 c4 e4 g4 c5 e5 g5 c6 e6 g6 c7 e7 g7 c8").s("z-square")
);
