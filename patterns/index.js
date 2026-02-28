/**
 * Registry of pattern modules (used by preview and other tools).
 * The main app discovers patterns via import.meta.glob('../patterns/*.js') and does not use this file.
 */
export const patterns = {
  '01-Introduction-Demo': () => import('./01-Introduction-Demo.js'),
  '01-Introduction': () => import('./01-Introduction.js'),
  '02-Monophon-Horn-Demo': () => import('./02-Monophon-Horn-Demo.js'),
  '02-Monophonic-Horn': () => import('./02-Monophonic-Horn.js'),
  '03-Blocks-Demo': () => import('./03-Blocks-Demo.js'),
  '03-Blocks': () => import('./03-Blocks.js'),
  '04-Diagnostic-sound': () => import('./04-Diagnostic-sound.js'),
};
