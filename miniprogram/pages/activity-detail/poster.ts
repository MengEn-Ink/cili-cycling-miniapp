import type { Activity } from '../../models';

export interface ActivityPosterOptions {
  displayTime: string;
  locationName: string;
  locationAddress?: string;
  approvedCount: number;
  attendeeNames: string[];
  groupQrImage: any;
}

function fitEllipsis(context: any, text: string, maxWidth: number) {
  const visibleChars = Array.from(text);
  while (visibleChars.length && context.measureText(`${visibleChars.join('')}…`).width > maxWidth) {
    visibleChars.pop();
  }
  return `${visibleChars.join('')}…`;
}

function lines(
  context: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
) {
  let line = '';
  let top = y;
  let count = 0;
  const content = String(text || '').trim();
  for (const char of content) {
    const next = line + char;
    if (line && context.measureText(next).width > maxWidth) {
      context.fillText(
        count + 1 === maxLines ? fitEllipsis(context, line, maxWidth) : line,
        x,
        top,
      );
      count += 1;
      if (count >= maxLines) return top;
      line = char;
      top += lineHeight;
    } else line = next;
  }
  if (line && count < maxLines) context.fillText(line, x, top);
  return top;
}

function cleanList(values?: string[]) {
  return Array.isArray(values)
    ? values.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
}

export function drawActivityPoster(
  context: any,
  width: number,
  height: number,
  activity: Activity,
  options: ActivityPosterOptions,
): boolean {
  if (!context || !activity || !options?.groupQrImage || width <= 0 || height <= 0) return false;

  const left = 28;
  const contentWidth = width - left * 2;
  context.fillStyle = '#f4f1eb';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#ff5a1f';
  context.fillRect(0, 0, width, 14);

  context.fillStyle = '#111111';
  context.font = 'bold 13px sans-serif';
  context.fillText('此里 · 骑行活动', left, 48);
  context.font = 'bold 31px sans-serif';
  const titleBottom = lines(context, activity.title || '骑行活动', left, 92, contentWidth, 38, 2);

  const timeTop = titleBottom + 28;
  context.fillStyle = '#111111';
  context.fillRect(left, timeTop, contentWidth, 86);
  context.fillStyle = '#ff7a42';
  context.font = 'bold 12px sans-serif';
  context.fillText('集合时间', left + 18, timeTop + 24);
  context.fillStyle = '#ffffff';
  context.font = 'bold 22px sans-serif';
  lines(
    context,
    options.displayTime || '待公布',
    left + 18,
    timeTop + 57,
    contentWidth - 36,
    26,
    1,
  );

  let cursor = timeTop + 122;
  context.fillStyle = '#7a756f';
  context.font = '12px sans-serif';
  context.fillText('集合地点', left, cursor);
  context.fillStyle = '#111111';
  context.font = 'bold 18px sans-serif';
  cursor =
    lines(context, options.locationName || '待公布', left, cursor + 28, contentWidth, 24, 2) + 36;
  if (options.locationAddress && options.locationAddress !== options.locationName) {
    context.fillStyle = '#6b6762';
    context.font = '12px sans-serif';
    cursor = lines(context, options.locationAddress, left, cursor, contentWidth, 18, 1) + 30;
  }

  const routeBits = [
    activity.route?.distanceKm ? `${activity.route.distanceKm} km` : '',
    activity.route?.elevationM ? `爬升 ${activity.route.elevationM} m` : '',
    activity.route?.level || '',
  ].filter(Boolean);
  if (routeBits.length) {
    context.fillStyle = '#111111';
    context.font = 'bold 14px sans-serif';
    context.fillText(routeBits.join('  ·  '), left, cursor);
    cursor += 30;
  }

  const description = String(activity.description || '').trim();
  if (description) {
    context.fillStyle = '#6b6762';
    context.font = '13px sans-serif';
    cursor = lines(context, description, left, cursor, contentWidth, 20, 2) + 34;
  }

  const qrSize = 126;
  const qrX = width - left - qrSize;
  const qrY = height - 176;
  const attendeeTextWidth = Math.max(0, qrX - left - 16);
  const names = cleanList(options.attendeeNames);
  context.fillStyle = '#111111';
  context.font = 'bold 14px sans-serif';
  context.fillText(`已通过 ${Math.max(0, options.approvedCount || 0)} 人`, left, cursor);
  if (names.length && attendeeTextWidth > 0) {
    context.fillStyle = '#6b6762';
    context.font = '12px sans-serif';
    // 报名名单限定在二维码左侧单行区域，避免长昵称覆盖群二维码。
    lines(context, names.slice(0, 6).join('、'), left, cursor + 24, attendeeTextWidth, 18, 1);
  }

  context.fillStyle = '#ffffff';
  context.fillRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
  context.drawImage(options.groupQrImage, qrX, qrY, qrSize, qrSize);
  context.fillStyle = '#111111';
  context.font = 'bold 15px sans-serif';
  context.fillText('扫码加入活动群', left, height - 116);
  context.fillStyle = '#6b6762';
  context.font = '12px sans-serif';
  context.fillText('报名通过后进群，接收出发通知', left, height - 92);
  context.fillStyle = '#ff5a1f';
  context.fillRect(left, height - 52, 54, 4);
  context.fillStyle = '#111111';
  context.font = 'bold 12px sans-serif';
  context.fillText('骑在一起，才是此里', left, height - 30);
  return true;
}
