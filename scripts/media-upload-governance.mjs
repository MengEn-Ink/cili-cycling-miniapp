import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ORCHESTRATOR = 'miniprogram/utils/media-upload.ts';
const GPX_UPLOADER = 'miniprogram/pages/admin/activity-edit/index.ts';
const GPX_MARKER = 'MEDIA_UPLOAD_GPX_ONLY';
const DIRECT_UPLOAD = /\b(?:wx\.cloud!?|cloud)\.uploadFile\s*\(/;
const LOW_LEVEL_RETRY = /\buploadWithRetry\s*\(/;
const REMOVED_REPOSITORY_PROTOCOL = new RegExp(
  `\\b(?:${['getProfileMediaUpload', 'Path'].join('')}|${['registerProfile', 'Media'].join('')}|${['reportProfileMedia', 'Orphan'].join('')})\\b`,
);
const LEGACY_WRITE_CATEGORY =
  /(?:uploadMedia\s*\(\s*\{[\s\S]{0,400}?category\s*:\s*['"](?:ride|bike|other)['"]|(?:issueMediaUploadPath|finalizeMediaUpload)\s*\([^\n]{0,200}['"](?:ride|bike|other)['"])/;

const isAllowedGpxRetry = (entry) =>
  entry.file === GPX_UPLOADER &&
  entry.content.includes(GPX_MARKER) &&
  /uploadWithRetry\s*\(\s*\{\s*cloudPath:\s*routeUploadPath\([^)]*,\s*digest,\s*['"]gpx['"]\)/s.test(
    entry.content,
  );

export function mediaUploadViolations(entries) {
  return entries
    .filter((entry) => {
      const isMiniprogram = entry.file.startsWith('miniprogram/');
      if (entry.file === ORCHESTRATOR) return false;
      if (isMiniprogram && DIRECT_UPLOAD.test(entry.content)) return true;
      if (isMiniprogram && LOW_LEVEL_RETRY.test(entry.content) && !isAllowedGpxRetry(entry)) {
        return true;
      }
      return (
        REMOVED_REPOSITORY_PROTOCOL.test(entry.content) || LEGACY_WRITE_CATEGORY.test(entry.content)
      );
    })
    .map((entry) => entry.file)
    .sort();
}

export const directNativeUploadViolations = mediaUploadViolations;

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
  const entries = [...sourceEntries(root, 'miniprogram'), ...sourceEntries(root, 'cloudfunctions')];
  const violations = mediaUploadViolations(entries);
  if (violations.length)
    throw new Error(`检测到遗留或绕过统一媒体上传的实现：${violations.join(', ')}`);
  return true;
}
