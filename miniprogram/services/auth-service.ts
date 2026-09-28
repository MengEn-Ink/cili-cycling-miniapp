import type { Role } from '../models';

export interface AuthIdentity {
  openid: string;
  role: Role;
  isSuper: boolean;
}

export type AuthErrorCode =
  | 'CLOUD_UNAVAILABLE'
  | 'FUNCTION_NOT_DEPLOYED'
  | 'OPENID_MISSING'
  | 'INVALID_RESPONSE'
  | 'CALL_FAILED';

export type AuthAttempt =
  | { status: 'authenticated'; identity: AuthIdentity }
  | { status: 'unavailable' | 'error'; code: AuthErrorCode; message: string };

export interface AuthCloudApi {
  callFunction(options: { name: string }): Promise<{ result?: unknown }>;
}

const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  CLOUD_UNAVAILABLE: '当前环境不支持微信云开发，请在微信开发者工具或真机中重试。',
  FUNCTION_NOT_DEPLOYED: '身份云函数尚未部署，请先部署 auth 云函数后重试。',
  OPENID_MISSING: '云端未取得微信身份，请从小程序内重试。',
  INVALID_RESPONSE: '身份服务返回了无法识别的数据，请检查云函数版本。',
  CALL_FAILED: '身份服务暂时不可用，请稍后重试。',
};

export class AuthServiceError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'AuthServiceError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseAuthResponse(response: unknown): AuthIdentity {
  if (!isRecord(response) || !('result' in response)) {
    throw new AuthServiceError('INVALID_RESPONSE');
  }

  const payload = response.result;
  if (isRecord(payload) && isRecord(payload.error)) {
    if (payload.error.code === 'AUTH_OPENID_MISSING') {
      throw new AuthServiceError('OPENID_MISSING');
    }
    throw new AuthServiceError('CALL_FAILED');
  }

  if (
    !isRecord(payload) ||
    typeof payload.openid !== 'string' ||
    payload.openid.length === 0 ||
    (payload.role !== 'member' && payload.role !== 'admin') ||
    typeof payload.isSuper !== 'boolean' ||
    (payload.role === 'member' && payload.isSuper)
  ) {
    throw new AuthServiceError('INVALID_RESPONSE');
  }

  return {
    openid: payload.openid,
    role: payload.role,
    isSuper: payload.isSuper,
  };
}

function mapCallError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) return error;

  const record = isRecord(error) ? error : {};
  const message = typeof record.errMsg === 'string' ? record.errMsg.toLowerCase() : '';
  if (
    message.includes('function not found') ||
    message.includes('functionname') ||
    message.includes('云函数不存在')
  ) {
    return new AuthServiceError('FUNCTION_NOT_DEPLOYED');
  }
  return new AuthServiceError('CALL_FAILED');
}

export async function authenticateWithCloud(cloud?: AuthCloudApi): Promise<AuthAttempt> {
  if (!cloud || typeof cloud.callFunction !== 'function') {
    return {
      status: 'unavailable',
      code: 'CLOUD_UNAVAILABLE',
      message: ERROR_MESSAGES.CLOUD_UNAVAILABLE,
    };
  }

  try {
    const identity = parseAuthResponse(await cloud.callFunction({ name: 'auth' }));
    return { status: 'authenticated', identity };
  } catch (error) {
    const mapped = mapCallError(error);
    return { status: 'error', code: mapped.code, message: mapped.message };
  }
}
