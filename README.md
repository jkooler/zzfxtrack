# ZzFXTrack

**ZzFXTrack** is a music creation app that uses [**ZzFXMicro**](https://github.com/KilledByAPixel/ZzFX) synthesis by [**Frank Force**](https://github.com/KilledByAPixel). It embeds [**Strudel**](https://strudel.cc/) for its REPL workflow and adds a custom made **Arranger** and **Blocks** with a tracker interface. The Arranger and Blocks is built upon Strudel's patterns and scheduling with one way integration support.

**Instruments** can be created using a streamlined editor with scrub inputs. Instruments are audited by ZzFXMicro externally instead of Strudel's internal sound engine with ZzFX support. This is because the music needs to be exported to games or demos in an optimal and predictable way.

Exported music can be played with the bundled **ZzFXTrack Player** which takes its inspiration from [**ZzFXM**](https://keithclark.github.io/ZzFXM) by [**Keith Clark**](https://github.com/keithclark) and **Frank Force**. Developers can freely use it their projects or build their own. WAV export is also supported.

Disclaimer: ZzFXTrack is not affiliated with or endorsed by creators of Strudel, ZzFX and ZzFXM. It's made for my personal projects, but I'm always open to expand the idea and collaborate.

## Creator's Quick Start

1. Open an Arrangement or Pattern from the left sidebar and hit play.
1. Select an Instrument from the left sidebar that is being used in the playback.
1. Make some changes to the parameters to see how the sound changes.
1. After this you could try to modify Blocks, Arrangements, or the Strudel pattern.
1. You can then click Export in the footer and choose ZzFXTrack Player.
1. Next you can click the play button to preview ZzFXTrack Player playback.
1. The sound you hear now comes from the exported JSON file and ZzFXTrack Player.
1. Click `Export WAV` if you want a quick audio file to share or test.

Take your time and explore. There are lots of features that aren't explained directly, but to be discovered.

## Installation and usage: Hosted vs Local

The **hosted** version is the quickest way to start (no install required), especially if you just want to write patterns, tweak instruments, and export. Local setup is mainly for developers who want to modify the app/exporter or run it offline.

## Hosted

A hosted version is planned (likely via GitHub Pages) once this project is published publicly.

For now, the only supported way to run ZzFXTrack is locally (see **Developer's Quick Start** below). When a hosted build is available, its URL and any differences from local usage will be documented here.

## Local Development Requirements

- Node.js: `^20.19.0 || >=22.12.0` (matches Vite's engine requirement in `package-lock.json`)
- npm (any version that supports lockfile v3 is fine)

## What This App Is For

- Compose music using a Strudel REPL workflow (patterns + scheduling).
- Design instruments using ZzFXMicro-style parameters (and use those same instruments during Strudel playback).
- Export JSON song data for use in games/apps that use ZzFXTrack Player song playback.

Disclaimer: This app was originally built for my personal projects, but it’s designed so others can compose, export, and embed the player as well.

## Alpha Status / Expectations

This is an **alpha**:
- The exporter is the “product”. The Strudel REPL is the authoring UI. Visual Arranger is for those who like more traditional way.
- Some Strudel features may preview fine but not export 1:1 (the README includes export-safe tips below).
- If something exports incorrectly, please open an issue with a minimal pattern reproduction.
- Aimed to be stable with backwards compatibility, if updated in next release:
   - Export: JSON/JS structure for the ZzFXTrack Player
   - Instrument parameters
   - Resources (Patterns, Arrangements, Blocks, Tracker)
- Subject to change:
   - UI/UX stuff

## Developer's Quick Start

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

## Example of data export

//! Generated by ZzFXTrack

```
// ZzFXTrack Player song data: [instruments, patterns, sequence, BPM]
export const songData = {"song":[[[0.2,0,232,0.01,0,0,4,1,0,0,0,0,0,0,0,0,0,0,1,0,0],[0.9,0,72,0,0.01,0.08,0,1,0,0,0,0,0,0,0,0,0,0.57,0.01,0,0],[1.3,0.05,233.08,0,0.16,0,1,14,38,98,358,0,0,2.16,730,0,0,0.06,0.17,0,578],[0.85,0,440,0,0.29,0.16,1,6.3,0,0,0,0,0.48,0.15,0,0,0,0.04,0.1,-0.5,0],[0.5,0,440,0.5,0.21,0.92,2,3,0,0,0,0,0.4,0.2,0,0,0,0.2,0.4,0.3,-553],[0.25,0,440,0.01,0,0,2,1.5,0,0,0,0,0,0,0,0,0,0,1,0,0]],[[{"72":[0,16,2.0805446207650533],"_":96},{"0":[1,0,11.337216544988166],"12":[1,0,-8.662783455011834],"24":[1,0,18.337216544988166],"36":[1,0,53.337216544988166],"48":[1,0,-0.6627834550118337],"54":[1,0,12.337216544988166],"60":[1,0,0.33721654498816633],"66":[1,12,24.337216544988166],"69":[1,12,24.337216544988166],"72":[1,0,36.337216544988166],"_":96},{"48":[2,0,-28.99986030457525],"_":96},{"12":[3,0,-2],"24":[3,0,-14],"42":[3,0,-21],"60":[3,0,0],"_":96},{"0":[4,0,-7],"_":96},{"0":[4,0,-21],"_":96},{"0":[5,0,-3],"_":96}],[{"72":[0,16,2.0805446207650533],"_":96},{"0":[1,0,11.337216544988166],"12":[1,0,-8.662783455011834],"24":[1,0,18.337216544988166],"36":[1,0,53.337216544988166],"48":[1,0,-0.6627834550118337],"54":[1,0,12.337216544988166],"60":[1,0,0.33721654498816633],"66":[1,12,24.337216544988166],"69":[1,12,24.337216544988166],"72":[1,0,36.337216544988166],"_":96},{"48":[2,0,-28.99986030457525],"_":96},{"0":[3,0,2],"6":[3,0,2],"24":[3,0,5],"48":[3,0,-3],"84":[3,0,-5],"_":96},{"0":[4,0,-5],"_":96},{"0":[4,0,-19],"_":96},{"0":[5,0,-2],"_":96}],[{"72":[0,16,2.0805446207650533],"_":96},{"0":[1,0,11.337216544988166],"12":[1,0,-8.662783455011834],"24":[1,0,18.337216544988166],"36":[1,0,53.337216544988166],"48":[1,0,-0.6627834550118337],"54":[1,0,12.337216544988166],"60":[1,0,0.33721654498816633],"66":[1,12,24.337216544988166],"69":[1,12,24.337216544988166],"72":[1,0,36.337216544988166],"_":96},{"48":[2,0,-28.99986030457525],"_":96},{"0":[3,0,3],"6":[3,0,3],"24":[3,0,5],"48":[3,0,0],"84":[3,0,-2],"_":96},{"0":[4,0,-9],"_":96},{"0":[4,0,-24],"_":96},{"0":[5,0,-5],"_":96}]],[0,1,0,2,0,1,0,2,0,1,0,2,0,1,0,2],720],"mix":{"targetPeak":0.5,"masterGainDb":3,"softClipDrive":1.4}};
export default songData;
```

## Using the ZzFXTrack Player in your project

Exported JSON from this app is for the **ZzFXTrack Player** (ZzFXMicro 20-parameter format). It is not compatible with the modified ZzFXM player. To play exported songs in your game or other project you need the standalone player.

**Alpha:** There is no published npm package yet for the player. Use the player by copying the standalone package from this repo:

1. Copy the **`packages/zzfxtrack-player/`** folder into your project (the whole folder: `index.js`, `src/`, `package.json`, `README.md`).
2. Import in your code, e.g.  
   `import { playZzFXTrackSong, stopZzFXTrackSong, buildSong } from './zzfxtrack-player/index.js';`  
   (adjust the path to where you placed the folder).
3. Pass your exported song data (either the `[instruments, patterns, sequence, BPM]` array or the `{ song, mix }` object from JSON) and an `AudioContext` to `playZzFXTrackSong(songData, audioCtx, onEnded?, options?)`.

The package has no dependencies. See **`packages/zzfxtrack-player/README.md`** in this repo for the full API, song format, and a minimal example. A published package or separate repo may follow later.

## System resources and updates

**System** resources (patterns, blocks, arrangements, and instruments in the "System" folder) are part of the app’s codebase. You can edit and delete (in dev mode) them like any other resource, but they are treated as **built-in presets** rather than user data.

- **Persistence:** System resources live in the repository (`patterns/`, `arrangements/`, `blocks/`, `instruments.system.js`, etc.). When you update or reinstall the app, these files may change.
- **Overwrites on update:** **Your changes may be overwritten when you update the app**—system files are tracked in the repo and can change with new versions.
- **Recommended workflow:** If you want to keep customizations long-term, duplicate or copy system content into user resources (e.g. your own patterns/blocks/instruments), or export your work to JSON/WAV. Treat the "System" content as a starting point, not a storage location for personal work.

## Project Structure

- `src/`: main web app (Strudel REPL UI, Arranger, Blocks/tracker, export logic, and ZzFXTrack Player preview/offline render).
- `patterns/`, `arrangements/`, `blocks/`: pattern/arrangement/block definitions used by the app (including "System" content).
- `instruments.js`: user ZzFX instrument parameter definitions.
- `instruments.system.js`: built-in/system instruments shipped with the app.
- `export.js`: CLI exporter that writes JSON song data to `output/`.
- `output/`: generated export output (JSON and related artifacts).
- `packages/zzfxtrack-player/`: standalone ZzFXTrack Player package (no dependencies). For games/projects that play exported JSON. After changing player code in `packages/zzfxtrack-player/src/`, run any sync/build scripts described in `RELEASING.md` (if needed).
- `public/`, `index.html`, `vite.config.js`: Vite-based frontend build and static assets.

## Versioning and releases

ZzFXTrack is currently in **pre-1.0 alpha**. Breaking changes may occur between releases while the tooling and export pipeline are still being refined.

- **Export format and player API:** The JSON/JS export structure for the ZzFXTrack Player and the core player API (`playZzFXTrackSong`, `stopZzFXTrackSong`, `buildSong`) are intended to be kept reasonably stable once published in a tagged release, but may still change before a 1.0 version.
- **UI and workflow:** The UI layout, Strudel integration details, and in-app workflows may change more freely between versions.
- See `CHANGELOG.md` for a summary of notable changes between releases.

## Data persistence and privacy

The app is designed to work without user accounts.

- **Local data:** Projects, patterns, arrangements, blocks, and instruments you create in the UI are stored locally in the browser (e.g. local storage) and/or in files on your machine when running locally. Hosted builds do not upload your content to a backend server.
- **Exports:** When you export JSON or WAV, those files are written to your local filesystem (for local runs) or offered as downloads in the browser. You are responsible for managing and backing up these exports.
- **Analytics/telemetry:** There is currently no external telemetry or analytics pipeline described here; if this changes in the future, it will be documented in this README.

## Browser and platform support

There is currently no formal browser/platform matrix yet. The focus is on modern desktop browsers with Web Audio support.

- Expect best results on up-to-date Chromium-based browsers (e.g. Chrome, Edge) on desktop.
- Other modern browsers (e.g. Firefox, Safari) may work but have not been systematically tested yet.
- Mobile browsers and touch workflows are experimental and may have audio/autoplay limitations.

## Contributing and issues

ZzFXTrack is currently developed primarily for the author’s own projects, and a public repository/issues board may not yet be available.

- If/when a public repository and issue tracker are published, contribution guidelines will be added here.
- Until then, treat the app as an alpha tool: you are welcome to experiment with it and adapt the code for your own projects, but external contributions are not yet part of a formal process.

## Licensing And Third-Party Notices

This repository is licensed under `AGPL-3.0-or-later` (see `LICENSE`).

This project also depends on and/or includes adapted code from:

- Strudel (`@strudel/*`) - `AGPL-3.0-or-later`
- ZzFX / ZzFXMicro - `MIT`
- ZzFXM for early boilerplate and inspiration

See `THIRD_PARTY_NOTICES.md` for attribution details and upstream links.

## About the authors

#### Jarno Koole

My background is in 90s demoscene and especially late 90s tracker scene.
To this day I'm interested anything related to digital music production.