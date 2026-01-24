
let analyser = null;
let animationFrameId = null;
let currentCanvas = null;
let canvasCtx = null;

export function getVisualizerAnalyser(audioCtx) {
    if (!analyser) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256; // Smaller FFT for smoother, faster bars
        analyser.smoothingTimeConstant = 0.5; // Smooth out jitter
    }
    return analyser;
}

export function attachVisualizer(canvas) {
    // If attaching to same canvas, do nothing
    if (currentCanvas === canvas) return;
    
    // Stop old animation
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    currentCanvas = canvas;
    
    if (canvas) {
        canvasCtx = canvas.getContext('2d');
        draw();
    }
}

function draw() {
    if (!currentCanvas) return;
    
    animationFrameId = requestAnimationFrame(draw);
    
    if (!analyser) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    
    // Debug: Check if we have any signal
    // let hasSignal = false;
    // for(let i=0; i<bufferLength; i++) {
    //    if (dataArray[i] !== 128) { hasSignal = true; break; }
    // }
    // if (hasSignal) console.log("Visualizer Signal Detected!");
    
    const width = currentCanvas.width;
    const height = currentCanvas.height;
    
    canvasCtx.clearRect(0, 0, width, height);
    
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#ffffff'; // White oscilloscope
    canvasCtx.beginPath();
    
    const sliceWidth = width * 1.0 / bufferLength;
    let x = 0;
    
    for(let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0; // Normalizing to 0..2
        const y = v * height / 2; // Scaling to canvas height
        
        if(i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }
        
        x += sliceWidth;
    }
    
    canvasCtx.lineTo(currentCanvas.width, currentCanvas.height/2);
    canvasCtx.stroke();
}
