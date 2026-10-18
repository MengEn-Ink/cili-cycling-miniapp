import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createMediaSecretDeploymentConfig,
  functionDetailHasMediaSecret,
  MEDIA_SECRET_FUNCTIONS,
  run,
} from './cloudbase-media-secret-config.mjs';

const secret = 'production-media-secret-for-tests-32-bytes';
const baseConfig = {
  envId: 'env-production',
  functions: [
    ...MEDIA_SECRET_FUNCTIONS.map((name) => ({ name, timeout: 10 })),
    { name: 'auth', timeout: 5 },
  ],
};

test('部署配置只向六个媒体函数注入同一密钥', () => {
  const configured = createMediaSecretDeploymentConfig(baseConfig, secret);
  for (const item of configured.functions) {
    if (MEDIA_SECRET_FUNCTIONS.includes(item.name))
      assert.equal(item.envVariables.PROFILE_MEDIA_PATH_SECRET, secret);
    else assert.equal(item.envVariables, undefined);
  }
  assert.equal(baseConfig.functions[0].envVariables, undefined);
});

test('密钥无效或媒体函数缺失时 fail closed', () => {
  assert.throws(() => createMediaSecretDeploymentConfig(baseConfig, ''), /缺少有效/);
  assert.throws(
    () =>
      createMediaSecretDeploymentConfig(
        {
          ...baseConfig,
          functions: baseConfig.functions.filter((item) => item.name !== 'profile'),
        },
        secret,
      ),
    /缺少媒体函数：profile/,
  );
});

test('函数详情兼容 Key-Value 与对象两种环境变量形态', () => {
  assert.equal(
    functionDetailHasMediaSecret(
      { EnvVariables: [{ Key: 'PROFILE_MEDIA_PATH_SECRET', Value: secret }] },
      secret,
    ),
    true,
  );
  assert.equal(
    functionDetailHasMediaSecret({ nested: { PROFILE_MEDIA_PATH_SECRET: secret } }, secret),
    true,
  );
  assert.equal(
    functionDetailHasMediaSecret(
      { EnvVariables: [{ Key: 'PROFILE_MEDIA_PATH_SECRET', Value: 'other' }] },
      secret,
    ),
    false,
  );
});

test('prepare 写出 0600 临时配置且不修改源配置', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cili-media-secret-'));
  const source = join(directory, 'cloudbaserc.json');
  const target = join(directory, 'cloudbaserc.deploy.json');
  writeFileSync(source, JSON.stringify(baseConfig));
  run(['prepare', '--source', source, '--target', target], {
    PROFILE_MEDIA_PATH_SECRET: secret,
  });
  assert.equal(statSync(target).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(source, 'utf8')).functions[0].envVariables, undefined);
  assert.equal(
    JSON.parse(readFileSync(target, 'utf8')).functions[0].envVariables.PROFILE_MEDIA_PATH_SECRET,
    secret,
  );
});
