/**
 * Module: shared/code-transform-utils
 * Purpose: Reusable source-transformation helpers for pattern, block, and arrangement code edits.
 */

export function slugify(value, { fallback = 'x', maxLength = 32 } = {}) {
    return (value || fallback)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, maxLength) || fallback;
}

export function stripQuotedStrings(source) {
    let out = '';
    let quote = null;
    let escaped = false;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (quote) {
            out += ' ';
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === quote) {
                quote = null;
            }
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            out += ' ';
            continue;
        }
        out += ch;
    }
    return out;
}

export function nextAvailableVarName(code, base) {
    let candidate = base;
    let n = 2;
    while (new RegExp(`\\bconst\\s+${candidate}\\b`).test(code) || new RegExp(`\\b${candidate}\\b`).test(code)) {
        candidate = `${base}_${n}`;
        n++;
    }
    return candidate;
}

export function ensureBlocksSection(code) {
    if (code.includes('// BLOCKS START') && code.includes('// BLOCKS END')) return code;
    return code.replace(
        /(export const bpm\s*=\s*\d+;\s*)/m,
        `$1\n\n// BLOCKS START\n// BLOCKS END\n`
    );
}

export function ensureArrangementsSection(code) {
    if (code.includes('// ARRANGEMENTS START') && code.includes('// ARRANGEMENTS END')) return code;
    if (code.includes('// BLOCKS END')) {
        return code.replace(
            /\/\/ BLOCKS END\s*\n/,
            `// BLOCKS END\n\n// ARRANGEMENTS START\n// ARRANGEMENTS END\n`
        );
    }
    return code.replace(
        /(export const bpm\s*=\s*\d+;\s*)/m,
        `$1\n\n// ARRANGEMENTS START\n// ARRANGEMENTS END\n`
    );
}

export function findMatchingParen(text, openIdx) {
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = openIdx; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }
        if (inSingle) {
            if (ch === '\\') { i++; continue; }
            if (ch === '\'') inSingle = false;
            continue;
        }
        if (inDouble) {
            if (ch === '\\') { i++; continue; }
            if (ch === '"') inDouble = false;
            continue;
        }
        if (inTemplate) {
            if (ch === '\\') { i++; continue; }
            if (ch === '`') inTemplate = false;
            continue;
        }

        if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
        if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
        if (ch === '\'') { inSingle = true; continue; }
        if (ch === '"') { inDouble = true; continue; }
        if (ch === '`') { inTemplate = true; continue; }

        if (ch === '(') depth++;
        if (ch === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

export function parseTopLevelArgs(text) {
    const args = [];
    let current = '';
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (inLineComment) {
            current += ch;
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            current += ch;
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                current += next;
                i++;
            }
            continue;
        }
        if (inSingle) {
            current += ch;
            if (ch === '\\') { current += next; i++; continue; }
            if (ch === '\'') inSingle = false;
            continue;
        }
        if (inDouble) {
            current += ch;
            if (ch === '\\') { current += next; i++; continue; }
            if (ch === '"') inDouble = false;
            continue;
        }
        if (inTemplate) {
            current += ch;
            if (ch === '\\') { current += next; i++; continue; }
            if (ch === '`') inTemplate = false;
            continue;
        }

        if (ch === '/' && next === '/') { inLineComment = true; current += ch; continue; }
        if (ch === '/' && next === '*') { inBlockComment = true; current += ch; continue; }
        if (ch === '\'') { inSingle = true; current += ch; continue; }
        if (ch === '"') { inDouble = true; current += ch; continue; }
        if (ch === '`') { inTemplate = true; current += ch; continue; }

        if (ch === '(') depth++;
        if (ch === ')') depth--;

        if (ch === ',' && depth === 0) {
            args.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) args.push(current.trim());
    return args;
}

function appendToTopLevelStackExpr(expr, arg) {
    const trimmed = expr.trimStart();
    if (!trimmed.startsWith('stack')) return null;
    const stackIdx = expr.indexOf('stack');
    let i = stackIdx + 5;
    while (i < expr.length && /\s/.test(expr[i])) i++;
    if (expr[i] !== '(') return null;
    const openIdx = i;
    const closeIdx = findMatchingParen(expr, openIdx);
    if (closeIdx === -1) return null;

    const argsText = expr.slice(openIdx + 1, closeIdx);
    const hasArgs = argsText.trim().length > 0;
    const multiline = expr.includes('\n');
    const insert = hasArgs ? (multiline ? `,\n  ${arg}` : `, ${arg}`) : (multiline ? `\n  ${arg}\n` : `${arg}`);

    let insertPos = closeIdx;
    if (hasArgs) {
        while (insertPos > openIdx + 1 && /\s/.test(expr[insertPos - 1])) insertPos--;
    }
    return expr.slice(0, insertPos) + insert + expr.slice(insertPos);
}

export function upsertPatternLayer(code, layerVar, { validateExistingExpression = false } = {}) {
    const match = code.match(/export const pattern\s*=\s*([\s\S]*?);\s*$/);
    if (!match) return `${code.trim()}\n\nexport const pattern = ${layerVar};\n`;
    const existing = match[1].trim();
    if (!existing) return code.replace(match[0], `export const pattern = ${layerVar};\n`);

    if (validateExistingExpression) {
        try {
            // eslint-disable-next-line no-new-func
            new Function(`return (\n${existing}\n);`);
        } catch (_e) {
            return code.replace(match[0], `export const pattern = ${layerVar};\n`);
        }
    }

    const appended = appendToTopLevelStackExpr(existing, layerVar);
    if (appended) return code.replace(match[0], `export const pattern = ${appended};\n`);
    return code.replace(match[0], `export const pattern = stack(\n  ${existing},\n  ${layerVar}\n);\n`);
}

export function normalizePatternStack(code) {
    const match = code.match(/export const pattern\s*=\s*([\s\S]*?);\s*$/);
    if (!match) return code;
    const expr = match[1].trim();
    const trimmed = expr.trimStart();
    if (!trimmed.startsWith('stack')) return code;

    const stackIdx = expr.indexOf('stack');
    let i = stackIdx + 5;
    while (i < expr.length && /\s/.test(expr[i])) i++;
    if (expr[i] !== '(') return code;
    const openIdx = i;
    const closeIdx = findMatchingParen(expr, openIdx);
    if (closeIdx === -1) return code;

    const inner = expr.slice(openIdx + 1, closeIdx);
    const args = parseTopLevelArgs(inner);
    if (!args.length) return code;

    let flattened = [];
    let didFlatten = false;
    for (const arg of args) {
        const argTrim = arg.trimStart();
        if (argTrim.startsWith('stack')) {
            const localIdx = arg.indexOf('stack');
            let j = localIdx + 5;
            while (j < arg.length && /\s/.test(arg[j])) j++;
            if (arg[j] === '(') {
                const close = findMatchingParen(arg, j);
                if (close !== -1) {
                    const innerArg = arg.slice(j + 1, close);
                    const innerArgs = parseTopLevelArgs(innerArg);
                    if (innerArgs.length) {
                        flattened = flattened.concat(innerArgs);
                        didFlatten = true;
                        continue;
                    }
                }
            }
        }
        flattened.push(arg);
    }
    if (!didFlatten) return code;

    const multiline = expr.includes('\n');
    const joiner = multiline ? ',\n  ' : ', ';
    const rebuilt = multiline ? `stack(\n  ${flattened.join(joiner)}\n)` : `stack(${flattened.join(joiner)})`;
    return code.replace(match[0], `export const pattern = ${rebuilt};\n`);
}
