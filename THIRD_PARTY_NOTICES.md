# Third-Party Notices

**ZzFXTrack** is an independent project and is not affiliated with or endorsed by Frank Force, KilledByAPixel, Strudel, or the ZzFXM authors.

This repository includes or depends on third-party software and assets. The summary below is intended as a practical attribution reference for the repository and hosted demo.

## Runtime dependencies and bundled assets

### Strudel

- Packages: `@strudel/core`, `@strudel/mini`, `@strudel/repl`, `@strudel/webaudio`
- Upstream: https://codeberg.org/uzu/strudel
- Homepage: https://strudel.cc
- License: `AGPL-3.0-or-later`
- Usage in this repository: embedded REPL, pattern evaluation, and Web Audio integration

### ZzFX / ZzFXMicro

- Project: ZzFX by Frank Force
- Upstream: https://github.com/KilledByAPixel/ZzFX
- License: `MIT`
- Usage in this repository: adapted sample generator and instrument playback support in `src/zzfx-loader.js`

### ZzFXM

- Project: ZzFX Music Generator by Keith Clark
- Upstream: https://github.com/keithclark/ZzFXM
- Homepage: https://keithclark.github.io/ZzFXM/
- License: `MIT`
- Usage in this repository: conceptual inspiration for compact song playback/export workflow

### Geist

- Package: `@fontsource/geist`
- Upstream: https://github.com/fontsource/font-files/tree/main/fonts/google/geist
- Homepage: https://fontsource.org/fonts/geist
- License: `OFL-1.1`
- Usage in this repository: UI font asset

### Geist Mono

- Package: `@fontsource/geist-mono`
- Upstream: https://github.com/fontsource/font-files/tree/main/fonts/google/geist-mono
- Homepage: https://fontsource.org/fonts/geist-mono
- License: `OFL-1.1`
- Usage in this repository: monospaced UI/editor font asset

### Coloris

- Package: `@melloware/coloris`
- Upstream: https://github.com/melloware/coloris-npm
- Homepage: https://coloris.js.org
- License: `MIT`
- Usage in this repository: theme color picker

### JSZip

- Package: `jszip`
- Upstream: https://github.com/Stuk/jszip
- License: `(MIT OR GPL-3.0-or-later)`
- Usage in this repository: project bundle export/import ZIP handling

### Lucide

- Package: `lucide`
- Upstream: https://github.com/lucide-icons/lucide
- Homepage: https://lucide.dev
- License: `ISC`
- Usage in this repository: UI icons

### Tailwind CSS

- Packages: `tailwindcss`, `@tailwindcss/vite`
- Upstream: https://github.com/tailwindlabs/tailwindcss
- Homepage: https://tailwindcss.com
- License: `MIT`
- Usage in this repository: styling and build-time CSS integration

## Build and tooling dependencies

### Autoprefixer

- Package: `autoprefixer`
- Upstream: https://github.com/postcss/autoprefixer
- License: `MIT`
- Usage in this repository: CSS post-processing during development/build

### Vite

- Package: `vite`
- Upstream: https://github.com/vitejs/vite
- Homepage: https://vite.dev
- License: `MIT`
- Usage in this repository: local development server and production/demo bundling

## Notes

- Strudel is `AGPL-3.0-or-later`, which aligns with this repository's `AGPL-3.0-or-later` license.
- MIT/ISC/OFL components remain under their own terms. Keep their attribution and license references when redistributing this project or substantial portions of it.
- The package/version/license information above was checked against the installed package metadata in `node_modules/*/package.json`.
