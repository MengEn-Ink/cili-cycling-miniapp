'use strict';

const COLLECTION_NOT_FOUND_CODE = -502005;

function isCollectionMissing(error) {
  if (!error || typeof error !== 'object') return false;

  const code = Number(error.errCode);
  const message = typeof error.errMsg === 'string' ? error.errMsg : '';
  return (
    code === COLLECTION_NOT_FOUND_CODE &&
    /database collection not exists|db or table not exist/i.test(message)
  );
}

function buildIdentity(openid, admin) {
  const isAdmin = Boolean(admin) && admin.enabled !== false;
  return {
    openid,
    role: isAdmin ? 'admin' : 'member',
    isSuper: isAdmin && admin.is_super === true,
  };
}

module.exports = { buildIdentity, isCollectionMissing };
