export interface PageTaskState<T> {
  loading: boolean;
  data?: T;
  error: string;
}

export async function runPageTask<T>(
  task: () => Promise<T>,
  fallback: string,
): Promise<PageTaskState<T>> {
  try {
    return { loading: false, data: await task(), error: '' };
  } catch (error) {
    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : fallback;
    return { loading: false, error: message || fallback };
  }
}

export function phoneAuthorizationError(detail?: { errMsg?: string }) {
  const reason = typeof detail?.errMsg === 'string' ? detail.errMsg.toLowerCase() : '';
  if (reason.includes('deny') || reason.includes('cancel'))
    return '你已取消手机号授权，请重新点击授权';
  if (reason.includes('no permission') || reason.includes('not supported'))
    return '当前小程序账号暂未开通手机号快速验证能力，请先在微信公众平台开通后使用真机授权';
  return '未取得手机号授权凭证，请使用真机微信重新授权';
}
