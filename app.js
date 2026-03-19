const startCameraBtn = document.getElementById('startCameraBtn');
const video = document.getElementById('cameraVideo');
const viewport = document.getElementById('cameraViewport');
const roiBox = document.getElementById('roiBox');
const processedCanvas = document.getElementById('processedCanvas');
const ctx = processedCanvas.getContext('2d', { willReadFrequently: true });

const grayscaleToggle = document.getElementById('grayscaleToggle');
const contrastRange = document.getElementById('contrastRange');
const thresholdRange = document.getElementById('thresholdRange');
const blobToggle = document.getElementById('blobToggle');
const blobMinSizeInput = document.getElementById('blobMinSize');
const blobResult = document.getElementById('blobResult');

const state = {
  dragging: false,
  resizing: false,
  handle: null,
  pointerId: null,
  startX: 0,
  startY: 0,
  startRect: null,
  roi: { x: 0, y: 0, width: 220, height: 160 }
};

function centerROI() {
  const bounds = viewport.getBoundingClientRect();
  state.roi.width = Math.min(260, Math.max(120, bounds.width * 0.35));
  state.roi.height = Math.min(190, Math.max(100, bounds.height * 0.35));
  state.roi.x = (bounds.width - state.roi.width) / 2;
  state.roi.y = (bounds.height - state.roi.height) / 2;
  applyROI();
}

function clampROI() {
  const bounds = viewport.getBoundingClientRect();
  state.roi.width = Math.max(60, Math.min(state.roi.width, bounds.width));
  state.roi.height = Math.max(60, Math.min(state.roi.height, bounds.height));
  state.roi.x = Math.max(0, Math.min(state.roi.x, bounds.width - state.roi.width));
  state.roi.y = Math.max(0, Math.min(state.roi.y, bounds.height - state.roi.height));
}

function applyROI() {
  clampROI();
  roiBox.style.left = `${state.roi.x}px`;
  roiBox.style.top = `${state.roi.y}px`;
  roiBox.style.width = `${state.roi.width}px`;
  roiBox.style.height = `${state.roi.height}px`;
}

function onPointerDown(event) {
  const handle = event.target.dataset.handle;
  state.pointerId = event.pointerId;
  roiBox.setPointerCapture(state.pointerId);
  state.startX = event.clientX;
  state.startY = event.clientY;
  state.startRect = { ...state.roi };

  if (handle) {
    state.resizing = true;
    state.handle = handle;
  } else {
    state.dragging = true;
  }
}

function onPointerMove(event) {
  if (!state.dragging && !state.resizing) return;

  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  const minSize = 60;

  if (state.dragging) {
    state.roi.x = state.startRect.x + dx;
    state.roi.y = state.startRect.y + dy;
  }

  if (state.resizing) {
    const rect = { ...state.startRect };

    if (state.handle.includes('left')) {
      rect.x = state.startRect.x + dx;
      rect.width = state.startRect.width - dx;
    }
    if (state.handle.includes('right')) {
      rect.width = state.startRect.width + dx;
    }
    if (state.handle.includes('top')) {
      rect.y = state.startRect.y + dy;
      rect.height = state.startRect.height - dy;
    }
    if (state.handle.includes('bottom')) {
      rect.height = state.startRect.height + dy;
    }

    if (rect.width < minSize) {
      rect.width = minSize;
      if (state.handle.includes('left')) rect.x = state.startRect.x + (state.startRect.width - minSize);
    }

    if (rect.height < minSize) {
      rect.height = minSize;
      if (state.handle.includes('top')) rect.y = state.startRect.y + (state.startRect.height - minSize);
    }

    state.roi = rect;
  }

  applyROI();
}

function onPointerUp() {
  state.dragging = false;
  state.resizing = false;
  state.handle = null;
  if (state.pointerId !== null) {
    try {
      roiBox.releasePointerCapture(state.pointerId);
    } catch {
      // ignore release errors
    }
  }
  state.pointerId = null;
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();
    centerROI();
  } catch (error) {
    alert(`Kaamera käivitamine ebaõnnestus: ${error.message}`);
  }
}

function applyFilters(imageData) {
  const data = imageData.data;
  const grayscale = grayscaleToggle.checked;
  const contrast = Number(contrastRange.value);
  const threshold = Number(thresholdRange.value);
  const useThreshold = threshold > 0;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (grayscale || useThreshold) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = gray;
    }

    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    if (useThreshold) {
      const binary = r >= threshold ? 255 : 0;
      r = g = b = binary;
    }

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  return imageData;
}

function runBlobInspection(imageData) {
  if (!blobToggle.checked) {
    blobResult.textContent = 'Blobid: välja lülitatud';
    return;
  }

  const minSize = Math.max(1, Number(blobMinSizeInput.value) || 1);
  const data = imageData.data;
  let brightPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 200) brightPixels += 1;
  }

  const estimatedBlobs = brightPixels > 0 ? Math.max(1, Math.round(brightPixels / minSize)) : 0;
  blobResult.textContent = `Blobid (hinnang): ${estimatedBlobs}, eredad px: ${brightPixels}`;
}

function processFrame() {
  if (!video.videoWidth || !video.videoHeight) {
    requestAnimationFrame(processFrame);
    return;
  }

  const viewRect = viewport.getBoundingClientRect();
  const scaleX = video.videoWidth / viewRect.width;
  const scaleY = video.videoHeight / viewRect.height;

  const sx = Math.max(0, Math.floor(state.roi.x * scaleX));
  const sy = Math.max(0, Math.floor(state.roi.y * scaleY));
  const sw = Math.max(1, Math.floor(state.roi.width * scaleX));
  const sh = Math.max(1, Math.floor(state.roi.height * scaleY));

  processedCanvas.width = sw;
  processedCanvas.height = sh;

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
  let imageData = ctx.getImageData(0, 0, sw, sh);
  imageData = applyFilters(imageData);
  ctx.putImageData(imageData, 0, 0);
  runBlobInspection(imageData);

  requestAnimationFrame(processFrame);
}

startCameraBtn.addEventListener('click', startCamera);
window.addEventListener('resize', centerROI);
roiBox.addEventListener('pointerdown', onPointerDown);
roiBox.addEventListener('pointermove', onPointerMove);
roiBox.addEventListener('pointerup', onPointerUp);
roiBox.addEventListener('pointercancel', onPointerUp);

centerROI();
requestAnimationFrame(processFrame);
