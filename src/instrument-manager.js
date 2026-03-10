/**
 * Instrument Manager
 * Manages the global instrument pool: system instruments (from instruments.system.js, tracked)
 * plus user instruments (localStorage + instruments.js file, gitignored).
 */

import * as systemModule from "../instruments.system.js";

const STORAGE_KEY = "zzfxm-instruments";
const SYSTEM_OVERRIDES_KEY = "zzfxm-instruments-system-overrides";
const VALID_SCOPES = new Set(["user", "system"]);
const DEVELOPER_MODE_KEY = "zzfxm-developer-mode";

const SYSTEM_ID_PREFIX = "system:";

function isDeveloperModeEnabled() {
  try {
    return localStorage.getItem(DEVELOPER_MODE_KEY) === "1";
  } catch (_e) {
    return false;
  }
}

function normalizeScope(value, fallback = "user") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return VALID_SCOPES.has(normalized) ? normalized : fallback;
}

function inferLegacyScope(instrument) {
  const alias = String(instrument?.strudelAlias || "").toLowerCase();
  if (alias.startsWith("demo-") || alias.startsWith("test-")) {
    return "system";
  }
  return "user";
}

function normalizeInstrument(record) {
  if (!record || typeof record !== "object") return null;
  return {
    ...record,
    scope: normalizeScope(record.scope, inferLegacyScope(record)),
  };
}

function parseMonophonicFlag(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return fallback;
}

