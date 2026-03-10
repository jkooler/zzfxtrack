/**
 * Instrument Manager
 * Manages the global instrument pool: system instruments (from instruments.system.js, tracked)
 * plus user instruments (localStorage + instruments.js file, gitignored).
 */

import * as systemModule from "../instruments.system.js";

const STORAGE_KEY = "zzfxtrack-instruments";
const SYSTEM_STORE_KEY = "zzfxtrack-system-instruments-store";
const SYSTEM_OVERRIDES_KEY = "zzfxtrack-instruments-system-overrides";
const VALID_SCOPES = new Set(["user", "system"]);
const DEVELOPER_MODE_KEY = "zzfxtrack-developer-mode";

const SYSTEM_ID_PREFIX = "system:";
let systemInstrumentStoreCache = null;
let didRepairInstrumentScopeStorage = false;

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
  return `zzfxtrack_${safe || "untitled"}`;
}

function cloneInstrument(record) {
  if (!record || typeof record !== "object") return null;
  return {
    ...record,
    params: Array.isArray(record.params) ? [...record.params] : [],
  };
}

function buildSystemInstrumentId(alias) {
  return SYSTEM_ID_PREFIX + String(alias || "");
}

function normalizeSystemInstrumentRecord(record) {
  if (!record || typeof record !== "object") return null;
  const alias = String(record.strudelAlias || "").trim();
  if (!alias) return null;
  return {
    id: buildSystemInstrumentId(alias),
    exportName: toSafeSystemExportName(record.exportName, alias),
    strudelAlias: alias,
    channel: Number.isFinite(Number(record.channel)) ? Number(record.channel) : 0,
    params: Array.isArray(record.params) ? [...record.params] : [],
    monophonic: parseMonophonicFlag(record.monophonic, false),
    scope: "system",
  };
}

function toSafeSystemExportName(exportName, alias) {
  const candidate = String(exportName || "").trim();
  return candidate || aliasToExportName(alias);
}

function getStaticSystemSourceSignature() {
  return JSON.stringify({
    instrumentMapping: systemModule.instrumentMapping || {},
    instruments: systemModule.instruments || {},
    instrumentMonophonic: systemModule.instrumentMonophonic || {},
    instrumentScope: systemModule.instrumentScope || {},
  });
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
 * Build mutable system instrument records from instruments.system.js and apply any
 * legacy local overrides so older saved edits are preserved.
 */
function buildStaticSystemInstrumentRecords() {
  const mapping = systemModule.instrumentMapping || {};
  const instruments = systemModule.instruments || {};
  const monophonic = systemModule.instrumentMonophonic || {};
  const overrides = loadSystemOverrides();

  return Object.entries(mapping).map(([alias, channel], index) => {
    let params = instruments[alias];
    if (!params || !Array.isArray(params)) params = [];
    let monophonicFlag = Boolean(monophonic[alias]);
    const override = overrides[alias];
    if (override) {
      if (Array.isArray(override.params) && override.params.length === 21) params = override.params;
      if (typeof override.monophonic === "boolean") monophonicFlag = override.monophonic;
    }
    return normalizeSystemInstrumentRecord({
      id: buildSystemInstrumentId(alias),
      exportName: aliasToExportName(alias),
      strudelAlias: alias,
      channel: Number.isFinite(Number(channel)) ? Number(channel) : index,
      params,
      monophonic: monophonicFlag,
      scope: "system",
    });
  });
}

function loadStoredSystemInstrumentStore() {
  try {
    const raw = localStorage.getItem(SYSTEM_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.records)) return null;
    return {
      sourceSignature: typeof parsed.sourceSignature === "string" ? parsed.sourceSignature : "",
      records: parsed.records.map(normalizeSystemInstrumentRecord).filter(Boolean),
    };
  } catch (_e) {
    return null;
  }
}

function saveSystemInstrumentStore(records) {
  const normalized = records
    .map(normalizeSystemInstrumentRecord)
    .filter(Boolean)
    .map((record, index) => ({ ...record, channel: index }));
  systemInstrumentStoreCache = normalized.map(cloneInstrument).filter(Boolean);
  try {
    localStorage.setItem(
      SYSTEM_STORE_KEY,
      JSON.stringify({
        sourceSignature: getStaticSystemSourceSignature(),
        records: systemInstrumentStoreCache,
      }),
    );
    return true;
  } catch (e) {
    console.error("[InstrumentManager] Failed to save system instruments:", e);
    return false;
  }
}

function loadSystemInstrumentStore() {
  if (Array.isArray(systemInstrumentStoreCache)) {
    return systemInstrumentStoreCache.map(cloneInstrument).filter(Boolean);
  }

  const currentSourceSignature = getStaticSystemSourceSignature();
  const stored = loadStoredSystemInstrumentStore();
  const needsReset = !stored || stored.sourceSignature !== currentSourceSignature;
  const seeded = needsReset ? buildStaticSystemInstrumentRecords() : stored.records;

  systemInstrumentStoreCache = seeded.map(normalizeSystemInstrumentRecord).filter(Boolean);
  if (needsReset) {
    saveSystemInstrumentStore(systemInstrumentStoreCache);
  }
  return systemInstrumentStoreCache.map(cloneInstrument).filter(Boolean);
}

/**
 * Build system instrument records from the mutable runtime/system store.
 * @returns {Array} Array of instrument objects with id "system:alias"
 */
function getSystemInstrumentRecords() {
  return loadSystemInstrumentStore().map((record, index) => ({
    ...record,
    id: buildSystemInstrumentId(record.strudelAlias),
    channel: index,
    scope: "system",
  }));
}

