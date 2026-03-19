// POCKET AOI MVP - Final Version
const AppState = {
    roi: { x: 0, y: 0, width: 220, height: 160, shape: 'rect' },
    selectedTool: 'presence',
    filters: { threshold: true, morph: false, invert: false },
    thresholdValue: 128,
    toolLimits: { presenceLimit: 100, blobMinSize: 80, blobCountLimit: 1 },
    stats: { pass: 0, fail: 0 },
    lastResult: { tool: '-', value: 0, limit: 0, passed: null },
    dragState: { isDragging: false, isResizing: false, handle: null, startX: 0, startY: 0, startRect: null },
    inspectTimeout: null
};

const elements = {
    video: document.getElementById('cameraVideo'),
    viewport: document.getElementById('cameraViewport'),
    roiBox: document.getElementById('roiBox'),
    processedCanvas: document.getElementById('processedCanvas'),
    toolSelector: document.getElementById('toolSelector'),
    presenceLimit: document.getElementById('presenceLimit'),
    presenceLimitDisplay: document.getElementById('presenceLimitDisplay'),
    blobMinSize: document.getElementById('blobMinSize'),
    blobMinSizeDisplay: document.getElementById('blobMinSizeDisplay'),
    blobCountLimit: document.getElementById('blobCountLimit'),
    blobCountLimitDisplay: document.getElementById('blobCountLimitDisplay'),
    roiWidth: document.getElementById('roiWidth'),
    roiWidthDisplay: document.getElementById('roiWidthDisplay'),
    roiHeight: document.getElementById('roiHeight'),
    roiHeightDisplay: document.getElementById('roiHeightDisplay'),
    thresholdFilter: document.getElementById('thresholdFilter'),
    thresholdValue: document.getElementById('thresholdValue'),
    thresholdDisplay: document.getElementById('thresholdDisplay'),
    morphFilter: document.getElementById('morphFilter'),
    invertFilter: document.getElementById('invertFilter'),
    roiShapeRadios: document.querySelectorAll('input[name="roiShape"]'),
    inspectBtn: document.getElementById('inspectBtn'),
    resetStatsBtn: document.getElementById('resetStatsBtn'),
    statPass: document.getElementById('statPass'),
    statFail: document.getElementById('statFail'),
    statFpy: document.getElementById('statFpy'),
    resultTool: document.getElementById('resultTool'),
    resultValue: document.getElementById('resultValue'),
    resultLimit: document.getElementById('resultLimit'),
    resultStatus: document.getElementById('resultStatus')
};

const ctx = elements.processedCanvas.getContext('2d', { willReadFrequently: true });

// COLLAPSIBLE SECTIONS
function toggleSection(header) {
    header.classList.toggle('collapsed');
    const content = header.nextElementSibling;
    content.classList.toggle('collapsed');
}

// AUTO START CAMERA
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        elements.video.srcObject = stream;
        elements.video.play();
        centerROI();
        processFrames();
    } catch (error) {
        console.error(`Camera error: ${error.message}`);
    }
}

// ROI MANAGEMENT
function centerROI() {
    const bounds = elements.viewport.getBoundingClientRect();
    AppState.roi.width = Math.min(260, Math.max(120, bounds.width * 0.35));
    AppState.roi.height = Math.min(190, Math.max(100, bounds.height * 0.35));
    AppState.roi.x = (bounds.width - AppState.roi.width) / 2;
    AppState.roi.y = (bounds.height - AppState.roi.height) / 2;
    applyROI();
}

function clampROI() {
    const bounds = elements.viewport.getBoundingClientRect();
    AppState.roi.width = Math.max(60, Math.min(AppState.roi.width, bounds.width));
    AppState.roi.height = Math.max(60, Math.min(AppState.roi.height, bounds.height));
    AppState.roi.x = Math.max(0, Math.min(AppState.roi.x, bounds.width - AppState.roi.width));
    AppState.roi.y = Math.max(0, Math.min(AppState.roi.y, bounds.height - AppState.roi.height));
}

