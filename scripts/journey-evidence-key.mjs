import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

const IS_POSIX = process.platform !== 'win32';
const OPEN_FLAGS =
  constants.O_RDONLY | (IS_POSIX ? (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0) : 0);

export class JourneyEvidenceKeyError extends Error {}

function keyError(reason) {
  return new JourneyEvidenceKeyError(reason);
}

export async function readJourneyEvidenceKey(path) {
  let handle;
  try {
    handle = await open(path, OPEN_FLAGS);
  } catch (error) {
    if (error?.code === 'EISDIR' || (IS_POSIX && error?.code === 'ELOOP')) {
      throw keyError('密钥必须是普通文件');
    }
    throw keyError('无法读取签发密钥');
  }

  try {
    let metadata;
    try {
      metadata = await handle.stat();
    } catch {
      throw keyError('无法读取签发密钥');
    }

    if (!metadata.isFile()) {
      throw keyError('密钥必须是普通文件');
    }
    if (IS_POSIX && (metadata.mode & 0o077) !== 0) {
      throw keyError('密钥文件权限必须为 0600');
    }

    let key;
    try {
      key = await handle.readFile();
    } catch {
      throw keyError('无法读取签发密钥');
    }
    if (key.length < 32) {
      throw keyError('签发密钥至少需要 32 字节');
    }

    return key;
  } finally {
    await handle.close();
  }
}
