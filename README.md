# Strudel to ZzFXM

This is an authoring/export tool for ZzFXM that embeds Strudel for its REPL workflow and Visual Arranger. It’s not a Strudel fork and doesn’t aim to replace or extend Strudel; it focuses on ZzFXM export and related tooling, bridging these creative tools together.

In practice it's a browser-based tool to compose **game-music loops** with Strudel patterns (and **Blocks**, a tracker-style workflow), design sounds with a **ZzFXMicro-friendly instrument editor**, and export **ZzFXM-ready song data** (plus WAV downloads for quick preview/sharing).

Under the hood, Strudel is used for **pattern notation + event scheduling**, and instruments are **ZzFXMicro-compatible** (registered as Strudel sounds for playback). The Visual Arranger uses Strudel under it's hood, which means a valid path for integration efforts. The export target is **ZzFXM**.

## Who This Is For

- Tiny web games and prototypes that use ZzFXM-style playback.
- js13k-style size/perf constraints (optional voice limiting).
- Anyone who wants fast iteration: write a pattern, preview, export song data.
- Anyone who prefers tracker/step-sequencer style composition but still wants Strudel’s flexibility.

## Quickstart

1. Open an arrangement or pattern from the "Your" folder and hit play
1. Select instrument and try to make changes to the parameters
1. Try to modify blocks, arrangements or Strudel pattern
1. Note: Arrangements/Blocks and Strudel patterns aren't integrated, they are separate resources
1. Click `Pattern to ZzFXM` or `ARR. to ZzFXM` if you're using the Arranger.
1. After this, click the play button to preview ZzFXM playback.
1. Open `Song Data` to inspect/download the exported JSON.
1. Click `Export WAV` if you want a quick audio file to share/test.

## Hosted vs Local

The **hosted** version is the quickest way to start (no install required), especially if you just want to write patterns, tweak instruments, and export. Local setup is mainly for developers who want to modify the app/exporter or run it offline.

## Local Development Requirements

- Node.js: `^20.19.0 || >=22.12.0` (matches Vite's engine requirement in `package-lock.json`)
- npm (any version that supports lockfile v3 is fine)

## What This App Is For

- Compose music using a Strudel REPL workflow (patterns + scheduling).
- Design instruments using ZzFXMicro-style parameters (and use those same instruments during Strudel playback).
- Export JSON song data for use in games/apps that use ZzFXM-style song playback.

Disclaimer: Currently this app is solely made for my specific needs, but I'm always happy to hear if you have found it useful.

## Alpha Status / Expectations

This is an **alpha**:
- The exporter is the “product”. The Strudel REPL is the authoring UI. Visual Arranger is for those who like more traditional way.
- Some Strudel features may preview fine but not export 1:1 (the README includes export-safe tips below).
- If something exports incorrectly, please open an issue with a minimal pattern reproduction.

## Quick Start

1. Install dependencies:
```bash
npm install
```
2. Start the app:
```bash
npm run dev
```
3. Export patterns:
```bash
npm run export -- 01-Introduction
npm run export -- --all
npm run export -- --all --combined
```

## Export-Safe Tips (In-App Workflow)

This app is optimized for creating ZzFXM-ready music with Strudel patterns. Strudel itself can do much more than what is practical to export 1:1, so it helps to stay within an "export-safe" subset.

### Loudness (Preview + WAV)

- Use the `Balanced` playback loudness preset as a good default starting point.
- If you hear clipping/distortion with dense chords or many layers, reduce loudness (or enable soft clipping) rather than pushing everything hotter.

### Polyphony / Chords

ZzFXM is effectively monophonic per channel. If you use chords, export may expand voices into more channels.

- If you target tight constraints (js13k-style), consider enabling `Limit channel usage`.
- If you use stacked unison notes, consider enabling `Normalize Layers`.

## Project Structure

- `patterns/`: pattern definitions (Strudel modules).
- `instruments.js`: ZzFX instrument parameter definitions.
- `export.js`: CLI exporter that writes JSON to `output/`.
- `src/export-logic.js`: Strudel-to-ZzFXM export conversion logic.
- `output/`: generated export output.

## Licensing And Third-Party Notices

This repository is licensed under `AGPL-3.0-or-later` (see `LICENSE`).

This project also depends on and/or includes adapted code from:

- Strudel (`@strudel/*`) - `AGPL-3.0-or-later`
- ZzFX / ZzFXMicro - `MIT`
- ZzFXM - `MIT`

See `THIRD_PARTY_NOTICES.md` for attribution details and upstream links.

## Authors

#### Jarno Koole

Background in 90s demoscene and especially tracker scene.
Interested by anything related to digital music production.