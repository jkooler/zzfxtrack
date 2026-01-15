import { note, s } from "@strudel/core";

export const bpm = 120;

// Minimal Test: Single note, Volume=1, Decay=1, all else 0
// This tests the most basic ZzFX envelope behavior
export const pattern = note("c3").s("minimal");
