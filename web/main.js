let port;

async function connect() {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
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

function fixLimits(color){
	if(color.r == 0xFF) color.r = 0xFE;
	if(color.g == 0xFF) color.g = 0xFE;
	if(color.b == 0xFF) color.b = 0xFE;
	return color;
}

async function writePicker(){
	const colors = [
		hexToRgb(document.getElementById("color0").value),
		hexToRgb(document.getElementById("color1").value),
		hexToRgb(document.getElementById("color2").value),
		hexToRgb(document.getElementById("color3").value),
	];
	await write(colors);
}

async function write(colors) {
  const modColors = colors.map(color => fixLimits(color));

  var buffer = new ArrayBuffer(13);
  var view = new Uint8Array(buffer);

  view[0] = 0xFF;
  
  view[1] = modColors[0].b;
  view[2] = modColors[0].r;
  view[3] = modColors[0].g;

  view[4] = modColors[1].b;
  view[5] = modColors[1].r;
  view[6] = modColors[1].g;

  view[7] = modColors[2].b;
  view[8] = modColors[2].r;
  view[9] = modColors[2].g;

  view[10] = modColors[3].b;
  view[11] = modColors[3].r;
  view[12] = modColors[3].g;

  console.log(view);

  const writer = port.writable.getWriter();
  await writer.write(view);
  writer.releaseLock();
}

let timer;
let tick = 0;
let height = 0;

let canvas = document.getElementById('canvas');
canvas.height = 1024;
canvas.width = 32;
let context = canvas.getContext('2d');

function refreshImage(){
	let img = new Image();
	img.onload = function (){
		context.drawImage(img, 0, 0);
		height = img.height;
	}
	img.src = document.getElementById("effect").value;
}

document.getElementById("effect").addEventListener("change", refreshImage);
refreshImage();

function startEffect(){
	timer = setInterval(onTick, 16);
}

function stopEffect(){
	clearInterval(timer);
}

function toRGB(arr){
	return {
		r: arr[0],
		g: arr[1],
		b: arr[2],
	}
}

// EXTRACTED FROM https://stackoverflow.com/a/46249246
// Get pixel RGBA value using bilinear interpolation.
// imgDat is a imageData object, 
// x,y are floats in the original coordinates
// Returns the pixel colour at that point as an array of RGBA
// Will copy last pixel's colour
function getPixelValue(imgData, x,y, result = []){ 
    var i;
    // clamp and floor coordinate
    const ix1 = (x < 0 ? 0 : x >= imgData.width ? imgData.width - 1 : x) | 0;
    const iy1 = (y < 0 ? 0 : y >= imgData.height ? imgData.height - 1 : y) | 0;
    // get next pixel pos
    const ix2 = ix1 === imgData.width -1 ? ix1 : ix1 + 1;
    const iy2 = iy1 === imgData.height -1 ? iy1 : iy1 + 1;
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

    for(i = 0; i < 3; i ++){
        // interpolate x for top and bottom pixels
        const c1 = (d[i2] * d[i2++] - d[i1] * d[i1]) * xpos + d[i1] * d[i1 ++];
        const c2 = (d[i4] * d[i4++] - d[i3] * d[i3]) * xpos + d[i3] * d[i3 ++];

        // now interpolate y
        result[i] = Math.sqrt((c2 - c1) * ypos + c1);
    }

    // and alpha is not logarithmic
    const c1 = (d[i2] - d[i1]) * xpos + d[i1];
    const c2 = (d[i4] - d[i3]) * xpos + d[i3];
    result[3] = (c2 - c1) * ypos + c1;
    return result;
}

async function onTick(){
	const speedFactor = document.getElementById("speedFactor").value;
	tick++;
	if(tick>=height*speedFactor) tick = 0;
	const tickL = tick / speedFactor;

	document.getElementById("counter").innerHTML = tickL;

	const imgData = context.getImageData(0, 0, 4, height);

	const p0 = toRGB(getPixelValue(imgData, 0, tickL));
	const p1 = toRGB(getPixelValue(imgData, 1, tickL));
	const p2 = toRGB(getPixelValue(imgData, 2, tickL));
	const p3 = toRGB(getPixelValue(imgData, 3, tickL));
	await write([p0, p1, p2, p3]);
}

document.getElementById("connectButton").addEventListener("click", connect);
document.getElementById("writeButton").addEventListener("click", writePicker);
document.getElementById("startButton").addEventListener("click", startEffect);
document.getElementById("stopButton").addEventListener("click", stopEffect);
