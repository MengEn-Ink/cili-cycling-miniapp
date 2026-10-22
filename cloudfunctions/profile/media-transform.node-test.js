'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const { normalizeCheckedImage } = require('./media-transform');

test('trusted WebP bytes are decoded and re-encoded as bounded JPEG with a new digest', async () => {
  const webp = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: { r: 12, g: 34, b: 56 },
    },
  })
    .webp()
    .toBuffer();
  const input = {
    bytes: webp,
    mime: 'image/webp',
    extension: 'webp',
    size: webp.length,
    sha256: '0'.repeat(64),
  };

  const result = await normalizeCheckedImage(input);
  const metadata = await sharp(result.bytes).metadata();

  assert.equal(result.mime, 'image/jpeg');
  assert.equal(result.extension, 'jpg');
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 32);
  assert.equal(metadata.height, 24);
  assert.notEqual(result.sha256, input.sha256);
  assert.equal(result.size, result.bytes.length);
});

test('decoder rejects oversized dimensions instead of trusting extension or client claims', async () => {
  const webp = await sharp({
    create: {
      width: 101,
      height: 10,
      channels: 3,
      background: 'white',
    },
  })
    .webp()
    .toBuffer();
  await assert.rejects(
    normalizeCheckedImage(
      {
        bytes: webp,
        mime: 'image/webp',
        extension: 'webp',
        size: webp.length,
        sha256: '0'.repeat(64),
      },
      { maxWidth: 100 },
    ),
    { code: 'MEDIA_DIMENSIONS_INVALID' },
  );
});

test('JPEG and PNG inputs are decoded for dimensions but retain their verified final bytes', async () => {
  const png = await sharp({
    create: {
      width: 12,
      height: 8,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const input = {
    bytes: png,
    mime: 'image/png',
    extension: 'png',
    size: png.length,
    sha256: require('node:crypto').createHash('sha256').update(png).digest('hex'),
  };
  const result = await normalizeCheckedImage(input);
  assert.equal(result.mime, 'image/png');
  assert.equal(result.sha256, input.sha256);
  assert.equal(result.bytes, input.bytes);
});
