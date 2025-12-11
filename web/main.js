let port = null;
let characteristic = null;

const MAX_FRAMES = 60; // Must match firmware MAX_FRAMES

async function connectSerial() {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
}

const serviceUUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const characteristicUUID = "0000ffe1-0000-1000-8000-00805f9b34fb";

async function connectBluetooth() {
  try {
    const options = {
      filters: [{ services: [serviceUUID] }],
    };
    const device = await navigator.bluetooth.requestDevice(options);

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(serviceUUID);

    characteristic = await service.getCharacteristic(characteristicUUID);
    document.getElementById("status").innerHTML = "Bluetooth connected";
    //const encoder = new TextEncoder("utf-8");
    //await characteristic.writeValue(encoder.encode("hello"));
  } catch (e) {
    document.write(e);
  }
}

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

function fixLimits(color) {
  // Avoid 0xFF, 0xFE, 0xFD, 0xFC, 0xFB as they are command bytes
  if (color.r >= 0xFB) color.r = 0xFA;
  if (color.g >= 0xFB) color.g = 0xFA;
  if (color.b >= 0xFB) color.b = 0xFA;
  return color;
}

async function writePicker() {
  const colors = [
    hexToRgb(document.getElementById("color0").value),
    hexToRgb(document.getElementById("color1").value),
    hexToRgb(document.getElementById("color2").value),
    hexToRgb(document.getElementById("color3").value),
  ];
  await writeStaticColor(colors);
}

// Send static color command (0xFF + 12 bytes)
async function writeStaticColor(colors) {
  const modColors = colors.map((color) => fixLimits(color));

  var buffer = new ArrayBuffer(13);
  var view = new Uint8Array(buffer);

  view[0] = 0xff;

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

// Send speed command (0xFD + 1 byte)
async function sendSpeed() {
  const speed = parseInt(document.getElementById("speedFactor").value);
  var buffer = new ArrayBuffer(2);
  var view = new Uint8Array(buffer);
  view[0] = 0xFD;
  view[1] = speed;
  await sendData(view);
}

// Generic send function
async function sendData(view) {
  if(port){
    const writer = port.writable.getWriter();
    await writer.write(view);
    writer.releaseLock();
  }
  if(characteristic){
    await characteristic.writeValue(view);
  }
}

let canvas = document.getElementById("canvas");
canvas.height = 1024;
canvas.width = 32;
let context = canvas.getContext("2d");
let height = 0;

function refreshImage() {
  let img = new Image();
  img.onload = function () {
    context.drawImage(img, 0, 0);
    height = img.height;
  };
  img.src = document.getElementById("effect").value;
}

document.getElementById("effect").addEventListener("change", refreshImage);
refreshImage();

function toRGB(arr, factor) {
  return {
    r: arr[0] * factor[0],
    g: arr[1] * factor[1],
    b: arr[2] * factor[2],
  };
}

// EXTRACTED FROM https://stackoverflow.com/a/46249246
// Get pixel RGBA value using bilinear interpolation.
// imgDat is a imageData object,
// x,y are floats in the original coordinates
// Returns the pixel colour at that point as an array of RGBA
// Will copy last pixel's colour
function getPixelValue(imgData, x, y, result = []) {
  var i;
  // clamp and floor coordinate
  const ix1 = (x < 0 ? 0 : x >= imgData.width ? imgData.width - 1 : x) | 0;
  const iy1 = (y < 0 ? 0 : y >= imgData.height ? imgData.height - 1 : y) | 0;
  // get next pixel pos
  const ix2 = ix1 === imgData.width - 1 ? ix1 : ix1 + 1;
  const iy2 = iy1 === imgData.height - 1 ? iy1 : iy1 + 1;
  // get interpolation position
  const xpos = x % 1;
  const ypos = y % 1;
  // get pixel index
  var i1 = (ix1 + iy1 * imgData.width) * 4;
  var i2 = (ix2 + iy1 * imgData.width) * 4;
  var i3 = (ix1 + iy2 * imgData.width) * 4;
  var i4 = (ix2 + iy2 * imgData.width) * 4;

  // to keep code short and readable get data alias
  const d = imgData.data;

  for (i = 0; i < 3; i++) {
    // interpolate x for top and bottom pixels
    const c1 = (d[i2] * d[i2++] - d[i1] * d[i1]) * xpos + d[i1] * d[i1++];
    const c2 = (d[i4] * d[i4++] - d[i3] * d[i3]) * xpos + d[i3] * d[i3++];

    // now interpolate y
    result[i] = Math.sqrt((c2 - c1) * ypos + c1);
  }

  // and alpha is not logarithmic
  const c1 = (d[i2] - d[i1]) * xpos + d[i1];
  const c2 = (d[i4] - d[i3]) * xpos + d[i3];
  result[3] = (c2 - c1) * ypos + c1;
  return result;
}

// Convert colors array to 12-byte frame
function colorsToFrame(colors) {
  const modColors = colors.map((color) => fixLimits(color));
  return [
    modColors[0].g, modColors[0].r, modColors[0].b,
    modColors[1].g, modColors[1].r, modColors[1].b,
    modColors[2].r, modColors[2].b, modColors[2].g,
    modColors[3].b, modColors[3].r, modColors[3].g
  ];
}

// Upload pattern to microcontroller (0xFE + count + frames)
async function uploadPattern() {
  const imgData = context.getImageData(0, 0, 4, height);
  
  const rFactor = document.getElementById("rFactor").value;
  const gFactor = document.getElementById("gFactor").value;
  const bFactor = document.getElementById("bFactor").value;
  const factors = [rFactor, gFactor, bFactor];

  // Sample frames from the pattern image
  // Limit to MAX_FRAMES
  const frameCount = Math.min(height, MAX_FRAMES);
  const step = height / frameCount;
  
  // Build the upload buffer: 0xFE + frameCount + (frameCount * 12) bytes
  const bufferSize = 2 + (frameCount * 12);
  var buffer = new ArrayBuffer(bufferSize);
  var view = new Uint8Array(buffer);
  
  view[0] = 0xFE;
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
  
  await sendData(view);
  document.getElementById("status").innerHTML = `Uploaded ${frameCount} frames`;
}

// Send speed when slider changes
document.getElementById("speedFactor").addEventListener("input", sendSpeed);

document
  .getElementById("connectSerialButton")
  .addEventListener("click", connectSerial);
document
  .getElementById("connectBluetoothButton")
  .addEventListener("click", connectBluetooth);
document.getElementById("writeButton").addEventListener("click", writePicker);
document.getElementById("uploadButton").addEventListener("click", uploadPattern);
