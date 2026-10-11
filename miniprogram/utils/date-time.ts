const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function chinaDate(value: string): Date | null {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  return new Date(instant.getTime() + 8 * 60 * 60 * 1000);
}

export function formatChinaDate(value?: string): string {
  if (!value) return '';
  const date = chinaDate(value);
  if (!date) return '';
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

export function formatChinaDateOnly(value?: string): string {
  if (!value) return '';
  const date = chinaDate(value);
  if (!date) return '';
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function formatChinaDateTime(value?: string): string {
  if (!value) return '';
  const text = value.trim();
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (calendarDate) {
    const [, yearText, monthText, dayText] = calendarDate;
    const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
    if (
      date.getUTCFullYear() !== Number(yearText) ||
      date.getUTCMonth() !== Number(monthText) - 1 ||
      date.getUTCDate() !== Number(dayText)
    )
      return '';
    return `${yearText}-${monthText}-${dayText} 00:00:00`;
  }
  const date = chinaDate(text);
  if (!date) return '';
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function formatChinaDateTimeSeconds(value?: string): string {
  return formatChinaDateTime(value);
}

export function formatActivityDate(value?: string): string {
  if (!value) return '日期待公布';
  const text = value.trim();
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (calendarDate) {
    const year = Number(calendarDate[1]);
    const month = Number(calendarDate[2]);
    const day = Number(calendarDate[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    )
      return '日期待公布';
    return `${month}月${day}日 ${WEEKDAYS[date.getUTCDay()]}`;
  }
  const instant = new Date(text);
  if (!Number.isFinite(instant.getTime())) return '日期待公布';
  // 活动均按中国标准时间运营，固定用 UTC+8 展示，避免设备时区改变活动日历日期。
  const chinaTime = new Date(instant.getTime() + 8 * 60 * 60 * 1000);
  return `${chinaTime.getUTCMonth() + 1}月${chinaTime.getUTCDate()}日 ${WEEKDAYS[chinaTime.getUTCDay()]}`;
}

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActivityDayBucket {
  key: string;
  label: string;
}

interface ChinaDayParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

// 活动统一按中国标准时间运营，分组日界固定取 UTC+8 自然日，避免设备时区改变分组结果。
function chinaDayParts(value: Date): ChinaDayParts {
  const shifted = new Date(value.getTime() + CHINA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function chinaDayKey(parts: ChinaDayParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/**
 * 计算活动集合时间相对“现在”所属的中国自然日分组。
 * 今天/明天/后天给相对称谓，其余给「M月D日 周X」，跨年补年份；无法解析时返回 null。
 */
export function describeActivityDay(
  value?: string,
  nowValue: string | Date = new Date(),
): ActivityDayBucket | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;

  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  let target: ChinaDayParts;
  if (calendarDate) {
    const year = Number(calendarDate[1]);
    const month = Number(calendarDate[2]);
    const day = Number(calendarDate[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    )
      return null;
    target = { year, month, day, weekday: date.getUTCDay() };
  } else {
    const instant = new Date(text);
    if (!Number.isFinite(instant.getTime())) return null;
    target = chinaDayParts(instant);
  }

  const now = typeof nowValue === 'string' ? new Date(nowValue) : nowValue;
  if (!Number.isFinite(now.getTime())) return null;
  const today = chinaDayParts(now);
  const deltaDays = Math.round(
    (Date.UTC(target.year, target.month - 1, target.day) -
      Date.UTC(today.year, today.month - 1, today.day)) /
      DAY_MS,
  );

  let label: string;
  if (deltaDays === 0) label = '今天';
  else if (deltaDays === 1) label = '明天';
  else if (deltaDays === 2) label = '后天';
  else label = `${target.month}月${target.day}日 ${WEEKDAYS[target.weekday]}`;
  // 相对称谓（今天/明天）天然落在当前年附近，仅绝对日期分支在跨年时补年份。
  if (deltaDays < 0 || deltaDays > 2) {
    if (target.year !== today.year) label = `${target.year}年${label}`;
  }
  return { key: chinaDayKey(target), label };
}

export function formatLocalDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseLocalDateTime(value: string, label: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const match = DATE_TIME_PATTERN.exec(text);
  if (!match) throw new Error(`${label}必须为 yyyy-MM-dd HH:mm:ss`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  )
    throw new Error(`${label}不是有效的日期时间`);
  return date.toISOString();
}
