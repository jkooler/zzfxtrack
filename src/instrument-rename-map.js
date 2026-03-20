/**
 * Instrument Rename Map
 * Persists old→new alias mappings so the tracker (and playback) can resolve
 * channel instruments to the current names after renames.
 */

import { getDefragmentedInstruments } from './instrument-manager.js';

const STORAGE_KEY = 'zzfxtrack-instrument-rename-map';

/**
 * Load the rename map from localStorage
 * @returns {Record<string, string>} Map of old alias → new alias
 */
export function loadRenameMap() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return {};
    const parsed = JSON.parse(data);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (_e) {
    return {};
  }
}

/**
 * Save the rename map to localStorage
 */
function saveRenameMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Add a rename mapping. When oldAlias is renamed to newAlias:
 * - Store oldAlias → newAlias
 * - Update any existing mappings that pointed to oldAlias to now point to newAlias
 */
export function addRenameMapping(oldAlias, newAlias) {
  if (!oldAlias || !newAlias || oldAlias === newAlias) return;
  const map = loadRenameMap();
  map[oldAlias] = newAlias;
  // Update any keys that pointed to oldAlias so they now point to newAlias
  for (const [k, v] of Object.entries(map)) {
    if (v === oldAlias) map[k] = newAlias;
  }
  saveRenameMap(map);
}

/**
 * Resolve an alias through the rename map (follows the chain to canonical name)
 */
export function resolveInstrumentAlias(alias) {
  if (!alias || typeof alias !== 'string') return alias;
  const map = loadRenameMap();
  const seen = new Set();
  let current = alias;
  while (map[current] && !seen.has(current)) {
    seen.add(current);
    current = map[current];
  }
  return current;
}

function getAvailableInstrumentAliases() {
  try {
    return new Set(
      getDefragmentedInstruments()
        .map((instrument) => String(instrument?.strudelAlias || '').trim())
        .filter(Boolean)
    );
  } catch (_e) {
    return new Set();
  }
}

function resolveInstrumentAliasAgainstAvailable(alias, availableAliases) {
  if (!alias || typeof alias !== 'string') return alias;
  const resolved = resolveInstrumentAlias(alias);
  if (!availableAliases.size) return resolved;
  if (resolved && availableAliases.has(resolved)) return resolved;
  if (availableAliases.has(alias)) return alias;
  return resolved;
}

/**
 * Resolve channelInstruments array through the rename map
 */
export function resolveChannelInstruments(channelInstruments) {
  if (!Array.isArray(channelInstruments)) return channelInstruments;
  const availableAliases = getAvailableInstrumentAliases();
  return channelInstruments.map((id) => (id ? resolveInstrumentAliasAgainstAvailable(id, availableAliases) : id));
}

/**
 * Return a new trackerState with channelInstruments resolved through the rename map
 */
export function resolveTrackerStateChannelInstruments(trackerState) {
  if (!trackerState) return trackerState;
  const channelInstruments = Array.isArray(trackerState.channelInstruments)
    ? trackerState.channelInstruments
    : [];
  const resolved = resolveChannelInstruments(channelInstruments);
  if (JSON.stringify(resolved) === JSON.stringify(channelInstruments)) {
    return trackerState;
  }
  return { ...trackerState, channelInstruments: resolved };
}
