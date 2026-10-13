'use strict';

const SECURITY_HEADERS = Object.freeze({
  'cache-control': 'public, max-age=300',
  'content-security-policy': [
    "default-src 'none'",
    'script-src https://strava-embeds.com',
    "style-src 'unsafe-inline' https://strava-embeds.com",
    'img-src https: data:',
    'font-src https: data:',
    'frame-src https://strava-embeds.com https://www.strava.com',
    'connect-src https://strava-embeds.com https://www.strava.com',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    'frame-ancestors *',
  ].join('; '),
  'content-disposition': 'inline',
  'content-type': 'text/html; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
});

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <title>${title}</title>
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #fff; color: #10120f; }
      main { width: min(100%, 760px); margin: 0 auto; padding: 16px 16px calc(24px + env(safe-area-inset-bottom)); }
      .fallback { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; border-bottom: 1px solid #d9ddd6; font-size: 14px; }
      .fallback a { flex: 0 0 auto; color: #c84218; font-weight: 700; }
      .message { padding: 48px 0; font-size: 17px; font-weight: 700; text-align: center; }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: SECURITY_HEADERS,
    body,
    isBase64Encoded: false,
  };
}

function routeId(event) {
  const value = event?.queryStringParameters?.id;
  return typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value) ? value : '';
}

async function main(event = {}) {
  if (!['/', '/route/embed'].includes(event.path))
    return response(404, htmlPage('页面不存在', '<div class="message">页面不存在</div>'));
  const id = routeId(event);
  if (!id)
    return response(
      400,
      htmlPage('路线链接无效', '<div class="message">路线链接无效，请返回活动后重试</div>'),
    );
  const officialUrl = `https://www.strava.com/routes/${id}`;
  return response(
    200,
    htmlPage(
      'Strava 官方路线',
      `<div class="fallback"><span>路线无法显示时</span><a href="${officialUrl}" target="_blank" rel="noreferrer">在 Strava 查看</a></div>
      <div class="strava-embed-placeholder" data-embed-type="route" data-embed-id="${id}"></div>
      <script src="https://strava-embeds.com/embed.js"></script>`,
    ),
  );
}

module.exports = { main };
