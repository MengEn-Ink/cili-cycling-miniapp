import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const reviewsTemplate = fs.readFileSync('miniprogram/pages/admin/reviews/index.wxml', 'utf8');

describe('管理员报名集合方式展示契约', () => {
  it('仅在有值时展示已映射的 gatheringMode', () => {
    expect(reviewsTemplate).toContain('wx:if="{{item.gatheringMode}}"');
    expect(reviewsTemplate).toContain('{{item.gatheringMode}}');
    expect(reviewsTemplate).not.toMatch(/bikeMode|bike_mode|rentalNeed|rental_need/);
  });
});
