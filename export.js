import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import * as instrumentModule from './instruments.js';
import { exportPattern } from './src/export-logic.js';
import { initStrudel } from './src/init.js';

await initStrudel();

const args = process.argv.slice(2);
const isAll = args.includes('--all');
const isCombined = args.includes('--combined');
const targetSong = args.find(a => !a.startsWith('--'));

const OUTPUT_DIR = './output';
const SONGS_DIR = path.resolve('./songs');
const instrumentArray = instrumentModule.instrumentArray || [];
const instrumentMapping = instrumentModule.instrumentMapping || {};
const instrumentMonophonic = instrumentModule.instrumentMonophonic || {};

function buildMonophonicByInstrumentIndex() {
    const byIndex = Array(instrumentArray.length).fill(false);
    Object.entries(instrumentMapping).forEach(([alias, idx]) => {
        if (!Number.isInteger(idx) || idx < 0 || idx >= byIndex.length) return;
        const raw =
            instrumentMonophonic?.[alias] ??
            instrumentMonophonic?.[alias.toLowerCase()] ??
            instrumentMonophonic?.[alias.toUpperCase()];
        byIndex[idx] = Boolean(raw);
    });
    return byIndex;
}

function buildSongRegistry() {
    const registry = new Map();
    const byFile = [];

    if (!fs.existsSync(SONGS_DIR)) {
        return { registry, songs: byFile };
    }

    const files = fs
        .readdirSync(SONGS_DIR)
        .filter((f) => f.endsWith('.js') && f !== 'index.js')
        .sort();

    for (const file of files) {
        const base = file.replace(/\.js$/, '');
        const id = base;

        const fullPath = path.resolve(SONGS_DIR, file);
        const descriptor = { id, base, file, fullPath };
        byFile.push(descriptor);

        registry.set(id, descriptor);
    }

    return { registry, songs: byFile };
}

async function loadSongModule(descriptor) {
    const moduleUrl = `${pathToFileURL(descriptor.fullPath).href}?t=${Date.now()}`;
    return import(moduleUrl);
}

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

async function runExport() {
    const { registry, songs } = buildSongRegistry();
    const monophonicByInstrumentIndex = buildMonophonicByInstrumentIndex();

    if (isAll) {
        console.log(`🚀 Exporting ALL songs...`);
        const bundle = {
            instruments: instrumentArray,
            songs: {}
        };

        for (const song of songs) {
            const module = await loadSongModule(song);
            const result = exportPattern(module.pattern, module.bpm, instrumentArray, instrumentMapping, 8, {
                monophonicByInstrumentIndex
            });
            const songData = result.song;
            
            if (isCombined) {
                // For combined, we store patterns/sequence/bpm separately per song
                bundle.songs[song.id] = {
                    patterns: songData[1],
                    sequence: songData[2],
                    bpm: songData[3]
                };
            } else {
                const filePath = path.join(OUTPUT_DIR, `${song.id}.json`);
                fs.writeFileSync(filePath, JSON.stringify(songData));
                console.log(`✅ Exported: ${filePath}`);
            }
        }

        if (isCombined) {
            const filePath = path.join(OUTPUT_DIR, `songs-bundle.json`);
            fs.writeFileSync(filePath, JSON.stringify(bundle));
            console.log(`✅ Exported Bundle: ${filePath}`);
        }
    } else if (targetSong && registry.has(targetSong)) {
        const song = registry.get(targetSong);
        console.log(`🚀 Exporting song: ${song.id} (${song.file})...`);
        const module = await loadSongModule(song);
        const result = exportPattern(module.pattern, module.bpm, instrumentArray, instrumentMapping, 8, {
            monophonicByInstrumentIndex
        });
        const songData = result.song;
        const filePath = path.join(OUTPUT_DIR, `${song.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(songData));
        console.log(`✅ Exported: ${filePath}`);
    } else {
        console.log('❌ Please specify a song name or use --all');
        console.log('Usage:');
        console.log('  npm run export -- <song-name>');
        console.log('  npm run export -- --all');
        console.log('  npm run export -- --all --combined');
        if (songs.length) {
            const songNames = songs.map((s) => s.id).join(', ');
            console.log(`Available songs: ${songNames}`);
        }
        process.exit(1);
    }
}

runExport().catch(err => {
    console.error(`💥 Export failed:`, err);
    process.exit(1);
});