function applyROI() {
    clampROI();
    elements.roiBox.style.left = `${AppState.roi.x}px`;
    elements.roiBox.style.top = `${AppState.roi.y}px`;
    elements.roiBox.style.width = `${AppState.roi.width}px`;
    elements.roiBox.style.height = `${AppState.roi.height}px`;
    
    if (AppState.roi.shape === 'circle') {
        elements.roiBox.style.borderRadius = '50%';
    } else {
        elements.roiBox.style.borderRadius = '0';
    }
}

function onPointerDown(event) {
    const handle = event.target.classList.contains('resize-handle') ? event.target.className.split(' ')[1] : null;
    AppState.dragState.startX = event.clientX;
    AppState.dragState.startY = event.clientY;
    AppState.dragState.startRect = { ...AppState.roi };
    
    if (handle) {
        AppState.dragState.isResizing = true;
        AppState.dragState.handle = handle;
    } else {
        AppState.dragState.isDragging = true;
    }
    elements.roiBox.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
    if (!AppState.dragState.isDragging && !AppState.dragState.isResizing) return;
    
    const dx = event.clientX - AppState.dragState.startX;
    const dy = event.clientY - AppState.dragState.startY;
    const minSize = 60;
    
    if (AppState.dragState.isDragging) {
        AppState.roi.x = AppState.dragState.startRect.x + dx;
        AppState.roi.y = AppState.dragState.startRect.y + dy;
    }
    
    if (AppState.dragState.isResizing) {
        const rect = { ...AppState.dragState.startRect };
        const handle = AppState.dragState.handle;
        
        if (handle.includes('l')) {
            rect.x = AppState.dragState.startRect.x + dx;
            rect.width = AppState.dragState.startRect.width - dx;
        }
        if (handle.includes('r')) rect.width = AppState.dragState.startRect.width + dx;
        if (handle.includes('t')) {
            rect.y = AppState.dragState.startRect.y + dy;
            rect.height = AppState.dragState.startRect.height - dy;
        }
        if (handle.includes('b')) rect.height = AppState.dragState.startRect.height + dy;
        
        if (rect.width < minSize) {
            rect.width = minSize;
            if (handle.includes('l')) rect.x = AppState.dragState.startRect.x + (AppState.dragState.startRect.width - minSize);
        }
        if (rect.height < minSize) {
            rect.height = minSize;
            if (handle.includes('t')) rect.y = AppState.dragState.startRect.y + (AppState.dragState.startRect.height - minSize);
        }
        
        AppState.roi = rect;
    }
    
    applyROI();
}

function onPointerUp(event) {
    AppState.dragState.isDragging = false;
    AppState.dragState.isResizing = false;
    AppState.dragState.handle = null;
    elements.roiBox.releasePointerCapture(event.pointerId);
}

// FILTER SYSTEM
function applyFilters(imageData) {
    const data = imageData.data;
    
    if (AppState.filters.threshold) {
        const thresh = AppState.thresholdValue;
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const binary = gray >= thresh ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = binary;
        }
    }
    
    if (AppState.filters.morph) {
        const width = elements.processedCanvas.width;
        const height = elements.processedCanvas.height;
        const newData = new Uint8ClampedArray(data);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let maxVal = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        maxVal = Math.max(maxVal, data[idx]);
                    }
                }
                const idx = (y * width + x) * 4;
                newData[idx] = newData[idx + 1] = newData[idx + 2] = maxVal;
            }
        }
        data.set(newData);
    }
    
    if (AppState.filters.invert) {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
        }
    }
    
    return imageData;
}

// BLOB DETECTION - EXACT SHAPE VISUALIZATION
function detectBlobs(imageData) {
    const data = imageData.data;
    const width = elements.processedCanvas.width;
    const height = elements.processedCanvas.height;
    const minSize = AppState.toolLimits.blobMinSize;
    
    const visited = new Array(width * height).fill(false);
    const blobs = [];
    
    function floodFill(startX, startY) {
        const stack = [[startX, startY]];
        const blob = [];
        
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = (y * width + x) * 4;
            
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (visited[y * width + x]) continue;
            if (data[idx] < 200) continue;
            
            visited[y * width + x] = true;
            blob.push({ x, y });
            
            stack.push([x + 1, y]);
            stack.push([x - 1, y]);
            stack.push([x, y + 1]);
            stack.push([x, y - 1]);
        }
        
        return blob;
    }
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (data[idx] > 200 && !visited[y * width + x]) {
                const blob = floodFill(x, y);
                if (blob.length >= minSize) {
                    blobs.push(blob);
                }
            }
        }
    }
    
    return blobs;
}

