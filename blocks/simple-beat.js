// Block: Simple beat
// Created in tracker

export const name = "Simple beat";
export const description = "Created in tracker";

export const pattern = `stack(
  note("c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ ~ c3 ~ ~ c3").s("demo-kickdrum"),
  note("~ ~ ~ ~ c3 ~ ~ ~ ~ ~ ~ ~ c3 ~ ~ ~").s("demo-snare"),
  note("~ ~ c3 ~ ~ ~ [c3 c3] [c4 c4] [c4 c4] ~ [c3 c3 c3] ~ ~ ~ [c3 c3 c3 c3] ~").s("demo-hh-open"),
  note("c3 ~ ~ c3 ~ c3 ~ ~ ~ ~ ~ c3 ~ c3 ~ ~").s("demo-hh-closed")
)`;

// Optional: Tracker state for re-editing
export const trackerState = {
  "version": 1,
  "channels": 4,
  "steps": 16,
  "grid": [
    [
      "c3",
      null,
      null,
      null,
      "c3",
      null,
      null,
      null,
      "c3",
      null,
      null,
      null,
      "c3",
      null,
      null,
      "c3"
    ],
    [
      null,
      null,
      null,
      null,
      "c3",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "c3",
      null,
      null,
      null
    ],
    [
      null,
      null,
      "c3",
      null,
      null,
      null,
      "c3",
      "c4",
      "c4",
      null,
      "c3",
      null,
      null,
      null,
      "c3",
      null
    ],
    [
      "c3",
      null,
      null,
      "c3",
      null,
      "c3",
      null,
      null,
      null,
      null,
      null,
      "c3",
      null,
      "c3",
      null,
      null
    ]
  ],
  "reps": [
    [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ],
    [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ],
    [
      null,
      null,
      null,
      null,
      null,
      null,
      2,
      2,
      2,
      null,
      3,
      null,
      null,
      null,
      4,
      null
    ],
    [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  ],
  "channelInstruments": [
    "demo-kickdrum",
    "demo-snare",
    "demo-hh-open",
    "demo-hh-closed"
  ]
};
