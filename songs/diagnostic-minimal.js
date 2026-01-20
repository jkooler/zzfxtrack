import { note, s } from "@strudel/core";

export const bpm = 140;

export const pattern = // Minimal Test: Single note, Volume=1, Decay=1, all else 0
// This tests the most basic ZzFX envelope behavior
note("c3").s("z-minimal");
