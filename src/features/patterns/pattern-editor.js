/**
 * Module: features/patterns/pattern-editor
 * Purpose: Pattern editor/file transforms, autosave behavior, and export validation helpers.
 */

export function fileToEditor(code) {
    let text = code;

    // 1. Remove imports (multiline safeish)
    text = text.replace(/^import .*?;\s*$/gm, '');

    // 2. Transform "export const bpm = ..." -> "const bpm = ..." AND add setcps.
    // Dividing by 240 because Strudel cycles are usually 4 beats.
    // BPM / 60 = beats/sec. / 4 = cycles/sec.
    text = text.replace(/export const bpm\s*=\s*(\d+);?/g, (_match, val) => {
        return `const bpm = ${val};\nsetcps(bpm/240);`;
    });

    // 3. Transform "export const pattern =" -> remove, leaving expression
    text = text.replace(/export const pattern =\s*/, '');

    // 4. Remove trailing semicolon/whitespace at the very end
    text = text.replace(/;\s*$/, '');

    return text.trim();
}

export function editorToFile(code) {
    const lines = code.split('\n');
    let bpmLine = lines.find((l) => l.trim().match(/^(const\s+)?bpm\s*=/));
    let bpmVal = 120;

    if (bpmLine) {
        const match = bpmLine.match(/bpm\s*=\s*(\d+)/);
        if (match) bpmVal = match[1];
    }

    let cleanCode = lines
        .filter((l) => !l.trim().match(/^(const\s+)?bpm\s*=/))
        .filter((l) => !l.trim().startsWith('setcps('))
        .join('\n').trim();

    const extractBlocksAndArrangementsSetup = (codeText) => {
        const blocksStart = '// BLOCKS START';
        const blocksEnd = '// BLOCKS END';
        const arrStart = '// ARRANGEMENTS START';
        const arrEnd = '// ARRANGEMENTS END';

        const blocksStartIdx = codeText.indexOf(blocksStart);
        const blocksEndIdx = codeText.indexOf(blocksEnd);
        const arrStartIdx = codeText.indexOf(arrStart);
        const arrEndIdx = codeText.indexOf(arrEnd);

        if (blocksStartIdx === -1 || blocksEndIdx === -1 || blocksEndIdx <= blocksStartIdx) return null;

        let setupEndIdx = blocksEndIdx + blocksEnd.length;
        if (arrStartIdx !== -1 && arrEndIdx !== -1 && arrEndIdx > arrStartIdx) {
            setupEndIdx = arrEndIdx + arrEnd.length;
        }

        const setup = codeText.slice(0, setupEndIdx).trim();
        const expr = codeText.slice(setupEndIdx).trim();
        return { setup, expr };
    };

    const splitSetupAndExpr = (codeText) => {
        const rawLines = codeText.split('\n');
        for (let split = rawLines.length - 1; split >= 0; split--) {
            const setup = rawLines.slice(0, split).join('\n').trim();
            const expr = rawLines.slice(split).join('\n').trim();
            if (!expr) continue;
            const wrapped = `${setup}\nreturn (\n${expr}\n);`;
            try {
                // Parse-only; never executed.
                // eslint-disable-next-line no-new-func
                new Function(wrapped);
                return { setup, expr };
            } catch (_e) {
                // Keep searching.
            }
        }
        return { setup: '', expr: codeText.trim() };
    };

    const extracted = extractBlocksAndArrangementsSetup(cleanCode);
    const { setup, expr } = extracted && extracted.expr ? extracted : splitSetupAndExpr(cleanCode);
    const finalExpr = expr && expr.trim() ? expr.trim() : 'stack()';

    const commonFuncs = ['stack', 'arrange', 'silence', 'note', 's', 'slow', 'fast', 'rev', 'jux', 'every', 'chunk', 'scale', 'gain', 'lpf', 'room', 'clip', 'sine', 'add', 'sub', 'mul', 'div', 'choose', 'rand', 'saw', 'square', 'tri', 'cat', 'seq', 'mini', 'tidal', 'pure', 'orbit', 'delay', 'shifto', 'shape', 'cps'];
    const usedImports = commonFuncs.filter((f) => cleanCode.includes(`${f}(`) || cleanCode.includes(`${f}.`));
    if (!usedImports.includes('note')) usedImports.push('note');
    if (!usedImports.includes('s')) usedImports.push('s');
    if (!usedImports.includes('stack')) usedImports.push('stack');
    if (!usedImports.includes('arrange')) usedImports.push('arrange');
    if (!usedImports.includes('silence')) usedImports.push('silence');
    if (!usedImports.includes('slow')) usedImports.push('slow');
    if (!usedImports.includes('gain')) usedImports.push('gain');

    const importStmt = `import { ${usedImports.join(', ')} } from "@strudel/core";`;
    const setupBlock = setup ? `\n${setup}\n` : '';

    return `${importStmt}

export const bpm = ${bpmVal};
${setupBlock}

export const pattern = ${finalExpr};
`;
}

