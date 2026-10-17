import { rideService } from '../../services/ride-service';
import { hasAnalyzableRoute } from '../../utils/route-outline';
import { ROUTE_VISUAL_STYLE } from '../../utils/route-visual';
import {
  deriveRouteAnalysis,
  type RouteAnalysis,
  type RouteKeyPoint,
  type RouteSegment,
} from './utils/route-analysis';
import { drawRouteAnalysisElevation } from './utils/route-analysis-chart';
import { routeAnalysisForMap } from './utils/gcj02';

const SELECTED_COLOR = '#211f1c';
const POINT_LABELS = {
  start: { type: '起点', purpose: '路线出发位置', marker: '起', color: '#16633a', size: 30 },
  end: { type: '终点', purpose: '路线完成位置', marker: '终', color: '#c0321f', size: 30 },
  highest: {
    type: '最高点',
    purpose: '全程海拔最高位置',
    marker: '高',
    color: '#7a5c00',
    size: 28,
  },
  climb: {
    type: '主爬坡',
    purpose: '连续爬升的节奏切换位置',
    marker: '爬',
    color: '#c0321f',
    size: 25,
  },
  descent: {
    type: '长下坡',
    purpose: '连续下降的控速起始位置',
    marker: '下',
    color: '#315d78',
    size: 25,
  },
  rest: {
    type: '节奏点',
    purpose: '按里程安排的状态检查位置',
    marker: '休',
    color: '#6f675d',
    size: 22,
  },
} as const;

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
      {
        points: base,
        color: ROUTE_VISUAL_STYLE.routeColor,
        width: ROUTE_VISUAL_STYLE.routeWidth,
        arrowLine: true,
        borderColor: '#ffffff',
        borderWidth: 2,
      },
      ...(selected.length > 1
        ? [{ points: selected, color: SELECTED_COLOR, width: 9, arrowLine: true }]
        : []),
    ],
  };
}

function viewPoint(point: RouteKeyPoint, index: number) {
  const hasCoordinate = point.lat !== null && point.lng !== null;
  const labels = POINT_LABELS[point.type];
  return {
    ...point,
    markerId: index + 1,
    typeLabel: labels.type,
    shortType: labels.type.slice(0, 1),
    markerLabel: labels.marker,
    markerColor: labels.color,
    markerSize: labels.size,
    purpose: labels.purpose,
    kmText: `${point.km.toFixed(1)} km`,
    hasElevation: point.elevation !== null,
    elevationText: point.elevation === null ? '' : `${Math.round(point.elevation)} m`,
    hasGrade: point.gradePercent !== null,
    gradeText:
      point.gradePercent === null
        ? ''
        : `${point.gradePercent > 0 ? '+' : ''}${point.gradePercent.toFixed(1)}%`,
    coordinateText: hasCoordinate ? `${point.lat!.toFixed(6)}, ${point.lng!.toFixed(6)}` : '',
    hasCoordinate,
  };
}

function viewSegment(segment: RouteSegment) {
  return {
    ...segment,
    rangeText: `${segment.startKm.toFixed(1)}–${segment.endKm.toFixed(1)} km`,
    hasChange: segment.ascentM !== null,
    changeText:
      segment.ascentM === null ? '' : `爬升 ${segment.ascentM} m · 下降 ${segment.descentM} m`,
    hasGrade: segment.gradePercent !== null,
    gradeText:
      segment.gradePercent === null
        ? ''
        : `${segment.gradePercent > 0 ? '+' : ''}${segment.gradePercent.toFixed(1)}%`,
  };
}

function markerFor(point: ReturnType<typeof viewPoint>, selectedId: string) {
  const selected = point.id === selectedId;
  const size = selected ? point.markerSize + 8 : point.markerSize;
  return {
    id: point.markerId,
    latitude: point.lat,
    longitude: point.lng,
    width: size,
    height: size,
    zIndex: selected ? 99 : point.markerSize,
    iconPath: '/assets/brand/logo-circle-144.png',
    label: {
      content: point.markerLabel,
      color: '#ffffff',
      fontSize: selected ? 12 : 10,
      anchorX: selected ? -7 : -6,
      anchorY: selected ? -25 : -21,
      bgColor: point.markerColor,
      borderRadius: 8,
      padding: 3,
    },
    callout: {
      content: `${point.name}\n${point.kmText}`,
      color: selected ? '#ffffff' : '#211f1c',
      bgColor: selected ? SELECTED_COLOR : '#ffffff',
      borderColor: selected ? SELECTED_COLOR : '#9a9186',
      borderWidth: 1,
      borderRadius: 8,
      padding: 7,
      fontSize: 11,
      display: selected ? 'ALWAYS' : 'BYCLICK',
    },
  };
}

