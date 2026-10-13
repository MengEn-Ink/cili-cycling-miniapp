import { describe, expect, it } from 'vitest';
import {
  normalizeStravaRouteUrl,
  routeErrorMessage,
  routeUploadPath,
  sha256Hex,
} from '../miniprogram/utils/route';

describe('官方路线 URL', () => {
  it('兼容地区前缀和尾部斜杠并归一化为官方 HTTPS 地址', () => {
    expect(normalizeStravaRouteUrl('https://www.strava.com/zh-CN/routes/42/')).toEqual({
      provider: 'strava',
      routeId: '42',
      url: 'https://www.strava.com/routes/42',
    });
  });

  it.each([
    '',
    ' https://www.strava.com/routes/42',
    'http://www.strava.com/routes/42',
    'https://strava.com/routes/42',
    'https://www.strava.com.evil.test/routes/42',
    'https://www.strava.com/routes/0',
    'https://www.strava.com/routes/42?share=1',
    'https://www.strava.com/routes/42#map',
    `https://www.strava.com/routes/${'1'.repeat(21)}`,
  ])('拒绝非公开官方路线地址：%s', (value) => {
    expect(() => normalizeStravaRouteUrl(value)).toThrowError('请输入有效的 Strava 公开路线链接');
  });
});

describe('GPX 内容寻址', () => {
  it('计算标准 SHA-256 十六进制摘要', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('按可信 openid 和摘要生成 GPX/PNG 路径', () => {
    const digest = 'a'.repeat(64);
    expect(routeUploadPath('owner_openid-1', digest, 'gpx')).toBe(
      `activity-routes/owner_openid-1/${digest}.gpx`,
    );
    expect(routeUploadPath('owner_openid-1', digest, 'png')).toBe(
      `activity-routes/owner_openid-1/${digest}.png`,
    );
  });

  it('拒绝非法身份、摘要和扩展名', () => {
    expect(() => routeUploadPath('../owner', 'a'.repeat(64), 'gpx')).toThrow();
    expect(() => routeUploadPath('owner', 'bad', 'gpx')).toThrow();
    expect(() => routeUploadPath('owner', 'a'.repeat(64), 'jpg' as 'gpx')).toThrow();
  });
});

describe('路线错误文案', () => {
  it('区分文件隐私声明缺失、用户未授权和环境不支持', () => {
    expect(
      routeErrorMessage({
        errMsg: 'chooseMessageFile:fail api scope is not declared in the privacy agreement',
      }),
    ).toBe('请联系管理员在微信后台隐私保护指引中声明“收集你选中的文件”后重新发布');
    expect(
      routeErrorMessage({
        errMsg: 'chooseMessageFile:fail appid privacy api banned',
      }),
    ).toBe('请联系管理员在微信后台隐私保护指引中声明“收集你选中的文件”后重新发布');
    expect(
      routeErrorMessage({
        errMsg: 'chooseMessageFile:fail privacy permission is not authorized errno: 104',
      }),
    ).toBe('请先同意小程序隐私保护指引，再上传 GPX');
    expect(
      routeErrorMessage({
        errMsg: 'chooseMessageFile:fail not supported in devtools',
      }),
    ).toBe('当前环境无法打开文件选择器，请使用微信真机上传 GPX');
  });

  it('把服务端稳定错误码映射为用户下一步', () => {
    expect(routeErrorMessage({ code: 'GPX_TOO_LARGE' })).toBe('文件超过 4 MB，请选择更小的 GPX');
    expect(routeErrorMessage({ code: 'GPX_ELEVATION_REQUIRED' })).toBe(
      'GPX 中没有海拔信息，暂时无法生成海拔曲线',
    );
    expect(routeErrorMessage({ code: 'GPX_TOO_MANY_POINTS' })).toBe(
      '路线点过多，请先简化路线后再上传',
    );
    expect(routeErrorMessage({ code: 'ROUTE_PREVIEW_EXPIRED' })).toBe(
      '路线预览已过期，请重新上传 GPX',
    );
  });

  it('未知错误使用可恢复兜底且不展示内部错误码', () => {
    expect(routeErrorMessage({ code: 'INTERNAL_PRIVATE_CODE', message: 'secret' })).toBe(
      '路线读取失败，请稍后重试',
    );
  });
});
