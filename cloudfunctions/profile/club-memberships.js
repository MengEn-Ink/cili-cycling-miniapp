'use strict';

const { safeClubMedia } = require('./privacy-contract');
function activeApprovedClub(club) {
  return Boolean(club && club.approval_status === 'approved' && club.status === 'active');
}

function compareSummary(left, right) {
  const leftName = left.club_identity.name;
  const rightName = right.club_identity.name;
  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  return left.club_id < right.club_id ? -1 : left.club_id > right.club_id ? 1 : 0;
}

function clubAvatarUrl(club) {
  return typeof club?.avatar_url === 'string' ? club.avatar_url.trim() : '';
}

function safeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

async function resolveClubMembershipAvatars(summaries, getTempFileURL) {
  const fileIds = [
    ...new Set(
      summaries
        .map((summary) => safeClubMedia(summary?.club_identity?.avatar_url))
        .filter((value) => typeof value === 'string' && value.startsWith('cloud://')),
    ),
  ];
  const resolved = new Map();
  if (fileIds.length && typeof getTempFileURL === 'function') {
    try {
      const response = await getTempFileURL({ fileList: fileIds });
      for (const item of Array.isArray(response?.fileList) ? response.fileList : []) {
        const url = item && Number(item.status) === 0 ? safeHttpsUrl(item.tempFileURL) : '';
        if (fileIds.includes(item?.fileID) && url && !resolved.has(item.fileID))
          resolved.set(item.fileID, url);
      }
    } catch {
      // 私有头像签名失败时 fail closed，不能把 cloud file id 返回客户端。
    }
  }
  return summaries.map((summary) => {
    const avatar = safeClubMedia(summary.club_identity.avatar_url);
    return {
      ...summary,
      club_identity: {
        ...summary.club_identity,
        avatar_url: avatar.startsWith('cloud://')
          ? resolved.get(avatar) || ''
          : safeHttpsUrl(avatar),
      },
    };
  });
}

async function loadClubMembershipSummaries(db, openid) {
  const result = await db
    .collection('club_memberships')
    .where({ openid, status: 'active' })
    .limit(100)
    .get();
  const memberships = Array.isArray(result?.data) ? result.data : [];
  const byClub = new Map();
  for (const membership of memberships) {
    if (
      typeof membership?.club_id !== 'string' ||
      !membership.club_id ||
      byClub.has(membership.club_id)
    )
      continue;
    byClub.set(membership.club_id, membership);
  }
  const summaries = await Promise.all(
    [...byClub.values()].map(async (membership) => {
      let club;
      try {
        club = (await db.collection('clubs').doc(membership.club_id).get()).data;
      } catch (error) {
        const missing =
          Number(error?.errCode) === -502001 ||
          /not exist|not found/i.test(String(error?.errMsg || ''));
        if (missing) return undefined;
        throw error;
      }
      // 会员关系与俱乐部状态是两个独立可信边界，任一失效都不能返回给个人中心。
      if (!activeApprovedClub(club) || typeof club.name !== 'string' || !club.name.trim())
        return undefined;
      return {
        club_id: membership.club_id,
        role: String(membership.role || '').toUpperCase(),
        club_identity: {
          id: membership.club_id,
          name: club.name.trim(),
          avatar_url: clubAvatarUrl(club),
        },
      };
    }),
  );
  return summaries.filter(Boolean).sort(compareSummary);
}

module.exports = {
  activeApprovedClub,
  clubAvatarUrl,
  resolveClubMembershipAvatars,
  loadClubMembershipSummaries,
};
