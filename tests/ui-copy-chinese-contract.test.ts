// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 界面文案中文化契约：用户要求 App 界面不残留装饰性英文文案。
 * 品牌词（CILI/STRAVA）与国际度量单位（km/m/km/h）不在清理范围。
 */
const FORBIDDEN_TOKENS = [
  'MY RIDES',
  'RIDER PROFILE',
  'RIDER CAPABILITY',
  'IDENTITY CHECK',
  'PROFILE LOADING',
  'PROFILE ERROR',
  'CURRENT EVENT',
  'CURRENT ACTIVITY',
  'CONTROL CENTER',
  'CILI ACTIVITIES',
  'REVIEW · DETAIL',
  'ADMIN · REVIEW',
  'PREFERENCES · RELEASES',
  'RIDE DETAIL',
  'RIDE / 01',
  'CILI · REGISTRATION',
  'STEP 1',
  '>REVIEW<',
  '>LATEST<',
] as const;

const collectWxml = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry: any) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectWxml(full);
    }
    return entry.name.endsWith('.wxml') ? [full] : [];
  });

const templates = collectWxml('miniprogram').map((file: string) => ({
  file,
  content: readFileSync(file, 'utf8'),
}));

describe('界面装饰文案中文化契约', () => {
  it.each(FORBIDDEN_TOKENS)('所有 WXML 不残留装饰英文：%s', (token) => {
    const offenders = templates
      .filter(({ content }: { content: string }) => content.includes(token))
      .map(({ file }: { file: string }) => file);
    expect(offenders).toEqual([]);
  });

  it('brand-logo 静态 meta 不再使用英文短语', () => {
    const offenders = templates.flatMap(({ file, content }: { file: string; content: string }) =>
      Array.from(content.matchAll(/meta="([^"{}]*[A-Za-z]{2,}[^"{}]*)"/g)).map(
        (match: any) => `${file}: meta="${match[1]}"`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('报名表单步骤与活动上下文为中文文案', () => {
    const form = templates.find(({ file }: { file: string }) =>
      file.endsWith('registration-form/index.wxml'),
    );
    expect(form).toBeTruthy();
    expect(form!.content).toContain('第一步 · 填写');
    expect(form!.content).toContain('当前活动');
  });
});
