export type RegistrationStatusView = {
  title: string;
  hint: string;
  tone: 'success' | 'warning' | 'muted';
};

export function createRegistrationStatusView(status: string): RegistrationStatusView {
  switch (status) {
    case 'waiting':
      return {
        title: '候补排队中',
        hint: '有名额释放时将按顺序递补，请留意小程序通知。',
        tone: 'warning',
      };
    case 'pending':
      return {
        title: '组织者审核中',
        hint: '审核结果会在本页更新，请勿重复提交报名。',
        tone: 'warning',
      };
    case 'approved':
      return {
        title: '报名已通过',
        hint: '出发凭证已生效，请核对集合时间与地点。',
        tone: 'success',
      };
    case 'checked_in':
      return {
        title: '签到已完成',
        hint: '报名与签到均已确认，可继续查看活动信息。',
        tone: 'success',
      };
    case 'rejected':
      return {
        title: '报名未通过',
        hint: '请查看审核原因，活动仍开放时可完善后重新报名。',
        tone: 'warning',
      };
    case 'cancelled':
      return {
        title: '报名已取消',
        hint: '当前凭证已失效，活动仍开放时可重新报名。',
        tone: 'muted',
      };
    default:
      return {
        title: '报名状态待确认',
        hint: '请稍后刷新本页查看最新结果。',
        tone: 'muted',
      };
  }
}