// DRAW EXACT BLOB SHAPES ON CANVAS
function drawBlobsOnCanvas(blobs, passed) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = elements.processedCanvas.width;
    tempCanvas.height = elements.processedCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    const color = passed ? '#00ff00' : '#ff0000';
    
    blobs.forEach(blob => {
        if (blob.length === 0) return;
        
        // Draw exact blob shape pixel by pixel
        blob.forEach(pixel => {
            tempCtx.fillStyle = color;
            tempCtx.globalAlpha = 0.5;
            tempCtx.fillRect(pixel.x, pixel.y, 1, 1);
        });
        
        // Draw contour outline
        tempCtx.globalAlpha = 1.0;
        tempCtx.strokeStyle = color;
        tempCtx.lineWidth = 1;
        
        const minX = Math.min(...blob.map(p => p.x));
        const maxX = Math.max(...blob.map(p => p.x));
        const minY = Math.min(...blob.map(p => p.y));
        const maxY = Math.max(...blob.map(p => p.y));
        
        tempCtx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    });
    
    ctx.drawImage(tempCanvas, 0, 0);
}

// INSPECTION TOOLS
function runPresenceTool(imageData) {
    const data = imageData.data;
    let whitePixels = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 200) whitePixels++;
    }
    const threshold = AppState.toolLimits.presenceLimit;
    return { 
        tool: 'Presence Counter',
        value: whitePixels, 
        limit: threshold,
        passed: whitePixels >= threshold,
        blobs: null
    };
}

function runBlobTool(imageData) {
    const blobs = detectBlobs(imageData);
    const countLimit = AppState.toolLimits.blobCountLimit;
    const passed = blobs.length >= countLimit;
    
    return { 
        tool: 'Blob Detection',
        value: blobs.length, 
        limit: countLimit,
        passed: passed,
        blobs: blobs
    };
}

// FRAME PROCESSING
function processFrames() {
    if (!elements.video.videoWidth || !elements.video.videoHeight) {
        requestAnimationFrame(processFrames);
        return;
    }
    
    const viewRect = elements.viewport.getBoundingClientRect();
    const scaleX = elements.video.videoWidth / viewRect.width;
    const scaleY = elements.video.videoHeight / viewRect.height;
    
    const sx = Math.floor(AppState.roi.x * scaleX);
    const sy = Math.floor(AppState.roi.y * scaleY);
    const sw = Math.floor(AppState.roi.width * scaleX);
    const sh = Math.floor(AppState.roi.height * scaleY);
    
    elements.processedCanvas.width = sw;
    elements.processedCanvas.height = sh;
    
    ctx.drawImage(elements.video, sx, sy, sw, sh, 0, 0, sw, sh);
    let imageData = ctx.getImageData(0, 0, sw, sh);
    imageData = applyFilters(imageData);
    ctx.putImageData(imageData, 0, 0);
    
    // LIVE INSPECTION UPDATE
    const result = AppState.selectedTool === 'presence' ? runPresenceTool(imageData) : runBlobTool(imageData);
    updateLiveResult(result);
    
    // DRAW BLOBS ON CANVAS if blob tool is selected
    if (AppState.selectedTool === 'blob' && result.blobs) {
        drawBlobsOnCanvas(result.blobs, result.passed);
    }
    
    requestAnimationFrame(processFrames);
}

// LIVE RESULT UPDATE
function updateLiveResult(result) {
    AppState.lastResult = result;
    elements.resultTool.textContent = result.tool;
    elements.resultValue.textContent = result.value;
    elements.resultLimit.textContent = result.limit;
    
    if (result.passed) {
        elements.resultStatus.textContent = 'PASS ✓';
        elements.resultStatus.className = 'result-status-pass';
        elements.roiBox.classList.add('pass');
        elements.roiBox.classList.remove('fail');
    } else {
        elements.resultStatus.textContent = 'FAIL ✗';
        elements.resultStatus.className = 'result-status-fail';
        elements.roiBox.classList.add('fail');
        elements.roiBox.classList.remove('pass');
    }
}

