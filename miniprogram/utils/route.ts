export interface ExternalRouteReference {
  provider: 'strava';
  routeId: string;
  url: string;
}

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const SHA256_ROUND = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256Hex(input: ArrayBuffer | Uint8Array): string {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(source);
  padded[source.length] = 0x80;
  const bitLength = source.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = [...SHA256_INITIAL];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const previous = words[index - 15];
      const sigma0 = rotateRight(previous, 7) ^ rotateRight(previous, 18) ^ (previous >>> 3);
      const recent = words[index - 2];
      const sigma1 = rotateRight(recent, 17) ^ rotateRight(recent, 19) ^ (recent >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choose + SHA256_ROUND[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((value) => value.toString(16).padStart(8, '0')).join('');
}

export function normalizeStravaRouteUrl(value: string): ExternalRouteReference {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 256)
    throw new Error('请输入有效的 Strava 公开路线链接');
  const match =
    /^https:\/\/www\.strava\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?routes\/([1-9]\d{0,19})\/?$/i.exec(
      value,
    );
  if (!match) throw new Error('请输入有效的 Strava 公开路线链接');
  return {
    provider: 'strava',
    routeId: match[1],
    url: `https://www.strava.com/routes/${match[1]}`,
  };
}

export function routeUploadPath(openid: string, digest: string, extension: 'gpx' | 'png'): string {
  if (
    typeof openid !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(openid) ||
    typeof digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    !['gpx', 'png'].includes(extension)
  )
    throw new Error('路线文件路径无效');
  return `activity-routes/${openid}/${digest}.${extension}`;
}

const ROUTE_ERRORS: Record<string, string> = {
  NO_FILE_SELECTED: '没有选中文件，请重新选择',
  GPX_TOO_LARGE: '文件超过 4 MB，请选择更小的 GPX',
  GPX_INVALID: '这个文件不是有效的 GPX，请重新导出后上传',
  GPX_FILE_INVALID: '这个文件不是有效的 GPX，请重新选择',
  GPX_DIGEST_MISMATCH: '路线文件校验失败，请重新选择',
  GPX_ELEVATION_REQUIRED: 'GPX 中没有海拔信息，暂时无法生成海拔曲线',
  GPX_TOO_MANY_POINTS: '路线点过多，请先简化路线后再上传',
  ROUTE_PREVIEW_EXPIRED: '路线预览已过期，请重新上传 GPX',
  ROUTE_PREVIEW_CONSUMED: '这份路线已用于其他活动，请重新选择',
  ROUTE_PREVIEW_REQUIRED: '请重新上传 GPX 路线',
  ROUTE_PREVIEW_IMAGE_INVALID: '路线图生成失败，请重试',
};

export function routeErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';
  return ROUTE_ERRORS[code] || '路线读取失败，请稍后重试';
}
