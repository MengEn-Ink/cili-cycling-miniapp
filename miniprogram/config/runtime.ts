export type DataMode = 'cloud' | 'mock';

// 微信真实运行固定使用云端。Mock 仅能通过测试/开发构造函数显式注入，UI 不提供切换入口。
export const DEVELOPMENT_MOCK = false;

export const runtimeConfig = Object.freeze({
  brandName: '此里',
  cloudEnvId: 'cloudbase-d0gizacy77a1ab017',
  dataMode: 'cloud' as DataMode,
});
