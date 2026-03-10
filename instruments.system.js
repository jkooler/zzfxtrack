// instruments.system.js
// System instruments (tracked in repo). User instruments live in instruments.js (gitignored).
//
// Waveform Indexes (Index 6):
// 0: Sine
// 1: Triangle
// 2: Sawtooth
// 3: Tangent
// 4: Noise
// 5: Square (Pulse)

export const zzfxm_cp_s = [1,0,110,0.55,1.4,3,1,11,0,0,0,0,0,0.45,0,0,0.9,0.21,0,0,-2964];
export const zzfxm_enterprise_s = [1,0,523.2511,0.14,1,1,1,1,0,0,0,0,0,0.1,0,0,0.25,0,0.08,0,0];
export const zzfxm_sine_s = [0.2,0,232,0.01,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const zzfxm_tri_s = [0.2,0,232,0.01,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const zzfxm_saw_s = [0.2,0,232,0.01,0,0,2,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const zzfxm_tan_s = [0.2,0,232,0.01,0,0,3,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const zzfxm_minimal_s = [1,6,232,0.2,3,1,0,20,-1,1,155,10,1,0,5,0,0.3,0.1,1,1,-500];
export const zzfxm_noise_s = [0.2,0,232,0.01,0,0,4,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const zzfxm_square_s = [0.2,0,232,0.01,0,0,5,1,0,0,0,0,0,0,0,0,0,0,1,0,0];
export const zzfxm_kick_s = [0.9,0,72,0,0.01,0.08,0,1,0,0,0,0,0,0,0,0,0,0.57,0.01,0,0];
export const zzfxm_snare_s = [1.3,0.05,233.08,0,0.16,0,1,14,38,98,358,0,0,2.16,730,0,0,0.06,0.17,0,578];
export const zzfxm_synth_stab_s = [0.85,0,440,0,0.29,0.16,1,6.3,0,0,0,0,0.48,0.15,0,0,0,0.04,0.1,-0.5,0];
export const zzfxm_hh_closed_s = [0.3,0,440,0,0,0,4,1,0,0,0,0,0,0,0,0,0,0,0.08,0,3700];
export const zzfxm_pad_s = [0.5,0,440,0.5,0.21,0.92,2,3,0,0,0,0,0.4,0.2,0,0,0,0.2,0.4,0.3,-553];
export const zzfxm_cowbell_s = [0.7,0,440,0,0.1,0,0,0,50,50,0,0,0,0,34121,0,0,0,0.4,0,-1255];
export const zzfxm_bass_s = [0.55,0,55,0.01,0,0,5,0.8,0,0,0,0,0,0,0,0,0,0,0.3,0,-540];
export const zzfxm_hh_open_s = [0.5,0,440,0,0,0,4,1,0,0,0,0,0,0,0,0,0,0,0.25,0,3800];
export const zzfxm_kickdrum_s = [0.9,0,130,0,0.06,0.05,1,0.8,-2,5,0,0,0,0.6,0,0,0.2,0.14,0,-1100];
export const zzfxm_elpiano_s = [0.32,0,440,0,0.09,1.01,1,14.5,0,0,0,0,0.23,0.08,0,0,0,0.82,0.19,0.1,-180];
export const zzfxm_horn_s = [0.48,0,110,0.03,0.22,0.1,2,7.8,0,0,0,0,0,0,0,0,0,0.92,0.82,0,-300];
export const zzfxm_saw2_s = [0.25,0,440,0.01,0,0,2,1.5,0,0,0,0,0,0,0,0,0,0,1,0,0];

export const instrumentMapping = {
    "cp-s": 0,
    "enterprise-s": 1,
    "sine-s": 2,
    "tri-s": 3,
    "saw-s": 4,
    "tan-s": 5,
    "minimal-s": 6,
    "noise-s": 7,
    "square-s": 8,
    "kick-s": 9,
    "snare-s": 10,
    "synth-stab-s": 11,
    "hh-closed-s": 12,
    "pad-s": 13,
    "cowbell-s": 14,
    "bass-s": 15,
    "hh-open-s": 16,
    "kickdrum-s": 17,
    "elpiano-s": 18,
    "horn-s": 19,
    "saw2-s": 20
};

export const instruments = {
    "cp-s": zzfxm_cp_s,
    "enterprise-s": zzfxm_enterprise_s,
    "sine-s": zzfxm_sine_s,
    "tri-s": zzfxm_tri_s,
    "saw-s": zzfxm_saw_s,
    "tan-s": zzfxm_tan_s,
    "minimal-s": zzfxm_minimal_s,
    "noise-s": zzfxm_noise_s,
    "square-s": zzfxm_square_s,
    "kick-s": zzfxm_kick_s,
    "snare-s": zzfxm_snare_s,
    "synth-stab-s": zzfxm_synth_stab_s,
    "hh-closed-s": zzfxm_hh_closed_s,
    "pad-s": zzfxm_pad_s,
    "cowbell-s": zzfxm_cowbell_s,
    "bass-s": zzfxm_bass_s,
    "hh-open-s": zzfxm_hh_open_s,
    "kickdrum-s": zzfxm_kickdrum_s,
    "elpiano-s": zzfxm_elpiano_s,
    "horn-s": zzfxm_horn_s,
    "saw2-s": zzfxm_saw2_s
};

export const instrumentMonophonic = {
    "cp-s": false,
    "enterprise-s": false,
    "sine-s": false,
    "tri-s": false,
    "saw-s": false,
    "tan-s": false,
    "minimal-s": false,
    "noise-s": false,
    "square-s": false,
    "kick-s": false,
    "snare-s": false,
    "synth-stab-s": false,
    "hh-closed-s": false,
    "pad-s": false,
    "cowbell-s": false,
    "bass-s": true,
    "hh-open-s": false,
    "kickdrum-s": false,
    "elpiano-s": false,
    "horn-s": true,
    "saw2-s": false
};

export const instrumentScope = {
    "cp-s": "system",
    "enterprise-s": "system",
    "sine-s": "system",
    "tri-s": "system",
    "saw-s": "system",
    "tan-s": "system",
    "minimal-s": "system",
    "noise-s": "system",
    "square-s": "system",
    "kick-s": "system",
    "snare-s": "system",
    "synth-stab-s": "system",
    "hh-closed-s": "system",
    "pad-s": "system",
    "cowbell-s": "system",
    "bass-s": "system",
    "hh-open-s": "system",
    "kickdrum-s": "system",
    "elpiano-s": "system",
    "horn-s": "system",
    "saw2-s": "system"
};

export const instrumentArray = [
    zzfxm_cp_s,
    zzfxm_enterprise_s,
    zzfxm_sine_s,
    zzfxm_tri_s,
    zzfxm_saw_s,
    zzfxm_tan_s,
    zzfxm_minimal_s,
    zzfxm_noise_s,
    zzfxm_square_s,
    zzfxm_kick_s,
    zzfxm_snare_s,
    zzfxm_synth_stab_s,
    zzfxm_hh_closed_s,
    zzfxm_pad_s,
    zzfxm_cowbell_s,
    zzfxm_bass_s,
    zzfxm_hh_open_s,
    zzfxm_kickdrum_s,
    zzfxm_elpiano_s,
    zzfxm_horn_s,
    zzfxm_saw2_s
];
