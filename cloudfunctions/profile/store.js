'use strict';

function missing(error) {
  return (
    Number(error?.errCode) === -502001 || /not exist|not found/i.test(String(error?.errMsg || ''))
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

function createProfileStore(db) {
  return {
    registerMedia: (id, buildRecord) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('profile_media');
        const existing = await get(collection, id);
        const record = buildRecord(existing);
        if (!existing) {
          const { _id, ...data } = record;
          await collection.doc(_id).set({ data });
        }
        return existing || record;
      }),
    mergePhone: (openid, fields) =>
      db.runTransaction(async (tx) => {
        const collection = tx.collection('profiles');
        const current = await get(collection, openid);
        const updatedAt = db.serverDate();
        const patch = { ...fields, updated_at: updatedAt };
        if (current) await collection.doc(openid).update({ data: patch });
        else await collection.doc(openid).set({ data: patch });
        return { ...(current || {}), ...patch };
      }),
  };
}

module.exports = { missing, get, createProfileStore };
