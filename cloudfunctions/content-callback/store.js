'use strict';

function missing(error) {
  return (
    Number(error?.errCode) === -502001 ||
    /document.*(?:not exist|not found)/iu.test(String(error?.errMsg || error?.message || ''))
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
        const media = transaction.collection('profile_media');
        let traceId;
        let mediaId;
        return work({
          getTrace: async (id) => {
            traceId = id;
            return get(traces, id);
          },
          getMedia: async (id) => {
            mediaId = id;
            return get(media, id);
          },
          updateTrace: (data) => traces.doc(traceId).update({ data }),
          updateMedia: (data) => media.doc(mediaId).update({ data }),
        });
      }),
  };
}

module.exports = { createCallbackStore, missing };
