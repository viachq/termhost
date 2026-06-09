import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync } from 'fs';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, 'icons-draft');
mkdirSync(OUT, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a0a"/>
      <stop offset="50%" stop-color="#141414"/>
      <stop offset="100%" stop-color="#1a1a1a"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="200" fill="url(#bg)"/>
  <path d="M230 300 L510 512 L230 724" stroke="#e0e0e0" stroke-width="72" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <rect x="570" y="672" width="230" height="52" rx="14" fill="#e0e0e0"/>
</svg>`;

const buf = Buffer.from(svg);

// Supersample at 2048 then downscale for each size
const master = await sharp(buf, { density: 600 })
  .resize(2048, 2048, { kernel: 'lanczos3' })
  .png()
  .toBuffer();

// Generate PNG at multiple sizes for ICO
const sizes = [256, 128, 64, 48, 32, 16];
const pngBuffers = [];

for (const size of sizes) {
  const png = await sharp(master)
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  pngBuffers.push({ size, png });
}

// Also save 512px preview
const preview512 = await sharp(master)
  .resize(512, 512, { kernel: 'lanczos3' })
  .png()
  .toFile(join(OUT, 'final-f7.png'));

// Build ICO file
function buildIco(entries) {
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * entries.length;
  let dataOffset = headerSize + dirSize;

  // ICO header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: 1 = ICO
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  const dataChunks = [];

  for (const { size, png } of entries) {
    const dir = Buffer.alloc(dirEntrySize);
    dir.writeUInt8(size >= 256 ? 0 : size, 0);   // width (0 = 256)
    dir.writeUInt8(size >= 256 ? 0 : size, 1);   // height
    dir.writeUInt8(0, 2);           // color palette
    dir.writeUInt8(0, 3);           // reserved
    dir.writeUInt16LE(1, 4);        // color planes
    dir.writeUInt16LE(32, 6);       // bits per pixel
    dir.writeUInt32LE(png.length, 8);  // data size
    dir.writeUInt32LE(dataOffset, 12); // data offset

    dirEntries.push(dir);
    dataChunks.push(png);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...dataChunks]);
}

const ico = buildIco(pngBuffers);
const icoPath = join(DIR, 'src-tauri', 'icons', 'icon.ico');
writeFileSync(icoPath, ico);

// Also save a copy in icons-draft for reference
writeFileSync(join(OUT, 'final-f7.ico'), ico);

console.log(`Done — ICO saved to ${icoPath}`);
console.log(`Sizes: ${sizes.join(', ')}px`);
console.log(`ICO file size: ${(ico.length / 1024).toFixed(1)} KB`);
