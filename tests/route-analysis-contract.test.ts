// @ts-expect-error Vitest provides the Node runtime used by this repository.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('完整路线分析页合同', () => {
  it('注册页面并使用既有活动读取服务和 state-view', () => {
    const app = JSON.parse(read('miniprogram/app.json'));
    const page = read('miniprogram/pages/route-analysis/index.ts');
    const config = JSON.parse(read('miniprogram/pages/route-analysis/index.json'));
    expect(app.pages).not.toContain('pages/route-analysis/index');
    expect(app.subpackages).toContainEqual({ root: 'pages/route-analysis', pages: ['index'] });
    expect(page).toContain('rideService.getActivity(this.activityId)');
    expect(page).toContain("typeof query.id === 'string'");
    expect(config.usingComponents['state-view']).toBe('/components/state-view/index');
    expect(config.usingComponents['metric-grid']).toBe('/components/metric-grid/index');
  });

  it('展示首期关键模块、原生地图、Canvas 与选择联动', () => {
    const template = read('miniprogram/pages/route-analysis/index.wxml');
    const page = read('miniprogram/pages/route-analysis/index.ts');
    for (const text of [
      '路线策略',
      '海拔剖面',
      '关键公里点',
      '主要分段',
      '路线地图',
      '外部增强能力状态',
      '基础装备建议',
      '数据来源与质量',
      '复制坐标',
    ])
      expect(template).toContain(text);
    expect(template).toContain('<map wx:if="{{mapAvailable}}"');
    expect(template).toContain('include-points="{{mapPoints}}"');
    expect(template).toContain('bindmarkertap="markerTap"');
    expect(template).toContain('id="route-analysis-elevation" type="2d"');
    expect(page).toContain('selectedSegmentId');
    expect(page).toContain('drawRouteAnalysisElevation(');
    expect(page).toContain('wx.setClipboardData');
  });

  it('诚实呈现天气、交通、导航与图表交互边界', () => {
    const template = read('miniprogram/pages/route-analysis/index.wxml');
    expect(template).toContain('实时天气未接入');
    expect(template).toContain('交通事件覆盖待开通');
    expect(template).toContain('无覆盖数据不等于道路畅通');
    expect(template).toContain('不含实时导航、天气或道路事件判断');
    expect(template).toContain('首期不支持图表拖动');
    expect(template).not.toMatch(/天气晴朗|当前道路畅通|实时风向：|实时降水：/);
  });

  it('活动详情和骑行凭证按真实路线条件进入同一个页面', () => {
    const detailPage = read('miniprogram/pages/activity-detail/index.ts');
    const detailTemplate = read('miniprogram/pages/activity-detail/index.wxml');
    const credentialPage = read('miniprogram/pages/credential/index.ts');
    const credentialTemplate = read('miniprogram/pages/credential/index.wxml');
    expect(detailPage).toContain('canAnalyzeRoute: hasAnalyzableRoute(detail.route)');
    expect(detailPage).toContain(
      'this.navigation.run(`/pages/route-analysis/index?id=${encodeURIComponent(id)}`)',
    );
    expect(detailTemplate).toContain('wx:if="{{canAnalyzeRoute}}"');
    expect(detailTemplate).toContain('查看完整路线分析');
    expect(credentialPage).toContain('canAnalyzeRoute: hasAnalyzableRoute(activity.route)');
    expect(credentialPage).toContain('const id = this.data.activity?.id');
    expect(credentialTemplate).toContain('wx:if="{{canAnalyzeRoute}}"');
    expect(credentialTemplate).toContain('查看路线分析');
  });

  it('专题 PRD 完整承载边界 TODO 且不伪装上线', () => {
    const prd = read('docs/superpowers/plans/2026-10-17-route-analysis-page.md');
    for (const marker of [
      '腾讯/高德逆地理编码与沿途 POI',
      '真实逐点逐时天气、风向、降水与穿衣规则',
      '施工/事故/管制/封路',
      '原创骑行人物资产动态换装',
      '真实导航/位置回放',
      '状态',
      '依赖/原因',
      '上线验收条件',
    ])
      expect(prd).toContain(marker);
    expect(prd).toContain('开放 PR #251');
  });

  it('发布说明使用当日递增版本并保留唯一当前记录', () => {
    const release = read('miniprogram/config/release.ts');
    const notes = read('miniprogram/pages/settings/index.ts');
    expect(release).toContain('2026.10.17.79');
    expect(notes).toContain("date: '2026-10-17'");
    expect(notes).toContain("title: '打开更快，路线查看更稳'");
    expect(notes.match(/latest: true/g)).toHaveLength(1);
    expect(notes).toContain('地图显示失败时保留核心路线数据');
  });
});
