# 🎹 Strudel to ZzFXM

A workflow tool for composing music with [Strudel](https://strudel.cc/) and exporting it to the compact [ZzFXM](https://keithclark.github.io/ZzFXM/) format.

## 🚀 Quick Start

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Start the Preview UI**:

   ```bash
   npm run dev
   ```

   Open the URL (usually http://localhost:5173) to live-preview your songs.

   > **Note for AI Agents**: If the dev server is already running, do not attempt to start it again. Simply navigate to http://localhost:5173 in the browser. The Vite config is set to use the next available port if 5173 is occupied.

3. **Bake songs**:
   - **From UI**: Select a song and click **"BAKE JSON"** to download it.
   - **From CLI**:
     ```bash
     npm run bake demo-bass         # Bake one song to /output
     npm run bake -- --all          # Bake all songs to /output
     npm run bake -- --all --combined # Create a bundle for PixiJS
     ```

## 📂 Project Structure

- `/songs`: Your composition files (`.js`).
- `/instruments.js`: Define your ZzFX parameters here.
- `/src/baker-logic.js`: The engine that translates Strudel to ZzFXM.
- `/output`: Where baked JSON files are saved.

## 🎵 Writing Songs

Songs are located in the `/songs/` directory. Each song should export a `pattern` (Strudel pattern) and a `bpm`.

```javascript
import { stack, note } from "@strudel/core";
export const bpm = 125;
export const pattern = note("c3 e3 g3").s("0"); // "0" refers to the instrument ID
```

### 🎯 Best Practices

**Instrument Naming**: Avoid common drum pattern names (like `hh`, `bd`, `sn`, `cp`) as they may conflict with Strudel's built-in shortcuts. Use prefixes or descriptive names:

- ✅ Good: `zzfx_hh`, `z_kick`, `bass_synth`, `lead_1`
- ❌ Avoid: `hh`, `bd`, `sn` (these are Strudel pattern shortcuts)

This ensures your ZzFX instruments are always used instead of falling back to samples.

## 🎮 PixiJS Integration

Use the `--combined` flag to generate `songs-bundle.json`. This format is optimized for loading all game music in one go:

```javascript
// Example loading in game
const bundle = await fetch("songs-bundle.json").then((r) => r.json());
// Access instruments: bundle.instruments
// Access specific song data: bundle.songs['demo-bass']
```

## 🛠️ Requirements

- Node.js 16+
- Modern Browser for previews
