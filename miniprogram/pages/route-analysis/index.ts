import { rideService } from '../../services/ride-service';
import {
  deriveRouteAnalysis,
  hasAnalyzableRoute,
  type RouteAnalysis,
  type RouteKeyPoint,
  type RouteSegment,
} from '../../utils/route-analysis';
import { drawRouteAnalysisElevation } from '../../utils/route-analysis-chart';

const ROUTE_COLOR = '#c0321f';
const SELECTED_COLOR = '#211f1c';

function segmentOutline(analysis: RouteAnalysis, segment?: RouteSegment | null) {
  if (!segment || analysis.outline.length < 2 || analysis.overview.distanceKm <= 0) return [];
  const last = analysis.outline.length - 1;
  const start = Math.floor((segment.startKm / analysis.overview.distanceKm) * last);
  const end = Math.ceil((segment.endKm / analysis.overview.distanceKm) * last);
  return analysis.outline.slice(Math.max(0, start), Math.min(last, end) + 1);
}

function mapState(analysis: RouteAnalysis, selectedSegment?: RouteSegment | null) {
  const base = analysis.outline.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  const selected = segmentOutline(analysis, selectedSegment);
  return {
    mapPoints: base,
    polylines: [
      { points: base, color: ROUTE_COLOR, width: 5, arrowLine: true },
      ...(selected.length > 1
        ? [{ points: selected, color: SELECTED_COLOR, width: 8, arrowLine: true }]
        : []),
    ],
  };
}

function viewPoint(point: RouteKeyPoint, index: number) {
  const hasCoordinate = point.lat !== null && point.lng !== null;
  return {
    ...point,
    markerId: index + 1,
    kmText: `km ${point.km.toFixed(1)}`,
    elevationText: point.elevation === null ? '海拔待补充' : `${Math.round(point.elevation)} m`,
    coordinateText: hasCoordinate
      ? `${point.lat!.toFixed(6)}, ${point.lng!.toFixed(6)}`
      : '坐标不可用',
    hasCoordinate,
  };
}

function viewSegment(segment: RouteSegment) {
  return {
    ...segment,
    rangeText: `${segment.startKm.toFixed(1)}–${segment.endKm.toFixed(1)} km`,
    changeText:
      segment.ascentM === null
        ? '升降数据不可用'
        : `爬升 ${segment.ascentM} m · 下降 ${segment.descentM} m`,
    gradeText: segment.gradePercent === null ? '坡度不可用' : `平均坡度 ${segment.gradePercent}%`,
  };
}

