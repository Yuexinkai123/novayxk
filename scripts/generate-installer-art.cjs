const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const installerDir = path.join(root, "assets", "installer");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rgba(r, g, b, a = 255) {
  return { r, g, b, a };
}

function mix(a, b, t) {
  return rgba(
    Math.round(a.r + (b.r - a.r) * t),
    Math.round(a.g + (b.g - a.g) * t),
    Math.round(a.b + (b.b - a.b) * t),
    Math.round(a.a + (b.a - a.a) * t),
  );
}

function roundedRect(x, y, rx, ry, width, height, radius) {
  const cx = clamp(x, rx + radius, rx + width - radius);
  const cy = clamp(y, ry + radius, ry + height - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
  const x = x1 + dx * t;
  const y = y1 + dy * t;
  return Math.hypot(px - x, py - y);
}

function inNShape(x, y, offsetX, offsetY, scale = 1) {
  const px = (x - offsetX) / scale;
  const py = (y - offsetY) / scale;
  const left = px >= 0 && px <= 10 && py >= 0 && py <= 42;
  const right = px >= 42 && px <= 52 && py >= 0 && py <= 42;
  const diagonal = distanceToSegment(px, py, 8, 3, 44, 39) <= 6;
  return left || right || diagonal;
}

function fillPixel(buffer, width, height, x, y, color) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const offset = 54 + (height - 1 - y) * rowSize + x * 3;
  buffer[offset] = color.b;
  buffer[offset + 1] = color.g;
  buffer[offset + 2] = color.r;
}

function writeBmp(filePath, width, height, sampler) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = rowSize * height;
  const buffer = Buffer.alloc(54 + pixelSize);
  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelSize, 34);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      fillPixel(buffer, width, height, x, y, sampler(x + 0.5, y + 0.5, width, height));
    }
  }

  fs.writeFileSync(filePath, buffer);
}

function sidebarSampler(x, y, width, height) {
  const base = mix(rgba(7, 14, 32), rgba(16, 33, 53), clamp((x * 0.28 + y) / height, 0, 1));
  let color = mix(base, rgba(18, 63, 60), Math.max(0, (height * 0.42 - y) / height) * 0.28);

  const glowA = Math.max(0, 1 - Math.hypot(x - 36, y - 52) / 108);
  const glowB = Math.max(0, 1 - Math.hypot(x - 142, y - 268) / 134);
  color = mix(color, rgba(77, 142, 255), glowA * 0.2);
  color = mix(color, rgba(78, 222, 163), glowB * 0.14);

  if (x >= 0 && x < width && y >= 0 && y < height) {
    const grain = ((x * 17 + y * 31) % 19) / 19;
    color = mix(color, rgba(255, 255, 255), grain * 0.025);
  }

  if (roundedRect(x, y, 28, 30, 108, 108, 24)) {
    color = mix(color, rgba(218, 226, 253), 0.08);
  }

  if (roundedRect(x, y, 36, 38, 92, 92, 20)) {
    color = mix(rgba(16, 33, 53), rgba(35, 95, 145), clamp((x + y) / 190, 0, 1));
  }

  if (inNShape(x, y, 56, 63, 1)) color = rgba(255, 253, 248);
  const spark = Math.abs(x - 107) / 10 + Math.abs(y - 61) / 10 <= 1;
  if (spark) color = rgba(78, 222, 163);

  if (roundedRect(x, y, 26, 172, 112, 52, 8)) color = mix(color, rgba(218, 226, 253), 0.08);
  if (x > 40 && x < 116 && y > 188 && y < 191) color = rgba(173, 198, 255);
  if (x > 40 && x < 130 && y > 202 && y < 204) color = rgba(140, 144, 159);
  if (x > 40 && x < 94 && y > 212 && y < 214) color = rgba(78, 222, 163);

  if (x > 30 && x < 134 && y > 254 && y < 257) color = rgba(173, 198, 255);
  if (x > 50 && x < 114 && y > 264 && y < 266) color = rgba(78, 222, 163);

  return color;
}

function headerSampler(x, y, width, height) {
  let color = mix(rgba(11, 19, 38), rgba(19, 27, 46), clamp(x / width, 0, 1));
  const glow = Math.max(0, 1 - Math.hypot(x - 142, y - 4) / 116);
  color = mix(color, rgba(77, 142, 255), glow * 0.16);
  if (y > height - 2) color = rgba(66, 71, 84);

  const markX = x - 18;
  const markY = y - 10;
  if (roundedRect(markX, markY, 0, 0, 40, 40, 9)) {
    color = mix(rgba(18, 63, 60), rgba(35, 95, 145), clamp((markX + markY) / 76, 0, 1));
  }
  const left = markX >= 12 && markX <= 16 && markY >= 13 && markY <= 29;
  const right = markX >= 25 && markX <= 29 && markY >= 13 && markY <= 29;
  const diagonal = distanceToSegment(markX, markY, 15, 14, 26, 28) <= 3;
  if (left || right || diagonal) color = rgba(255, 253, 248);

  const lineA = x > 74 && x < 156 && y > 17 && y < 20;
  const lineB = x > 74 && x < 236 && y > 32 && y < 34;
  if (lineA) color = rgba(173, 198, 255);
  if (lineB) color = rgba(78, 222, 163);

  return color;
}

fs.mkdirSync(installerDir, { recursive: true });
writeBmp(path.join(installerDir, "installerSidebar.bmp"), 164, 314, sidebarSampler);
writeBmp(path.join(installerDir, "uninstallerSidebar.bmp"), 164, 314, sidebarSampler);
writeBmp(path.join(installerDir, "installerHeader.bmp"), 150, 57, headerSampler);
console.log(`Generated NSIS installer artwork in ${installerDir}`);
