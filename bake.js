import fs from 'fs';
import path from 'path';
import { songs } from './songs/index.js';
import { instrumentArray } from './instruments.js';
import { bakePattern } from './src/baker-logic.js';
import { initStrudel } from './src/init.js';

await initStrudel();

const args = process.argv.slice(2);
const isAll = args.includes('--all');
const isCombined = args.includes('--combined');
const targetSong = args.find(a => !a.startsWith('--'));

const OUTPUT_DIR = './output';

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

async function runBake() {
    if (isAll) {
        console.log(`🚀 Baking ALL songs...`);
        const bundle = {
            instruments: instrumentArray,
            songs: {}
        };

        for (const id of Object.keys(songs)) {
            const module = await songs[id]();
            const songData = bakePattern(module.pattern, module.bpm, instrumentArray);
            
            if (isCombined) {
                // For combined, we store patterns/sequence/bpm separately per song
                bundle.songs[id] = {
                    patterns: songData[1],
                    sequence: songData[2],
                    bpm: songData[3]
                };
            } else {
                const filePath = path.join(OUTPUT_DIR, `${id}.json`);
                fs.writeFileSync(filePath, JSON.stringify(songData));
                console.log(`✅ Baked: ${filePath}`);
            }
        }

        if (isCombined) {
            const filePath = path.join(OUTPUT_DIR, `songs-bundle.json`);
            fs.writeFileSync(filePath, JSON.stringify(bundle));
            console.log(`✅ Baked Bundle: ${filePath}`);
        }
    } else if (targetSong && songs[targetSong]) {
        console.log(`🚀 Baking song: ${targetSong}...`);
        const module = await songs[targetSong]();
        const songData = bakePattern(module.pattern, module.bpm, instrumentArray);
        const filePath = path.join(OUTPUT_DIR, `${targetSong}.json`);
        fs.writeFileSync(filePath, JSON.stringify(songData));
        console.log(`✅ Baked: ${filePath}`);
    } else {
        console.log('❌ Please specify a song name or use --all');
        console.log('Usage:');
        console.log('  npm run bake <song-name>');
        console.log('  npm run bake -- --all');
        console.log('  npm run bake -- --all --combined');
        process.exit(1);
    }
}

runBake().catch(err => {
    console.error(`💥 Bake failed:`, err);
    process.exit(1);
});