export type OrganizerView = {
  visible: boolean;
  name: string;
  role: '活动发布者' | '活动归属';
  clubName: string;
  avatarUrl: string;
};

export function createOrganizerView(activity: any): OrganizerView {
  const publisherName = activity?.publisher?.nickname?.trim?.() || '';
  const clubName = activity?.clubIdentity?.name?.trim?.() || '';
  const isPublisher = Boolean(publisherName);
  return {
    visible: Boolean(publisherName || clubName),
    name: publisherName || clubName,
    role: isPublisher ? '活动发布者' : '活动归属',
    clubName,
    avatarUrl: isPublisher
      ? activity?.publisher?.avatarUrl || ''
      : activity?.clubIdentity?.avatarUrl || '',
  };
}

export function createRouteDifficultyHint(route: any): string {
  const metrics = [
    Number(route?.distanceKm) > 0 ? `${route.distanceKm} km` : '',
    Number(route?.elevationM) > 0 ? `爬升 ${route.elevationM} m` : '',
  ].filter(Boolean);
  const basis = metrics.length
    ? `请结合${metrics.join('、')}判断是否适合`
    : '请结合自身能力判断是否适合';
  return route?.level ? `难度“${route.level}”由组织者标注，${basis}` : `组织者未标注难度，${basis}`;
}
