'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadClubMembershipSummaries, resolveClubMembershipAvatars } = require('./club-memberships');

function database({ memberships, clubs }) {
  return {
    collection(name) {
      if (name === 'club_memberships') {
        return {
          where(conditions) {
            return {
              limit() {
                return {
                  get: async () => ({
                    data: memberships.filter((item) =>
                      Object.entries(conditions).every(([key, value]) => item[key] === value),
                    ),
                  }),
                };
              },
            };
          },
        };
      }
      if (name === 'clubs') {
        return {
          doc: (id) => ({ get: async () => ({ data: clubs.get(id) }) }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
}

test('profile 只返回 active 会员关系与 approved/active 俱乐部并稳定排序', async () => {
  const memberships = [
    { _id: 'm-left', club_id: 'club-left', openid: 'owner', role: 'OWNER', status: 'left' },
    { _id: 'm-z', club_id: 'club-z', openid: 'owner', role: 'member', status: 'active' },
    { _id: 'm-a', club_id: 'club-a', openid: 'owner', role: 'admin', status: 'active' },
    {
      _id: 'm-disabled',
      club_id: 'club-disabled',
      openid: 'owner',
      role: 'OWNER',
      status: 'active',
    },
    { _id: 'm-other', club_id: 'club-other', openid: 'other', role: 'OWNER', status: 'active' },
  ];
  const clubs = new Map([
    [
      'club-z',
      {
        _id: 'club-z',
        name: '乙俱乐部',
        avatar_url: 'cloud://z.jpg',
        approval_status: 'approved',
        status: 'active',
      },
    ],
    [
      'club-a',
      {
        _id: 'club-a',
        name: '甲俱乐部',
        avatar_url: 'cloud://a.jpg',
        approval_status: 'approved',
        status: 'active',
      },
    ],
    [
      'club-disabled',
      { _id: 'club-disabled', name: '停用俱乐部', approval_status: 'approved', status: 'disabled' },
    ],
  ]);

  const summaries = await loadClubMembershipSummaries(database({ memberships, clubs }), 'owner');

  assert.deepEqual(
    summaries.map((item) => item.club_id),
    ['club-z', 'club-a'],
  );
  assert.deepEqual(summaries[0], {
    club_id: 'club-z',
    role: 'MEMBER',
    club_identity: { id: 'club-z', name: '乙俱乐部', avatar_url: 'cloud://z.jpg' },
  });
  assert.equal(JSON.stringify(summaries).includes('club-left'), false);
  assert.equal(JSON.stringify(summaries).includes('club-disabled'), false);
});

test('profile 过滤未审批、缺失和重复俱乐部关系', async () => {
  const memberships = [
    { _id: 'm1', club_id: 'club-pending', openid: 'owner', role: 'OWNER', status: 'active' },
    { _id: 'm2', club_id: 'club-missing', openid: 'owner', role: 'OWNER', status: 'active' },
    { _id: 'm3', club_id: 'club-ok', openid: 'owner', role: 'OWNER', status: 'active' },
    { _id: 'm4', club_id: 'club-ok', openid: 'owner', role: 'ADMIN', status: 'active' },
  ];
  const clubs = new Map([
    [
      'club-pending',
      { _id: 'club-pending', name: '待审', approval_status: 'pending', status: 'active' },
    ],
    ['club-ok', { _id: 'club-ok', name: '有效', approval_status: 'approved', status: 'active' }],
  ]);

  const summaries = await loadClubMembershipSummaries(database({ memberships, clubs }), 'owner');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].club_id, 'club-ok');
});

test('profile 头像只使用 avatar_url，不再回退 cover_file_id', async () => {
  const memberships = [
    { club_id: 'legacy', openid: 'owner', role: 'OWNER', status: 'active' },
    { club_id: 'empty', openid: 'owner', role: 'ADMIN', status: 'active' },
  ];
  const clubs = new Map([
    [
      'legacy',
      {
        name: '旧俱乐部',
        cover_file_id: 'cloud://env/clubs/legacy.jpg',
        approval_status: 'approved',
        status: 'active',
      },
    ],
    [
      'empty',
      {
        name: '空头像俱乐部',
        avatar_url: '',
        cover_file_id: 'cloud://env/clubs/must-not-fallback.jpg',
        approval_status: 'approved',
        status: 'active',
      },
    ],
  ]);

  const summaries = await loadClubMembershipSummaries(database({ memberships, clubs }), 'owner');
  const byId = new Map(summaries.map((summary) => [summary.club_id, summary]));

  assert.equal(byId.get('legacy').club_identity.avatar_url, '');
  assert.equal(byId.get('empty').club_identity.avatar_url, '');
});

test('profile 将 cloud 俱乐部头像签成安全 https，签名失败时不泄露 file id', async () => {
  const summaries = [
    {
      club_id: 'success',
      role: 'OWNER',
      club_identity: { id: 'success', name: '成功', avatar_url: 'cloud://env/clubs/success.jpg' },
    },
    {
      club_id: 'failed',
      role: 'ADMIN',
      club_identity: { id: 'failed', name: '失败', avatar_url: 'cloud://env/clubs/failed.jpg' },
    },
  ];
  const resolved = await resolveClubMembershipAvatars(summaries, async () => ({
    fileList: [
      {
        fileID: 'cloud://env/clubs/success.jpg',
        status: 0,
        tempFileURL: 'https://temporary.example/success.jpg',
      },
      {
        fileID: 'cloud://env/clubs/failed.jpg',
        status: -1,
        tempFileURL: 'cloud://env/clubs/failed.jpg',
      },
    ],
  }));

  assert.equal(resolved[0].club_identity.avatar_url, 'https://temporary.example/success.jpg');
  assert.equal(resolved[1].club_identity.avatar_url, '');
  assert.equal(JSON.stringify(resolved).includes('cloud://'), false);

  const rejected = await resolveClubMembershipAvatars([summaries[0]], async () => {
    throw new Error('sign failed');
  });
  assert.equal(rejected[0].club_identity.avatar_url, '');
});