Page({
  activityId: '',
  analysis: null as RouteAnalysis | null,
  unloaded: false,
  data: {
    loading: true,
    error: '',
    empty: false,
    activityTitle: '',
    routeTitle: '',
    overviewItems: [] as any[],
    strategySummary: [] as string[],
    profileAvailable: false,
    keyPoints: [] as ReturnType<typeof viewPoint>[],
    segments: [] as ReturnType<typeof viewSegment>[],
    equipment: [] as string[],
    quality: [] as string[],
    selectedPoint: null as ReturnType<typeof viewPoint> | null,
    selectedPointId: '',
    selectedSegmentId: '',
    markers: [] as any[],
    mapPoints: [] as any[],
    polylines: [] as any[],
    mapAvailable: false,
    mapLatitude: 39.9,
    mapLongitude: 116.4,
  },
  onLoad(query: { id?: string }) {
    this.unloaded = false;
    this.activityId = typeof query.id === 'string' ? query.id : '';
    void this.load();
  },
  onReady() {
    this.drawElevation();
  },
  onUnload() {
    this.unloaded = true;
  },
  async load() {
    this.setData({ loading: true, error: '', empty: false });
    try {
      if (!this.activityId) throw new Error('缺少活动 ID');
      const activity = await rideService.getActivity(this.activityId);
      if (!activity) throw new Error('活动不存在或暂不可见');
      if (!hasAnalyzableRoute(activity.route)) {
        this.setData({ empty: true, activityTitle: activity.title });
        return;
      }
      const analysis = deriveRouteAnalysis(activity.route);
      this.analysis = analysis;
      const keyPoints = analysis.keyPoints.map(viewPoint);
      const selectedPoint = keyPoints[0] || null;
      const markers = keyPoints
        .filter((point) => point.hasCoordinate)
        .map((point) => ({
          id: point.markerId,
          latitude: point.lat,
          longitude: point.lng,
          width: point.id === selectedPoint?.id ? 32 : 24,
          height: point.id === selectedPoint?.id ? 32 : 24,
          iconPath: '/assets/brand/logo-circle-144.png',
          callout: {
            content: `${point.name}\n${point.kmText}`,
            color: '#211f1c',
            bgColor: '#ffffff',
            borderColor: '#9a9186',
            borderWidth: 1,
            borderRadius: 8,
            padding: 6,
            display: point.id === selectedPoint?.id ? 'ALWAYS' : 'BYCLICK',
          },
        }));
      const firstCoordinate = keyPoints.find((point) => point.hasCoordinate);
      this.setData(
        {
          activityTitle: activity.title,
          routeTitle:
            activity.route.routeName ||
            [activity.route.start, activity.route.end].filter(Boolean).join(' → ') ||
            '活动路线',
          overviewItems: [
            { value: analysis.overview.distanceKm || '--', unit: 'km', label: '距离' },
            { value: analysis.overview.ascentM || '--', unit: 'm', label: '累计爬升' },
            { value: analysis.overview.highestM ?? '--', unit: 'm', label: '最高海拔' },
            { value: analysis.overview.durationText, unit: '', label: '预计骑行' },
          ],
          strategySummary: analysis.strategySummary,
          profileAvailable: analysis.profile.length > 1,
          keyPoints,
          segments: analysis.segments.map(viewSegment),
          equipment: analysis.equipment,
          quality: analysis.quality,
          selectedPoint,
          selectedPointId: selectedPoint?.id || '',
          markers,
          mapAvailable: analysis.outline.length > 1,
          mapLatitude: firstCoordinate?.lat || analysis.outline[0]?.latitude || 39.9,
          mapLongitude: firstCoordinate?.lng || analysis.outline[0]?.longitude || 116.4,
          ...mapState(analysis),
        },
        () => this.drawElevation(),
      );
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '路线分析加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
  selectPoint(event: any) {
    this.applyPoint(String(event.currentTarget.dataset.id || ''));
  },
  markerTap(event: any) {
    const markerId = Number(event.detail?.markerId);
    const point = this.data.keyPoints.find(
      (item: ReturnType<typeof viewPoint>) => item.markerId === markerId,
    );
    if (point) this.applyPoint(point.id);
  },
  applyPoint(id: string) {
    const point = this.data.keyPoints.find((item: ReturnType<typeof viewPoint>) => item.id === id);
    if (!point) return;
    const markers = this.data.markers.map((marker: any) => ({
      ...marker,
      width: marker.id === point.markerId ? 32 : 24,
      height: marker.id === point.markerId ? 32 : 24,
      callout: {
        ...marker.callout,
        display: marker.id === point.markerId ? 'ALWAYS' : 'BYCLICK',
      },
    }));
    this.setData(
      {
        selectedPoint: point,
        selectedPointId: point.id,
        markers,
        ...(point.hasCoordinate ? { mapLatitude: point.lat, mapLongitude: point.lng } : {}),
      },
      () => this.drawElevation(),
    );
  },
  selectSegment(event: any) {
    const segment = this.data.segments.find(
      (item: ReturnType<typeof viewSegment>) =>
        item.id === String(event.currentTarget.dataset.id || ''),
    );
    if (!segment || !this.analysis) return;
    const middle = (segment.startKm + segment.endKm) / 2;
    const nearest = this.data.keyPoints.reduce(
      (best: ReturnType<typeof viewPoint>, point: ReturnType<typeof viewPoint>) =>
        Math.abs(point.km - middle) < Math.abs(best.km - middle) ? point : best,
    );
    const markers = this.data.markers.map((marker: any) => ({
      ...marker,
      width: marker.id === nearest.markerId ? 32 : 24,
      height: marker.id === nearest.markerId ? 32 : 24,
      callout: {
        ...marker.callout,
        display: marker.id === nearest.markerId ? 'ALWAYS' : 'BYCLICK',
      },
    }));
    this.setData(
      {
        selectedSegmentId: segment.id,
        selectedPoint: nearest,
        selectedPointId: nearest.id,
        markers,
        ...(nearest.hasCoordinate ? { mapLatitude: nearest.lat, mapLongitude: nearest.lng } : {}),
        ...mapState(this.analysis, segment),
      },
      () => this.drawElevation(),
    );
  },
  copyCoordinate() {
    const point = this.data.selectedPoint;
    if (!point?.hasCoordinate) return;
    wx.setClipboardData({
      data: `${point.lat!.toFixed(6)},${point.lng!.toFixed(6)}`,
      fail: () => wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' }),
    });
  },
  drawElevation() {
    if (!this.analysis || !this.data.profileAvailable) return;
    wx.createSelectorQuery()
      .select('#route-analysis-elevation')
      .fields({ node: true, size: true })
      .exec((result: any[]) => {
        if (this.unloaded) return;
        const target = result?.[0];
        if (!target?.node || !target.width || !target.height || !this.analysis) return;
        const deviceRatio =
          wx.getWindowInfo?.().pixelRatio || wx.getSystemInfoSync?.().pixelRatio || 1;
        // Canvas 物理尺寸保持有界时，绘制缩放必须使用同一个有效倍率，否则高分屏会被裁切。
        const ratio = Math.max(
          0.1,
          Math.min(deviceRatio, 1600 / target.width, 800 / target.height),
        );
        target.node.width = Math.round(target.width * ratio);
        target.node.height = Math.round(target.height * ratio);
        drawRouteAnalysisElevation(
          target.node.getContext('2d'),
          target.width,
          target.height,
          this.analysis.profile,
          this.analysis.keyPoints,
          {
            point: this.analysis.keyPoints.find(
              (point: RouteKeyPoint) => point.id === this.data.selectedPointId,
            ),
            segment: this.analysis.segments.find(
              (segment: RouteSegment) => segment.id === this.data.selectedSegmentId,
            ),
          },
          ratio,
        );
      });
  },
});
