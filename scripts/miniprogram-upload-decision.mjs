const UPLOAD_PREFIXES = ['miniprogram/', 'cloudfunctions/', 'tools/miniprogram-ci/'];
const UPLOAD_FILES = new Set([
  'scripts/upload-miniprogram-ci.mjs',
  'scripts/miniprogram-upload-decision.mjs',
  'project.config.json',
  'project.private.config.json',
  'package.json',
  'package-lock.json',
]);
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function normalizePath(value) {
  return String(value).replace(/^\.\/+/, '');
}

function affectsMiniProgram(path) {
  return (
    UPLOAD_FILES.has(path) || UPLOAD_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

export function shouldUploadMiniProgram(paths) {
  return paths.some((value) => affectsMiniProgram(normalizePath(value)));
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) {
    throw new Error(`${label} 必须是 40 位十六进制提交 SHA`);
  }
  return value.toLowerCase();
}

export function buildUploadDecision({ before, sha, paths }) {
  if (!Array.isArray(paths)) throw new Error('paths 必须是数组');
  const normalizedPaths = paths.map(normalizePath);
  const matchedPaths = [
    ...new Set(normalizedPaths.filter((path) => affectsMiniProgram(path))),
  ];
  return {
    schemaVersion: 1,
    before: requireSha(before, 'before'),
    sha: requireSha(sha, 'sha'),
    shouldUpload: matchedPaths.length > 0,
    matchedPaths,
  };
}

export function validateUploadDecision(value, expectedSha) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('上传判定必须是对象');
  }
  if (value.schemaVersion !== 1) throw new Error('上传判定 schemaVersion 无效');
  const before = requireSha(value.before, 'before');
  const sha = requireSha(value.sha, 'sha');
  const expected = requireSha(expectedSha, 'expected SHA');
  if (sha !== expected) throw new Error(`上传判定 SHA 不匹配：${sha} != ${expected}`);
  if (typeof value.shouldUpload !== 'boolean') {
    throw new Error('上传判定 shouldUpload 必须是布尔值');
  }
  if (
    !Array.isArray(value.matchedPaths) ||
    value.matchedPaths.some((path) => typeof path !== 'string' || !affectsMiniProgram(path))
  ) {
    throw new Error('上传判定 matchedPaths 无效');
  }
  if (value.shouldUpload !== (value.matchedPaths.length > 0)) {
    throw new Error('上传判定 shouldUpload 与 matchedPaths 不一致');
  }
  return {
    schemaVersion: 1,
    before,
    sha,
    shouldUpload: value.shouldUpload,
    matchedPaths: [...value.matchedPaths],
  };
}
