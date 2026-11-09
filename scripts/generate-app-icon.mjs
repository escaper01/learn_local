import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const SIZE = 512;
const SAMPLES = 4;

function insideRoundedRect(x, y, left, top, width, height, radius) {
  if (x < left || y < top || x >= left + width || y >= top + height) return false;
  const nearestX = Math.max(left + radius, Math.min(x, left + width - radius));
  const nearestY = Math.max(top + radius, Math.min(y, top + height - radius));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function mix(start, end, amount) {
  return start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount));
}

function sample(x, y) {
  if (!insideRoundedRect(x, y, 0, 0, SIZE, SIZE, 112)) return [0, 0, 0, 0];

  if (insideRoundedRect(x, y, 344, 308, 64, 74, 16)) return [255, 244, 227, 255];

  const inVertical = insideRoundedRect(x, y, 104, 130, 76, 252, 22);
  const inHorizontal = insideRoundedRect(x, y, 104, 308, 212, 74, 22);
  if (inVertical || inHorizontal) {
    const color = mix([255, 194, 103], [255, 157, 15], Math.max(0, Math.min(1, (y - 130) / 252)));
    return [...color, 255];
  }

  const color = mix([27, 32, 41], [12, 16, 21], y / SIZE);
  return [...color, 255];
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const totals = [0, 0, 0, 0];
    for (let sampleY = 0; sampleY < SAMPLES; sampleY += 1) {
      for (let sampleX = 0; sampleX < SAMPLES; sampleX += 1) {
        const color = sample(x + (sampleX + 0.5) / SAMPLES, y + (sampleY + 0.5) / SAMPLES);
        for (let channel = 0; channel < 4; channel += 1) totals[channel] += color[channel];
      }
    }
    const offset = (y * SIZE + x) * 4;
    const count = SAMPLES * SAMPLES;
    for (let channel = 0; channel < 4; channel += 1) pixels[offset + channel] = Math.round(totals[channel] / count);
  }
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  body.copy(output, 4);
  output.writeUInt32BE(crc32(body), 8 + data.length);
  return output;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8;
header[9] = 6;

const scanlines = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  const target = y * (SIZE * 4 + 1);
  scanlines[target] = 0;
  pixels.copy(scanlines, target + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(scanlines, { level: 9 })),
  chunk("IEND")
]);

const outputPath = resolve("build/icon.png");
await writeFile(outputPath, png);
console.log(`Generated ${outputPath} (${png.length} bytes).`);
