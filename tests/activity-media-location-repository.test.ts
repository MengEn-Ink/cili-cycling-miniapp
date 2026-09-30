import { describe, expect, it, vi } from 'vitest';
import { CloudRepository } from '../miniprogram/repositories/cloud';

const location = { name: '集合点', address: '湖滨路', latitude: 30.2, longitude: 120.1 };
const dto = {
  _id: 'a1',
  version: 1,
  title: '活动',
  description: '',
  images: ['cloud://first.jpg', 'cloud://second.jpg'],
  cover_image: 'cloud://legacy.jpg',
  event_start: '2026-10-18T00:00:00.000Z',
  event_end: '2026-10-18T08:00:00.000Z',
  signup_deadline: '2026-10-17T00:00:00.000Z',
  status: 'published',
  capacity: 20,
  route: {
    start: '集合点',
    end: '终点',
    start_location: location,
    end_location: { ...location, name: '终点', longitude: 120.2 },
    distance_km: 80,
    elevation_m: 500,
    level: '进阶',
  },
  schedule: [],
  notices: [],
  equipment: [],
  fee: '',
  registration_state: 'open',
  closed_reason: null,
  server_now: '2026-09-29T04:00:00.000Z',
};

function cloudWith(response: unknown) {
  const callFunction = vi.fn().mockResolvedValue({ result: { ok: true, data: response } });
  return { cloud: { callFunction }, callFunction };
}

describe('活动图集与位置仓储 DTO', () => {
  it('读取优先用 images[0] 作封面并映射坐标', async () => {
    const { cloud } = cloudWith(dto);
    await expect(new CloudRepository(cloud).getActivity('a1')).resolves.toMatchObject({
      images: dto.images,
      coverImage: dto.images[0],
      route: { startLocation: location, endLocation: dto.route.end_location },
    });
  });

  it('旧数据仅有 cover_image 时保持兼容', async () => {
    const legacy = { ...dto, images: undefined };
    const { cloud } = cloudWith(legacy);
    const result = await new CloudRepository(cloud).getActivity('a1');
    expect(result.coverImage).toBe(dto.cover_image);
    expect(result).not.toHaveProperty('images');
  });

  it('写入 images、首图封面及位置白名单字段', async () => {
    const { cloud, callFunction } = cloudWith(dto);
    await new CloudRepository(cloud).saveActivity({
      title: '活动',
      description: '',
      images: dto.images,
      coverImage: 'cloud://ignored.jpg',
      startAt: dto.event_start,
      endAt: dto.event_end,
      deadline: dto.signup_deadline,
      status: 'published',
      capacity: 20,
      route: {
        start: '集合点',
        end: '终点',
        startLocation: location,
        endLocation: dto.route.end_location,
        distanceKm: 80,
        elevationM: 500,
        level: '进阶',
      },
      schedule: [],
      notices: [],
      equipment: [],
      fee: '',
    });
    expect(callFunction.mock.calls[0][0].data.activity).toMatchObject({
      images: dto.images,
      cover_image: dto.images[0],
      route: { start_location: location, end_location: dto.route.end_location },
    });
  });
});
