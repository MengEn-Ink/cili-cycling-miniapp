// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const models = read('miniprogram/models/index.ts');
const repository = read('miniprogram/repositories/cloud.ts');
const activityCard = read('miniprogram/components/activity-card/index.wxml');
const activityDetail = read('miniprogram/pages/activity-detail/index.wxml');
const registrations = read('miniprogram/pages/registrations/index.wxml');
const credential = read('miniprogram/pages/credential/index.wxml');
const profile = read('miniprogram/pages/profile/index.wxml');
const adminEdit = read('miniprogram/pages/admin/activity-edit/index.wxml');
const bootstrap = read('scripts/bootstrap-cloudbase.mjs');
const activityDomain = read('cloudfunctions/activity-admin/domain.js');
const activityUseCases = read('cloudfunctions/activity-admin/use-cases.js');
const profileFunction = read('cloudfunctions/profile/index.js');
const profileMemberships = read('cloudfunctions/profile/club-memberships.js');

// M0 首个纵向切片：先打通可信俱乐部身份和历史快照，审批状态机在后续切片实现。
describe('M0 俱乐部身份生产契约', () => {
  it('活动和个人资料模型分别承载活动快照与有效会员关系', () => {
    expect(models).toContain('export interface ClubIdentity');
    expect(models).toContain('export interface ClubMembershipSummary');
    expect(models).toMatch(/clubIdentity\?: ClubIdentity/);
    expect(models).toMatch(/clubs: ClubMembershipSummary\[\]/);
  });

  it('客户端只提交 club_id，展示资料来自服务端可信快照', () => {
    expect(repository).toContain('club_id: activity.clubId || null');
    expect(repository).toContain('club_identity');
    expect(activityDomain).toContain("'club_id'");
    expect(activityDomain).toContain("'club_identity'");
    expect(activityUseCases).toContain('resolveTrustedClubIdentity');
    expect(activityUseCases).toContain('club_identity: trustedClub.clubIdentity');
  });

  it('活动列表、详情、行程与凭证均展示活动归属', () => {
    expect(activityCard).toContain('item.clubIdentity.name');
    expect(activityDetail).toContain('item.clubIdentity.name');
    expect(registrations).toContain('item.activity.clubIdentity.name');
    expect(credential).toContain('activity.clubIdentity.name');
  });

  it('个人中心保留有效俱乐部读取，单俱乐部收口后只展示唯一俱乐部入口', () => {
    expect(profileFunction).toContain('loadClubMembershipSummaries(db, OPENID)');
    expect(profileMemberships).toContain("collection('club_memberships')");
    expect(profileMemberships).toContain("collection('clubs')");
    expect(profile).toContain('profile.clubs[0]');
    expect(profile).toContain('openClubCenter');
    expect(profile).not.toContain('club-avatar-stack');
    expect(profile).not.toContain('主俱乐部');
  });

  it('活动编辑页在数据层保留俱乐部归属，但唯一俱乐部已自动归属不再展示选择器', () => {
    // 唯一俱乐部收口后，WXML 不再出现活动归属 picker；底层 TS 仍维护 clubOptions / PUBLIC_CLUB_OPTION。
    const adminEditSource = read('miniprogram/pages/admin/activity-edit/index.ts');
    expect(adminEdit).not.toContain('活动归属');
    expect(adminEdit).not.toContain('club-picker-field');
    expect(adminEditSource).toContain('clubOptions');
    expect(adminEditSource).toContain('PUBLIC_CLUB_OPTION');
    expect(adminEditSource).toContain('recomputePublishLabel');
  });

  it('CloudBase 基线包含俱乐部和会员关系集合及查询索引', () => {
    expect(bootstrap).toContain("'clubs'");
    expect(bootstrap).toContain("'club_memberships'");
    expect(bootstrap).toContain('club_memberships_openid_status');
    expect(bootstrap).toContain('activities_club_status_event_start');
  });
});
