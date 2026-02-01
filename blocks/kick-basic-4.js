// Block: Kick Basic 4/4
// A simple four-on-the-floor kick drum pattern

export const name = "Kick Basic 4/4";
export const description = "Classic four-on-the-floor kick pattern";

export const pattern = `note("c4 ~*3 c4 ~*3 c4 ~*3 c4 ~*3").s("demo-kickdrum")`;

// Optional: Tracker state for re-editing
export const trackerState = {
  version: 1,
  channels: 4,
  steps: 16,
  grid: [
    ["c4", null, null, null, "c4", null, null, null, "c4", null, null, null, "c4", null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]
  ],
  channelInstruments: ["demo-kickdrum", "", "", ""]
};