Page({
  activityId: '',
  analysis: null as RouteAnalysis | null,
  unloaded: false,
  inactive: false,
  loadRequestId: 0,
  loadPromise: null as Promise<void> | null,
  data: {
    loading: true,
    error: '',
    empty: false,
    activityTitle: '',
    routeTitle: '',
    routeSummary: '',
    overviewItems: [] as any[],
    strategySummary: [] as string[],
    risks: [] as string[],
    profileAvailable: false,
    keyPoints: [] as ReturnType<typeof viewPoint>[],
    segments: [] as ReturnType<typeof viewSegment>[],
    equipment: [] as string[],
    selectedPoint: null as ReturnType<typeof viewPoint> | null,
    selectedPointId: '',
    selectedSegmentId: '',
    markers: [] as any[],
    mapPoints: [] as any[],
    polylines: [] as any[],
    mapAvailable: false,
    mapFailed: false,
    mapRenderKey: 0,
    mapFocused: false,
    mapScale: 12,
    mapLatitude: 39.9,
    mapLongitude: 116.4,
  },
  onLoad(query: { id?: string }) {
    this.unloaded = false;
    this.inactive = false;
    this.activityId = typeof query.id === 'string' ? query.id : '';
    void this.load();
  },
  onShow() {
    this.inactive = false;
    if (!this.analysis && this.activityId) void this.load();
    else this.drawElevation();
  },
  onReady() {
    this.drawElevation();
  },
  onHide() {
    this.inactive = true;
    this.loadRequestId += 1;
    this.loadPromise = null;
  },
  onUnload() {
    this.unloaded = true;
    this.inactive = true;
    this.loadRequestId += 1;
    this.loadPromise = null;
    this.analysis = null;
  },
  safeSetData(value: Record<string, unknown>, callback?: () => void) {
    if (!this.unloaded && !this.inactive) this.setData(value, callback);
  },
  load() {
    if (this.loadPromise) return this.loadPromise;
    const requestId = ++this.loadRequestId;
    const request = this.performLoad(requestId).finally(() => {
      if (this.loadPromise === request) this.loadPromise = null;
    });
    this.loadPromise = request;
    return request;
  },
  isCurrentRequest(requestId: number) {
    return !this.unloaded && !this.inactive && requestId === this.loadRequestId;
  },
  async performLoad(requestId: number) {
    this.safeSetData({ loading: true, error: '', empty: false });
    try {
      if (!this.activityId) throw new Error('缺少活动 ID');
      const activity = await rideService.getActivity(this.activityId);
      if (!this.isCurrentRequest(requestId)) return;
      if (!activity) throw new Error('活动不存在或暂不可见');
      if (!hasAnalyzableRoute(activity.route)) {
        this.safeSetData({ empty: true, activityTitle: activity.title });
        return;
      }
      const sourceAnalysis = deriveRouteAnalysis(activity.route);
      const preserveKeyPointIds = [
        ...(Number.isFinite(activity.route.startLocation?.latitude) &&
        Number.isFinite(activity.route.startLocation?.longitude)
          ? ['start']
          : []),
        ...(Number.isFinite(activity.route.endLocation?.latitude) &&
        Number.isFinite(activity.route.endLocation?.longitude)
          ? ['end']
          : []),
      ];
      const analysis = routeAnalysisForMap(
        sourceAnalysis,
        Boolean(activity.route.gpxFileId),
        preserveKeyPointIds,
      );
      this.analysis = analysis;
      const keyPoints = analysis.keyPoints.map(viewPoint);
      const selectedPoint = keyPoints.find((point) => point.hasCoordinate) || keyPoints[0] || null;
      const overviewItems = [
        ...(analysis.overview.distanceKm > 0
          ? [{ value: analysis.overview.distanceKm, unit: 'km', label: '总距离' }]
          : []),
        ...(analysis.overview.ascentM !== null
          ? [{ value: analysis.overview.ascentM, unit: 'm', label: '累计爬升' }]
          : []),
        ...(analysis.overview.highestM !== null
          ? [{ value: analysis.overview.highestM, unit: 'm', label: '最高点' }]
          : []),
        ...(analysis.overview.durationText
          ? [{ value: analysis.overview.durationText, unit: '', label: '预计骑行' }]
          : []),
      ];
      const firstCoordinate = keyPoints.find((point) => point.hasCoordinate);
      this.safeSetData(
        {
          activityTitle: activity.title,
          routeTitle:
            activity.route.routeName ||
            [activity.route.start, activity.route.end].filter(Boolean).join(' → ') ||
            '活动路线',
          routeSummary: [activity.route.start, activity.route.end].filter(Boolean).join(' → '),
          overviewItems,
          strategySummary: analysis.strategySummary,
          risks: analysis.risks,
          profileAvailable: analysis.profile.length > 1,
          keyPoints,
          segments: analysis.segments.map(viewSegment),
          equipment: analysis.equipment,
          selectedPoint,
          selectedPointId: selectedPoint?.id || '',
          markers: keyPoints
            .filter((point) => point.hasCoordinate)
            .map((point) => markerFor(point, selectedPoint?.id || '')),
          mapAvailable: analysis.outline.length > 1,
          mapFailed: false,
          mapFocused: false,
          mapScale: 12,
          mapLatitude: firstCoordinate?.lat || analysis.outline[0]?.latitude || 39.9,
          mapLongitude: firstCoordinate?.lng || analysis.outline[0]?.longitude || 116.4,
          ...mapState(analysis),
        },
        () => this.drawElevation(),
      );
    } catch (error) {
      if (!this.isCurrentRequest(requestId)) return;
      this.safeSetData({ error: error instanceof Error ? error.message : '路线分析加载失败' });
    } finally {
      if (this.isCurrentRequest(requestId)) this.safeSetData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
  mapError() {
    if (!this.data.mapAvailable) return;
    this.safeSetData({ mapAvailable: false, mapFailed: true });
  },
  retryMap() {
    if (!this.analysis || this.analysis.outline.length < 2) return;
    this.safeSetData({
      mapFailed: false,
      mapAvailable: true,
      mapRenderKey: this.data.mapRenderKey + 1,
    });
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
    if (!point || !this.analysis) return;
    this.safeSetData(
      {
        selectedPoint: point,
        selectedPointId: point.id,
        selectedSegmentId: '',
        markers: this.data.keyPoints
          .filter((item: ReturnType<typeof viewPoint>) => item.hasCoordinate)
          .map((item: ReturnType<typeof viewPoint>) => markerFor(item, point.id)),
        ...mapState(this.analysis),
        mapFocused: point.hasCoordinate,
        mapScale: point.hasCoordinate ? 15 : 12,
        mapPoints: point.hasCoordinate ? [] : this.data.mapPoints,
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
    if (!segment || !this.analysis || !this.data.keyPoints.length) return;
    const middle = (segment.startKm + segment.endKm) / 2;
    const nearest = this.data.keyPoints.reduce(
      (best: ReturnType<typeof viewPoint>, point: ReturnType<typeof viewPoint>) =>
        Math.abs(point.km - middle) < Math.abs(best.km - middle) ? point : best,
    );
    const selectedOutline = segmentOutline(this.analysis, segment).map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));
    this.safeSetData(
      {
        selectedSegmentId: segment.id,
        selectedPoint: nearest,
        selectedPointId: nearest.id,
        markers: this.data.keyPoints
          .filter((item: ReturnType<typeof viewPoint>) => item.hasCoordinate)
          .map((item: ReturnType<typeof viewPoint>) => markerFor(item, nearest.id)),
        ...mapState(this.analysis, segment),
        mapFocused: selectedOutline.length > 1,
        mapScale: selectedOutline.length > 1 ? 13 : 12,
        mapPoints: selectedOutline,
        ...(nearest.hasCoordinate ? { mapLatitude: nearest.lat, mapLongitude: nearest.lng } : {}),
      },
      () => this.drawElevation(),
    );
  },
  showFullRoute() {
    if (!this.analysis || this.analysis.outline.length < 2) return;
    const middle = this.analysis.outline[Math.floor(this.analysis.outline.length / 2)];
    this.safeSetData({
      selectedSegmentId: '',
      mapFocused: false,
      mapScale: 12,
      mapLatitude: middle.latitude,
      mapLongitude: middle.longitude,
      ...mapState(this.analysis),
    });
  },
  drawElevation() {
    if (this.unloaded || this.inactive || !this.analysis || !this.data.profileAvailable) return;
    wx.createSelectorQuery()
      .select('#route-analysis-elevation')
      .fields({ node: true, size: true })
      .exec((result: any[]) => {
        if (this.unloaded || this.inactive) return;
        const target = result?.[0];
        if (!target?.node || !target.width || !target.height || !this.analysis) return;
        const deviceRatio =
          wx.getWindowInfo?.().pixelRatio || wx.getSystemInfoSync?.().pixelRatio || 1;
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
