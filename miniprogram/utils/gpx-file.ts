const GPX_SUFFIX = /\.gpx$/i;
const FORBIDDEN_FILE_CHARS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|']);

function unsafeFileCharacter(value: string): boolean {
  const code = value.charCodeAt(0);
  return code <= 31 || code === 127 || FORBIDDEN_FILE_CHARS.has(value);
}

export function isSafeGpxFileName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 5 || value.length > 160) return false;
  if (
    value !== value.trim() ||
    !GPX_SUFFIX.test(value) ||
    Array.from(value).some(unsafeFileCharacter)
  )
    return false;
  const stem = value.slice(0, -4);
  return Boolean(stem && stem !== '.' && stem !== '..');
}

export function sanitizeGpxFileName(value: unknown, fallback: string): string {
  const source = typeof value === 'string' ? value.trim() : '';
  const leaf = source.split(/[\\/]/).pop() || '';
  const cleaned = Array.from(leaf)
    .map((character) => (unsafeFileCharacter(character) ? '-' : character))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 155)
    .trim();
  const candidate = `${cleaned.replace(GPX_SUFFIX, '') || fallback}.gpx`;
  return isSafeGpxFileName(candidate) ? candidate : `${fallback}.gpx`;
}
