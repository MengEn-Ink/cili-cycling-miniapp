'use strict';

const MAX_MEDIA_TARGETS = 256;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const optionalFileId = (value) => value == null || typeof value === 'string';

function retainSnapshotTargets(request, snapshot) {
  const invalid = () => {
    if (isRecord(request)) request.manual_required = true;
    return { ok: false, code: 'MEDIA_TARGET_ACCOUNTING_INVALID' };
  };
  if (!isRecord(request)) return invalid();
  const existing = request.media_targets === undefined ? [] : request.media_targets;
  if (!Array.isArray(existing) || existing.some((value) => typeof value !== 'string'))
    return invalid();
  if (snapshot != null && !isRecord(snapshot)) return invalid();
  if (snapshot?.background_photo != null && !isRecord(snapshot.background_photo)) return invalid();
  if (snapshot?.photos != null && !Array.isArray(snapshot.photos)) return invalid();
  const photos = snapshot?.photos ?? [];
  if (
    !optionalFileId(snapshot?.avatar_file_id) ||
    !optionalFileId(snapshot?.background_photo?.file_id) ||
    photos.some((photo) => photo != null && (!isRecord(photo) || !optionalFileId(photo.file_id)))
  )
    return invalid();
  const previous = new Set(existing.filter(Boolean));
  const targets = [
    ...new Set(
      [
        ...existing,
        snapshot?.avatar_file_id,
        snapshot?.background_photo?.file_id,
        ...photos.map((photo) => photo?.file_id),
      ].filter((value) => typeof value === 'string' && value),
    ),
  ];
  if (targets.length > MAX_MEDIA_TARGETS) {
    request.manual_required = true;
    return { ok: false, code: 'MEDIA_TARGET_ACCOUNTING_LIMIT', total: targets.length };
  }
  request.media_targets = targets;
  return { ok: true, added: targets.length - previous.size, total: targets.length };
}

module.exports = { MAX_MEDIA_TARGETS, retainSnapshotTargets };
