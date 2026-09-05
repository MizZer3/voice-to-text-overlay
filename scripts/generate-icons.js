const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 64x64 SVG icon with modern gradient microphone & wave design
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF6B00"/>
      <stop offset="100%" stop-color="#9333EA"/>
    </linearGradient>
    <linearGradient id="micGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#CBD5E1"/>
    </linearGradient>
  </defs>
  <!-- Background rounded squircle -->
  <rect x="2" y="2" width="60" height="60" rx="16" fill="#0F172A" stroke="url(#grad)" stroke-width="3"/>
  
  <!-- Outer audio wave rings -->
  <circle cx="32" cy="30" r="23" fill="none" stroke="#FF6B00" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.4"/>

  <!-- Mic Body -->
  <rect x="26" y="16" width="12" height="20" rx="6" fill="url(#micGrad)"/>
  
  <!-- Mic Arc Support -->
  <path d="M20 28 C20 37, 44 37, 44 28" fill="none" stroke="#F8FAFC" stroke-width="3" stroke-linecap="round"/>
  
  <!-- Mic Stand -->
  <line x1="32" y1="37" x2="32" y2="45" stroke="#F8FAFC" stroke-width="3" stroke-linecap="round"/>
  <line x1="24" y1="45" x2="40" y2="45" stroke="#F8FAFC" stroke-width="3" stroke-linecap="round"/>

  <!-- Live glowing dot -->
  <circle cx="48" cy="14" r="4" fill="#10B981"/>
</svg>`;

fs.writeFileSync(path.join(assetsDir, 'icon.svg'), svgContent, 'utf-8');

// Also create a 16x16 / 32x32 transparent PNG icon for Electron Tray / Taskbar
// We can construct a clean valid uncompressed PNG using standard zlib and raw RGBA
const zlib = require('zlib');

function createPng(size, rgbaCallback) {
  const width = size;
  const height = size;

  // Raw image data with 1 byte filter per scanline
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = rgbaCallback(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  function createChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);

    const crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        if (c & 1) c = 0xedb88320 ^ (c >>> 1);
        else c = c >>> 1;
      }
      crcTable[n] = c;
    }

    let crc = 0xffffffff;
    for (let i = 0; i < typeBuf.length; i++) {
      crc = crcTable[(crc ^ typeBuf[i]) & 0xff] ^ (crc >>> 8);
    }
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    crcBuf.writeUInt32BE(crc, 0);

    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression method: 0
  ihdr[11] = 0; // Filter method: 0
  ihdr[12] = 0; // Interlace: 0
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT
  const idatChunk = createChunk('IDAT', deflated);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate icon.png (32x32)
const icon32 = createPng(32, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  if (dist > 14) return [0, 0, 0, 0]; // outside circle

  // Inside circle: dark background
  if (dist > 12) return [255, 107, 0, 255]; // orange border

  // Microphone shape in center
  if (x >= 13 && x <= 18 && y >= 8 && y <= 18) {
    return [255, 255, 255, 255]; // mic head
  }
  if ((x === 11 || x === 20) && y >= 14 && y <= 20) {
    return [255, 107, 0, 255]; // mic arc
  }
  if (x >= 12 && x <= 19 && y === 21) {
    return [255, 107, 0, 255]; // mic bottom arc
  }
  if (x >= 15 && x <= 16 && y >= 22 && y <= 25) {
    return [255, 107, 0, 255]; // mic stem
  }
  if (x >= 12 && x <= 19 && y === 26) {
    return [255, 107, 0, 255]; // mic base
  }

  return [15, 23, 42, 255]; // slate-900 background
});

fs.writeFileSync(path.join(assetsDir, 'icon.png'), icon32);
fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), icon32);

// Generate 16x16, 32x32, 48x48, 64x64 PNGs and pack into assets/icon.ico
function getPixel(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = w * 0.45;
  const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  if (dist > radius) return [0, 0, 0, 0];
  if (dist > radius - 1.5) return [255, 107, 0, 255]; // orange border

  // Scaled mic coordinates
  const scale = w / 32;
  const mx = x / scale;
  const my = y / scale;

  if (mx >= 13 && mx <= 18 && my >= 8 && my <= 18) return [255, 255, 255, 255];
  if ((mx >= 10.5 && mx <= 11.5 || mx >= 19.5 && mx <= 20.5) && my >= 14 && my <= 20) return [255, 107, 0, 255];
  if (mx >= 11 && mx <= 20 && my >= 20 && my <= 21.5) return [255, 107, 0, 255];
  if (mx >= 15 && mx <= 16 && my >= 22 && my <= 25) return [255, 107, 0, 255];
  if (mx >= 12 && mx <= 19 && my >= 25 && my <= 26.5) return [255, 107, 0, 255];

  return [15, 23, 42, 255];
}

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  const datas = [];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    datas.push(img.data);
    offset += img.data.length;
  }

  return Buffer.concat([header, ...entries, ...datas]);
}

const p16 = createPng(16, (x, y, w, h) => getPixel(x, y, w, h));
const p32 = icon32;
const p48 = createPng(48, (x, y, w, h) => getPixel(x, y, w, h));
const p64 = createPng(64, (x, y, w, h) => getPixel(x, y, w, h));

const icoBuffer = createIco([
  { width: 16, height: 16, data: p16 },
  { width: 32, height: 32, data: p32 },
  { width: 48, height: 48, data: p48 },
  { width: 64, height: 64, data: p64 }
]);

fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);

console.log('Icons generated successfully in assets/ (including icon.ico)');

