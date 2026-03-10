import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import * as instrumentModule from './instruments.system.js';
import { exportPattern } from './src/export-logic.js';
import { initStrudel } from './src/init.js';

await initStrudel();

const args = process.argv.slice(2);
const isAll = args.includes('--all');
const isCombined = args.includes('--combined');
const targetPattern = args.find(a => !a.startsWith('--'));

const OUTPUT_DIR = './output';
const PATTERNS_DIR = path.resolve('./patterns');
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

function buildPatternRegistry() {
    const registry = new Map();
    const byFile = [];

    if (!fs.existsSync(PATTERNS_DIR)) {
        return { registry, patterns: byFile };
    }

    const files = fs
        .readdirSync(PATTERNS_DIR)
        .filter((f) => f.endsWith('.js') && f !== 'index.js')
        .sort();

    for (const file of files) {
        const base = file.replace(/\.js$/, '');
        const id = base;

        const fullPath = path.resolve(PATTERNS_DIR, file);
        const descriptor = { id, base, file, fullPath };
        byFile.push(descriptor);

        registry.set(id, descriptor);
    }

    return { registry, patterns: byFile };
}

async function loadPatternModule(descriptor) {
    const moduleUrl = `${pathToFileURL(descriptor.fullPath).href}?t=${Date.now()}`;
    return import(moduleUrl);
}

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

async function runExport() {
    const { registry, patterns } = buildPatternRegistry();
    const monophonicByInstrumentIndex = buildMonophonicByInstrumentIndex();

    if (isAll) {
        console.log(`🚀 Exporting ALL patterns...`);
        const bundle = {
            instruments: instrumentArray,
            patterns: {}
        };

        for (const pattern of patterns) {
            const module = await loadPatternModule(pattern);
            const result = exportPattern(module.pattern, module.bpm, instrumentArray, instrumentMapping, 8, {
                monophonicByInstrumentIndex
            });
            const songData = result.song;
            
            if (isCombined) {
                // For combined, we store patterns/sequence/bpm separately per pattern
                bundle.patterns[pattern.id] = {
                    patterns: songData[1],
                    sequence: songData[2],
                    bpm: songData[3]
                };
            } else {
                const filePath = path.join(OUTPUT_DIR, `${pattern.id}.json`);
                fs.writeFileSync(filePath, JSON.stringify(songData));
                console.log(`✅ Exported: ${filePath}`);
            }
        }

        if (isCombined) {
            const filePath = path.join(OUTPUT_DIR, `patterns-bundle.json`);
            fs.writeFileSync(filePath, JSON.stringify(bundle));
            console.log(`✅ Exported Bundle: ${filePath}`);
        }
    } else if (targetPattern && registry.has(targetPattern)) {
        const pattern = registry.get(targetPattern);
        console.log(`🚀 Exporting pattern: ${pattern.id} (${pattern.file})...`);
        const module = await loadPatternModule(pattern);
        const result = exportPattern(module.pattern, module.bpm, instrumentArray, instrumentMapping, 8, {
            monophonicByInstrumentIndex
        });
        const songData = result.song;
        const filePath = path.join(OUTPUT_DIR, `${pattern.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(songData));
        console.log(`✅ Exported: ${filePath}`);
    } else {
        console.log('❌ Please specify a pattern name or use --all');
        console.log('Usage:');
        console.log('  npm run export -- <pattern-name>');
        console.log('  npm run export -- --all');
        console.log('  npm run export -- --all --combined');
        if (patterns.length) {
            const patternNames = patterns.map((s) => s.id).join(', ');
            console.log(`Available patterns: ${patternNames}`);
        }
        process.exit(1);
    }
}

runExport().catch(err => {
    console.error(`💥 Export failed:`, err);
    process.exit(1);
});
