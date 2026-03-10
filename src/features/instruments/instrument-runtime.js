/**
 * Module: features/instruments/instrument-runtime
 * Purpose: Reload merged instruments (system + user) into Strudel.
 */

import { getDefragmentedInstruments } from '../../instrument-manager.js';
import { loadZzFXInstruments } from '../../zzfx-loader.js';

/**
 * Reload instruments into Strudel (system from instruments.system.js + user from localStorage).
 * Call this after instrument changes to update the sound registry.
 */
export async function reloadInstruments() {
    const map = {};
    const monophonicAliases = new Set();
    const defragged = getDefragmentedInstruments();

    defragged.forEach((inst) => {
        map[inst.strudelAlias] = inst.params;
        if (inst.monophonic) monophonicAliases.add(inst.strudelAlias);
    });

    if (Object.keys(map).length === 0) {
        console.log('[InstrumentRuntime] No instruments to load; keeping initial registry');
        return;
    }

    loadZzFXInstruments(map, { monophonicAliases });
    console.log('[InstrumentRuntime] Reloaded', Object.keys(map).length, 'instruments into Strudel');
}
