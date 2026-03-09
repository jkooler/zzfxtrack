/**
 * Module: features/instruments/instrument-reference-sync
 * Purpose: Keeps pattern/block/arrangement source references consistent across instrument renames.
 */

import { confirmDialog } from '../../dialog.js';

let getDeveloperModeHeaders = () => ({});
let refreshPatternList = async () => {};
let isDemoMode = () => import.meta.env.MODE === 'demo';

function normalizeScope(value) {
    return value === 'system' ? 'system' : 'user';
}

function normalizePatternEntries(payload) {
    if (!Array.isArray(payload)) return [];
    return payload
        .map((item) => {
            if (typeof item === 'string') {
                return { filename: item, scope: 'user' };
            }
            if (!item || typeof item !== 'object' || typeof item.filename !== 'string') {
                return null;
            }
            return {
                filename: item.filename,
                scope: normalizeScope(item.scope),
            };
        })
        .filter(Boolean);
}

function replaceAliasInCode(code, oldAlias, newAlias) {
    if (!oldAlias || oldAlias === newAlias) return code;
    let out = code;
    out = out.split(`"${oldAlias}"`).join(`"${newAlias}"`);
    out = out.split(`'${oldAlias}'`).join(`'${newAlias}'`);
    return out;
}

function replaceAliasInTrackerState(trackerState, oldAlias, newAlias) {
    if (!trackerState || !oldAlias || oldAlias === newAlias) return trackerState;
    const channelInstruments = Array.isArray(trackerState.channelInstruments) ? [...trackerState.channelInstruments] : [];
    const updated = channelInstruments.map((id) => (id === oldAlias ? newAlias : id));
    if (JSON.stringify(updated) === JSON.stringify(channelInstruments)) return trackerState;
    return { ...trackerState, channelInstruments: updated };
}

function emitStatus(message, type = 'normal') {
    document.dispatchEvent(new CustomEvent('app:status', { detail: { message, type } }));
}

export function configureInstrumentReferenceSync(options = {}) {
    if (typeof options.getDeveloperModeHeaders === 'function') {
        getDeveloperModeHeaders = options.getDeveloperModeHeaders;
    }
    if (typeof options.refreshPatternList === 'function') {
        refreshPatternList = options.refreshPatternList;
    }
    if (typeof options.isDemoMode === 'function') {
        isDemoMode = options.isDemoMode;
    }
}

/**
 * Update all patterns and blocks that reference oldAlias to use newAlias.
 * Only touches user-scope files. Shows confirmation before bulk edit.
 */
export async function updateInstrumentReferencesInPatternsAndBlocks(oldAlias, newAlias) {
    if (isDemoMode()) return;
    if (!oldAlias || !newAlias || oldAlias === newAlias) return;

    try {
        const [patternsRes, blocksRes] = await Promise.all([
            fetch('/api/patterns'),
            fetch('/api/blocks'),
        ]);
        if (!patternsRes.ok || !blocksRes.ok) return;

        const patternsPayload = await patternsRes.json();
        const blocksPayload = await blocksRes.json();
        const patternEntries = normalizePatternEntries(patternsPayload).filter((e) => normalizeScope(e?.scope) !== 'system');
        const blockItems = (Array.isArray(blocksPayload) ? blocksPayload : []).filter((b) => normalizeScope(b?.scope) !== 'system');

        const patternsToUpdate = [];
        const blocksToUpdate = [];

        for (const entry of patternEntries) {
            const filename = entry?.filename;
            if (!filename) continue;
            const res = await fetch(`/api/pattern/${encodeURIComponent(filename)}`);
            if (!res.ok) continue;
            const content = await res.text();
            if (content.includes(`"${oldAlias}"`) || content.includes(`'${oldAlias}'`)) {
                patternsToUpdate.push({ filename, content });
            }
        }

        for (const block of blockItems) {
            const filename = block?.filename;
            if (!filename) continue;
            const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`);
            if (!res.ok) continue;
            const detail = await res.json();
            const pattern = detail?.pattern || '';
            const channelInstruments = Array.isArray(detail?.trackerState?.channelInstruments) ? detail.trackerState.channelInstruments : [];
            const patternHasAlias = pattern.includes(`"${oldAlias}"`) || pattern.includes(`'${oldAlias}'`);
            const trackerHasAlias = channelInstruments.includes(oldAlias);
            if (patternHasAlias || trackerHasAlias) {
                blocksToUpdate.push({ filename, block: detail });
            }
        }

        const total = patternsToUpdate.length + blocksToUpdate.length;
        if (total === 0) return;

        const ok = await confirmDialog({
            title: 'Update References',
            message: `Update ${patternsToUpdate.length} pattern(s) and ${blocksToUpdate.length} block(s) to use "${newAlias}" instead of "${oldAlias}"?`,
            confirmLabel: 'Update',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;

        for (const { filename, content } of patternsToUpdate) {
            const updated = replaceAliasInCode(content, oldAlias, newAlias);
            const res = await fetch(`/api/pattern/${encodeURIComponent(filename)}`, {
                method: 'POST',
                headers: getDeveloperModeHeaders(),
                body: updated,
            });
            if (!res.ok) console.warn('[InstrumentRefSync] Failed to update pattern:', filename);
        }

        const { updateBlock } = await import('../../blocks.js');
        for (const { filename, block: detail } of blocksToUpdate) {
            const updatedPattern = replaceAliasInCode(detail.pattern || '', oldAlias, newAlias);
            const updatedTrackerState = replaceAliasInTrackerState(detail.trackerState ?? null, oldAlias, newAlias);
            await updateBlock(
                filename,
                detail.name || filename.replace('.js', ''),
                detail.description || '',
                updatedPattern,
                updatedTrackerState,
                normalizeScope(detail.scope, 'user')
            );
        }

        if (patternsToUpdate.length > 0) await refreshPatternList();
        emitStatus(`Updated ${total} file(s) to use "${newAlias}"`, 'success');
    } catch (err) {
        console.error('[InstrumentRefSync] Failed to update instrument references:', err);
    }
}
