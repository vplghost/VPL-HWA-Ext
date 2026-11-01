#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { decodeETC, makePNG, ETC_FORMAT } from 'tex-decoder';

/**
 * Mapping of Unity's UnityEngine.TextureFormat enum values to tex-decoder ETC_FORMAT enum values.
 */
export const UNITY_TO_ETC = {
  34: ETC_FORMAT.ETC1_RGB,   // TextureFormat.ETC_RGB4
  45: ETC_FORMAT.ETC2_RGB,   // TextureFormat.ETC2_RGB
  46: ETC_FORMAT.ETC2_RGBA1, // TextureFormat.ETC2_RGBA1
  47: ETC_FORMAT.ETC2_RGBA8, // TextureFormat.ETC2_RGBA8
  48: ETC_FORMAT.EAC_R11,    // TextureFormat.EAC_R
  50: ETC_FORMAT.EAC_RG11    // TextureFormat.EAC_RG
};

/**
 * Parses a Hero Wars Alliance / WebGL .img texture container.
 *
 * Game .img files are PKZip archives containing two files:
 * 1. `tex.header`: A serialized .NET BinaryFormatter ValueTuple<bool, TextureFormat, int, int>
 *    where the last 13 bytes contain:
 *      - 4 bytes LE: TextureFormat enum integer
 *      - 4 bytes LE: width (int32)
 *      - 4 bytes LE: height (int32)
 *      - 1 byte (0x0B): BinaryFormatter MessageEnd record marker
 * 2. `tex.bytes`: Raw compressed ETC/EAC texture blocks
 *
 * @param {Buffer} buf Raw .img file buffer
 * @returns {{ unityFormat: number, etcFormat: number, width: number, height: number, bytesBuf: Buffer }}
 */
export function parseImg(buf) {
  let idx = 0;
  let headerBuf = null;
  let bytesBuf = null;

  while ((idx = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), idx)) !== -1) {
    const compMethod = buf.readUInt16LE(idx + 8);
    const compSize = buf.readUInt32LE(idx + 18);
    const fnLen = buf.readUInt16LE(idx + 26);
    const extraLen = buf.readUInt16LE(idx + 28);
    const fn = buf.toString('utf8', idx + 30, idx + 30 + fnLen);
    const dataOffset = idx + 30 + fnLen + extraLen;
    const rawData = buf.subarray(dataOffset, dataOffset + compSize);
    const decompressed = compMethod === 8 ? inflateRawSync(rawData) : rawData;

    if (fn === 'tex.header') headerBuf = decompressed;
    if (fn === 'tex.bytes') bytesBuf = decompressed;

    idx = dataOffset + compSize;
  }

  if (!headerBuf || !bytesBuf) {
    throw new Error('Invalid .img archive: missing tex.header or tex.bytes');
  }

  // Read format, width, height from trailing BinaryFormatter record
  const end = headerBuf.length - 1;
  if (headerBuf[end] !== 0x0b) {
    throw new Error('Unrecognized tex.header structure: expected MessageEnd 0x0B');
  }

  const height = headerBuf.readInt32LE(end - 4);
  const width = headerBuf.readInt32LE(end - 8);
  const unityFormat = headerBuf.readInt32LE(end - 12);
  const etcFormat = UNITY_TO_ETC[unityFormat];

  if (etcFormat === undefined) {
    throw new Error(`Unsupported Unity texture format: ${unityFormat}`);
  }

  return { unityFormat, etcFormat, width, height, bytesBuf };
}

/**
 * Decodes raw .img buffer into PNG image buffer.
 *
 * @param {Buffer} imgBuf
 * @returns {{ width: number, height: number, unityFormat: number, png: Buffer }}
 */
export function convertImgBuffer(imgBuf) {
  const { unityFormat, etcFormat, width, height, bytesBuf } = parseImg(imgBuf);
  const decoded = decodeETC(bytesBuf, width, height, etcFormat);
  const isRGB = decoded.length === width * height * 3;
  const rgba = Buffer.alloc(width * height * 4);

  // Unity / WebGL textures use OpenGL coordinate space with origin at bottom-left.
  // Standard image formats (PNG) use origin at top-left.
  // We flip the pixel rows vertically while converting to RGBA.
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      if (isRGB) {
        const srcIdx = (srcY * width + x) * 3;
        rgba[dstIdx] = decoded[srcIdx];
        rgba[dstIdx + 1] = decoded[srcIdx + 1];
        rgba[dstIdx + 2] = decoded[srcIdx + 2];
        rgba[dstIdx + 3] = 255;
      } else {
        const srcIdx = (srcY * width + x) * 4;
        rgba[dstIdx] = decoded[srcIdx];
        rgba[dstIdx + 1] = decoded[srcIdx + 1];
        rgba[dstIdx + 2] = decoded[srcIdx + 2];
        rgba[dstIdx + 3] = decoded[srcIdx + 3];
      }
    }
  }

  const png = Buffer.from(makePNG(rgba, width, height));
  return { width, height, unityFormat, png };
}

// CLI handler
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const input = process.argv[2];
  const output = process.argv[3];

  if (!input) {
    console.error('Usage: node scripts/convert-img-asset.mjs <input.img|url> [output.png]');
    process.exit(1);
  }

  let buffer;
  if (input.startsWith('http://') || input.startsWith('https://')) {
    console.log(`Fetching ${input}...`);
    const res = await fetch(input);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } else {
    buffer = await readFile(resolve(input));
  }

  const { width, height, unityFormat, png } = convertImgBuffer(buffer);
  const outPath = output || resolve(basename(input, '.img') + '.png');
  await writeFile(outPath, png);
  console.log(`Converted ${input} (${width}x${height}, format ${unityFormat}) -> ${outPath} (${png.length} bytes)`);
}
