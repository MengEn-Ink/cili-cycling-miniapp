#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const host = '127.0.0.1';
const requestedPort = Number(process.env.PHASE3_PORT || 0);
const prototypeDir = resolve('docs/designs/2026-10-22-cycling-image-journal');
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = resolve(prototypeDir, relativePath);
    if (filePath !== prototypeDir && !filePath.startsWith(`${prototypeDir}${sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end('Not Found');
  }
});

function listen() {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('无法获取原型服务监听地址'));
        return;
      }
      resolveListen(`http://${host}:${address.port}`);
    });
  });
}

function closeServer() {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

function runWalkthrough(base) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ['scripts/phase3-three-width-walkthrough.mjs'], {
      stdio: 'inherit',
      env: { ...process.env, PROTO_URL: base },
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`三宽度走查失败：code=${code ?? 'null'} signal=${signal ?? 'none'}`));
    });
  });
}

const base = await listen();
try {
  await runWalkthrough(base);
} finally {
  await closeServer();
}
