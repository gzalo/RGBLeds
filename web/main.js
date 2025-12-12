let port = null;
let characteristic = null;
let isConnected = false;

const MAX_FRAMES = 60; // Must match firmware MAX_FRAMES

// ============ Logging System ============
function log(message, type = 'info') {
  const logArea = document.getElementById('logArea');
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `[${timestamp}] ${message}`;
  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight;
}

function logData(label, data) {
  const hexStr = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
  log(`${label}: [${data.length} bytes] ${hexStr}`, 'data');
}

function clearLog() {
  document.getElementById('logArea').innerHTML = '';
  log('Log cleared', 'info');
}

// ============ Connection Status Management ============
function updateConnectionStatus() {
  const statusEl = document.getElementById('status');
  const buttons = ['writeButton', 'uploadButton', 'stopButton', 'startButton'];
  
  if (port || characteristic) {
    isConnected = true;
    let connectionType = [];
    if (port) connectionType.push('Serial');
    if (characteristic) connectionType.push('Bluetooth');
    statusEl.innerHTML = `Connected (${connectionType.join(' + ')})`;
    statusEl.className = 'ml-3 status-connected';
    buttons.forEach(id => document.getElementById(id).disabled = false);
  } else {
    isConnected = false;
    statusEl.innerHTML = 'Not connected';
    statusEl.className = 'ml-3 status-disconnected';
    buttons.forEach(id => document.getElementById(id).disabled = true);
  }
}

// ============ Serial Connection ============
async function connectSerial() {
  try {
    log('Requesting serial port...', 'info');
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    log('Serial port connected successfully', 'success');
    updateConnectionStatus();
  } catch (e) {
    log(`Serial connection failed: ${e.message}`, 'error');
    port = null;
    updateConnectionStatus();
  }
}

// ============ Bluetooth Connection ============
const serviceUUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const characteristicUUID = "0000ffe1-0000-1000-8000-00805f9b34fb";

async function connectBluetooth() {
  try {
    log('Requesting Bluetooth device...', 'info');
    const options = {
      filters: [{ services: [serviceUUID] }],
    };
    const device = await navigator.bluetooth.requestDevice(options);
    log(`Found device: ${device.name || 'Unknown'}`, 'info');

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(serviceUUID);
    characteristic = await service.getCharacteristic(characteristicUUID);
    
    // Handle disconnection
    device.addEventListener('gattserverdisconnected', () => {
      log('Bluetooth device disconnected', 'error');
      characteristic = null;
      updateConnectionStatus();
    });
    
    log('Bluetooth connected successfully', 'success');
    updateConnectionStatus();
  } catch (e) {
    log(`Bluetooth connection failed: ${e.message}`, 'error');
    characteristic = null;
    updateConnectionStatus();
  }
}

// ============ Color Utilities ============
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}

function fixLimits(color) {
  // Avoid 0xFF, 0xFE, 0xFD, 0xFC, 0xFB as they are command bytes
  const result = { ...color };
  if (result.r >= 0xFB) result.r = 0xFA;
  if (result.g >= 0xFB) result.g = 0xFA;
  if (result.b >= 0xFB) result.b = 0xFA;
  return result;
}

// ============ Color Picker Preview ============
function updateColorPreview(id) {
  const colorInput = document.getElementById(`color${id}`);
  const preview = document.getElementById(`preview${id}`);
  if (preview) {
    preview.style.backgroundColor = colorInput.value;
  }
}

function initColorPreviews() {
  for (let i = 0; i < 4; i++) {
    updateColorPreview(i);
    document.getElementById(`color${i}`).addEventListener('input', () => {
      updateColorPreview(i);
      const color = hexToRgb(document.getElementById(`color${i}`).value);
      log(`Color ${i + 1} changed to RGB(${color.r}, ${color.g}, ${color.b})`, 'info');
    });
  }
}

// ============ Slider Value Displays ============
function updateSliderDisplays() {
  document.getElementById('speedValue').textContent = document.getElementById('speedFactor').value;
  document.getElementById('rValue').textContent = parseFloat(document.getElementById('rFactor').value).toFixed(2);
  document.getElementById('gValue').textContent = parseFloat(document.getElementById('gFactor').value).toFixed(2);
  document.getElementById('bValue').textContent = parseFloat(document.getElementById('bFactor').value).toFixed(2);
}

// ============ Data Transmission ============
// BLE chunk size (default MTU is ~20 bytes, use conservative value)
const BLE_CHUNK_SIZE = 20;

