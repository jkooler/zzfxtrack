/**
 * Instrument Manager
 * Manages the global instrument pool with localStorage persistence
 */

const STORAGE_KEY = "zzfxm-instruments";

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

/**
 * Load instruments from localStorage
 * @returns {Array} Array of instrument objects
 */
export function loadInstruments() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    console.error("[InstrumentManager] Failed to load instruments:", e);
    return [];
  }
}

/**
 * Save instruments to localStorage
 * @param {Array} instruments - Array of instrument objects
 */
export function saveInstruments(instruments) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instruments));
    console.log("[InstrumentManager] Saved", instruments.length, "instruments");
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
  const instruments = loadInstruments();

  // Default params if not provided (sine wave at 440Hz)
  const defaultParams = [
    0.2, 0, 440, 0.01, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0,
  ];

  const instrument = {
    id: generateId(),
    exportName: exportName || "INST_UNTITLED",
    strudelAlias: strudelAlias || "z-untitled",
    channel: channel ?? instruments.length,
    params: params.length === 21 ? params : defaultParams,
    monophonic: false,
  };

  instruments.push(instrument);
  saveInstruments(instruments);

  return instrument;
}

/**
 * Update an existing instrument
 * @param {string} id - Instrument ID
 * @param {Object} changes - Object with fields to update
 * @returns {Object|null} Updated instrument or null if not found
 */
export function updateInstrument(id, changes) {
  const instruments = loadInstruments();
  const index = instruments.findIndex((inst) => inst.id === id);

  if (index === -1) {
    console.error("[InstrumentManager] Instrument not found:", id);
    return null;
  }

  instruments[index] = { ...instruments[index], ...changes };
  saveInstruments(instruments);

  return instruments[index];
}

/**
 * Delete an instrument
 * @param {string} id - Instrument ID
 * @returns {boolean} Success status
 */
export function deleteInstrument(id) {
  const instruments = loadInstruments();
  const filtered = instruments.filter((inst) => inst.id !== id);

  if (filtered.length === instruments.length) {
    console.error("[InstrumentManager] Instrument not found:", id);
    return false;
  }

  saveInstruments(filtered);
  return true;
}

/**
 * Reorder instruments (changes channel assignments)
 * @param {number} fromIndex - Source index
 * @param {number} toIndex - Destination index
 * @returns {Array} Reordered instruments
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
 * Get defragmented instruments (compact sparse channels to sequential)
 * Example: channels [1, 23, 132, 501] → [0, 1, 2, 3]
 * @returns {Array} Instruments with compacted channel indices
 */
export function getDefragmentedInstruments() {
  const instruments = loadInstruments();

  // Sort by channel number
  const sorted = [...instruments].sort((a, b) => a.channel - b.channel);

  // Reassign to sequential indices
  return sorted.map((inst, index) => ({
    ...inst,
    defragmentedChannel: index,
  }));
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
 * Get instrument by ID
 * @param {string} id - Instrument ID
 * @returns {Object|null} Instrument object or null
 */
export function getInstrumentById(id) {
  const instruments = loadInstruments();
  return instruments.find((inst) => inst.id === id) || null;
}

/**
 * Migrate instruments from existing instruments.js file
 * @param {Object} importedData - Object with instrument exports
 * @returns {Array} Migrated instruments
 */
export function migrateFromFile(importedData) {
  console.log("[InstrumentManager] Starting migration from instruments.js");

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

  const instruments = [];
  let channel = 0;

  // Extract from instrumentMapping if available
  if (importedData.instrumentMapping) {
    Object.entries(importedData.instrumentMapping).forEach(([alias, ch]) => {
      // Generate export name using the same convention as instrument creation
      // Remove any existing z- prefix before adding zzfxm- prefix
      const cleanAlias = alias.toLowerCase().replace(/^z-/, "");
      // Convert to safe variable name
      let safeName = cleanAlias.replace(/[^a-zA-Z0-9]/g, '_');
      if (/^[0-9]/.test(safeName)) safeName = '_' + safeName;
      const exportName = `zzfxm_${safeName}`;

      // Try to find the instrument params
      // First try exact match
      let params = importedData.instruments?.[alias];

      // If not found, try case variations (e.g., z-KICKDRUM vs z-kickdrum)
      if (!params) {
        const aliasUpper = alias.toUpperCase();
        const aliasLower = alias.toLowerCase();
        params =
          importedData.instruments?.[aliasUpper] ||
          importedData.instruments?.[aliasLower];
      }

      if (params && Array.isArray(params)) {
        const prev =
          existingByAlias.get(alias) || existingByAliasLower.get(alias.toLowerCase());
        const monoFromFile =
          monophonicFromFile?.[alias] ??
          monophonicFromFile?.[alias.toLowerCase()] ??
          monophonicFromFile?.[alias.toUpperCase()];
        instruments.push({
          id: prev?.id || generateId(),
          exportName,
          strudelAlias: alias,
          channel: ch,
          params,
          monophonic: parseMonophonicFlag(monoFromFile, parseMonophonicFlag(prev?.monophonic, false)),
        });
      } else {
        console.warn(`[InstrumentManager] Could not find params for ${alias}`);
      }
    });
  }

  saveInstruments(instruments);
  console.log(
    "[InstrumentManager] Migrated",
    instruments.length,
    "instruments",
  );

  return instruments;
}

/**
 * Check if migration is needed (no instruments in localStorage)
 * @returns {boolean}
 */
export function needsMigration() {
  const instruments = loadInstruments();
  return instruments.length === 0;
}
