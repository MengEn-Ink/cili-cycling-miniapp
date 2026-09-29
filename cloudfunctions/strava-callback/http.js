'use strict';

function redirect303(location) {
  return {
    statusCode: 303,
    headers: {
      location,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
    body: '',
  };
}

function resultLocation(callbackUrl, success) {
  const url = new URL(callbackUrl);
  url.pathname = success ? '/strava/success' : '/strava/failure';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function renderResultPage({ success, nonce }) {
  const title = success ? '绑定成功' : '绑定失败';
  const csp = [
    "default-src 'none'",
    "style-src 'nonce-" + nonce + "'",
    "script-src 'nonce-" + nonce + "' https://res.wx.qq.com",
    "img-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    statusCode: success ? 200 : 400,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': csp,
      'referrer-policy': 'no-referrer',
    },
    body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style nonce="${nonce}">body{font-family:sans-serif;padding:32px;color:#173c2d}button{min-height:44px}</style><h2>${title}</h2><p>${success ? '数据将自动准备。' : '请返回小程序查看原因并重试。'}</p><button id="back">返回小程序</button><script nonce="${nonce}" src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js"></script><script nonce="${nonce}">const go=()=>window.wx&&wx.miniProgram&&wx.miniProgram.navigateBack({delta:1});document.getElementById('back').addEventListener('click',go);setTimeout(go,800);</script>`,
  };
}

module.exports = { redirect303, resultLocation, renderResultPage };
