# ZzFXTrack

**ZzFXTrack** is an authoring/export tool for music made with ZzFXMicro that embeds Strudel for its REPL workflow and Visual Arranger. It’s not a Strudel fork and doesn’t aim to replace or extend Strudel; it focuses on the exporting funcationality and related tooling, bridging these creative tools together.

In practice it's a browser-based tool to compose **game-music loops** with Strudel patterns (and **Blocks**, a tracker-style workflow), design sounds with a **ZzFXMicro-friendly instrument editor**, and export **ZzFXTrack Player song data** (plus WAV downloads for quick preview/sharing).

Under the hood, Strudel is used for **pattern notation + event scheduling**, and instruments are **ZzFXMicro-compatible** (registered as Strudel sounds for playback). The Visual Arranger uses Strudel under it's hood, which means a valid path for integration efforts. The export target is JSON file that **ZzFXTrack Player** can play.

ZzFXTrack is an independent project and is not affiliated with or endorsed by Frank Force, KilledByAPixel, or the ZzFXM authors.

## Quickstart

1. Open an arrangement or pattern from the "Your" folder and hit play
1. Select instrument and try to make changes to the parameters
1. Try to modify blocks, arrangements or Strudel pattern
1. Note: Arrangements/Blocks and Strudel patterns aren't integrated, they are separate resources
1. Click <strong>Export ZzFXTrack</strong> (pattern or arrangement).
1. After this, click the play button to preview ZzFXTrack Player playback.
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
- Export JSON song data for use in games/apps that use ZzFXTrack Player song playback.

Disclaimer: Currently this app is solely made for my specific needs.

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

This app is optimized for creating ZzFXTrack Player-ready music with Strudel patterns. Strudel itself can do much more than what is practical to export 1:1, so it helps to stay within an "export-safe" subset.

### Loudness (Preview + WAV)

- Use the `Balanced` playback loudness preset as a good default starting point.
- If you hear clipping/distortion with dense chords or many layers, reduce loudness (or enable soft clipping) rather than pushing everything hotter.

### Polyphony / Chords

The export format is effectively monophonic per channel. If you use chords, export may expand voices into more channels.

- If you target tight constraints (js13k-style), consider enabling `Limit channel usage`.
- If you use stacked unison notes, consider enabling `Normalize Layers`.

### Export resolution and file size

Export uses **rows per cycle** (e.g. 48 or 96) to grid notes in time. Each cycle (e.g. one bar) is that many rows in the pattern data.

- **Higher resolution** (e.g. 96) → more rows per bar → larger JSON and more precise timing.
- **Lower resolution** (e.g. 48) → fewer rows per bar → smaller export and slightly coarser timing.

If exported pattern data feels long or bloated, try a lower resolution; it often reduces file size noticeably with little audible difference for typical loops.

## Using the ZzFXTrack Player in your project

Exported JSON from this app is for the **ZzFXTrack Player** (ZzFXMicro 21-param format). It is not compatible with the canonical ZzFXM player. To play exported songs in your game or other project you need the standalone player.

**Alpha:** There is no published npm package yet. Use the player by copying the standalone package from this repo:

1. Copy the **`packages/zzfxtrack-player/`** folder into your project (the whole folder: `index.js`, `src/`, `package.json`, `README.md`).
2. Import in your code, e.g.  
   `import { playZzfxmSong, stopZzfxmSong, buildSong } from './zzfxtrack-player/index.js';`  
   (adjust the path to where you placed the folder.)
3. Pass your exported song data (the `[instruments, patterns, sequence, BPM]` array, e.g. from JSON) and an `AudioContext` to `playZzfxmSong(songData, audioCtx, onEnded?, options?)`.

The package has no dependencies. See **`packages/zzfxtrack-player/README.md`** in this repo for the full API, song format, and a minimal example. A published package or separate repo may follow later.

## System resources and updates

**System** resources (patterns, blocks, arrangements, and instruments in the "System" folder) are part of the app’s codebase. You can edit and delete them like any other resource. **Your changes may be overwritten when you update the app**—system files are tracked in the repo and can change with new versions. If you want to keep customizations long-term, duplicate or copy content into user resources, or export your work.

## Project Structure

- `patterns/`: pattern definitions (Strudel modules).
- `instruments.js`: ZzFX instrument parameter definitions.
- `export.js`: CLI exporter that writes JSON to `output/`.
- `src/export-logic.js`: Strudel-to-ZzFXTrack Player export conversion logic.
- `src/zzfxtrack-player.js`: ZzFXTrack Player (export preview and offline render).
- `packages/zzfxtrack-player/`: Standalone player package (no dependencies). For games/projects that play exported JSON. After changing player code in `src/`, run `npm run sync-player` to copy into the package.
- `output/`: generated export output.

## Licensing And Third-Party Notices

This repository is licensed under `AGPL-3.0-or-later` (see `LICENSE`).

This project also depends on and/or includes adapted code from:

- Strudel (`@strudel/*`) - `AGPL-3.0-or-later`
- ZzFX / ZzFXMicro - `MIT`
- ZzFXM for early boilerplate and inspiration

See `THIRD_PARTY_NOTICES.md` for attribution details and upstream links.

## Authors

#### Jarno Koole

Background in 90s demoscene and especially tracker scene.
Interested by anything related to digital music production.