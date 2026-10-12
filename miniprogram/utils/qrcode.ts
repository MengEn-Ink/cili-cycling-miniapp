// Minimal, dependency-free QR Code encoder (byte mode) for rendering the Strava
// authorization URL as a scannable code. Pure functions only — no `wx` access —
// so the whole pipeline can be unit-tested on the host.
//
// Supports numeric/alphanumeric fallback to byte mode, versions 1–40, and the
// four standard error-correction levels. The default level is M, which balances
// density against scan robustness for ~250 character URLs.

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrCode {
  readonly version: number;
  readonly size: number;
  /** Row-major matrix; `true` is a dark module. */
  readonly modules: boolean[][];
}

// ---------------------------------------------------------------------------
// Galois field GF(256) arithmetic for Reed–Solomon error correction.
// ---------------------------------------------------------------------------

const GF_EXP = new Array<number>(512).fill(0);
const GF_LOG = new Array<number>(256).fill(0);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ecLen: number): number[] {
  const generator = rsGeneratorPoly(ecLen); // length ecLen+1, generator[0] === 1
  const buffer = data.concat(new Array<number>(ecLen).fill(0));
  for (let i = 0; i < data.length; i += 1) {
    const coef = buffer[i];
    if (coef === 0) continue;
    for (let j = 0; j < generator.length; j += 1) {
      buffer[i + j] ^= gfMul(generator[j], coef);
    }
  }
  return buffer.slice(data.length);
}

// ---------------------------------------------------------------------------
// Capacity + block tables (byte mode) for every version/EC level.
// ---------------------------------------------------------------------------

// EC codewords per block and block layout, indexed by [version-1][ecLevelIndex].
// Each entry: [ecCodewordsPerBlock, numBlocksGroup1, dataCodewordsGroup1,
// numBlocksGroup2, dataCodewordsGroup2].
import { EC_BLOCK_TABLE } from './qrcode-tables';

const EC_ORDER: ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];

interface VersionPlan {
  readonly version: number;
  readonly ecPerBlock: number;
  readonly group1Blocks: number;
  readonly group1DataCount: number;
  readonly group2Blocks: number;
  readonly group2DataCount: number;
  readonly totalDataCodewords: number;
}

function versionPlan(version: number, ecLevel: ErrorCorrectionLevel): VersionPlan {
  const row = EC_BLOCK_TABLE[version - 1];
  const [ecPerBlock, g1Blocks, g1Count, g2Blocks, g2Count] = row[EC_ORDER.indexOf(ecLevel)];
  return {
    version,
    ecPerBlock,
    group1Blocks: g1Blocks,
    group1DataCount: g1Count,
    group2Blocks: g2Blocks,
    group2DataCount: g2Count,
    totalDataCodewords: g1Blocks * g1Count + g2Blocks * g2Count,
  };
}

function charCountBits(version: number): number {
  // Byte mode: 8 bits for v1–9, 16 bits for v10–40.
  return version <= 9 ? 8 : 16;
}

function chooseVersion(byteLength: number, ecLevel: ErrorCorrectionLevel): VersionPlan {
  for (let version = 1; version <= EC_BLOCK_TABLE.length; version += 1) {
    const plan = versionPlan(version, ecLevel);
    const header = 4 + charCountBits(version);
    const neededBits = header + byteLength * 8;
    if (neededBits <= plan.totalDataCodewords * 8) return plan;
  }
  throw new Error('内容超出二维码容量上限');
}

// ---------------------------------------------------------------------------
// Bit buffer + data codeword assembly.
// ---------------------------------------------------------------------------

function toUtf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

function buildDataCodewords(bytes: number[], plan: VersionPlan): number[] {
  const bits: number[] = [];
  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  pushBits(0b0100, 4); // byte mode indicator
  pushBits(bytes.length, charCountBits(plan.version));
  for (const byte of bytes) pushBits(byte, 8);

  const capacityBits = plan.totalDataCodewords * 8;
  // Terminator (up to 4 zero bits).
  for (let i = 0; i < 4 && bits.length < capacityBits; i += 1) bits.push(0);
  // Pad to a byte boundary.
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  // Pad bytes alternate between 0xEC and 0x11.
  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < plan.totalDataCodewords) {
    codewords.push(padBytes[padIndex % 2]);
    padIndex += 1;
  }
  return codewords;
}

