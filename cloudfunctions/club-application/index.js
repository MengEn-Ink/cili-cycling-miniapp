'use strict';

const cloud = require('wx-server-sdk');
const {
  ClubApplicationError,
  applicationId,
  project,
  listJoinableClubs,
  joinPublicClub,
  getClubDetail,
  getManagedClub,
  updateManagedClub,
  getSoleClubHome,
  saveDraft,
  submitApplication,
  withdrawApplication,
  reviewApplication,
  getSoleClub,
  createSoleClub,
  updateSoleClub,
} = require('./core');
const {
  ClubMediaError,
  resolveApplicationCover,
  resolveApplicationCovers,
  resolveJoinableClubAvatars,
} = require('./media');
const { ContentCheckError } = require('./content-contract');
const { readJoinableClubDocuments } = require('./query-pages');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ok = (data) => ({ ok: true, data });
const failure = (error) => ({
  ok: false,
  error: {
    code:
      error instanceof ClubApplicationError ||
      error instanceof ContentCheckError ||
      error instanceof ClubMediaError
        ? error.code
        : 'INTERNAL_ERROR',
    message:
      error instanceof ClubApplicationError ||
      error instanceof ContentCheckError ||
      error instanceof ClubMediaError
        ? error.message
        : '服务暂时不可用',
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
    msgSecCheck: (input) => cloud.openapi.security.msgSecCheck(input),
    transaction: (work) =>
      db.runTransaction(async (transaction) =>
        work({
          getProfileMediaByCanonical: async (fileId, ownerOpenid, category) => {
            const result = await transaction
              .collection('profile_media')
              .where({ canonical_file_id: fileId, owner_openid: ownerOpenid, category })
              .limit(2)
              .get();
            return Array.isArray(result?.data) && result.data.length === 1
              ? result.data[0]
              : undefined;
          },
          activateProfileMedia: (id, referencedAt) =>
            transaction
              .collection('profile_media')
              .doc(id)
              .update({
                data: {
                  status: 'active',
                  referenced_at: referencedAt,
                  cleanup_after: null,
                  delete_lease_id: '',
                  updated_at: referencedAt,
                },
              }),
          getAdmin: (id) => maybeGet(transaction.collection('admins'), id),
          getApplication: (id) => maybeGet(transaction.collection('club_applications'), id),
          getClub: (id) => maybeGet(transaction.collection('clubs'), id),
          getMembership: (id) => maybeGet(transaction.collection('club_memberships'), id),
          countActiveMemberships: async (clubId) =>
            (
              await transaction
                .collection('club_memberships')
                .where({ club_id: clubId, status: 'active' })
                .count()
            ).total,
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
const DATA_MIGRATION_REQUIRED_MESSAGE = '检测到多个存量俱乐部，请先完成数据迁移后再管理唯一俱乐部';

// 最多读取两条即可裁决唯一性；多条存量数据必须显式失败，绝不静默选择第一条。
async function findSoleClubDocument() {
  const result = await db.collection('clubs').orderBy('_id', 'asc').limit(2).get();
  const documents = Array.isArray(result?.data) ? result.data : [];
  if (documents.length > 1)
    throw new ClubApplicationError('DATA_MIGRATION_REQUIRED', DATA_MIGRATION_REQUIRED_MESSAGE);
  const doc = documents[0] || null;
  return doc && typeof doc._id === 'string' ? doc : null;
}
async function resolveSoleClubPayload(cloud, payload) {
  if (!payload || payload.exists !== true || !payload.club) return { exists: false };
  const [resolved] = await resolveJoinableClubAvatars(cloud, [
    { ...payload.club, avatar_url: payload.club.avatar_file_id },
  ]);
  return {
    exists: true,
    club: {
      ...payload.club,
      avatar_url: resolved.avatar_url,
      cover_url: resolved.cover_url,
    },
  };
}
function isTransactionConflict(error) {
  const code = String(error?.errCode || error?.code || '');
  const message = String(error?.errMsg || error?.message || '');
  return /transaction.*conflict|conflict.*transaction|database_transaction_conflict|事务.*冲突|冲突.*事务/i.test(
    `${code} ${message}`,
  );
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
      // 沿用仓库分页范式，以 _id 升序完整读取两侧集合；过滤后才保留最终 100 条。
      const clubs = await readJoinableClubDocuments(
        db.collection('club_memberships').where({ openid, status: 'active' }),
        db
          .collection('clubs')
          .where({ approval_status: 'approved', status: 'active', join_mode: 'public_apply' }),
      );
      return ok(await resolveJoinableClubAvatars(cloud, listJoinableClubs(clubs)));
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
    if (event.action === 'getClubDetail') {
      const value = await getClubDetail(transactionStore(), {
        openid,
        clubId: event.clubId,
      });
      const [resolved] = await resolveJoinableClubAvatars(cloud, [value]);
      return ok(resolved);
    }
    if (event.action === 'getSoleClubHome') {
      // 登录用户即可读取唯一俱乐部公开主页；空库返回 {exists:false}，不报错。
      const existing = await findSoleClubDocument();
      const value = await getSoleClubHome(transactionStore(), {
        openid,
        clubId: existing?._id || '',
      });
      if (!value || value.exists !== true || !value.club) return ok({ exists: false });
      // 临时地址在出口统一签发；响应只保留公开字段，剥离 fileID 等内部信息。
      const [resolved] = await resolveJoinableClubAvatars(cloud, [
        { ...value.club, avatar_url: value.club.avatar_file_id },
      ]);
      return ok({
        exists: true,
        club: {
          id: value.club.id,
          name: value.club.name,
          city: value.club.city,
          introduction: value.club.introduction,
          avatar_url: resolved.avatar_url,
          cover_url: resolved.cover_url,
        },
        role: value.role,
        role_label: value.role_label,
        can_manage: value.can_manage,
      });
    }
    if (event.action === 'getManagedClub') {
      const value = await getManagedClub(transactionStore(), {
        openid,
        clubId: event.clubId,
      });
      const [resolved] = await resolveJoinableClubAvatars(cloud, [
        { ...value, avatar_url: value.avatar_file_id },
      ]);
      return ok({
        ...value,
        avatar_url: resolved.avatar_url,
        cover_url: resolved.cover_url,
      });
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
        { msgSecCheck: (input) => cloud.openapi.security.msgSecCheck(input) },
      );
      const [resolved] = await resolveJoinableClubAvatars(cloud, [
        { ...value, avatar_url: value.avatar_file_id },
      ]);
      return ok({
        ...value,
        avatar_url: resolved.avatar_url,
        cover_url: resolved.cover_url,
      });
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
    if (event.action === 'withdraw') {
      const value = await withdrawApplication(
        transactionStore(),
        {
          openid,
          requestId: event.requestId,
          expectedReviewVersion: event.expectedReviewVersion,
        },
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
    if (event.action === 'adminGetSoleClub') {
      // 空库返回 {exists:false}，不报错；仅平台管理员可读取。
      await requireAdmin(openid);
      const existing = await findSoleClubDocument();
      const value = await getSoleClub(transactionStore(), {
        adminOpenid: openid,
        clubId: existing?._id || '',
      });
      return ok(await resolveSoleClubPayload(cloud, value));
    }
    if (event.action === 'adminCreateSoleClub') {
      const existing = await findSoleClubDocument();
      try {
        const value = await createSoleClub(
          transactionStore(),
          {
            adminOpenid: openid,
            existingClubId: existing?._id || '',
            input: event.club,
            requestId: event.requestId,
          },
          new Date(),
          { msgSecCheck: (input) => cloud.openapi.security.msgSecCheck(input) },
        );
        return ok(await resolveSoleClubPayload(cloud, value));
      } catch (error) {
        // 并发首次创建时 CloudBase 可能以事务冲突而非 CLUB_ALREADY_EXISTS 失败，统一中文口径。
        if (isTransactionConflict(error))
          throw new ClubApplicationError(
            'CLUB_ALREADY_EXISTS',
            '全平台只允许存在一个俱乐部，不能创建第二个',
          );
        throw error;
      }
    }
    if (event.action === 'adminUpdateSoleClub') {
      const existing = await findSoleClubDocument();
      const value = await updateSoleClub(
        transactionStore(),
        {
          adminOpenid: openid,
          clubId: existing?._id || '',
          requestId: event.requestId,
          expectedUpdatedAt: event.expectedUpdatedAt,
          input: event.club,
        },
        new Date(),
        { msgSecCheck: (input) => cloud.openapi.security.msgSecCheck(input) },
      );
      return ok(await resolveSoleClubPayload(cloud, value));
    }
    throw new ClubApplicationError('UNKNOWN_ACTION', '未知操作');
  } catch (error) {
    console.error('club-application failed', error && error.code ? error.code : 'INTERNAL_ERROR');
    return failure(error);
  }
};
