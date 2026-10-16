import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./wechat-devtools-e2e.cjs', import.meta.url), 'utf8');

test('开发者工具冷启动使用 automator 支持的 timeout 参数', () => {
  assert.match(
    source,
    /automator\.launch\(\{\s*cliPath,\s*projectPath,\s*timeout:\s*180000\s*\}\)/s,
  );
  assert.doesNotMatch(source, /launchTimeout/);
});
