import fs from 'fs';
import zlib from 'zlib';

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCRC32Table();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4);
  data.copy(chunk, 8);
  const crcTarget = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = crc32(crcTarget);
  chunk.writeUInt32BE(c, 8 + len);
  return chunk;
}

function generatePng(width, height, isMaskable) {
  const rawRows = [];
  const cx = width / 2;
  const cy = height / 2;
  const cornerRadius = isMaskable ? 0 : width * 0.22;

  // Bell icon geometry scaled to width
  const scale = width / 512;
  const bellCenterY = isMaskable ? cy - 8 * scale : cy - 12 * scale;
  const bellScale = isMaskable ? 0.78 * scale : 0.95 * scale;

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const idx = 1 + x * 4;

      // Check rounded corner distance for non-maskable
      let inCard = true;
      if (!isMaskable) {
        let dx = 0;
        let dy = 0;
        if (x < cornerRadius) dx = cornerRadius - x;
        else if (x > width - cornerRadius) dx = x - (width - cornerRadius);
        if (y < cornerRadius) dy = cornerRadius - y;
        else if (y > height - cornerRadius) dy = y - (height - cornerRadius);
        if (dx > 0 && dy > 0) {
          if (dx * dx + dy * dy > cornerRadius * cornerRadius) {
            inCard = false;
          }
        }
      }

      if (!inCard) {
        // Transparent
        row[idx] = 0;
        row[idx + 1] = 0;
        row[idx + 2] = 0;
        row[idx + 3] = 0;
        continue;
      }

      // Background gradient: #E86732 to #D4541F
      const gradT = (x + y) / (width + height);
      const bgR = Math.round(232 - gradT * 20); // 232 -> 212
      const bgG = Math.round(103 - gradT * 19); // 103 -> 84
      const bgB = Math.round(50 - gradT * 19);  // 50 -> 31

      // Render Bell shape in center
      // Coordinates relative to bell center
      const bx = (x - cx) / bellScale;
      const by = (y - bellCenterY) / bellScale;

      let inBell = false;

      // Bell body: flared dome
      if (by >= -75 && by <= 65) {
        // Dome width expands downwards
        const progress = (by + 75) / 140; // 0 at top, 1 at bottom
        let maxW;
        if (progress < 0.6) {
          maxW = 32 + progress * 24; // 32 to 46
        } else {
          // flare out
          const flare = (progress - 0.6) / 0.4;
          maxW = 46 + flare * flare * 52; // flaring to 98
        }
        if (Math.abs(bx) <= maxW) {
          inBell = true;
        }
      }

      // Bell crown loop (top)
      if (by >= -94 && by < -75) {
        if (Math.abs(bx) <= 20) {
          inBell = true;
        }
      }

      // Clapper (circle below rim)
      const clapperDist = Math.sqrt(bx * bx + (by - 90) * (by - 90));
      if (clapperDist <= 22) {
        inBell = true;
      }

      // Sound arcs
      const leftArcDist = Math.sqrt((bx + 85) * (bx + 85) + by * by);
      if (leftArcDist >= 34 && leftArcDist <= 44 && Math.abs(by) <= 36) {
        inBell = true;
      }
      const rightArcDist = Math.sqrt((bx - 85) * (bx - 85) + by * by);
      if (rightArcDist >= 34 && rightArcDist <= 44 && Math.abs(by) <= 36) {
        inBell = true;
      }

      if (inBell) {
        row[idx] = 255;
        row[idx + 1] = 255;
        row[idx + 2] = 255;
        row[idx + 3] = 255;
      } else {
        row[idx] = bgR;
        row[idx + 1] = bgG;
        row[idx + 2] = bgB;
        row[idx + 3] = 255;
      }
    }
    rawRows.push(row);
  }

  const rawData = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const icons = [
  { file: 'public/pwa-192x192.png', size: 192, maskable: false },
  { file: 'public/pwa-512x512.png', size: 512, maskable: false },
  { file: 'public/pwa-maskable-512x512.png', size: 512, maskable: true },
  { file: 'public/apple-touch-icon.png', size: 180, maskable: false },
  { file: 'public/favicon.png', size: 64, maskable: false },
];

for (const icon of icons) {
  const buf = generatePng(icon.size, icon.size, icon.maskable);
  fs.writeFileSync(icon.file, buf);
  console.log(`Generated ${icon.file} (${icon.size}x${icon.size})`);
}
