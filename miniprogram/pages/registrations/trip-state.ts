import { formatActivityTime } from '../../utils/date-time';

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface TripActivitySummary {
  date?: string;
  startAt?: string;
  schedule?: { time?: string; title?: string; location?: string }[];
  route?: { start?: string };
}

function archiveAt(endAt?: string): number | null {
  if (!endAt) return null;
  const instant = new Date(endAt);
  if (!Number.isFinite(instant.getTime())) return null;
  const chinaTime = new Date(instant.getTime() + CHINA_OFFSET_MS);
  const chinaDayStartUtc = Date.UTC(
    chinaTime.getUTCFullYear(),
    chinaTime.getUTCMonth(),
    chinaTime.getUTCDate(),
  );
  // 行程凭证在活动结束当天仍有效，到中国时间次日 0 点才统一归档。
  return chinaDayStartUtc + DAY_MS - CHINA_OFFSET_MS;
}

export function isTripArchived(endAt?: string, now: Date = new Date()): boolean {
  const cutoff = archiveAt(endAt);
  return cutoff !== null && now.getTime() >= cutoff;
}

export function buildTripMeetingInfo(activity: TripActivitySummary) {
  const routeLocation = activity.route?.start?.trim();
  // 新活动以路线起点为正式集合地点；旧活动缺少该字段时才兼容日程首个地点。
  const legacyScheduleLocation = activity.schedule
    ?.find((item) => item.location?.trim())
    ?.location?.trim();
  return {
    time: formatActivityTime(activity.startAt || activity.date),
    location: routeLocation || legacyScheduleLocation || '地点待公布',
  };
}