// RECORD INSPECTION RESULT WITH 3 SECOND RESET
function recordInspection() {
    const passed = AppState.lastResult.passed;
    
    // Add to statistics
    if (passed) {
        AppState.stats.pass++;
        elements.inspectBtn.classList.add('pass');
        elements.inspectBtn.classList.remove('fail');
    } else {
        AppState.stats.fail++;
        elements.inspectBtn.classList.add('fail');
        elements.inspectBtn.classList.remove('pass');
    }
    
    updateStatsDisplay();
    
    // Reset to neutral state after 3 seconds
    if (AppState.inspectTimeout) {
        clearTimeout(AppState.inspectTimeout);
    }
    
    AppState.inspectTimeout = setTimeout(() => {
        elements.inspectBtn.classList.remove('pass', 'fail');
    }, 3000);
}

// STATISTICS
function updateStatsDisplay() {
    const total = AppState.stats.pass + AppState.stats.fail;
    const fpy = total > 0 ? (AppState.stats.pass / total * 100).toFixed(1) : 0;
    
    elements.statPass.textContent = AppState.stats.pass;
    elements.statFail.textContent = AppState.stats.fail;
    elements.statFpy.textContent = fpy + '%';
}

function resetStats() {
    AppState.stats = { pass: 0, fail: 0 };
    updateStatsDisplay();
    elements.inspectBtn.classList.remove('pass', 'fail');
}

// EVENT LISTENERS
window.addEventListener('resize', centerROI);
elements.roiBox.addEventListener('pointerdown', onPointerDown);
elements.roiBox.addEventListener('pointermove', onPointerMove);
elements.roiBox.addEventListener('pointerup', onPointerUp);
elements.roiBox.addEventListener('pointercancel', onPointerUp);

elements.toolSelector.addEventListener('change', (e) => AppState.selectedTool = e.target.value);

elements.presenceLimit.addEventListener('input', (e) => {
    AppState.toolLimits.presenceLimit = parseInt(e.target.value);
    elements.presenceLimitDisplay.textContent = e.target.value + ' px';
});

elements.blobMinSize.addEventListener('input', (e) => {
    AppState.toolLimits.blobMinSize = parseInt(e.target.value);
    elements.blobMinSizeDisplay.textContent = e.target.value + ' px';
});

elements.blobCountLimit.addEventListener('input', (e) => {
    AppState.toolLimits.blobCountLimit = parseInt(e.target.value);
    elements.blobCountLimitDisplay.textContent = e.target.value + ' blob' + (e.target.value > 1 ? 's' : '');
});

elements.roiWidth.addEventListener('input', (e) => {
    AppState.roi.width = parseInt(e.target.value);
    elements.roiWidthDisplay.textContent = e.target.value + ' px';
    applyROI();
});

elements.roiHeight.addEventListener('input', (e) => {
    AppState.roi.height = parseInt(e.target.value);
    elements.roiHeightDisplay.textContent = e.target.value + ' px';
    applyROI();
});

elements.thresholdFilter.addEventListener('change', (e) => AppState.filters.threshold = e.target.checked);
elements.thresholdValue.addEventListener('input', (e) => {
    AppState.thresholdValue = parseInt(e.target.value);
    elements.thresholdDisplay.textContent = 'Value: ' + e.target.value;
});

elements.morphFilter.addEventListener('change', (e) => AppState.filters.morph = e.target.checked);
elements.invertFilter.addEventListener('change', (e) => AppState.filters.invert = e.target.checked);

elements.roiShapeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        AppState.roi.shape = e.target.value;
        applyROI();
    });
});

elements.inspectBtn.addEventListener('click', recordInspection);
elements.resetStatsBtn.addEventListener('click', resetStats);

// Initialize
startCamera();
centerROI();
updateStatsDisplay();