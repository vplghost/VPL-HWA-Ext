/**
 * Minimal offline QR Code (ISO/IEC 18004, Byte mode, Error Correction Level L, Versions 1..6)
 * Pure TypeScript SVG generator with zero external dependencies.
 * Supports payloads up to 134 UTF-8 bytes (ideal for https://endpoint/?guid=<uuid>).
 */

// Version 1..6 Level L parameters: [totalCodewords, dataCodewords, ecCodewordsPerBlock, alignmentCenters]
const QR_VERSIONS: Array<{
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewords: number;
  alignment: number[];
}> = [
  { version: 1, size: 21, dataCodewords: 19, ecCodewords: 7, alignment: [] },
  { version: 2, size: 25, dataCodewords: 34, ecCodewords: 10, alignment: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, alignment: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, alignment: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, alignment: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, ecCodewords: 18, alignment: [6, 34] }, // 2 blocks of (68 data, 18 ec)
];

// GF(256) with primitive polynomial 0x11d
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsComputeEc(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const msg = new Uint8Array(data.length + ecCount);
  msg.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

function encodeDataBits(bytes: Uint8Array, dataCodewords: number): Uint8Array {
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  // Mode indicator: Byte (0100)
  pushBits(0b0100, 4);
  // Character count (8 bits for versions 1..9)
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);

  const capacityBits = dataCodewords * 8;
  // Terminator (up to 4 zero bits)
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  const out = new Uint8Array(dataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    out[i] = byte;
  }
  let padIdx = 0;
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8; i < dataCodewords; i++) {
    out[i] = padBytes[padIdx++ % 2];
  }
  return out;
}

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(String(text || ''));
  // Max byte payload = dataCodewords - 2 (4-bit mode + 8-bit length + 4-bit terminator = 2 bytes)
  const spec = QR_VERSIONS.find((v) => bytes.length <= v.dataCodewords - 2);
  if (!spec) {
    throw new Error(`QR payload too long (${bytes.length} bytes, max 134)`);
  }

  const data = encodeDataBits(bytes, spec.dataCodewords);
  let codewords: Uint8Array;
  if (spec.version === 6) {
    // Version 6-L has 2 blocks of (68 data, 18 EC) interleaved
    const b1 = data.slice(0, 68);
    const b2 = data.slice(68, 136);
    const ec1 = rsComputeEc(b1, 18);
    const ec2 = rsComputeEc(b2, 18);
    codewords = new Uint8Array(136 + 36);
    let idx = 0;
    for (let i = 0; i < 68; i++) {
      codewords[idx++] = b1[i];
      codewords[idx++] = b2[i];
    }
    for (let i = 0; i < 18; i++) {
      codewords[idx++] = ec1[i];
      codewords[idx++] = ec2[i];
    }
  } else {
    const ec = rsComputeEc(data, spec.ecCodewords);
    codewords = new Uint8Array(data.length + ec.length);
    codewords.set(data);
    codewords.set(ec, data.length);
  }

  const size = spec.size;
  const grid: Array<Array<boolean>> = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: Array<Array<boolean>> = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, dark: boolean, isFunc = true) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    grid[r][c] = dark;
    if (isFunc) reserved[r][c] = true;
  };

  // Finder patterns + separators
  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(rr, cc, inOuter && (onBorder || inCenter), true);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0, true);
    setModule(i, 6, i % 2 === 0, true);
  }

  // Alignment patterns
  for (const rCenter of spec.alignment) {
    for (const cCenter of spec.alignment) {
      if (reserved[rCenter][cCenter]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setModule(rCenter + dr, cCenter + dc, dist !== 1, true);
        }
      }
    }
  }

  // Dark module
  setModule(size - 8, 8, true, true);

  // Reserve format info areas
  for (let i = 0; i <= 8; i++) {
    if (!reserved[8][i]) reserved[8][i] = true;
    if (!reserved[i][8]) reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  // Place data bits (zigzag upward/downward right-to-left) with Mask 0: (r + c) % 2 === 0
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Skip vertical timing column
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (reserved[r][c]) continue;
        const bit =
          bitIndex < totalBits
            ? Boolean((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1)
            : false;
        bitIndex++;
        const masked = (r + c) % 2 === 0 ? !bit : bit;
        grid[r][c] = masked;
      }
    }
    upward = !upward;
  }

  // Write Format Information for EC Level L (01) + Mask 0 (000) -> 15-bit BCH + XOR 0x5412 = 0x77c4 (111011111000100)
  const formatBits = 0x77c4;
  for (let i = 0; i < 15; i++) {
    const dark = Boolean((formatBits >>> (14 - i)) & 1);
    // Horizontal copy
    if (i < 6) grid[8][i] = dark;
    else if (i === 6) grid[8][7] = dark;
    else if (i === 7) grid[8][8] = dark;
    else grid[8][size - 15 + i] = dark;

    // Vertical copy
    if (i < 7) grid[size - 1 - i][8] = dark;
    else if (i === 7) grid[8][8] = dark;
    else if (i === 8) grid[7][8] = dark;
    else grid[14 - i][8] = dark;
  }

  return grid;
}

export function renderQrSvg(text: string, quietZone = 2): string {
  const matrix = generateQrMatrix(text);
  const size = matrix.length;
  const viewSize = size + quietZone * 2;
  const rects: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        rects.push(`M${c + quietZone},${r + quietZone}h1v1h-1z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges" role="img" aria-label="Mobile pairing QR code"><rect width="${viewSize}" height="${viewSize}" fill="#ffffff"/><path d="${rects.join('')}" fill="#0f172a"/></svg>`;
}