function loadStoredUserInstruments() {
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

function migrateSystemScopedUserInstruments() {
  const records = loadStoredUserInstruments();
  const promoted = records.filter((record) => normalizeScope(record.scope, inferLegacyScope(record)) === "system");
  if (promoted.length === 0) return records;

  const userOnly = records.filter((record) => normalizeScope(record.scope, inferLegacyScope(record)) !== "system");
  const systemRecords = loadSystemInstrumentStore();
  const systemByAlias = new Map(systemRecords.map((record) => [String(record.strudelAlias || "").toLowerCase(), record]));

  promoted.forEach((record) => {
    const aliasKey = String(record.strudelAlias || "").toLowerCase();
    if (systemByAlias.has(aliasKey)) return;
    systemRecords.push(
      normalizeSystemInstrumentRecord({
        exportName: record.exportName,
        strudelAlias: record.strudelAlias,
        params: record.params,
        monophonic: record.monophonic,
      }),
    );
  });

  saveSystemInstrumentStore(systemRecords);
  saveInstruments(userOnly);
  didRepairInstrumentScopeStorage = true;
  console.log("[InstrumentManager] Migrated", promoted.length, "system-scoped instruments out of user storage");
  return userOnly;
}

export function consumeInstrumentScopeRepairFlag() {
  const value = didRepairInstrumentScopeStorage;
  didRepairInstrumentScopeStorage = false;
  return value;
}

/**
 * Load user instruments from localStorage
 * @returns {Array} Array of instrument objects (user only)
 */
export function loadInstruments() {
  return migrateSystemScopedUserInstruments()
    .filter((record) => normalizeScope(record.scope, inferLegacyScope(record)) !== "system")
    .map((record) => ({ ...record, scope: "user" }));
}

/**
 * Save user instruments to localStorage (user only; system instruments are in instruments.system.js)
 * @param {Array} instruments - Array of user instrument objects
 */
export function saveInstruments(instruments) {
  try {
    const userOnly = (Array.isArray(instruments) ? instruments : [])
      .map(normalizeInstrument)
      .filter(Boolean)
      .filter((record) => normalizeScope(record.scope, inferLegacyScope(record)) !== "system")
      .map((record) => ({ ...record, scope: "user" }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userOnly));
    console.log("[InstrumentManager] Saved", userOnly.length, "user instruments");
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
    const systemRecords = loadSystemInstrumentStore();
    const index = systemRecords.findIndex((record) => record.id === id);
    if (index === -1) return null;

    const current = systemRecords[index];
    const nextAlias = String(changes?.strudelAlias || current.strudelAlias || "").trim();
    if (!nextAlias) return null;
    const aliasChanged = nextAlias !== current.strudelAlias;
    if (aliasChanged) {
      const duplicate = systemRecords.find((record, recordIndex) => recordIndex !== index && record.strudelAlias === nextAlias);
      if (duplicate) {
        console.error("[InstrumentManager] Duplicate system instrument alias:", nextAlias);
        return null;
      }
    }

    const next = normalizeSystemInstrumentRecord({
      ...current,
      ...changes,
      id: buildSystemInstrumentId(nextAlias),
      strudelAlias: nextAlias,
      exportName: toSafeSystemExportName(changes?.exportName, nextAlias),
      params: changes.params && Array.isArray(changes.params) && changes.params.length === 21
        ? changes.params
        : current.params,
      monophonic: typeof changes.monophonic === "boolean" ? changes.monophonic : current.monophonic,
    });
    if (!next) return null;

    systemRecords[index] = next;
    saveSystemInstrumentStore(systemRecords);
    return next;
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
    const systemRecords = loadSystemInstrumentStore();
    const filtered = systemRecords.filter((record) => record.id !== id);
    if (filtered.length === systemRecords.length) {
      console.error("[InstrumentManager] System instrument not found:", id);
      return false;
    }
    saveSystemInstrumentStore(filtered);
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
  const nextScope = normalizeScope(scope, "user");

  if (typeof id === "string" && id.startsWith(SYSTEM_ID_PREFIX)) {
    if (nextScope === "system") return getInstrumentById(id);
    const systemRecords = loadSystemInstrumentStore();
    const index = systemRecords.findIndex((record) => record.id === id);
    if (index === -1) return null;

    const [moved] = systemRecords.splice(index, 1);
    saveSystemInstrumentStore(systemRecords);

    const userInstruments = loadInstruments();
    const userRecord = {
      ...cloneInstrument(moved),
      id: generateId(),
      scope: "user",
    };
    userInstruments.push(userRecord);
    saveInstruments(userInstruments);
    return userRecord;
  }

  const userInstruments = loadInstruments();
  const index = userInstruments.findIndex((inst) => inst.id === id);
  if (index === -1) return null;

  if (nextScope === "user") {
    userInstruments[index] = { ...userInstruments[index], scope: "user" };
    saveInstruments(userInstruments);
    return userInstruments[index];
  }

  const [moved] = userInstruments.splice(index, 1);
  const systemRecords = loadSystemInstrumentStore();
  if (systemRecords.some((record) => record.strudelAlias === moved.strudelAlias)) {
    console.error("[InstrumentManager] System instrument alias already exists:", moved.strudelAlias);
    return null;
  }

  const systemRecord = normalizeSystemInstrumentRecord({
    ...cloneInstrument(moved),
    id: buildSystemInstrumentId(moved.strudelAlias),
    exportName: toSafeSystemExportName(moved.exportName, moved.strudelAlias),
    scope: "system",
  });
  if (!systemRecord) return null;

  systemRecords.push(systemRecord);
  saveSystemInstrumentStore(systemRecords);
  saveInstruments(userInstruments);
  return systemRecord;
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
      const exportName = `zzfxtrack_${safeName}`;

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