// Generate unique ID
function generateId() {
  return `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function aliasToExportName(alias) {
  const safe = String(alias || "")
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "_")
    .replace(/^_|_$/g, "");
  return `zzfxm_${safe || "untitled"}`;
}

/**
 * Load system parameter overrides from localStorage (user edits to system instruments)
 * @returns {Object} Map of strudelAlias -> { params?, monophonic? }
 */
function loadSystemOverrides() {
  try {
    const data = localStorage.getItem(SYSTEM_OVERRIDES_KEY);
    if (!data) return {};
    const parsed = JSON.parse(data);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveSystemOverrides(overrides) {
  try {
    localStorage.setItem(SYSTEM_OVERRIDES_KEY, JSON.stringify(overrides));
    return true;
  } catch (e) {
    console.error("[InstrumentManager] Failed to save system overrides:", e);
    return false;
  }
}

/**
 * Build system instrument records from instruments.system.js and apply overrides
 * @returns {Array} Array of instrument objects with id "system:alias"
 */
function getSystemInstrumentRecords() {
  const mapping = systemModule.instrumentMapping || {};
  const instruments = systemModule.instruments || {};
  const monophonic = systemModule.instrumentMonophonic || {};
  const overrides = loadSystemOverrides();

  return Object.entries(mapping).map(([alias, channel]) => {
    let params = instruments[alias];
    if (!params || !Array.isArray(params)) params = [];
    let monophonicFlag = Boolean(monophonic[alias]);
    const override = overrides[alias];
    if (override) {
      if (Array.isArray(override.params) && override.params.length === 21) params = override.params;
      if (typeof override.monophonic === "boolean") monophonicFlag = override.monophonic;
    }
    return {
      id: SYSTEM_ID_PREFIX + alias,
      exportName: aliasToExportName(alias),
      strudelAlias: alias,
      channel: Number(channel),
      params,
      monophonic: monophonicFlag,
      scope: "system",
    };
  });
}

/**
 * Load user instruments from localStorage
 * @returns {Array} Array of instrument objects (user only)
 */
export function loadInstruments() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeInstrument).filter(Boolean);
  } catch (e) {
    console.error("[InstrumentManager] Failed to load instruments:", e);
    return [];
  }
}

/**
 * Save user instruments to localStorage (user only; system instruments are in instruments.system.js)
 * @param {Array} instruments - Array of user instrument objects
 */
export function saveInstruments(instruments) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instruments));
    console.log("[InstrumentManager] Saved", instruments.length, "user instruments");
    return true;
  } catch (e) {
    console.error("[InstrumentManager] Failed to save instruments:", e);
    return false;
  }
}

/**
 * Create a new instrument
 * @param {string} exportName - Export constant name (e.g., "INST_KICKDRUM")
 * @param {string} strudelAlias - Strudel sound name (e.g., "z-kickdrum")
 * @param {number} channel - Channel number
 * @param {Array} params - ZzFX parameters (21 numbers)
 * @returns {Object} Created instrument object
 */
export function createInstrument(
  exportName,
  strudelAlias,
  channel,
  params = [],
) {
  const userInstruments = loadInstruments();
  const systemCount = getSystemInstrumentRecords().length;
  const defaultParams = [
    0.2, 0, 440, 0.01, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0,
  ];

  const instrument = {
    id: generateId(),
    exportName: exportName || "INST_UNTITLED",
    strudelAlias: strudelAlias || "z-untitled",
    channel: channel ?? systemCount + userInstruments.length,
    params: params.length === 21 ? params : defaultParams,
    monophonic: false,
    scope: "user",
  };

  userInstruments.push(instrument);
  saveInstruments(userInstruments);

  return instrument;
}

/**
 * Update an existing instrument (user: in localStorage; system: in overrides only)
 * @param {string} id - Instrument ID (user id or "system:alias")
 * @param {Object} changes - Object with fields to update
 * @returns {Object|null} Updated instrument or null if not found
 */
export function updateInstrument(id, changes) {
  if (typeof id === "string" && id.startsWith(SYSTEM_ID_PREFIX)) {
    const alias = id.slice(SYSTEM_ID_PREFIX.length);
    const overrides = loadSystemOverrides();
    const systemRecords = getSystemInstrumentRecords();
    const base = systemRecords.find((r) => r.strudelAlias === alias);
    if (!base) return null;
    const currentOverride = overrides[alias] || {};
    const nextParams = changes.params && Array.isArray(changes.params) && changes.params.length === 21
      ? changes.params
      : base.params;
    const nextMonophonic = typeof changes.monophonic === "boolean" ? changes.monophonic : base.monophonic;
    overrides[alias] = { params: nextParams, monophonic: nextMonophonic };
    saveSystemOverrides(overrides);
    return { ...base, params: nextParams, monophonic: nextMonophonic };
  }

  const instruments = loadInstruments();
  const index = instruments.findIndex((inst) => inst.id === id);

  if (index === -1) {
    console.error("[InstrumentManager] Instrument not found:", id);
    return null;
  }

  const current = instruments[index];
  const currentScope = normalizeScope(current?.scope, inferLegacyScope(current));
  const next = { ...current, ...changes };
  next.scope = normalizeScope(next.scope, currentScope);

  instruments[index] = next;
  saveInstruments(instruments);

  return instruments[index];
}

/**
 * Delete an instrument
 * @param {string} id - Instrument ID
 * @returns {boolean} Success status
 */
export function deleteInstrument(id) {
  if (typeof id === "string" && id.startsWith(SYSTEM_ID_PREFIX)) {
    if (!isDeveloperModeEnabled()) return false;
    const alias = id.slice(SYSTEM_ID_PREFIX.length);
    const overrides = loadSystemOverrides();
    delete overrides[alias];
    saveSystemOverrides(overrides);
    return true;
  }

  const instruments = loadInstruments();
  const target = instruments.find((inst) => inst.id === id);
  if (
    target &&
    normalizeScope(target.scope, inferLegacyScope(target)) === "system" &&
    !isDeveloperModeEnabled()
  ) {
    return false;
  }
  const filtered = instruments.filter((inst) => inst.id !== id);

  if (filtered.length === instruments.length) {
    console.error("[InstrumentManager] Instrument not found:", id);
    return false;
  }

  saveInstruments(filtered);
  return true;
}

export function setInstrumentScope(id, scope) {
  return updateInstrument(id, { scope: normalizeScope(scope, "user") });
}

/**
 * Reorder user instruments (changes channel assignments). System instruments stay fixed.
 * @param {number} fromIndex - Source index within user list
 * @param {number} toIndex - Destination index within user list
 * @returns {Array} Reordered user instruments
 */
export function reorderInstruments(fromIndex, toIndex) {
  const instruments = loadInstruments();

  if (
    fromIndex < 0 ||
    fromIndex >= instruments.length ||
    toIndex < 0 ||
    toIndex >= instruments.length
  ) {
    console.error("[InstrumentManager] Invalid reorder indices");
    return instruments;
  }

  const [moved] = instruments.splice(fromIndex, 1);
  instruments.splice(toIndex, 0, moved);

  saveInstruments(instruments);
  return instruments;
}

/**
 * Get defragmented instruments: system first (from instruments.system.js + overrides), then user (localStorage).
 * Channels are sequential: 0..systemCount-1 for system, systemCount.. for user.
 * @returns {Array} Merged instruments with defragmentedChannel
 */
export function getDefragmentedInstruments() {
  const systemRecords = getSystemInstrumentRecords();
  const userRecords = loadInstruments();
  const systemCount = systemRecords.length;
  const userWithChannels = userRecords.map((inst, i) => ({
    ...inst,
    channel: systemCount + i,
  }));
  const merged = [
    ...systemRecords.map((inst, i) => ({ ...inst, defragmentedChannel: i })),
    ...userWithChannels.map((inst, i) => ({ ...inst, defragmentedChannel: systemCount + i })),
  ];
  return merged;
}

/**
 * Generate instrument mapping for exporter (Strudel alias → defragmented channel)
 * @returns {Object} Mapping object
 */
export function getInstrumentMapping() {
  const defragged = getDefragmentedInstruments();
  const mapping = {};

  defragged.forEach((inst) => {
    mapping[inst.strudelAlias] = inst.defragmentedChannel;
  });

  return mapping;
}

/**
 * Generate instrument array for exporter (defragmented, sequential)
 * @returns {Array} Array of parameter arrays
 */
export function getInstrumentArray() {
  const defragged = getDefragmentedInstruments();
  return defragged.map((inst) => inst.params);
}

/**
 * Get monophonic flag array for exporter (defragmented, sequential)
 * @returns {Array} Array of booleans aligned to getInstrumentArray()
 */
export function getMonophonicArray() {
  const defragged = getDefragmentedInstruments();
  return defragged.map((inst) => Boolean(inst.monophonic));
}

/**
 * Get instrument by ID (searches merged system + user list)
 * @param {string} id - Instrument ID (user id or "system:alias")
 * @returns {Object|null} Instrument object or null
 */
export function getInstrumentById(id) {
  const merged = getDefragmentedInstruments();
  return merged.find((inst) => inst.id === id) || null;
}

/**
 * Migrate user instruments from file data (e.g. instruments.js user file).
 * Only records with scope "user" are saved to localStorage; system instruments are in instruments.system.js.
 * @param {Object} importedData - Object with instrument exports (instruments, instrumentMapping, instrumentMonophonic, instrumentScope)
 * @returns {Array} Migrated user instruments
 */
export function migrateFromFile(importedData) {
  console.log("[InstrumentManager] Migrating user instruments from file");

  const existing = loadInstruments();
  const existingByAlias = new Map(
    existing
      .filter((inst) => inst && typeof inst.strudelAlias === "string")
      .map((inst) => [inst.strudelAlias, inst]),
  );
  const existingByAliasLower = new Map(
    existing
      .filter((inst) => inst && typeof inst.strudelAlias === "string")
      .map((inst) => [inst.strudelAlias.toLowerCase(), inst]),
  );
  const monophonicFromFile = importedData?.instrumentMonophonic || {};
  const scopeFromFile = importedData?.instrumentScope || {};
  const systemCount = getSystemInstrumentRecords().length;

  const allFromFile = [];
  if (importedData.instrumentMapping) {
    Object.entries(importedData.instrumentMapping).forEach(([alias, ch], idx) => {
      let params = importedData.instruments?.[alias];
      if (!params && importedData.instruments) {
        params =
          importedData.instruments[alias.toLowerCase()] ||
          importedData.instruments[alias.toUpperCase()];
      }
      if (!params || !Array.isArray(params)) return;

      const prev = existingByAlias.get(alias) || existingByAliasLower.get(alias.toLowerCase());
      const monoFromFile =
        monophonicFromFile[alias] ?? monophonicFromFile[alias.toLowerCase()] ?? monophonicFromFile[alias.toUpperCase()];
      const fileScope = scopeFromFile[alias] ?? scopeFromFile[alias.toLowerCase()] ?? scopeFromFile[alias.toUpperCase()];
      const scope = normalizeScope(
        typeof fileScope === "string" ? fileScope : prev?.scope,
        "user",
      );
      const cleanAlias = alias.toLowerCase().replace(/^z-/, "");
      let safeName = cleanAlias.replace(/[^a-zA-Z0-9]/g, "_");
      if (/^[0-9]/.test(safeName)) safeName = "_" + safeName;
      const exportName = `zzfxm_${safeName}`;

      allFromFile.push({
        id: prev?.id || generateId(),
        exportName,
        strudelAlias: alias,
        channel: systemCount + idx,
        params,
        monophonic: parseMonophonicFlag(monoFromFile, parseMonophonicFlag(prev?.monophonic, false)),
        scope,
      });
    });
  }

  const userOnly = allFromFile
    .filter((inst) => normalizeScope(inst.scope) === "user")
    .map((inst, i) => ({ ...inst, channel: systemCount + i }));
  saveInstruments(userOnly);
  console.log("[InstrumentManager] Migrated", userOnly.length, "user instruments");
  return userOnly;
}

/**
 * Check if migration is needed (no user instruments in localStorage)
 * @returns {boolean}
 */
export function needsMigration() {
  const instruments = loadInstruments();
  return instruments.length === 0;
}