async function sendData(view) {
  if (!isConnected) {
    log('Cannot send data: not connected', 'error');
    return false;
  }
  
  try {
    if (port) {
      const writer = port.writable.getWriter();
      await writer.write(view);
      writer.releaseLock();
      log(`Sent ${view.length} bytes via Serial`, 'success');
    }
    if (characteristic) {
      // BLE has limited MTU, send in chunks
      for (let offset = 0; offset < view.length; offset += BLE_CHUNK_SIZE) {
        const chunk = view.slice(offset, Math.min(offset + BLE_CHUNK_SIZE, view.length));
        await characteristic.writeValue(chunk);
        // Small delay between chunks to avoid overwhelming the device
        if (offset + BLE_CHUNK_SIZE < view.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      log(`Sent ${view.length} bytes via Bluetooth (${Math.ceil(view.length / BLE_CHUNK_SIZE)} chunks)`, 'success');
    }
    logData('Data sent', view);
    return true;
  } catch (e) {
    log(`Send failed: ${e.message}`, 'error');
    return false;
  }
}

// ============ Static Color Command (0xFF) ============
async function writePicker() {
  const colors = [
    hexToRgb(document.getElementById("color0").value),
    hexToRgb(document.getElementById("color1").value),
    hexToRgb(document.getElementById("color2").value),
    hexToRgb(document.getElementById("color3").value),
  ];
  
  log('Sending static color command (animation will stop)...', 'info');
  colors.forEach((c, i) => log(`  Strip ${i + 1}: RGB(${c.r}, ${c.g}, ${c.b})`, 'data'));
  
  await writeStaticColor(colors);
}

async function writeStaticColor(colors) {
  const modColors = colors.map((color) => fixLimits(color));

  var buffer = new ArrayBuffer(13);
  var view = new Uint8Array(buffer);

  view[0] = 0xff; // Static color command

  view[1] = modColors[0].g;
  view[2] = modColors[0].r;
  view[3] = modColors[0].b;

  view[4] = modColors[1].g;
  view[5] = modColors[1].r;
  view[6] = modColors[1].b;

  view[7] = modColors[2].r;
  view[8] = modColors[2].b;
  view[9] = modColors[2].g;

  view[10] = modColors[3].b;
  view[11] = modColors[3].r;
  view[12] = modColors[3].g;

  await sendData(view);
}

// ============ Speed Command (0xFD) ============
async function sendSpeed() {
  const speed = parseInt(document.getElementById("speedFactor").value);
  updateSliderDisplays();
  
  if (!isConnected) {
    log(`Speed changed to ${speed} (will be applied on next send)`, 'info');
    return;
  }
  
  log(`Sending speed command: ${speed}`, 'info');
  
  var buffer = new ArrayBuffer(2);
  var view = new Uint8Array(buffer);
  view[0] = 0xFD;
  view[1] = speed;
  await sendData(view);
}

// ============ Start Playback Command (0xFC) ============
async function startPlayback() {
  log('Sending start playback command...', 'info');
  var buffer = new ArrayBuffer(1);
  var view = new Uint8Array(buffer);
  view[0] = 0xFC;
  await sendData(view);
}

// ============ Stop Playback Command (0xFB) ============
async function stopPlayback() {
  log('Sending stop playback command...', 'info');
  var buffer = new ArrayBuffer(1);
  var view = new Uint8Array(buffer);
  view[0] = 0xFB;
  await sendData(view);
}

// ============ Pattern Canvas ============
let canvas = document.getElementById("canvas");
canvas.height = 256;
canvas.width = 64;
let context = canvas.getContext("2d");
let height = 0;

function refreshImage() {
  let img = new Image();
  const patternPath = document.getElementById("effect").value;
  img.onload = function () {
    // Scale image to fit canvas while preserving aspect ratio
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const x = (canvas.width - img.width * scale) / 2;
    const y = 0;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, x, y, img.width * scale, img.height * scale);
    height = img.height;
    document.getElementById("counter").textContent = `Pattern size: ${img.width}x${img.height} pixels, ${Math.min(height, MAX_FRAMES)} frames will be used`;
    log(`Pattern loaded: ${patternPath} (${img.width}x${img.height})`, 'info');
  };
  img.onerror = function() {
    log(`Failed to load pattern: ${patternPath}`, 'error');
  };
  img.src = patternPath;
}

document.getElementById("effect").addEventListener("change", refreshImage);
refreshImage();

// ============ Pattern Upload (0xFE) ============
function toRGB(arr, factor) {
  return {
    r: arr[0] * factor[0],
    g: arr[1] * factor[1],
    b: arr[2] * factor[2],
  };
}

// Get pixel RGBA value using bilinear interpolation.
function getPixelValue(imgData, x, y, result = []) {
  var i;
  const ix1 = (x < 0 ? 0 : x >= imgData.width ? imgData.width - 1 : x) | 0;
  const iy1 = (y < 0 ? 0 : y >= imgData.height ? imgData.height - 1 : y) | 0;
  const ix2 = ix1 === imgData.width - 1 ? ix1 : ix1 + 1;
  const iy2 = iy1 === imgData.height - 1 ? iy1 : iy1 + 1;
  const xpos = x % 1;
  const ypos = y % 1;
  var i1 = (ix1 + iy1 * imgData.width) * 4;
  var i2 = (ix2 + iy1 * imgData.width) * 4;
  var i3 = (ix1 + iy2 * imgData.width) * 4;
  var i4 = (ix2 + iy2 * imgData.width) * 4;
  const d = imgData.data;

  for (i = 0; i < 3; i++) {
    const d_i1 = d[i1];
    const d_i2 = d[i2];
    const d_i3 = d[i3];
    const d_i4 = d[i4];
    const c1 = (d_i2 * d_i2 - d_i1 * d_i1) * xpos + d_i1 * d_i1;
    const c2 = (d_i4 * d_i4 - d_i3 * d_i3) * xpos + d_i3 * d_i3;
    i1++; i2++; i3++; i4++;
    result[i] = Math.sqrt((c2 - c1) * ypos + c1);
  }

  const c1_a = (d[i2] - d[i1]) * xpos + d[i1];
  const c2_a = (d[i4] - d[i3]) * xpos + d[i3];
  result[3] = (c2_a - c1_a) * ypos + c1_a;
  return result;
}

function colorsToFrame(colors) {
  const modColors = colors.map((color) => fixLimits(color));
  return [
    modColors[0].g, modColors[0].r, modColors[0].b,
    modColors[1].g, modColors[1].r, modColors[1].b,
    modColors[2].r, modColors[2].b, modColors[2].g,
    modColors[3].b, modColors[3].r, modColors[3].g
  ];
}

async function uploadPattern() {
  // Need to reload the image at original size for sampling
  const patternPath = document.getElementById("effect").value;
  
  log(`Loading pattern for upload: ${patternPath}`, 'info');
  
  const img = new Image();
  img.src = patternPath;
  
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to load pattern image'));
  });
  
  // Create a temporary canvas at original image size
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = img.width;
  tempCanvas.height = img.height;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(img, 0, 0);
  
  const imgData = tempCtx.getImageData(0, 0, img.width, img.height);
  
  const rFactor = parseFloat(document.getElementById("rFactor").value);
  const gFactor = parseFloat(document.getElementById("gFactor").value);
  const bFactor = parseFloat(document.getElementById("bFactor").value);
  const factors = [rFactor, gFactor, bFactor];

  log(`Color correction factors: R=${rFactor.toFixed(2)}, G=${gFactor.toFixed(2)}, B=${bFactor.toFixed(2)}`, 'data');

  const frameCount = Math.min(img.height, MAX_FRAMES);
  const step = img.height / frameCount;
  
  log(`Preparing ${frameCount} frames from ${img.height} pixel rows (step=${step.toFixed(2)})`, 'info');
  
  const bufferSize = 2 + (frameCount * 12);
  var buffer = new ArrayBuffer(bufferSize);
  var view = new Uint8Array(buffer);
  
  view[0] = 0xFE; // Upload pattern command
  view[1] = frameCount;
  
  let offset = 2;
  for (let i = 0; i < frameCount; i++) {
    const y = i * step;
    const p0 = toRGB(getPixelValue(imgData, 0, y), factors);
    const p1 = toRGB(getPixelValue(imgData, 1, y), factors);
    const p2 = toRGB(getPixelValue(imgData, 2, y), factors);
    const p3 = toRGB(getPixelValue(imgData, 3, y), factors);
    
    const frameData = colorsToFrame([p0, p1, p2, p3]);
    for (let j = 0; j < 12; j++) {
      view[offset++] = frameData[j];
    }
  }
  
  log(`Uploading pattern: ${bufferSize} bytes total`, 'info');
  const success = await sendData(view);
  
  if (success) {
    const speed = parseInt(document.getElementById("speedFactor").value);
    log(`Pattern uploaded! ${frameCount} frames, speed: ${speed}`, 'success');
    log('Animation playback started automatically', 'success');
  }
}

