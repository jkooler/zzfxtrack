/**
 * Module: app/api
 * Purpose: Central API wrapper layer for patterns, blocks, arrangements, and export persistence.
 */

function buildApiError(action, response) {
    return new Error(`${action} (HTTP ${response.status})`);
}

export async function listPatterns() {
    const res = await fetch('/api/patterns');
    if (!res.ok) throw buildApiError('Failed to list patterns', res);
    const payload = await res.json();
    return Array.isArray(payload) ? payload : [];
}

export async function getPatternSource(filename) {
    const res = await fetch(`/api/pattern/${encodeURIComponent(filename)}`);
    if (!res.ok) throw buildApiError('Failed to load pattern', res);
    return await res.text();
}

export async function getPatternSourceOrEmpty(filename) {
    try {
        return await getPatternSource(filename);
    } catch (_e) {
        return '';
    }
}

export async function savePatternSource(filename, content, extraHeaders = {}) {
    const res = await fetch(`/api/pattern/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { ...extraHeaders },
        body: content,
    });
    if (!res.ok) throw buildApiError('Failed to save pattern', res);
}

export async function savePatternSourceKeepalive(filename, content, extraHeaders = {}) {
    const res = await fetch(`/api/pattern/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { ...extraHeaders },
        body: content,
        keepalive: true,
    });
    if (!res.ok) throw buildApiError('Failed to save pattern', res);
}

export function sendPatternSourceBeacon(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    return navigator.sendBeacon(`/api/pattern/${encodeURIComponent(filename)}`, blob);
}

export async function renamePatternFile(oldName, newName, extraHeaders = {}) {
    const res = await fetch('/api/rename-pattern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify({ oldName, newName }),
    });
    if (!res.ok) throw buildApiError('Failed to rename pattern', res);
}

export async function deletePatternByFilename(filename, extraHeaders = {}) {
    const res = await fetch(`/api/pattern/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: { ...extraHeaders },
    });
    if (!res.ok) throw buildApiError('Failed to delete pattern', res);
}

export async function getPatternMetaOrNull(filename) {
    const res = await fetch(`/api/pattern-meta/${encodeURIComponent(filename)}`);
    if (!res.ok) return null;
    return await res.json();
}

export async function savePatternMetaRecord(filename, payload) {
    const res = await fetch(`/api/pattern-meta/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw buildApiError('Failed to save pattern meta', res);
}

export async function listArrangements() {
    const res = await fetch('/api/arrangements');
    if (!res.ok) throw buildApiError('Failed to list arrangements', res);
    const payload = await res.json();
    return Array.isArray(payload) ? payload : [];
}

export async function listArrangementsOrEmpty() {
    try {
        return await listArrangements();
    } catch (_e) {
        return [];
    }
}

export async function getArrangementOrNull(filename) {
    if (!filename) return null;
    const res = await fetch(`/api/arrangements/${encodeURIComponent(filename)}`);
    if (!res.ok) return null;
    return await res.json();
}

export async function getArrangement(filename) {
    const detail = await getArrangementOrNull(filename);
    if (!detail) throw new Error('Failed to load arrangement details');
    return detail;
}

export async function createArrangement(payload) {
    const res = await fetch('/api/arrangements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw buildApiError('Failed to create arrangement', res);
}

export async function saveArrangement(filename, payload, extraHeaders = {}) {
    const res = await fetch(`/api/arrangements/${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw buildApiError('Failed to save arrangement', res);
}

export async function saveArrangementKeepalive(filename, payload, extraHeaders = {}) {
    const res = await fetch(`/api/arrangements/${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify(payload),
        keepalive: true,
    });
    if (!res.ok) throw buildApiError('Failed to save arrangement', res);
}

export async function deleteArrangementByFilename(filename, extraHeaders = {}) {
    const res = await fetch(`/api/arrangements/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: { ...extraHeaders },
    });
    if (!res.ok) throw buildApiError('Failed to delete arrangement', res);
}

export async function renameArrangementFile(oldName, newName, extraHeaders = {}) {
    const res = await fetch('/api/rename-arrangement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify({ oldName, newName }),
    });
    if (!res.ok) throw buildApiError('Failed to rename arrangement', res);
}

export async function listBlocksOrEmpty() {
    try {
        return await listBlocks();
    } catch (_e) {
        return [];
    }
}

export async function listBlocks() {
    const res = await fetch('/api/blocks');
    if (!res.ok) throw buildApiError('Failed to list blocks', res);
    const payload = await res.json();
    return Array.isArray(payload) ? payload : [];
}

export async function getBlockDetailOrNull(filename) {
    if (!filename) return null;
    const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`);
    if (!res.ok) return null;
    return await res.json();
}

export async function getBlockDetail(filename) {
    const detail = await getBlockDetailOrNull(filename);
    if (!detail) throw new Error('Failed to load block details');
    return detail;
}

export async function saveBlockDetail(filename, payload, extraHeaders = {}) {
    const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw buildApiError('Failed to save block', res);
}

export async function saveBlockDetailKeepalive(filename, payload, extraHeaders = {}) {
    const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify(payload),
        keepalive: true,
    });
    if (!res.ok) throw buildApiError('Failed to save block', res);
}

export async function deleteBlockByFilename(filename, extraHeaders = {}) {
    const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: { ...extraHeaders },
    });
    if (!res.ok) throw buildApiError('Failed to delete block', res);
}

export async function deleteBlockByFilenameWithConflictInfo(filename, extraHeaders = {}) {
    const res = await fetch(`/api/blocks/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: { ...extraHeaders },
    });
    if (res.ok) {
        return { ok: true, status: res.status, usedBy: [] };
    }
    if (res.status === 409) {
        let usedBy = [];
        try {
            const payload = await res.json();
            usedBy = Array.isArray(payload?.usedBy) ? payload.usedBy : [];
        } catch (_e) {
            usedBy = [];
        }
        return { ok: false, status: 409, usedBy };
    }
    throw buildApiError('Failed to delete block', res);
}

export async function saveExportedJsonFile(filename, payload) {
    const res = await fetch(`/api/save-exported/${encodeURIComponent(filename)}`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw buildApiError('Server failed to save JSON', res);
}

export async function saveExportedJsFile(filename, moduleText) {
    const res = await fetch(`/api/save-exported-js/${encodeURIComponent(filename)}`, {
        method: 'POST',
        body: moduleText,
    });
    if (!res.ok) throw buildApiError('Server failed to save JS song module', res);
}

export async function updateInstrumentsSourceFile(content) {
    const res = await fetch('/api/update-instruments', {
        method: 'POST',
        body: content,
    });
    if (!res.ok) throw buildApiError('Failed to update instruments file', res);
}

export async function updateSystemInstrumentsSourceFile(content) {
    const res = await fetch('/api/update-system-instruments', {
        method: 'POST',
        body: content,
    });
    if (!res.ok) throw buildApiError('Failed to update system instruments file', res);
}

export async function getPatternMetaTextOrNull(filename) {
    const res = await fetch(`/api/pattern-meta/${encodeURIComponent(filename)}`);
    if (!res.ok) return null;
    return await res.text();
}
