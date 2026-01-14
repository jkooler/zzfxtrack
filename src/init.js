import { setStringParser } from '@strudel/core';

export async function initStrudel() {
    try {
        const { mini } = await import('@strudel/mini');
        setStringParser(mini);
        console.log('✅ Strudel mini-notation parser registered.');
    } catch (e) {
        console.warn('⚠️ Strudel mini-notation parser not found. Strings might not be parsed.');
    }
}
