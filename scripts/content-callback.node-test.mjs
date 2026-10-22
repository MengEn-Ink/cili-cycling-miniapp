import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { createAffectedPlan } from './affected-ci.mjs';
import { COLLECTIONS, DENY_RULE, INDEXES } from './bootstrap-cloudbase.mjs';
import { createCloudBaseDeployDecision } from './cloudbase-deploy-decision.mjs';
import * as functionEnv from './cloudbase-function-env.mjs';
import { CLOUD_PACKAGES } from './run-cloud-packages.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('cloudbaserc.json', root), 'utf8'));
const CALLBACK_CONFIG = Object.freeze({
  WECHAT_CALLBACK_TOKEN: 'T'.repeat(32),
  WECHAT_CALLBACK_AES_KEY: 'A'.repeat(43),
  WECHAT_APP_ID: `wx${'1'.repeat(16)}`,
});

test('content callback function and anonymous gateway route are declared together', () => {
  const callback = config.functions.find(({ name }) => name === 'content-callback');
  assert.deepEqual(
    {
      handler: callback?.handler,
      runtime: callback?.runtime,
      timeout: callback?.timeout,
      installDependency: callback?.installDependency,
    },
    {
      handler: 'index.main',
      runtime: 'Nodejs20.19',
      timeout: 10,
      installDependency: true,
    },
  );
  assert.deepEqual(
    config.gateway.routes.find(({ path }) => path === '/content/callback'),
    {
      path: '/content/callback',
      target: 'function:content-callback',
      enableAuth: false,
      enablePathTransmission: true,
      domain: '*',
    },
  );
});

test('media check ledger is private and has a stable pending-result scan index', () => {
  assert.ok(COLLECTIONS.includes('content_media_checks'));
  assert.deepEqual(DENY_RULE, { read: false, write: false });
  assert.deepEqual(
    INDEXES.find(({ name }) => name === 'content_media_checks_status_updated_id'),
    {
      collection: 'content_media_checks',
      name: 'content_media_checks_status_updated_id',
      keys: [
        ['status', 1],
        ['updated_at', 1],
        ['_id', 1],
      ],
      unique: false,
    },
  );
});

test('callback participates in cloud package, affected CI, deployment and package verification', () => {
  assert.ok(CLOUD_PACKAGES.includes('content-callback'));
  const affected = createAffectedPlan(['cloudfunctions/content-callback/index.js']);
  assert.equal(affected.mode, 'targeted');
  assert.deepEqual(affected.cloudFunctions, ['content-callback']);

  const direct = createCloudBaseDeployDecision(
    ['cloudfunctions/content-callback/index.js'],
    config,
  );
  assert.ok(direct.functions.includes('content-callback'));
  const generated = createCloudBaseDeployDecision(['scripts/prepare-cloudfunctions.mjs'], config);
  assert.ok(generated.functions.includes('content-callback'));

  const verifier = readFileSync(new URL('scripts/verify-cloud-packages.mjs', root), 'utf8');
  assert.match(
    verifier,
    /pack\('content-callback', \[[\s\S]*'callback-contract\.js'[\s\S]*'package\.json'/,
  );
  const packageJson = readFileSync(new URL('package.json', root), 'utf8');
  assert.match(packageJson, /cloudfunctions\/content-callback audit --audit-level=high/);
});

test('callback config is sourced, validated, injected and verified without repository values', () => {
  assert.deepEqual(functionEnv.CALLBACK_CONFIG_NAMES, Object.keys(CALLBACK_CONFIG));
  assert.deepEqual(functionEnv.CALLBACK_CONFIG_CONSUMERS, ['content-callback']);
  assert.equal(typeof functionEnv.resolveCallbackConfig, 'function');
  assert.deepEqual(
    functionEnv.resolveCallbackConfig(new Map([['content-callback', {}]]), CALLBACK_CONFIG),
    CALLBACK_CONFIG,
  );

  const runtime = functionEnv.createRuntimeConfig(
    {
      functions: [{ name: 'content-callback', timeout: 10 }],
    },
    new Map([['content-callback', { EXISTING: 'preserved' }]]),
    ['content-callback'],
    'same-profile-media-path-secret-32-bytes',
    Buffer.alloc(32, 7).toString('base64'),
    {},
    CALLBACK_CONFIG,
  );
  assert.deepEqual(runtime.functions[0].envVariables, {
    EXISTING: 'preserved',
    ...CALLBACK_CONFIG,
  });
  assert.deepEqual(
    functionEnv.verifyFunctionDetail(
      {
        FunctionName: 'content-callback',
        Status: 'Active',
        Environment: {
          Variables: Object.entries(CALLBACK_CONFIG).map(([Key, Value]) => ({ Key, Value })),
        },
      },
      'content-callback',
      undefined,
      undefined,
      CALLBACK_CONFIG,
    ),
    { name: 'content-callback', status: 'Active' },
  );
});

test('deployment workflow applies and reads back declarative gateway routes', async () => {
  const verifierPath = new URL('scripts/cloudbase-gateway.mjs', root);
  assert.ok(existsSync(verifierPath), 'gateway verifier must exist');
  const { verifyGatewayRoutes } = await import(verifierPath);
  assert.deepEqual(
    verifyGatewayRoutes(config, {
      Response: {
        Routes: [
          {
            Path: '/strava/callback',
            UpstreamResourceType: 'SCF',
            UpstreamResourceName: 'strava-callback',
            Enable: true,
            EnableAuth: false,
            EnablePathTransmission: true,
            Domain: '*',
          },
          {
            Path: '/content/callback',
            UpstreamResourceType: 'SCF',
            UpstreamResourceName: 'content-callback',
            Enable: true,
            EnableAuth: false,
            EnablePathTransmission: true,
            Domain: '*',
          },
        ],
      },
    }),
    [],
  );
  assert.deepEqual(
    verifyGatewayRoutes(config, {
      Routes: config.gateway.routes.map((route) => ({
        ...route,
        domain: route.path === '/content/callback' ? 'unexpected.example' : route.domain,
        enable: true,
      })),
    }),
    ['/content/callback: domain 应为 *'],
  );

  const workflow = readFileSync(new URL('.github/workflows/deploy-cloudbase.yml', root), 'utf8');
  assert.match(workflow, /WECHAT_CALLBACK_TOKEN_SOURCE:.*secrets\.WECHAT_CALLBACK_TOKEN/);
  assert.match(workflow, /WECHAT_CALLBACK_AES_KEY_SOURCE:.*secrets\.WECHAT_CALLBACK_AES_KEY/);
  assert.match(workflow, /WECHAT_APP_ID_SOURCE:.*vars\.WECHAT_APP_ID/);
  assert.match(workflow, /deploy --only gateway --force --json/);
  assert.match(workflow, /routes list --limit 1000 --json/);
  assert.match(workflow, /cloudbase-gateway\.mjs verify/);
});
