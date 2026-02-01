// Block: Offbeat Hi-hats
// Classic off-beat hi-hat pattern

export const name = "Offbeat Hi-hats";
export const description = "Eighth-note hi-hats on the off-beats";

export const pattern = `note("~ demo-hh-closed ~ demo-hh-closed ~ demo-hh-closed ~ demo-hh-closed").s("demo-hh-closed")`;

// Optional: Tracker state for re-editing
export const trackerState = {
  version: 1,
  channels: 4,
  steps: 16,
  grid: [
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ["demo-hh-closed", null, "demo-hh-closed", null, "demo-hh-closed", null, "demo-hh-closed", null, "demo-hh-closed", null, "demo-hh-closed", null, "demo-hh-closed", null, "demo-hh-closed", null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]
  ],
  channelInstruments: ["", "demo-hh-closed", "", ""]
};
