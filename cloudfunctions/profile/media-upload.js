'use strict';

const {
  canonicalFileForRecord,
  canonicalMediaBinding,
  canonicalUploadIntent,
  clientUploadIntentId,
  mediaDocumentId,
  mediaPath,
  mediaRegistration,
  verifyUploadedImageObject,
  verifyUploadedMedia,
} = require('./core');

async function canonicalizeClientMedia({
  openid,
  fileId,
  category,
  origin,
  mediaSecret,
  getTempFileURL,
  uploadFile,
  store,
  verifyImage = verifyUploadedImageObject,
  now = new Date(),
}) {
  const mediaId = mediaDocumentId(fileId);
  mediaRegistration(fileId, category, origin, openid, mediaSecret, now);
  const existing = await store.getMedia(mediaId);
  if (existing) {
    const validated = mediaRegistration(
      fileId,
      category,
      origin,
      openid,
      mediaSecret,
      now,
      existing,
    );
    if (canonicalFileForRecord(validated, fileId, openid, mediaSecret)) return validated;
  }

  const tempFileURL = await verifyUploadedMedia(fileId, getTempFileURL);
  const verified = await verifyImage(tempFileURL);
  const canonicalIntent = canonicalUploadIntent(openid, fileId, verified, mediaSecret, now);
  const sourceIntentId = clientUploadIntentId(mediaPath(fileId));
  await store.prepareCanonicalUpload(openid, sourceIntentId, canonicalIntent, mediaSecret, now);
  const uploaded = await uploadFile({
    cloudPath: canonicalIntent.cloud_path,
    fileContent: verified.bytes,
  });
  const binding = canonicalMediaBinding(openid, fileId, uploaded?.fileID, verified, mediaSecret);
  return store.completeClientMedia(
    openid,
    fileId,
    sourceIntentId,
    canonicalIntent._id,
    binding,
    mediaSecret,
    (current) =>
      mediaRegistration(fileId, category, origin, openid, mediaSecret, now, current, binding),
    now,
  );
}

module.exports = { canonicalizeClientMedia };
