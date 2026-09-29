import { describe, expect, it, vi } from 'vitest';
import { runPageTask } from '../miniprogram/services/page-service';
describe('页面异步状态', () => {
  it('成功返回数据', async () => {
    await expect(runPageTask(async () => 42, '失败')).resolves.toEqual({
      loading: false,
      data: 42,
      error: '',
    });
  });
  it('业务错误展示安全消息', async () => {
    await expect(
      runPageTask(async () => {
        throw new Error('请先完善资料');
      }, '失败'),
    ).resolves.toEqual({ loading: false, error: '请先完善资料' });
  });
  it('非 Error 使用兜底', async () => {
    await expect(
      runPageTask(async () => {
        throw 'bad';
      }, '网络失败'),
    ).resolves.toEqual({ loading: false, error: '网络失败' });
  });
  it('不会吞掉成功调用', async () => {
    const call = vi.fn().mockResolvedValue({ connected: false });
    expect((await runPageTask(call, '失败')).data).toEqual({ connected: false });
    expect(call).toHaveBeenCalledOnce();
  });
});
