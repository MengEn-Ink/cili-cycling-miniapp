import type { RouteElevationPoint } from '../../../models/index';
import type { RouteSegment, SegmentType } from './route-analysis-types';

const round = (value: number, digits = 1) => Number(value.toFixed(digits));

function segmentDetails(
  start: RouteElevationPoint,
  end: RouteElevationPoint,
  ascentM: number,
  descentM: number,
  index: number,
  count: number,
): RouteSegment {
  const distance = Math.max(0, end.distanceKm - start.distanceKm);
  const rawGrade = distance ? ((end.elevationM - start.elevationM) / (distance * 1000)) * 100 : 0;
  // 极短距离上的海拔噪点会放大成数百个百分点；限幅只影响展示与难度，不改原始海拔。
  const grade = Math.max(-40, Math.min(40, rawGrade));
  const type: SegmentType =
    index === 0
      ? 'start'
      : index === count - 1
        ? 'return'
        : ascentM > descentM * 1.3
          ? 'climb'
          : descentM > ascentM * 1.3
            ? 'descent'
            : 'transition';
  const labels = {
    start: '起步',
    climb: '主爬坡',
    transition: '过渡',
    descent: '长下坡',
    return: '返程',
  };
  const strategy = {
    start: '保守起步，逐步进入稳定踏频。',
    climb: '提前补水，使用轻档维持踏频。',
    transition: '恢复呼吸，检查补给与队形。',
    descent: '控制速度，保持安全车距。',
    return: '评估余量，稳定完成返程。',
  };
  const difficulty =
    Math.abs(grade) >= 4 || ascentM >= 250
      ? '挑战'
      : Math.abs(grade) >= 2 || ascentM >= 100
        ? '适中'
        : '轻松';
  return {
    id: `segment-${index + 1}`,
    type,
    name: labels[type],
    startKm: round(start.distanceKm),
    endKm: round(end.distanceKm),
    ascentM: Math.round(ascentM),
    descentM: Math.round(descentM),
    gradePercent: round(grade),
    difficulty,
    strategy: strategy[type],
  };
}

export function deriveRouteSegments(
  profile: RouteElevationPoint[],
  distanceKm: number,
): RouteSegment[] {
  if (profile.length < 2) {
    const cuts =
      distanceKm < 8 ? [0, distanceKm] : [0, distanceKm * 0.18, distanceKm * 0.78, distanceKm];
    return cuts.slice(0, -1).map((start, index) => ({
      id: `segment-${index + 1}`,
      type: index === 0 ? 'start' : index === cuts.length - 2 ? 'return' : 'transition',
      name: index === 0 ? '起步' : index === cuts.length - 2 ? '返程' : '巡航',
      startKm: round(start),
      endKm: round(cuts[index + 1]),
      ascentM: null,
      descentM: null,
      gradePercent: null,
      difficulty: '轻松',
      strategy: '按体感控制节奏；缺少海拔剖面，坡度不可用。',
    }));
  }
  const groupSize = Math.max(1, Math.ceil((profile.length - 1) / 6));
  const segments: RouteSegment[] = [];
  for (let startIndex = 0; startIndex < profile.length - 1; startIndex += groupSize) {
    const endIndex = Math.min(profile.length - 1, startIndex + groupSize);
    let ascent = 0;
    let descent = 0;
    for (let index = startIndex + 1; index <= endIndex; index += 1) {
      const delta = profile[index].elevationM - profile[index - 1].elevationM;
      if (delta > 0) ascent += delta;
      else descent -= delta;
    }
    segments.push(
      segmentDetails(
        profile[startIndex],
        profile[endIndex],
        ascent,
        descent,
        segments.length,
        Math.ceil((profile.length - 1) / groupSize),
      ),
    );
  }
  return segments.slice(0, 6);
}

export function formatRouteDuration(seconds?: number): string {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return '';
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`.replace('0 小时 ', '');
}
