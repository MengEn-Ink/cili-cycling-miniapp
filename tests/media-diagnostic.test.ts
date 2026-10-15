import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_RELEASE_VERSION } from '../miniprogram/config/release';
import { mediaSourceKind, reportMediaDiagnostic } from '../miniprogram/utils/media-diagnostic';

describe('图片诊断日志', () => {
  afterEach(() => vi.restoreAllMocks());

  it('区分地址类型且日志只包含版本和非敏感诊断字段', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    expect(mediaSourceKind('wxfile://tmp/photo.jpg')).toBe('local');
    expect(mediaSourceKind('http://127.0.0.1/photo.jpg')).toBe('local');
    expect(mediaSourceKind('https://example.test/photo.jpg')).toBe('https');
    expect(mediaSourceKind('cloud://env/photo.jpg')).toBe('cloud');
    expect(mediaSourceKind('')).toBe('unknown');

    reportMediaDiagnostic('profile-edit.photo', 'load-error', {
      source: 'local',
      retryAttempted: false,
    });

    expect(info).toHaveBeenCalledWith(`[此里媒体][${CLIENT_RELEASE_VERSION}]`, {
      scope: 'profile-edit.photo',
      event: 'load-error',
      source: 'local',
      retryAttempted: false,
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain('wxfile://tmp/photo.jpg');
  });
});
