import { stack, note, s } from "@strudel/core";

export const bpm = 120;

export const pattern =
stack(
  note("c4 ~*3 c4 ~*3 c4 ~*3 c4 ~*3").s("demo-kickdrum"),
  note("c4 ~*7 a4 ~*3 d4 ~ g4 ~").s("demo-pad"),
  note("c3 d3 e3 c3 d3 f3 c4 f3 e4 f3 d3 e3 f3 g3 d3 e3").s("test-sine")
);
