import { instruments as staticInstruments, instrumentMonophonic as staticMonophonic } from '../../../instruments.js';
import { getDefragmentedInstruments } from '../../instrument-manager.js';
import { loadZzFXInstruments } from '../../zzfx-loader.js';

/**
 * Reload instruments into Strudel.
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

    // Only use static fallback when user has no instruments (initial/demo state).
    if (defragged.length === 0) {
        for (const [alias, params] of Object.entries(staticInstruments)) {
            if (Array.isArray(params) && map[alias] === undefined) {
                map[alias] = params;
                if (staticMonophonic && staticMonophonic[alias]) monophonicAliases.add(alias);
            }
        }
    }

    if (Object.keys(map).length === 0) {
        console.log('[InstrumentRuntime] No instruments to load; keeping initial registry');
        return;
    }

    loadZzFXInstruments(map, { monophonicAliases });
    console.log('[InstrumentRuntime] Reloaded', Object.keys(map).length, 'instruments into Strudel');
}
