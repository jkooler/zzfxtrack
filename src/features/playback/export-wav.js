let deps = {
    buildSong: () => new Float32Array(),
    triggerFileDownload: () => {},
    setStatus: () => {},
    logError: () => {},
};

export function configureExportWav(options = {}) {
    deps = { ...deps, ...options };
}

function resampleLinear(input, sourceRate, targetRate) {
    if (!(input instanceof Float32Array) || input.length === 0) return new Float32Array();
    if (!Number.isFinite(sourceRate) || !Number.isFinite(targetRate) || sourceRate <= 0 || targetRate <= 0 || sourceRate === targetRate) {
        return input;
    }
    const ratio = targetRate / sourceRate;
    const outputLength = Math.max(1, Math.round(input.length * ratio));
    const output = new Float32Array(outputLength);
    const invRatio = sourceRate / targetRate;
    for (let i = 0; i < outputLength; i++) {
        const srcPos = i * invRatio;
        const srcIndex = Math.floor(srcPos);
        const frac = srcPos - srcIndex;
        const s0 = input[srcIndex] ?? 0;
        const s1 = input[Math.min(srcIndex + 1, input.length - 1)] ?? s0;
        output[i] = s0 + (s1 - s0) * frac;
    }
    return output;
}

function encodeWavMono(samples, sampleRate, bitDepth = 16) {
    const depth = bitDepth === 8 ? 8 : (bitDepth === 24 ? 24 : 16);
    const bytesPerSample = depth / 8;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const channels = 1;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    const writeString = (offset, text) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, depth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        if (depth === 8) {
            const v = Math.round((s * 0.5 + 0.5) * 255);
            view.setUint8(offset, Math.min(255, Math.max(0, v)));
            offset += 1;
        } else if (depth === 16) {
            const v = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
            view.setInt16(offset, v, true);
            offset += 2;
        } else {
            const v = s < 0 ? Math.round(s * 0x800000) : Math.round(s * 0x7fffff);
            view.setUint8(offset, v & 0xff);
            view.setUint8(offset + 1, (v >> 8) & 0xff);
            view.setUint8(offset + 2, (v >> 16) & 0xff);
            offset += 3;
        }
    }

    return buffer;
}

export function exportPatternWav({ lastExportedData, lastExportedMeta, mixSettings, wavSettings, outputFilename }) {
    const pcm44k = deps.buildSong(lastExportedData, { ...(lastExportedMeta || {}), ...mixSettings });
    if (!(pcm44k instanceof Float32Array) || pcm44k.length === 0) {
        throw new Error('Could not render PCM audio');
    }
    const pcm = wavSettings.sampleRate === 44100
        ? pcm44k
        : resampleLinear(pcm44k, 44100, wavSettings.sampleRate);
    const wavBuffer = encodeWavMono(pcm, wavSettings.sampleRate, wavSettings.bitDepth);
    deps.triggerFileDownload(outputFilename, new Blob([wavBuffer], { type: 'audio/wav' }), 'audio/wav');
}

export function exportArrangementWav({ renderResult, wavSettings, outputFilename }) {
    if (!renderResult?.mixBuffer?.length) {
        throw new Error('Arrangement has no playable tracker blocks');
    }
    const pcm = wavSettings.sampleRate === renderResult.sampleRate
        ? renderResult.mixBuffer
        : resampleLinear(renderResult.mixBuffer, renderResult.sampleRate, wavSettings.sampleRate);
    const wavBuffer = encodeWavMono(pcm, wavSettings.sampleRate, wavSettings.bitDepth);
    deps.triggerFileDownload(outputFilename, new Blob([wavBuffer], { type: 'audio/wav' }), 'audio/wav');
}
