import { existsSync, readFileSync } from 'node:fs';
const a = JSON.parse(readFileSync('miniprogram/app.json'));
for (const p of a.pages)
  for (const e of ['.ts', '.wxml', '.wxss', '.json'])
    if (!existsSync('miniprogram/' + p + e)) throw Error(p + e);
console.log('源码完整性校验通过：' + a.pages.length + ' 个页面');