function interleaveCodewords(dataCodewords: number[], plan: VersionPlan): number[] {
  const blocks: { data: number[]; ec: number[] }[] = [];
  let offset = 0;
  const addBlocks = (count: number, dataCount: number) => {
    for (let i = 0; i < count; i += 1) {
      const data = dataCodewords.slice(offset, offset + dataCount);
      offset += dataCount;
      blocks.push({ data, ec: rsEncode(data, plan.ecPerBlock) });
    }
  };
  addBlocks(plan.group1Blocks, plan.group1DataCount);
  addBlocks(plan.group2Blocks, plan.group2DataCount);

  const result: number[] = [];
  const maxData = Math.max(plan.group1DataCount, plan.group2DataCount);
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) {
      if (i < block.data.length) result.push(block.data[i]);
    }
  }
  for (let i = 0; i < plan.ecPerBlock; i += 1) {
    for (const block of blocks) result.push(block.ec[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Module matrix placement, masking, and format/version information.
// ---------------------------------------------------------------------------

const ALIGNMENT_POSITIONS: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

const EC_FORMAT_BITS: Record<ErrorCorrectionLevel, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

function createMatrix(size: number): (boolean | null)[][] {
  return Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
}

function placeFinder(matrix: (boolean | null)[][], row: number, col: number): void {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= matrix.length || cc < 0 || cc >= matrix.length) continue;
      const isBorder = r === -1 || r === 7 || c === -1 || c === 7;
      const inRing =
        r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6);
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      matrix[rr][cc] = isBorder ? false : inRing || inCore;
    }
  }
}

function reserveFormatAreas(matrix: (boolean | null)[][], size: number): void {
  // Mark format info regions as reserved (set to false placeholder, overwritten later).
  // Handled during format bit writing; here we just leave timing/finder done.
  void matrix;
  void size;
}

function isFunctionModule(
  version: number,
  size: number,
  alignment: number[],
  row: number,
  col: number,
): boolean {
  // Finder patterns + separators.
  if (row < 8 && col < 8) return true;
  if (row < 8 && col >= size - 8) return true;
  if (row >= size - 8 && col < 8) return true;
  // Timing patterns.
  if (row === 6 || col === 6) return true;
  // Dark module + format areas near finders.
  if (col === 8 && (row < 9 || row >= size - 8)) return true;
  if (row === 8 && (col < 9 || col >= size - 8)) return true;
  // Alignment patterns.
  for (const ar of alignment) {
    for (const ac of alignment) {
      if ((ar <= 7 && ac <= 7) || (ar <= 7 && ac >= size - 8) || (ar >= size - 8 && ac <= 7))
        continue;
      if (row >= ar - 2 && row <= ar + 2 && col >= ac - 2 && col <= ac + 2) return true;
    }
  }
  // Version info (v7+).
  if (version >= 7) {
    if (row < 6 && col >= size - 11 && col < size - 8) return true;
    if (col < 6 && row >= size - 11 && row < size - 8) return true;
  }
  return false;
}

function placeAlignment(matrix: (boolean | null)[][], alignment: number[], size: number): void {
  for (const ar of alignment) {
    for (const ac of alignment) {
      if ((ar <= 7 && ac <= 7) || (ar <= 7 && ac >= size - 8) || (ar >= size - 8 && ac <= 7))
        continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const ring = Math.max(Math.abs(r), Math.abs(c));
          matrix[ar + r][ac + c] = ring !== 1;
        }
      }
    }
  }
}

function placeTiming(matrix: (boolean | null)[][], size: number): void {
  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    if (matrix[6][i] === null) matrix[6][i] = dark;
    if (matrix[i][6] === null) matrix[i][6] = dark;
  }
}

function maskCondition(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function formatInfoBits(ecLevel: ErrorCorrectionLevel, mask: number): number {
  const data = (EC_FORMAT_BITS[ecLevel] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) {
    rem = (rem << 1) ^ ((rem >> 9) & 1 ? 0b10100110111 : 0);
  }
  return ((data << 10) | (rem & 0x3ff)) ^ 0b101010000010010;
}

function versionInfoBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i += 1) {
    rem = (rem << 1) ^ ((rem >> 11) & 1 ? 0b1111100100101 : 0);
  }
  return (version << 12) | (rem & 0xfff);
}

function placeFormatInfo(
  matrix: (boolean | null)[][],
  size: number,
  ecLevel: ErrorCorrectionLevel,
  mask: number,
): void {
  const bits = formatInfoBits(ecLevel, mask);
  for (let i = 0; i < 15; i += 1) {
    const bit = ((bits >> i) & 1) === 1;
    // Around top-left finder.
    if (i < 6) matrix[i][8] = bit;
    else if (i === 6) matrix[7][8] = bit;
    else if (i === 7) matrix[8][8] = bit;
    else if (i === 8) matrix[8][7] = bit;
    else matrix[8][14 - i] = bit;
    // Around top-right / bottom-left.
    if (i < 8) matrix[8][size - 1 - i] = bit;
    else matrix[size - 15 + i][8] = bit;
  }
  matrix[size - 8][8] = true; // dark module
}

