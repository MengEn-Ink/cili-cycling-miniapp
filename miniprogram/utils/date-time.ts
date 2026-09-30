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

export function formatChinaDateTime(value?: string): string {
  if (!value) return '';
  const date = chinaDate(value);
  if (!date) return '';
  return `${formatChinaDate(value)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
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