// ============ Event Listeners ============
// Color correction sliders
document.getElementById("rFactor").addEventListener("input", () => {
  updateSliderDisplays();
  log(`Red correction: ${document.getElementById("rFactor").value}`, 'info');
});
document.getElementById("gFactor").addEventListener("input", () => {
  updateSliderDisplays();
  log(`Green correction: ${document.getElementById("gFactor").value}`, 'info');
});
document.getElementById("bFactor").addEventListener("input", () => {
  updateSliderDisplays();
  log(`Blue correction: ${document.getElementById("bFactor").value}`, 'info');
});

// Speed slider - sends immediately if connected
document.getElementById("speedFactor").addEventListener("input", sendSpeed);

// Connection buttons
document.getElementById("connectSerialButton").addEventListener("click", connectSerial);
document.getElementById("connectBluetoothButton").addEventListener("click", connectBluetooth);

// Control buttons
document.getElementById("writeButton").addEventListener("click", writePicker);
document.getElementById("uploadButton").addEventListener("click", uploadPattern);
document.getElementById("stopButton").addEventListener("click", stopPlayback);
document.getElementById("startButton").addEventListener("click", startPlayback);

// Clear log button
document.getElementById("clearLogButton").addEventListener("click", clearLog);

// ============ Initialization ============
function init() {
  updateConnectionStatus();
  updateSliderDisplays();
  initColorPreviews();
  log('RGB LED Controller initialized', 'info');
  log('Connect via Serial or Bluetooth to begin', 'info');
}

init();
