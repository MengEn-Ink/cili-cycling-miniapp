import type { RouteCoordinate, RouteElevationPoint } from '../../../models/index';

export type KeyPointType = 'start' | 'end' | 'highest' | 'climb' | 'descent' | 'rest';
export type SegmentType = 'start' | 'climb' | 'transition' | 'descent' | 'return';

export interface RouteKeyPoint {
  id: string;
  type: KeyPointType;
  name: string;
  km: number;
  elevation: number | null;
  lat: number | null;
  lng: number | null;
  source: '活动路线' | '海拔剖面规则' | '距离规则';
  confidence: '高' | '中' | '低';
  note: string;
}

export interface RouteSegment {
  id: string;
  type: SegmentType;
  name: string;
  startKm: number;
  endKm: number;
  ascentM: number | null;
  descentM: number | null;
  gradePercent: number | null;
  difficulty: '轻松' | '适中' | '挑战';
  strategy: string;
}

export interface RouteAnalysis {
  overview: { distanceKm: number; ascentM: number; highestM: number | null; durationText: string };
  profile: RouteElevationPoint[];
  outline: RouteCoordinate[];
  keyPoints: RouteKeyPoint[];
  segments: RouteSegment[];
  strategySummary: string[];
  equipment: string[];
  quality: string[];
}
