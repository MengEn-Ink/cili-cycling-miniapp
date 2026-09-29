'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let http = {};
try {
  http = require('./http');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND' || !error.message.includes("'./http'")) throw error;
}

const callback = require('./index');

test('redirect303 returns a query-free 303 response without OAuth data', () => {
  assert.equal(typeof http.redirect303, 'function', 'redirect303 must exist');

  const redirect = http.redirect303('https://example.com/strava/success');

  assert.equal(redirect.statusCode, 303);
  assert.equal(redirect.headers.location, 'https://example.com/strava/success');
  assert.equal(redirect.headers['cache-control'], 'no-store');
  assert.equal(redirect.headers['referrer-policy'], 'no-referrer');
  assert.equal(redirect.body, '');
  assert.doesNotMatch(JSON.stringify(redirect), /code-secret|state-secret|openid/);
});

test('resultLocation replaces the callback path and strips query and fragment', () => {
  assert.equal(typeof http.resultLocation, 'function', 'resultLocation must exist');

  assert.equal(
    http.resultLocation(
      'https://example.com/strava/callback?code=code-secret&state=state-secret#oauth',
      true,
    ),
    'https://example.com/strava/success',
  );
  assert.equal(
    http.resultLocation(
      'https://example.com/strava/callback?code=code-secret&state=state-secret#oauth',
      false,
    ),
    'https://example.com/strava/failure',
  );
});

test('renderResultPage uses a nonce-only CSP and the official Weixin bridge', () => {
  assert.equal(typeof http.renderResultPage, 'function', 'renderResultPage must exist');

  const page = http.renderResultPage({ success: true, nonce: 'nonce-123' });
  const csp = page.headers['content-security-policy'];

  assert.equal(page.statusCode, 200);
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /style-src 'nonce-nonce-123'/);
  assert.match(csp, /script-src 'nonce-nonce-123' https:\/\/res\.wx\.qq\.com/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.match(
    page.body,
    /<script nonce="nonce-123" src="https:\/\/res\.wx\.qq\.com\/open\/js\/jweixin-1\.6\.0\.js"><\/script>/,
  );
  assert.match(page.body, /<button id="back"/);
  assert.match(page.body, /wx\.miniProgram\.navigateBack\(\{delta:1\}\)/);
  assert.match(page.body, /setTimeout\(go,800\)/);
  assert.doesNotMatch(page.body, /code-secret|state-secret|openid/);

  const failure = http.renderResultPage({ success: false, nonce: 'nonce-456' });
  assert.equal(failure.statusCode, 400);
  assert.match(failure.body, /绑定失败/);
  assert.match(failure.body, /nonce="nonce-456"/);
});

test('handler redirects then renders fixed pages without leaking OAuth query values', async () => {
  assert.equal(typeof callback.createHandler, 'function', 'createHandler must exist');

  const handled = [];
  const handler = callback.createHandler({
    callbackUrl: 'https://example.com/strava/callback',
    handleCallback: async (query) => handled.push(query),
    randomNonce: () => 'handler-nonce',
    logger: { error: () => assert.fail('success must not be logged as an error') },
  });
  const event = {
    path: '/strava/callback',
    queryStringParameters: { code: 'code-secret', state: 'state-secret' },
  };

  const redirect = await handler(event);
  assert.deepEqual(handled, [{ code: 'code-secret', state: 'state-secret' }]);
  assert.equal(redirect.statusCode, 303);
  assert.equal(redirect.headers.location, 'https://example.com/strava/success');
  assert.doesNotMatch(JSON.stringify(redirect), /code-secret|state-secret/);

  const page = await handler({
    path: '/strava/success',
    queryStringParameters: { code: 'code-secret', state: 'state-secret' },
  });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /handler-nonce/);
  assert.doesNotMatch(JSON.stringify(page), /code-secret|state-secret/);
});

test('handler logs only a stable error code and redirects to the failure page', async () => {
  assert.equal(typeof callback.createHandler, 'function', 'createHandler must exist');

  const logs = [];
  const handler = callback.createHandler({
    callbackUrl: 'https://example.com/strava/callback',
    handleCallback: async () => {
      throw new Error('exchange failed for code-secret and state-secret');
    },
    randomNonce: () => 'handler-nonce',
    logger: { error: (...parts) => logs.push(parts) },
  });

  const redirect = await handler({
    path: '/strava/callback',
    queryStringParameters: { code: 'code-secret', state: 'state-secret' },
  });

  assert.equal(redirect.statusCode, 303);
  assert.equal(redirect.headers.location, 'https://example.com/strava/failure');
  assert.doesNotMatch(JSON.stringify(redirect), /code-secret|state-secret/);
  assert.deepEqual(logs, [['strava_callback_failed', { code: 'INTERNAL_ERROR' }]]);
  assert.doesNotMatch(JSON.stringify(logs), /code-secret|state-secret|exchange failed/);
});

test('CloudBase exposes fixed success and failure result routes', () => {
  const { gateway } = require('../../cloudbaserc.json');
  const callbackRoutes = gateway.routes.filter(
    (route) => route.target === 'function:strava-callback',
  );

  for (const path of ['/strava/success', '/strava/failure']) {
    assert.deepEqual(
      callbackRoutes.find((route) => route.path === path),
      {
        path,
        target: 'function:strava-callback',
        enableAuth: false,
        domain: '*',
      },
    );
  }
});
