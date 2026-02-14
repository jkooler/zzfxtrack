# Strudel to ZzFXM Baker

Browser-based tool to compose with Strudel patterns, preview generated sound, and export song/instrument data compatible with ZzFXM playback.

## What This App Is For

- Compose music using a Strudel REPL workflow.
- Define and test ZzFX instrument parameters.
- Export baked JSON data for use in games/apps that use ZzFXM-style song playback.

## Quick Start

1. Install dependencies:
```bash
npm install
```
2. Start the app:
```bash
npm run dev
```
3. Bake songs:
```bash
npm run bake -- demo-bass
npm run bake -- --all
npm run bake -- --all --combined
```

## Project Structure

- `songs/`: song definitions.
- `instruments.js`: ZzFX instrument parameter definitions.
- `src/baker-logic.js`: Strudel-to-ZzFXM conversion logic.
- `output/`: generated bake output.

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