const UNSAFE_FUNCS = [
    'delay', 'room', 'reverb', 'lpf', 'hpf', 'bp', 'vowel',
    'phaser', 'leslie', 'crush', 'cutoff', 'resonance',
    'distort', 'saturate', 'chorus', 'flanger', 'tremolo',
    'fit', 'legato', 'chop'
];

export function validateCodeForExport(code, { setStatus, getStatusText }) {
    const findings = [];
    UNSAFE_FUNCS.forEach((func) => {
        const regex = new RegExp(`\\b${func}\\(`, 'g');
        if (regex.test(code)) findings.push(func);
    });

    if (findings.length > 0) {
        setStatus(`⚠️ Unsafe for Export: ${findings.join(', ')}`, 'error');
    } else if ((getStatusText() || '').startsWith('⚠️')) {
        setStatus('Ready', 'normal');
    }
}

let editorDeps = {
    isDemoMode: () => false,
    getReplEditor: () => null,
    getCurrentPatternFilename: () => null,
    getCurrentPatternScope: () => 'user',
    isDeveloperModeEnabled: () => false,
    updateInstrumentUsage: () => {},
    getAutoSaveTimeout: () => null,
    setAutoSaveTimeout: () => {},
    saveCurrentPattern: async () => {},
    persistUnsavedPattern: () => {},
    clearUnsavedPattern: () => {},
    isReplPlaying: () => false,
    evaluateRepl: () => {},
    logInfo: () => {},
    logError: () => {},
};

let hotReloadTimeout = null;

export function configurePatternEditor(options = {}) {
    editorDeps = { ...editorDeps, ...options };
}

export function setupPatternEditorAutosave() {
    if (editorDeps.isDemoMode()) {
        editorDeps.logInfo('ℹ️ Demo mode: auto-save disabled');
        return;
    }

    let checkCount = 0;
    const checkEditor = setInterval(() => {
        checkCount++;
        const replEditor = editorDeps.getReplEditor();
        const view = replEditor?.editor;
        if (replEditor && view) {
            clearInterval(checkEditor);
            let lastCode = view.state.doc.toString();
            const observer = new MutationObserver(() => {
                const currentPatternFilename = editorDeps.getCurrentPatternFilename();
                if (!currentPatternFilename || !view.hasFocus) return;

                const currentCode = view.state.doc.toString();
                if (currentCode === lastCode) return;
                lastCode = currentCode;

                editorDeps.updateInstrumentUsage(currentCode);

                if (editorDeps.getCurrentPatternScope() !== 'system' || editorDeps.isDeveloperModeEnabled()) {
                    editorDeps.persistUnsavedPattern(currentPatternFilename, currentCode);
                    const autoSaveTimeout = editorDeps.getAutoSaveTimeout();
                    if (autoSaveTimeout) {
                        clearTimeout(autoSaveTimeout);
                    }
                    const timeout = setTimeout(() => {
                        const activeFilename = editorDeps.getCurrentPatternFilename();
                        editorDeps.saveCurrentPattern().catch(() => {});
                        if (activeFilename) editorDeps.clearUnsavedPattern(activeFilename);
                    }, 1000);
                    editorDeps.setAutoSaveTimeout(timeout);
                }

                if (editorDeps.isReplPlaying()) {
                    if (hotReloadTimeout) clearTimeout(hotReloadTimeout);
                    hotReloadTimeout = setTimeout(() => {
                        try {
                            editorDeps.evaluateRepl();
                            editorDeps.logInfo('🔥 Hot-reloaded code changes');
                        } catch (e) {
                            editorDeps.logError('Hot-reload evaluation error:', e);
                        }
                    }, 500);
                }
            });

            observer.observe(view.contentDOM, {
                childList: true,
                subtree: true,
                characterData: true,
                characterDataOldValue: false
            });
            editorDeps.logInfo('✅ Auto-save enabled with 1s debounce (event-driven via MutationObserver)');
        } else if (checkCount > 50) {
            clearInterval(checkEditor);
            editorDeps.logError('❌ Editor not found after 5 seconds. Auto-save disabled.');
        }
    }, 100);
}
