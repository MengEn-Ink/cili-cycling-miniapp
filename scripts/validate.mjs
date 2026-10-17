import { existsSync, readFileSync } from 'node:fs';

import appRoutes from './app-routes.cjs';

const appConfig = JSON.parse(readFileSync('miniprogram/app.json'));
const pages = appRoutes.expandAppRoutes(appConfig);
for (const page of pages)
  for (const extension of ['.ts', '.wxml', '.wxss', '.json'])
    if (!existsSync('miniprogram/' + page + extension)) throw Error(page + extension);
console.log('源码完整性校验通过：' + pages.length + ' 个页面');
