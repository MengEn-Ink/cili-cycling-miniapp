'use strict';

const crypto = require('node:crypto');
const sharp = require('sharp');

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_WIDTH = 8192;
const DEFAULT_MAX_HEIGHT = 8192;
const DEFAULT_MAX_PIXELS = 40_000_000;

function mediaError(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

async function normalizeCheckedImage(
  verified,
  {
    maxBytes = DEFAULT_MAX_BYTES,
    maxWidth = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    maxPixels = DEFAULT_MAX_PIXELS,
  } = {},
) {
  if (
    !verified ||
    !Buffer.isBuffer(verified.bytes) ||
    verified.bytes.length < 1 ||
    verified.bytes.length > maxBytes
  ) {
    mediaError('MEDIA_OBJECT_TOO_LARGE', '图片大小无效');
  }
  let metadata;
  try {
    metadata = await sharp(verified.bytes, {
      failOn: 'warning',
      limitInputPixels: maxPixels,
      sequentialRead: true,
    }).metadata();
  } catch {
    mediaError('MEDIA_DECODE_INVALID', '图片无法安全解码');
  }
  const width = Number(metadata.width);
  const height = Number(metadata.height);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > maxWidth ||
    height > maxHeight ||
    width * height > maxPixels
  ) {
    mediaError('MEDIA_DIMENSIONS_INVALID', '图片尺寸超过限制');
  }

  if (metadata.format !== 'webp') {
    const expected = { jpeg: 'image/jpeg', png: 'image/png' }[metadata.format];
    if (!expected || expected !== verified.mime) {
      mediaError('MEDIA_DECODE_INVALID', '图片格式与实际内容不一致');
    }
    return verified;
  }

  let bytes;
  try {
    bytes = await sharp(verified.bytes, {
      failOn: 'warning',
      limitInputPixels: maxPixels,
      sequentialRead: true,
    })
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90, progressive: true, chromaSubsampling: '4:2:0' })
      .toBuffer();
  } catch {
    mediaError('MEDIA_TRANSFORM_FAILED', '图片转换失败');
  }
  if (bytes.length < 1 || bytes.length > maxBytes) {
    mediaError('MEDIA_OBJECT_TOO_LARGE', '转换后的图片不能超过 5MB');
  }
  return {
    bytes,
    mime: 'image/jpeg',
    extension: 'jpg',
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    transformed_from: 'image/webp',
    width,
    height,
  };
}

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_HEIGHT,
  DEFAULT_MAX_PIXELS,
  DEFAULT_MAX_WIDTH,
  normalizeCheckedImage,
};
