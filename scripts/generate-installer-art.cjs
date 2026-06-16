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

function monogramAt(x, y, offsetX, offsetY, scale = 1) {
  const px = (x - offsetX) / scale;
  const py = (y - offsetY) / scale;
  const left = roundedRect(px, py, 0, 0, 10, 42, 5);
  const right = roundedRect(px, py, 42, 0, 10, 42, 5);
  const diagonal = distanceToSegment(px, py, 8, 6, 44, 36) <= 5.5;
  return left || right || diagonal;
}

function sidebarSamplerFactory(accentColor) {
  return (x, y, width, height) => {
    const t = clamp((y * 0.86 + x * 0.18) / height, 0, 1);
    let color = mix(rgba(12, 17, 23), rgba(22, 30, 39), t);

    const glowA = Math.max(0, 1 - Math.hypot(x - 46, y - 44) / 126);
    const glowB = Math.max(0, 1 - Math.hypot(x - 138, y - 278) / 136);
    color = mix(color, rgba(accentColor.r, accentColor.g, accentColor.b), glowA * 0.12);
    color = mix(color, rgba(255, 255, 255), glowB * 0.03);

    if (roundedRect(x, y, 24, 28, 116, 116, 24)) {
      color = mix(color, rgba(255, 255, 255), 0.035);
    }

    if (roundedRect(x, y, 38, 42, 88, 88, 18)) {
      color = mix(color, rgba(255, 255, 255), 0.04);
    }

    if (monogramAt(x, y, 56, 62, 1)) {
      color = rgba(244, 247, 251);
    }

    if ((x - 108) ** 2 + (y - 62) ** 2 <= 9 ** 2) {
      color = rgba(accentColor.r, accentColor.g, accentColor.b);
    }

    if (distanceToSegment(x, y, 42, 188, 118, 188) <= 1.8) {
      color = rgba(163, 183, 212);
    }

    if (distanceToSegment(x, y, 42, 206, 102, 206) <= 1.2) {
      color = rgba(accentColor.r, accentColor.g, accentColor.b);
    }

    if (distanceToSegment(x, y, 42, 258, 132, 258) <= 1.8) {
      color = rgba(244, 247, 251, 224);
    }

    if (distanceToSegment(x, y, 56, 270, 112, 270) <= 1.1) {
      color = rgba(accentColor.r, accentColor.g, accentColor.b);
    }

    return color;
  };
}

function headerSampler(x, y, width, height) {
  let color = mix(rgba(15, 21, 28), rgba(24, 33, 44), clamp(x / width, 0, 1));
  const glow = Math.max(0, 1 - Math.hypot(x - 26, y - 6) / 92);
  color = mix(color, rgba(111, 143, 189), glow * 0.18);

  if (y >= height - 1.5) {
    return rgba(52, 66, 84);
  }

  if (roundedRect(x, y, 16, 9, 40, 40, 10)) {
    color = mix(rgba(18, 24, 31), rgba(31, 42, 55), clamp((x + y) / 72, 0, 1));
  }

  if (monogramAt(x, y, 28, 19, 0.72)) {
    color = rgba(244, 247, 251);
  }

  if ((x - 47) ** 2 + (y - 18) ** 2 <= 4.6 ** 2) {
    color = rgba(210, 178, 130);
  }

  if (distanceToSegment(x, y, 74, 18, 152, 18) <= 1.5) {
    color = rgba(163, 183, 212);
  }

  if (distanceToSegment(x, y, 74, 31, 226, 31) <= 1.2) {
    color = rgba(111, 143, 189);
  }

  return color;
}

fs.mkdirSync(installerDir, { recursive: true });
writeBmp(path.join(installerDir, "installerSidebar.bmp"), 164, 314, sidebarSamplerFactory(rgba(111, 143, 189)));
writeBmp(path.join(installerDir, "uninstallerSidebar.bmp"), 164, 314, sidebarSamplerFactory(rgba(171, 130, 82)));
writeBmp(path.join(installerDir, "installerHeader.bmp"), 150, 57, headerSampler);
console.log(`Generated NSIS installer artwork in ${installerDir}`);
