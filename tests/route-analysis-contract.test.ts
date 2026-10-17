// @ts-expect-error Vitest provides the Node runtime used by this repository.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const template = read('miniprogram/pages/route-analysis/index.wxml');
const page = read('miniprogram/pages/route-analysis/index.ts');
const styles = read('miniprogram/pages/route-analysis/index.wxss');

describe('完整路线分析页合同', () => {
  it('注册页面并使用既有活动读取服务和 state-view', () => {
    const app = JSON.parse(read('miniprogram/app.json'));
    const config = JSON.parse(read('miniprogram/pages/route-analysis/index.json'));
    expect(app.pages).not.toContain('pages/route-analysis/index');
    expect(app.subpackages).toContainEqual({ root: 'pages/route-analysis', pages: ['index'] });
    expect(page).toContain('rideService.getActivity(this.activityId)');
    expect(page).toContain("typeof query.id === 'string'");
    expect(config.usingComponents['state-view']).toBe('/components/state-view/index');
    expect(config.usingComponents['metric-grid']).toBe('/components/metric-grid/index');
  });

  it('呈现高密度路线层级且地图优先于海拔和分段', () => {
    for (const text of [
      '核心结论',
      '路线走向 · 关键地名',
      '海拔剖面与锚点',
      '路线分段',
      '关键公里点',
      '坡段风险',
      '路线策略',
      '装备建议',
    ])
      expect(template).toContain(text);
    expect(template.indexOf('路线走向 · 关键地名')).toBeLessThan(
      template.indexOf('海拔剖面与锚点'),
    );
    expect(template.indexOf('海拔剖面与锚点')).toBeLessThan(template.indexOf('路线分段'));
    expect(styles).toContain('background: #efe6d4');
    expect(styles).toContain('font-family: var(--font-mono)');
  });

  it('地图展示完整路线、方向和分级标记，并在紧邻位置展示选中点详情', () => {
    expect(template).toContain('<map id="route-analysis-map"');
    expect(template).toContain('include-points="{{mapPoints}}"');
    expect(template).toContain('bindmarkertap="markerTap"');
    expect(template).toContain('沿红色箭头查看骑行顺序');
    expect(template).toContain('class="map-detail"');
    for (const detail of [
      '{{selectedPoint.name}}',
      '{{selectedPoint.typeLabel}}',
      '{{selectedPoint.kmText}}',
      '{{selectedPoint.coordinateText}}',
      '{{selectedPoint.elevationText}}',
      '{{selectedPoint.gradeText}}',
      '{{selectedPoint.note}}',
    ])
      expect(template).toContain(detail);
    expect(page).toContain('arrowLine: true');
    expect(page).toContain("display: selected ? 'ALWAYS' : 'BYCLICK'");
    expect(page).toContain('label: {');
    expect(page).toContain('content: point.markerLabel');
    expect(page).toContain('bgColor: point.markerColor');
    for (const marker of ['起', '终', '高', '爬', '下', '休'])
      expect(template).toContain(`>${marker}</text>`);
  });

  it('地图、海拔与可选详情按真实数据整块隐藏', () => {
    expect(template).toContain(
      'class="analysis-card map-card" wx:if="{{mapAvailable || mapFailed}}"',
    );
    expect(template).toContain('class="analysis-card" wx:if="{{profileAvailable}}"');
    expect(template).toContain('wx:if="{{selectedPoint.hasElevation}}"');
    expect(template).toContain('wx:if="{{selectedPoint.hasGrade}}"');
    expect(template).toContain('wx:if="{{selectedPoint.hasCoordinate}}"');
    expect(page).toContain('mapAvailable: analysis.outline.length > 1');
    expect(page).toContain('profileAvailable: analysis.profile.length > 1');
    expect(page).toContain('analysis.overview.ascentM !== null');
    expect(template).not.toMatch(/补给点|卫生间/);
  });

  it('关键点、分段、海拔锚点与地图 Canvas 双向联动', () => {
    expect(template).toContain('bindtap="selectPoint"');
    expect(template).toContain('bindtap="selectSegment"');
    expect(template).toContain('id="route-analysis-elevation" type="2d"');
    expect(page).toContain('selectedSegmentId');
    expect(page).toContain('...mapState(this.analysis, segment)');
    expect(page).toContain('...mapState(this.analysis)');
    expect(page).toContain('drawRouteAnalysisElevation(');
    expect(page).toContain('markerTap(event: any)');
    expect(page).toContain('mapPoints: point.hasCoordinate ? []');
    expect(page).toContain('mapPoints: selectedOutline');
    expect(page).toContain('showFullRoute()');
    expect(template).toContain('scale="{{mapScale}}"');
    expect(template).toContain('bindtap="showFullRoute">查看全线');
    expect(page).toContain('wx.setClipboardData');
  });

  it('用户页面移除技术状态痕迹且不伪造外部信息', () => {
    expect(template).not.toMatch(
      /待接入|未接入|技术边界|设计预览|模拟|数据质量|只读分析|外部增强能力状态|实时天气|道路畅通/,
    );
    expect(template).not.toMatch(/施工|事故|封路|天气|风向|降水/);
  });

  it('活动详情保留既有路线详情与完整分析入口，骑行凭证入口保持可用', () => {
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
    expect(detailTemplate).toContain('class="gpx-route-card" wx:if="{{hasRouteDetails}}"');
    expect(credentialPage).toContain('canAnalyzeRoute: hasAnalyzableRoute(activity.route)');
    expect(credentialTemplate).toContain('wx:if="{{canAnalyzeRoute}}"');
    expect(credentialTemplate).toContain('查看路线分析');
  });

  it('专题 PRD V2 承载高密度地图设计契约与真实数据隐藏策略', () => {
    const prd = read('docs/superpowers/plans/2026-10-17-route-analysis-page.md');
    for (const marker of [
      '完整路线分析页 PRD（V2',
      '高密度特殊页面豁免',
      '活动详情页（更新）',
      '完整路线分析页',
      '显示 / 隐藏规则',
      '验收标准',
      '骑行走向',
      '爬升变化',
      '关键地名备注',
      '补给方案',
      '卫生间坐标',
      '真实数据展示规则',
      '字段级隐藏',
      '整模块隐藏',
      '不得伪造',
    ])
      expect(prd).toContain(marker);
    for (const hidden of [
      '实时天气模块',
      '交通事件模块',
      '外部增强能力状态卡',
      '数据来源与质量卡',
      '"坐标复制"',
      '"下载 GPX"',
    ])
      expect(prd).toContain(hidden);
    expect(prd).toContain('#0f766e');
    expect(prd).toContain('#d64520');
    expect(prd).toContain('#d4a017');
    expect(prd).toContain('#4b7aa8');
    expect(prd).toContain('375 × 812');
    expect(prd).toContain('390 × 844');
  });

  it('发布说明使用当日递增版本并保留唯一 latest', () => {
    const release = read('miniprogram/config/release.ts');
    const notes = read('miniprogram/pages/settings/index.ts');
    expect(release).toContain('2026.10.17.79');
    expect(notes).toContain("date: '2026-10-17'");
    expect(notes).toContain("title: '完整路线分析更快更稳'");
    expect(notes.match(/latest: true/g)).toHaveLength(1);
    expect(notes).toContain('地图显示失败时保留核心路线数据并支持重试');
    expect(notes).toContain('标记、海拔锚点、关键点和分段可同步联动');
  });
});
