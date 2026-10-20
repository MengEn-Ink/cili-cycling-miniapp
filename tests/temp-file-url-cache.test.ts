import { describe, expect, it, vi } from 'vitest';
import {
  clearSharedTempFileUrlCache,
  getSharedTempFileUrlCache,
  TempFileUrlCache,
} from '../miniprogram/utils/temp-file-url';

const TTL = 2 * 60 * 60 * 1000;
const MARGIN = 5 * 60 * 1000;

const fileId = (key: string) => `cloud://env/profiles/owner/${key}.jpg`;
const tempUrl = (key: string) => `https://temporary.example/${key}.jpg`;

function setup() {
  let now = 1_000_000;
  const getTempFileURL = vi.fn();
  const cache = new TempFileUrlCache({
    getTempFileURL,
    ttlMs: TTL,
    refreshMarginMs: MARGIN,
    now: () => now,
  });
  const advance = (ms: number) => {
    now += ms;
  };
  const respond = (keys: string[]) =>
    getTempFileURL.mockResolvedValueOnce({
      fileList: keys.map((key) => ({ fileID: fileId(key), tempFileURL: tempUrl(key) })),
    });
  return { cache, getTempFileURL, advance, respond, now: () => now };
}

describe('TempFileUrlCache 临时地址缓存', () => {
  it('首次解析发起请求，TTL 内再次解析复用缓存不再请求', async () => {
    const { cache, getTempFileURL, respond } = setup();
    respond(['a']);

    await expect(cache.resolve([fileId('a')])).resolves.toEqual({
      [fileId('a')]: tempUrl('a'),
    });
    const again = await cache.resolve([fileId('a')]);

    expect(again[fileId('a')]).toBe(tempUrl('a'));
    expect(getTempFileURL).toHaveBeenCalledTimes(1);
  });

  it('同一事件循环内对不同 id 的解析合并为一次批量调用', async () => {
    const { cache, getTempFileURL, respond } = setup();
    respond(['a', 'b']);

    const [first, second] = await Promise.all([
      cache.resolve([fileId('a')]),
      cache.resolve([fileId('b')]),
    ]);

    expect(first).toEqual({ [fileId('a')]: tempUrl('a') });
    expect(second).toEqual({ [fileId('b')]: tempUrl('b') });
    expect(getTempFileURL).toHaveBeenCalledTimes(1);
    expect(getTempFileURL).toHaveBeenCalledWith({
      fileList: [fileId('a'), fileId('b')],
    });
  });

  it('同一 id 的并发解析做单飞去重，只请求一次', async () => {
    const { cache, getTempFileURL, respond } = setup();
    respond(['a']);

    const results = await Promise.all([cache.resolve([fileId('a')]), cache.resolve([fileId('a')])]);

    expect(results).toHaveLength(2);
    expect(getTempFileURL).toHaveBeenCalledTimes(1);
  });

  it('临期前 get 返回空并在下次解析时重新请求', async () => {
    const { cache, getTempFileURL, respond, advance } = setup();
    respond(['a']);
    await cache.resolve([fileId('a')]);

    // 仍在安全有效期内：同步命中。
    expect(cache.get(fileId('a'))).toBe(tempUrl('a'));
    // 推进到“已进入提前刷新余量”但尚未真正到期。
    advance(TTL - MARGIN + 1);
    expect(cache.get(fileId('a'))).toBe('');

    respond(['a']);
    const refreshed = await cache.resolve([fileId('a')]);
    expect(refreshed[fileId('a')]).toBe(tempUrl('a'));
    expect(getTempFileURL).toHaveBeenCalledTimes(2);
  });

  it('整批请求失败时拒绝且不缓存，下次解析重新请求', async () => {
    const { cache, getTempFileURL, respond } = setup();
    getTempFileURL.mockRejectedValueOnce(new Error('network down'));

    await expect(cache.resolve([fileId('a')])).rejects.toThrow('network down');

    respond(['a']);
    const retried = await cache.resolve([fileId('a')]);
    expect(retried[fileId('a')]).toBe(tempUrl('a'));
    expect(getTempFileURL).toHaveBeenCalledTimes(2);
  });

  it('跳过非 https 或缺 fileID 的异常结果，不污染缓存', async () => {
    const { cache, getTempFileURL } = setup();
    getTempFileURL.mockResolvedValueOnce({
      fileList: [
        { fileID: fileId('bad'), tempFileURL: 'cloud://env/not-https.jpg' },
        { tempFileURL: tempUrl('nofileid') },
      ],
    });

    const result = await cache.resolve([fileId('bad')]);

    expect(result).toEqual({});
    expect(cache.get(fileId('bad'))).toBe('');
  });

  it('个人资料、活动编辑与骑行名片复用同一应用级缓存', async () => {
    const getTempFileURL = vi.fn().mockResolvedValue({
      fileList: [{ fileID: fileId('shared'), tempFileURL: tempUrl('shared') }],
    });
    const firstPageCache = getSharedTempFileUrlCache({ getTempFileURL });
    const secondPageCache = getSharedTempFileUrlCache({ getTempFileURL: vi.fn() });

    expect(secondPageCache).toBe(firstPageCache);
    await firstPageCache.resolve([fileId('shared')]);
    await secondPageCache.resolve([fileId('shared')]);
    expect(getTempFileURL).toHaveBeenCalledTimes(1);

    clearSharedTempFileUrlCache();
    await secondPageCache.resolve([fileId('shared')]);
    expect(getTempFileURL).toHaveBeenCalledTimes(2);
  });

  it('invalidate 指定/全部后下次解析重新请求', async () => {
    const { cache, getTempFileURL, respond } = setup();
    respond(['a', 'b']);
    await Promise.all([cache.resolve([fileId('a')]), cache.resolve([fileId('b')])]);

    cache.invalidate([fileId('a')]);
    respond(['a']);
    await cache.resolve([fileId('a'), fileId('b')]);

    // a 被失效后重新请求，b 仍命中缓存；整批清空场景另验。
    expect(getTempFileURL).toHaveBeenCalledTimes(2);
    expect(getTempFileURL).toHaveBeenLastCalledWith({ fileList: [fileId('a')] });

    cache.invalidate();
    respond(['a', 'b']);
    await cache.resolve([fileId('a'), fileId('b')]);
    expect(getTempFileURL).toHaveBeenCalledTimes(3);
  });
});
