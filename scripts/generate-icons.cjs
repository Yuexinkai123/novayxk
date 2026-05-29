const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const iconDir = path.join(root, "assets", "icons");
const sizes = [16, 32, 64, 128, 256];

function crc32(buffer) {
  const table = crc32.table ?? (crc32.table = makeCrcTable());
  let crc = -1;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makeCrcTable() {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPng(size) {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = 1 + x * 4;
      const pixel = sampleIcon(size, x + 0.5, y + 0.5);
      row[i] = pixel.r;
      row[i + 1] = pixel.g;
      row[i + 2] = pixel.b;
      row[i + 3] = pixel.a;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function sampleIcon(size, x, y) {
  const scale = size / 256;
  const px = x / scale;
  const py = y / scale;

  if (!roundedRect(px, py, 0, 0, 256, 256, 54)) return rgba(0, 0, 0, 0);

  let color = rgba(244, 240, 232, 255);
  if (roundedRect(px, py, 24, 24, 208, 208, 46)) {
    color = gradient(px, py);
  }

  if (inNShape(px, py)) {
    color = mix(rgba(255, 253, 248, 255), rgba(246, 195, 155, 255), clamp((py - 58) / 132, 0, 1));
  }

  if (inSpark(px, py)) {
    color = rgba(255, 247, 214, 255);
  }

  const underlineOuter = distanceToSegment(px, py, 70, 196, 186, 196) <= 5;
  if (underlineOuter) color = rgba(255, 253, 248, 230);

  const underlineInner = distanceToSegment(px, py, 84, 198, 162, 198) <= 2;
  if (underlineInner) color = rgba(110, 212, 199, 245);

  return color;
}

function roundedRect(x, y, rx, ry, width, height, radius) {
  const cx = clamp(x, rx + radius, rx + width - radius);
  const cy = clamp(y, ry + radius, ry + height - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function inNShape(x, y) {
  const left = x >= 68 && x <= 92 && y >= 80 && y <= 176;
  const right = x >= 164 && x <= 188 && y >= 80 && y <= 176;
  const diagonal = distanceToSegment(x, y, 88, 91, 171, 164) <= 15;
  return left || right || diagonal;
}

function inSpark(x, y) {
  return Math.abs(x - 178) / 28 + Math.abs(y - 83) / 28 <= 1;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return Math.hypot(px - x, py - y);
}

function gradient(x, y) {
  const t = clamp((x * 0.45 + y * 0.75) / 256, 0, 1);
  if (t < 0.56) {
    return mix(rgba(18, 63, 60, 255), rgba(36, 95, 155, 255), t / 0.56);
  }
  return mix(rgba(36, 95, 155, 255), rgba(201, 93, 48, 255), (t - 0.56) / 0.44);
}

function mix(a, b, t) {
  return rgba(
    Math.round(a.r + (b.r - a.r) * t),
    Math.round(a.g + (b.g - a.g) * t),
    Math.round(a.b + (b.b - a.b) * t),
    Math.round(a.a + (b.a - a.a) * t),
  );
}

function rgba(r, g, b, a) {
  return { r, g, b, a };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const directory = [];
  for (const entry of entries) {
    const png = entry.png;
    const dir = Buffer.alloc(16);
    dir[0] = entry.size === 256 ? 0 : entry.size;
    dir[1] = entry.size === 256 ? 0 : entry.size;
    dir[2] = 0;
    dir[3] = 0;
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    directory.push(dir);
    offset += png.length;
  }

  return Buffer.concat([header, ...directory, ...entries.map((entry) => entry.png)]);
}

fs.mkdirSync(iconDir, { recursive: true });
const pngEntries = sizes.map((size) => {
  const png = createPng(size);
  fs.writeFileSync(path.join(iconDir, `novayxk-${size}.png`), png);
  return { size, png };
});

fs.writeFileSync(path.join(iconDir, "novayxk.ico"), createIco(pngEntries));
console.log(`Generated ${pngEntries.length} PNG files and novayxk.ico in ${iconDir}`);
