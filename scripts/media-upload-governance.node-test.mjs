import test from 'node:test';
import assert from 'node:assert/strict';
import { directNativeUploadViolations } from './media-upload-governance.mjs';

test('统一上传治理允许业务调用 orchestrator', () => {
  assert.deepEqual(
    directNativeUploadViolations([
      { file: 'miniprogram/pages/a.ts', content: "await uploadMedia({ category: 'club-avatar' })" },
      { file: 'miniprogram/repositories/cloud.ts', content: "call('profile', payload)" },
    ]),
    [],
  );
});

test('统一上传治理允许云函数在 canonical 化与清理流程中执行服务端上传', () => {
  assert.deepEqual(
    directNativeUploadViolations([
      {
        file: 'cloudfunctions/profile/index.js',
        content: 'uploadFile: (input) => cloud.uploadFile(input)',
      },
      {
        file: 'cloudfunctions/profile-media-cleanup/index.js',
        content: 'uploadFile: (input) => cloud.uploadFile(input)',
      },
    ]),
    [],
  );
});

test('统一上传治理扫描整个 miniprogram 且只允许 orchestrator 原生上传', () => {
  assert.deepEqual(
    directNativeUploadViolations([
      { file: 'miniprogram/pages/a.ts', content: 'await wx.cloud!.uploadFile({})' },
      { file: 'miniprogram/components/a.ts', content: 'cloud.uploadFile({ filePath })' },
      { file: 'miniprogram/services/a.js', content: 'wx.cloud.uploadFile({})' },
      { file: 'miniprogram/utils/other.ts', content: 'cloud.uploadFile({ filePath })' },
      { file: 'miniprogram/utils/media-upload.ts', content: 'wx.cloud!.uploadFile({})' },
    ]),
    [
      'miniprogram/components/a.ts',
      'miniprogram/pages/a.ts',
      'miniprogram/services/a.js',
      'miniprogram/utils/other.ts',
    ],
  );
});
