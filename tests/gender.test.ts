import { describe, expect, it } from 'vitest';
import { genderView, normalizeGender } from '../miniprogram/utils/gender';

describe('客户端性别工具', () => {
  it.each([
    ['男', '男'],
    ['女', '女'],
    ['其他', ''],
    [null, ''],
    [undefined, ''],
    [1, ''],
  ])('normalizeGender(%s) -> %s', (input, expected) => {
    expect(normalizeGender(input)).toBe(expected);
  });

  it('男骑手展示男与男性样式类', () => {
    expect(genderView('男')).toEqual({
      gender: '男',
      genderLabel: '男',
      genderClass: 'gender-male',
    });
  });

  it('女骑手展示女与女性样式类', () => {
    expect(genderView('女')).toEqual({
      gender: '女',
      genderLabel: '女',
      genderClass: 'gender-female',
    });
  });

  it('缺失时展示未标注与中性样式类', () => {
    expect(genderView('未知')).toEqual({
      gender: '',
      genderLabel: '未标注',
      genderClass: 'gender-unknown',
    });
  });
});
