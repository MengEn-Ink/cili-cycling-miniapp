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
  requestId,
  mediaSecret,
  getTempFileURL,
  uploadFile,
  store,
  verifyImage = verifyUploadedImageObject,
  now = new Date(),
}) {
  const sourceIntentId = clientUploadIntentId(mediaPath(fileId));
  const sourceIntent = store.getClientUpload
    ? await store.getClientUpload(sourceIntentId)
    : undefined;
  if (
    (requestId && !sourceIntent) ||
    (sourceIntent &&
      ((sourceIntent.category && sourceIntent.category !== category) ||
        (sourceIntent.request_id && sourceIntent.request_id !== requestId)))
  )
    throw Object.assign(new Error('媒体授权与登记请求不一致'), {
      code: 'MEDIA_UPLOAD_INTENT_MISMATCH',
    });
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
  const canonicalCategory = ['ride', 'bike', 'other'].includes(category) ? '' : category;
  const canonicalIntent = canonicalUploadIntent(
    openid,
    fileId,
    verified,
    mediaSecret,
    now,
    canonicalCategory,
  );
  await store.prepareCanonicalUpload(openid, sourceIntentId, canonicalIntent, mediaSecret, now);
  const uploaded = await uploadFile({
    cloudPath: canonicalIntent.cloud_path,
    fileContent: verified.bytes,
  });
  const binding = canonicalMediaBinding(
    openid,
    fileId,
    uploaded?.fileID,
    verified,
    mediaSecret,
    canonicalCategory,
  );
  return store.completeClientMedia(
    openid,
    fileId,
    sourceIntentId,
    canonicalIntent._id,
    binding,
    mediaSecret,
    (current) => {
      const record = mediaRegistration(
        fileId,
        category,
        origin,
        openid,
        mediaSecret,
        now,
        current,
        binding,
      );
      // Profile assets are activated by the profile transaction. Business assets remain
      // staged until activity/club persistence activates the exact canonical reference.
      return record;
    },
    now,
  );
}

module.exports = { canonicalizeClientMedia };
