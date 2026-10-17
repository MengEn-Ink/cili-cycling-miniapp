'use strict';

const cloud = require('wx-server-sdk');
const {
  ClubApplicationError,
  applicationId,
  project,
  listJoinableClubs,
  joinPublicClub,
  getManagedClub,
  updateManagedClub,
  saveDraft,
  submitApplication,
  reviewApplication,
} = require('./core');
const {
  resolveApplicationCover,
  resolveApplicationCovers,
  resolveJoinableClubAvatars,
} = require('./media');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ok = (data) => ({ ok: true, data });
const failure = (error) => ({
  ok: false,
  error: {
    code: error instanceof ClubApplicationError ? error.code : 'INTERNAL_ERROR',
    message: error instanceof ClubApplicationError ? error.message : '服务暂时不可用',
  },
});
function isNotFound(error) {
  return (
    error &&
    (Number(error.errCode) === -502001 || /not exist|not found/i.test(String(error.errMsg || '')))
  );
}
async function maybeGet(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}
function transactionStore() {
  return {
    transaction: (work) =>
      db.runTransaction(async (transaction) =>
        work({
          getAdmin: (id) => maybeGet(transaction.collection('admins'), id),
          getApplication: (id) => maybeGet(transaction.collection('club_applications'), id),
          getClub: (id) => maybeGet(transaction.collection('clubs'), id),
          getMembership: (id) => maybeGet(transaction.collection('club_memberships'), id),
          getAudit: (id) => maybeGet(transaction.collection('audit_logs'), id),
          putApplication: async (id, value) => {
            const { _id, ...data } = value;
            await transaction.collection('club_applications').doc(id).set({ data });
          },
          putClub: async (id, value) => {
            const { _id, ...data } = value;
            await transaction.collection('clubs').doc(id).set({ data });
          },
          putMembership: async (id, value) => {
            const { _id, ...data } = value;
            await transaction.collection('club_memberships').doc(id).set({ data });
          },
          putAudit: async (id, value) => {
            const { _id, ...data } = value;
            await transaction.collection('audit_logs').doc(id).set({ data });
          },
          addAudit: (value) => transaction.collection('audit_logs').add({ data: value }),
        }),
      ),
  };
}
async function requireAdmin(openid) {
  const admin = await maybeGet(db.collection('admins'), openid);
  if (!admin || admin._id !== openid || admin.enabled === false)
    throw new ClubApplicationError('ADMIN_REQUIRED', '需要管理员权限');
}

exports.main = async (event = {}) => {
  try {
    const openid = cloud.getWXContext().OPENID;
    if (typeof openid !== 'string' || !openid)
      throw new ClubApplicationError('UNAUTHENTICATED', '请先完成微信登录');
    if (event.action === 'mine') {
      const value = await maybeGet(db.collection('club_applications'), applicationId(openid));
      return ok(await resolveApplicationCover(cloud, project(value), openid));
    }
    if (event.action === 'listJoinable') {
      const result = await db
        .collection('clubs')
        .where({ approval_status: 'approved', status: 'active', join_mode: 'public_apply' })
        .limit(100)
        .get();
      return ok(await resolveJoinableClubAvatars(cloud, listJoinableClubs(result.data)));
    }
    if (event.action === 'joinPublicClub') {
      const joined = await joinPublicClub(
        transactionStore(),
        { openid, clubId: event.clubId, requestId: event.requestId },
        new Date(),
      );
      const [club] = await resolveJoinableClubAvatars(cloud, [joined.club]);
      return ok({ ...joined, club });
    }
    if (event.action === 'getManagedClub') {
      const value = await getManagedClub(transactionStore(), {
        openid,
        clubId: event.clubId,
      });
      const [resolved] = await resolveJoinableClubAvatars(cloud, [
        { ...value, avatar_url: value.avatar_file_id },
      ]);
      return ok({ ...value, avatar_url: resolved.avatar_url });
    }
    if (event.action === 'updateManagedClub') {
      const value = await updateManagedClub(
        transactionStore(),
        {
          openid,
          clubId: event.clubId,
          requestId: event.requestId,
          expectedUpdatedAt: event.expectedUpdatedAt,
          input: event.club,
        },
        new Date(),
      );
      const [resolved] = await resolveJoinableClubAvatars(cloud, [
        { ...value, avatar_url: value.avatar_file_id },
      ]);
      return ok({ ...value, avatar_url: resolved.avatar_url });
    }
    if (event.action === 'saveDraft') {
      const value = await saveDraft(
        transactionStore(),
        { openid, input: event.application },
        new Date(),
      );
      return ok(await resolveApplicationCover(cloud, value, openid));
    }
    if (event.action === 'submit') {
      const value = await submitApplication(
        transactionStore(),
        { openid, input: event.application, requestId: event.requestId },
        new Date(),
      );
      return ok(await resolveApplicationCover(cloud, value, openid));
    }
    if (event.action === 'adminList') {
      await requireAdmin(openid);
      const status = event.status || 'pending_review';
      if (!['pending_review', 'approved', 'rejected'].includes(status))
        throw new ClubApplicationError('VALIDATION_FAILED', '筛选状态无效');
      const result = await db
        .collection('club_applications')
        .where({ status })
        .orderBy('updated_at', 'desc')
        .limit(100)
        .get();
      const projected = result.data.map((item) => project(item, true));
      return ok(await resolveApplicationCovers(cloud, projected));
    }
    if (event.action === 'adminDetail') {
      await requireAdmin(openid);
      if (typeof event.applicationId !== 'string' || !event.applicationId)
        throw new ClubApplicationError('VALIDATION_FAILED', '缺少申请 ID');
      const value = await maybeGet(db.collection('club_applications'), event.applicationId);
      if (!value) throw new ClubApplicationError('NOT_FOUND', '俱乐部申请不存在');
      return ok(await resolveApplicationCover(cloud, project(value, true)));
    }
    if (event.action === 'review') {
      const value = await reviewApplication(
        transactionStore(),
        {
          adminOpenid: openid,
          applicationId: event.applicationId,
          decision: event.decision,
          reason: event.reason,
          requestId: event.requestId,
        },
        new Date(),
      );
      return ok(await resolveApplicationCover(cloud, value));
    }
    throw new ClubApplicationError('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('club-application failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return failure(error);
  }
};