function placeVersionInfo(matrix: (boolean | null)[][], size: number, version: number): void {
  if (version < 7) return;
  const bits = versionInfoBits(version);
  for (let i = 0; i < 18; i += 1) {
    const bit = ((bits >> i) & 1) === 1;
    const row = Math.floor(i / 3);
    const col = i % 3;
    matrix[row][size - 11 + col] = bit;
    matrix[size - 11 + col][row] = bit;
  }
}

function placeData(
  matrix: (boolean | null)[][],
  codewords: number[],
  version: number,
  size: number,
  alignment: number[],
): void {
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    const c = col === 6 ? col - 1 : col; // skip timing column
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (let j = 0; j < 2; j += 1) {
        const cc = c - j;
        if (matrix[row][cc] !== null) continue;
        if (isFunctionModule(version, size, alignment, row, cc)) continue;
        let dark = false;
        if (bitIndex < totalBits) {
          const byte = codewords[bitIndex >> 3];
          dark = ((byte >> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex += 1;
        }
        matrix[row][cc] = dark;
      }
    }
    upward = !upward;
  }
}

function applyMask(
  matrix: (boolean | null)[][],
  mask: number,
  version: number,
  size: number,
  alignment: number[],
): void {
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (isFunctionModule(version, size, alignment, row, col)) continue;
      if (maskCondition(mask, row, col)) matrix[row][col] = !matrix[row][col];
    }
  }
}

function penalty(matrix: (boolean | null)[][], size: number): number {
  const at = (r: number, c: number) => matrix[r][c] === true;
  let score = 0;
  // Rule 1: runs of 5+ same-color modules.
  for (let r = 0; r < size; r += 1) {
    let runColor = at(r, 0);
    let runLen = 1;
    for (let c = 1; c < size; c += 1) {
      if (at(r, c) === runColor) runLen += 1;
      else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runColor = at(r, c);
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }
  for (let c = 0; c < size; c += 1) {
    let runColor = at(0, c);
    let runLen = 1;
    for (let r = 1; r < size; r += 1) {
      if (at(r, c) === runColor) runLen += 1;
      else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runColor = at(r, c);
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }
  // Rule 2: 2x2 blocks of same color.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) score += 3;
    }
  }
  // Rule 3: finder-like patterns.
  const pattern = [true, false, true, true, true, false, true];
  const matchAt = (cells: boolean[]) => {
    for (let i = 0; i <= cells.length - 7; i += 1) {
      let ok = true;
      for (let k = 0; k < 7; k += 1) if (cells[i + k] !== pattern[k]) ok = false;
      if (ok) {
        const before = i >= 4 ? cells.slice(i - 4, i).every((x) => !x) : false;
        const after = i + 11 <= cells.length ? cells.slice(i + 7, i + 11).every((x) => !x) : false;
        if (before || after) score += 40;
      }
    }
  };
  for (let r = 0; r < size; r += 1) matchAt(matrix[r].map((x) => x === true));
  for (let c = 0; c < size; c += 1) matchAt(matrix.map((row) => row[c] === true));
  // Rule 4: dark module balance.
  let dark = 0;
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (at(r, c)) dark += 1;
  const ratio = (dark * 100) / (size * size);
  const k = Math.floor(Math.abs(ratio - 50) / 5);
  score += k * 10;
  return score;
}

/** Encode text into a QR Code module matrix. */
export function encodeQrCode(text: string, ecLevel: ErrorCorrectionLevel = 'M'): QrCode {
  if (!text) throw new Error('二维码内容不能为空');
  const bytes = toUtf8Bytes(text);
  const plan = chooseVersion(bytes.length, ecLevel);
  const dataCodewords = buildDataCodewords(bytes, plan);
  const finalCodewords = interleaveCodewords(dataCodewords, plan);

  const size = plan.version * 4 + 17;
  const alignment = ALIGNMENT_POSITIONS[plan.version - 1];

  const base = createMatrix(size);
  placeFinder(base, 0, 0);
  placeFinder(base, 0, size - 7);
  placeFinder(base, size - 7, 0);
  reserveFormatAreas(base, size);
  placeAlignment(base, alignment, size);
  placeTiming(base, size);
  placeData(base, finalCodewords, plan.version, size, alignment);
  placeVersionInfo(base, size, plan.version);

  let best: (boolean | null)[][] | null = null;
  let bestScore = Infinity;
  let bestMask = 0;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = base.map((row) => row.slice());
    applyMask(candidate, mask, plan.version, size, alignment);
    placeFormatInfo(candidate, size, ecLevel, mask);
    const score = penalty(candidate, size);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
      bestMask = mask;
    }
  }
  void bestMask;

  const modules = (best as (boolean | null)[][]).map((row) => row.map((cell) => cell === true));
  return { version: plan.version, size, modules };
}

/** Internal pipeline pieces exposed for host unit tests. */
export const __qrInternals = {
  gfMul,
  rsEncode,
  toUtf8Bytes,
  chooseVersion,
  buildDataCodewords,
  versionPlan,
};
