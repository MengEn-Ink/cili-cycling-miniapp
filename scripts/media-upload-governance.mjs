import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIRECT_UPLOAD = /\b(?:wx\.cloud!?|cloud)\.uploadFile\s*\(/;

const ORCHESTRATOR = 'miniprogram/utils/media-upload.ts';

export function directNativeUploadViolations(entries) {
  return entries
    .filter((entry) => entry.file !== ORCHESTRATOR && DIRECT_UPLOAD.test(entry.content))
    .map((entry) => entry.file)
    .sort();
}

function sourceEntries(root, directory) {
  const base = join(root, directory);
  const entries = [];
  const visit = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.(?:js|ts)$/.test(name))
        entries.push({ file: relative(root, path), content: readFileSync(path, 'utf8') });
    }
  };
  visit(base);
  return entries;
}

export function assertUnifiedMediaUpload(root = process.cwd()) {
  const violations = directNativeUploadViolations(sourceEntries(root, 'miniprogram'));
  if (violations.length)
    throw new Error(`禁止绕过统一媒体上传模块直接调用 uploadFile：${violations.join(', ')}`);
  return true;
}
