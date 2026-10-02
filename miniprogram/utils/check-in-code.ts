const PREFIX = 'CILI-CHECKIN:';
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
// Code 128 的 0-106 条码宽度表；使用 B 字符集即可覆盖凭证中的 ASCII 文本。
const PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

export function buildCheckInCode(registrationId: string): string {
  if (!ID_PATTERN.test(registrationId)) throw new Error('报名 ID 格式无效');
  return `${PREFIX}${registrationId}`;
}

export function parseCheckInScan(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const candidates = [
    text.startsWith(PREFIX) ? text.slice(PREFIX.length) : '',
    /^cili:\/\/checkin\/([^?&#]+)/i.exec(text)?.[1] || '',
    /(?:^|\/)pages\/admin\/review-detail\/index\?[^#]*\bid=([^&#]+)/.exec(text)?.[1] || '',
  ];
  for (const candidate of candidates) {
    let decoded = candidate;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      return null;
    }
    if (ID_PATTERN.test(decoded)) return decoded;
  }
  return null;
}

export function drawCode128(context: any, width: number, height: number, value: string): boolean {
  if (!context || width <= 0 || height <= 0 || !/^[\x20-\x7e]+$/.test(value)) return false;
  const codes = Array.from(value, (char) => char.charCodeAt(0) - 32);
  let checksum = 104;
  codes.forEach((code, index) => {
    checksum += code * (index + 1);
  });
  const sequence = [104, ...codes, checksum % 103, 106];
  const modules = sequence.reduce(
    (total, code) =>
      total + PATTERNS[code].split('').reduce((sum, digit) => sum + Number(digit), 0),
    20,
  );
  const unit = width / modules;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#000000';
  let x = 10 * unit;
  for (const code of sequence) {
    const pattern = PATTERNS[code];
    for (let index = 0; index < pattern.length; index += 1) {
      const barWidth = Number(pattern[index]) * unit;
      if (index % 2 === 0) context.fillRect(x, 0, Math.ceil(barWidth), height);
      x += barWidth;
    }
  }
  return true;
}
