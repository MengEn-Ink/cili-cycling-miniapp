import type { Activity } from '../../models';

function lines(
  context: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  let line = '';
  let top = y;
  for (const char of text) {
    const next = line + char;
    if (line && context.measureText(next).width > maxWidth) {
      context.fillText(line, x, top);
      line = char;
      top += lineHeight;
    } else line = next;
  }
  if (line) context.fillText(line, x, top);
  return top;
}

export function drawActivityPoster(
  context: any,
  width: number,
  height: number,
  activity: Activity,
): boolean {
  if (!context || !activity || width <= 0 || height <= 0) return false;
  context.fillStyle = '#0b0b0c';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#ff5722';
  context.fillRect(0, 0, width, 12);
  context.fillStyle = '#f7f7f5';
  context.font = 'bold 30px sans-serif';
  const titleBottom = lines(context, activity.title || '骑行活动', 28, 72, width - 56, 40);
  context.font = '18px sans-serif';
  context.fillStyle = '#d0d0d2';
  context.fillText(`时间  ${activity.startAt || activity.date || '待公布'}`, 28, titleBottom + 54);
  context.fillText(`地点  ${activity.route?.start || '待公布'}`, 28, titleBottom + 90);
  context.fillStyle = '#f7f7f5';
  context.font = 'bold 20px sans-serif';
  context.fillText('路线摘要', 28, titleBottom + 148);
  context.font = '17px sans-serif';
  context.fillStyle = '#d0d0d2';
  lines(
    context,
    `${activity.route?.start || '起点'} → ${activity.route?.end || '终点'} · ${activity.route?.distanceKm || 0} km · 爬升 ${activity.route?.elevationM || 0} m`,
    28,
    titleBottom + 182,
    width - 56,
    30,
  );
  context.fillStyle = '#242427';
  context.fillRect(28, height - 128, width - 56, 84);
  context.fillStyle = '#ff5722';
  context.font = 'bold 18px sans-serif';
  context.fillText('微信搜索「此里」小程序进入活动', 48, height - 78);
  return true;
}
