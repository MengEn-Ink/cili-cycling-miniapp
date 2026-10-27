'use strict';

function missing(error) {
  const code = String(error?.errCode || error?.code || '');
  const message = String(error?.errMsg || error?.message || '');
  const explicitDocumentMissing =
    /\bdocument(?:\s+with\s+_id\s+\S+)?\s+(?:(?:does\s+)?not\s+exist|not\s+found)\b/iu.test(
      message,
    );
  return (
    ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(code) ||
    ([-502001, -1].includes(Number(error?.errCode)) && explicitDocumentMissing)
  );
}

async function get(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}

function createCallbackStore(db) {
  return {
    transaction: (work) =>
      db.runTransaction(async (transaction) => {
        const traces = transaction.collection('content_media_checks');
        const operations = transaction.collection('content_media_check_operations');
        const media = transaction.collection('profile_media');
        let traceId;
        let operationId;
        let mediaId;
        return work({
          getTrace: async (id) => {
            traceId = id;
            return get(traces, id);
          },
          getOperation: async (id) => {
            operationId = id;
            return get(operations, id);
          },
          getMedia: async (id) => {
            mediaId = id;
            return get(media, id);
          },
          updateTrace: (data) => traces.doc(traceId).update({ data }),
          updateOperation: (data) => operations.doc(operationId).update({ data }),
          updateMedia: (data) => media.doc(mediaId).update({ data }),
        });
      }),
  };
}

module.exports = { createCallbackStore, get, missing };
