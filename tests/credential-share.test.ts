import { describe, expect, it, vi } from 'vitest';

describe('凭证分享公开活动', () => {
  it('队长也只分享活动标题与活动地址，不附带队伍邀请', async () => {
    let page: any;
    vi.stubGlobal('Page', (value: any) => {
      page = value;
    });
    await import('../miniprogram/pages/credential/index');
    expect(
      page.onShareAppMessage.call({
        data: {
          activity: { id: 'synthetic/activity', title: '合成晨骑活动' },
          item: { isTeamLeader: true, teamId: 'synthetic-team', teamName: '合成小队' },
        },
      }),
    ).toEqual({
      title: '合成晨骑活动',
      path: 'pages/activity-detail/index?id=synthetic%2Factivity',
    });
    vi.unstubAllGlobals();
  });
});
