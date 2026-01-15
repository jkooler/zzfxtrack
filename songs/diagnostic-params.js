import { note, s, cat } from "@strudel/core";

export const bpm = 120;

export const pattern = // Parameter Diagnostic Song
// Each cycle tests a specific ZzFX parameter in isolation.
// Instruments are defined in instruments.js (Channels 12-17).

cat(
    // 1. Envelope (Attack/Decay/Sustain/Release)
    // Should hear slow fade in, sustain, slow fade out.
    note("c1").s("test_env"),
    
    // 2. Slide
    // Should hear pitch slide UP.
    note("c3").s("test_slide"),
    
    // 3. Pitch Jump
    // Should hear discrete frequency jump after 0.2s.
    note("c3").s("test_jump"),
    
    // 4. Modulation (FM)
    // Should hear metallic/vibrato timbre.
    note("c3").s("test_mod"),
    
    // 5. Tremolo (AM)
    // Should hear volume wobble.
    note("c3").s("test_trem"),
    
    // 6. BitCrush
    // Should hear gritty quantization.
    note("c3").s("test_crush")
);
