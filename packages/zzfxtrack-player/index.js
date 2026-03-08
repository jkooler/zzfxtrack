/**
 * ZzFXTrack Player — play song data (ZzFXMicro 21-param format).
 * No dependencies. For use with exported JSON from tools that output this format.
 */

export {
  buildSong,
  playZzfxmSong,
  stopZzfxmSong,
} from './src/zzfxtrack-player.js';

export {
  DEFAULT_PLAYBACK_MIX_SETTINGS,
  sanitizePlaybackMixSettings,
  dbToGain,
  softClipSample,
} from './src/mix-settings.js';
