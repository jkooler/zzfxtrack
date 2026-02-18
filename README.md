# Strudel to ZzFXM

Browser-based tool to compose with Strudel patterns, preview generated sound, and export song/instrument data compatible with ZzFXM playback.

## Requirements

- Node.js: `^20.19.0 || >=22.12.0` (matches Vite's engine requirement in `package-lock.json`)
- npm (any version that supports lockfile v3 is fine)

## What This App Is For

- Compose music using a Strudel REPL workflow.
- Define and test ZzFX instrument parameters.
- Export JSON song data for use in games/apps that use ZzFXM-style song playback.

Disclaimer: Currently this app is solely made for my specific needs, but I'm always happy to hear if you have found it useful! -Jarno Koole (jarno@koole.fi)

## Quick Start

1. Install dependencies:
```bash
npm install
```
2. Start the app:
```bash
npm run dev
```
3. Export songs:
```bash
npm run export -- 01-demo-song
npm run export -- --all
npm run export -- --all --combined
```

## Project Structure

- `songs/`: song definitions.
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

## In-App Attribution

The welcome screen includes:

- `See Licensing And Attribution Notes` button that opens a modal with attribution and license links.
- `Change Log` button that opens a modal with release notes.

## Releases

- Release process guide: `RELEASING.md`
- Published versions: GitHub Releases (`vX.Y.Z` tags)
- Support policy: latest release is supported; older releases remain available as-is.
