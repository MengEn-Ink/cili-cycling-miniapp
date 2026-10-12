import { describe, expect, it } from 'vitest';
import { encodeQrCode, __qrInternals } from '../miniprogram/utils/qrcode';

const { gfMul, rsEncode, toUtf8Bytes, chooseVersion, buildDataCodewords } = __qrInternals;

describe('QR 编码器 · GF(256) 与 Reed–Solomon', () => {
  it('GF(256) 乘法满足已知乘积', () => {
    // Canonical products in GF(256) with 0x11d primitive polynomial.
    expect(gfMul(0, 5)).toBe(0);
    expect(gfMul(1, 1)).toBe(1);
    expect(gfMul(2, 2)).toBe(4);
    expect(gfMul(3, 7)).toBe(9); // (x+1)(x^2+x+1) over GF(256)/0x11d
    expect(gfMul(2, 142)).toBe(1); // 142 is the multiplicative inverse of 2
  });

  it('复现 "HELLO WORLD" v1-Q 的参考纠错码字', () => {
    // Canonical data codewords for QR v1-Q byte/alnum encoding of "HELLO WORLD"
    // and its 13 Reed–Solomon EC codewords (Thonky reference tutorial).
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
    const ec = rsEncode(data, 13);
    expect(ec).toEqual([168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16]);
  });

  it('复现 ISO/IEC 18004 的 1-M 参考纠错码字（数据 "01234567"）', () => {
    const data = [
      0b00010000, 0b00100000, 0b00001100, 0b01010110, 0b01100001, 0b10000000, 0b11101100,
      0b00010001, 0b11101100, 0b00010001, 0b11101100, 0b00010001, 0b11101100, 0b00010001,
      0b11101100, 0b00010001,
    ];
    const ec = rsEncode(data, 10);
    expect(ec).toEqual([165, 36, 212, 193, 237, 54, 199, 135, 44, 85]);
  });
});

describe('QR 编码器 · 数据组装与版本选择', () => {
  it('UTF-8 编码 ASCII 与多字节字符', () => {
    expect(toUtf8Bytes('AB')).toEqual([0x41, 0x42]);
    expect(toUtf8Bytes('中')).toEqual([0xe4, 0xb8, 0xad]);
  });

  it('按字节长度选择足够容量的最小版本（level M）', () => {
    expect(chooseVersion(10, 'M').version).toBe(1);
    // A ~250-char URL must fit without throwing.
    const plan = chooseVersion(250, 'M');
    expect(plan.version).toBeGreaterThanOrEqual(10);
    expect(plan.totalDataCodewords * 8).toBeGreaterThanOrEqual(250 * 8 + 20);
  });

  it('数据码字填充到版本容量并使用交替填充字节', () => {
    const plan = chooseVersion(2, 'M');
    const codewords = buildDataCodewords(toUtf8Bytes('AB'), plan);
    expect(codewords).toHaveLength(plan.totalDataCodewords);
    // Pad bytes alternate 0xEC / 0x11 at the tail.
    expect(codewords[codewords.length - 2]).toBe(0xec);
    expect(codewords[codewords.length - 1]).toBe(0x11);
  });
});

describe('QR 编码器 · 矩阵结构不变量', () => {
  const code = encodeQrCode('https://www.strava.com/oauth/authorize?client_id=1', 'M');

  it('输出尺寸符合 version*4+17', () => {
    expect(code.size).toBe(code.version * 4 + 17);
    expect(code.modules).toHaveLength(code.size);
    expect(code.modules[0]).toHaveLength(code.size);
  });

  it('三个定位图案的 7x7 外环为暗、内部 3x3 为暗、环为亮', () => {
    const corners = [
      [0, 0],
      [0, code.size - 7],
      [code.size - 7, 0],
    ];
    for (const [r, c] of corners) {
      // Outer ring corners are dark.
      expect(code.modules[r][c]).toBe(true);
      expect(code.modules[r + 6][c + 6]).toBe(true);
      // One module inside the ring (row r+1,c+1) is light.
      expect(code.modules[r + 1][c + 1]).toBe(false);
      // Core center is dark.
      expect(code.modules[r + 3][c + 3]).toBe(true);
    }
  });

  it('timing 图案在第 6 行/列交替', () => {
    for (let i = 8; i < code.size - 8; i += 1) {
      expect(code.modules[6][i]).toBe(i % 2 === 0);
      expect(code.modules[i][6]).toBe(i % 2 === 0);
    }
  });

  it('真实授权链接可编码且版本在表范围内', () => {
    const url =
      'https://www.strava.com/oauth/authorize?client_id=36717&redirect_uri=https%3A%2F%2Fcloudbase-d0gizacy77a1ab017-1497589790.ap-shanghai.app.tcloudbase.com%2Fstrava%2Fcallback&response_type=code&approval_prompt=force&scope=read%2Cactivity%3Aread_all%2Cprofile%3Aread_all&state=xfuFUGqLnOlBOlAsJxxaFzHcUiiN2MR6pTONjWxOWY';
    const long = encodeQrCode(url, 'M');
    expect(long.version).toBeLessThanOrEqual(13);
    expect(long.size).toBe(long.version * 4 + 17);
  });

  it('空内容抛错', () => {
    expect(() => encodeQrCode('', 'M')).toThrow();
  });
});
