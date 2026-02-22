
export class ScopeVisualizer {
    constructor(analyser) {
        this.analyser = analyser;
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.draw = this.draw.bind(this);
    }

    attach(canvas) {
        if (this.canvas === canvas) return;
        
        // Cleanup old
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        this.canvas = canvas;
        
        if (canvas) {
            this.ctx = canvas.getContext('2d');
            this.draw();
        }
    }

    /**
     * Swap the analyser (e.g. to preview analyser while test note plays, then back to instrument analyser).
     */
    setAnalyser(analyser) {
        this.analyser = analyser;
    }

    draw() {
        if (!this.canvas) return;
        this.animationId = requestAnimationFrame(this.draw);

        if (!this.analyser) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);

        const width = this.canvas.width;
        const height = this.canvas.height;
        const ctx = this.ctx;

        ctx.clearRect(0, 0, width, height);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff'; 
        ctx.beginPath();

        // Amplify deviation from center so quiet signals are visible (zoom into waveform)
        const waveformGain = 4;
        const sliceWidth = width * 1.0 / bufferLength;
        const centerY = height / 2;
        const halfHeight = height / 2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const normalized = (dataArray[i] - 128) / 128; // -1 .. 1
            const amplified = Math.max(-1, Math.min(1, normalized * waveformGain));
            const y = centerY + amplified * halfHeight;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        ctx.lineTo(width, centerY);
        ctx.stroke();
    }
}

// Global singleton for backward compatibility (Songs List)
let globalVisualizer = null;
let globalAnalyser = null;

export function getVisualizerAnalyser(audioCtx) {
    if (!globalAnalyser) {
        globalAnalyser = audioCtx.createAnalyser();
        globalAnalyser.fftSize = 256;
        globalAnalyser.smoothingTimeConstant = 0.5;
        globalVisualizer = new ScopeVisualizer(globalAnalyser);
    }
    return globalAnalyser;
}

export function attachVisualizer(canvas) {
    if (globalVisualizer) {
        globalVisualizer.attach(canvas);
    }
}
