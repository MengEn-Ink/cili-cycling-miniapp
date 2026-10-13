'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseGpx, MAX_GPX_BYTES } = require('./gpx');

function trackGpx(points, metadata = '') {
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>
    <gpx version="1.1" creator="test">
      ${metadata}
      <trk><trkseg>
        ${points
          .map(
            ({ latitude, longitude, elevation }) =>
              `<trkpt lat="${latitude}" lon="${longitude}">${
                elevation === undefined ? '' : `<ele>${elevation}</ele>`
              }</trkpt>`,
          )
          .join('')}
      </trkseg></trk>
    </gpx>`,
  );
}

test('解析命名空间轨迹的名称、里程、海拔、边界和起终点', () => {
  const source = Buffer.from(`<?xml version="1.0"?>
    <g:gpx xmlns:g="urn:example:gpx">
      <g:metadata><g:name> 周末环湖 </g:name></g:metadata>
      <g:trk><g:trkseg>
        <g:trkpt lon="114" lat="22"><g:ele>10</g:ele></g:trkpt>
        <g:trkpt lat="22.01" lon="114"><g:ele>40</g:ele></g:trkpt>
        <g:trkpt lat="22.02" lon="114.01"><g:ele>25</g:ele></g:trkpt>
      </g:trkseg></g:trk>
    </g:gpx>`);

  const parsed = parseGpx(source, { fileName: 'fallback.gpx' });

  assert.equal(parsed.route_name, '周末环湖');
  assert.equal(parsed.distance_km > 2.5 && parsed.distance_km < 2.7, true);
  assert.equal(parsed.elevation_m, 8);
  assert.equal(parsed.elevation_loss_m, 0);
  assert.equal(parsed.elevation_min_m, 10);
  assert.equal(parsed.elevation_max_m, 40);
  assert.equal(parsed.estimation_source, 'cili');
  assert.equal(parsed.estimated_moving_time_seconds > 0, true);
  assert.deepEqual(parsed.route_bounds, {
    south: 22,
    west: 114,
    north: 22.02,
    east: 114.01,
  });
  assert.deepEqual(parsed.route_outline[0], { latitude: 22, longitude: 114 });
  assert.deepEqual(parsed.route_outline.at(-1), { latitude: 22.02, longitude: 114.01 });
  assert.equal(parsed.elevation_profile[0].distance_km, 0);
  assert.equal(parsed.elevation_profile.at(-1).distance_km, parsed.distance_km);
});

test('轨迹缺失时解析路线点，并从安全文件名回退路线名称', () => {
  const source = Buffer.from(`<?xml version="1.0"?>
    <gpx>
      <rte>
        <rtept lat="30" lon="120"><ele>100</ele></rtept>
        <rtept lat="30.01" lon="120.01"><ele>130</ele></rtept>
      </rte>
    </gpx>`);

  const parsed = parseGpx(source, { fileName: '../Morning Ride.gpx' });

  assert.equal(parsed.route_name, 'Morning Ride');
  assert.equal(parsed.elevation_profile.length, 2);
  assert.equal(parsed.route_outline.length, 2);
});

test('按距离抽稀海拔曲线和路线轮廓并保留端点', () => {
  const points = Array.from({ length: 360 }, (_, index) => ({
    latitude: 22 + index * 0.0001,
    longitude: 114 + Math.sin(index / 20) * 0.001,
    elevation: 20 + index * 0.5,
  }));

  const parsed = parseGpx(trackGpx(points));

  assert.equal(parsed.elevation_profile.length, 120);
  assert.equal(parsed.route_outline.length, 240);
  assert.deepEqual(parsed.route_outline[0], {
    latitude: points[0].latitude,
    longitude: points[0].longitude,
  });
  assert.deepEqual(parsed.route_outline.at(-1), {
    latitude: points.at(-1).latitude,
    longitude: points.at(-1).longitude,
  });
  for (let index = 1; index < parsed.elevation_profile.length; index += 1) {
    assert.equal(
      parsed.elevation_profile[index].distance_km >=
        parsed.elevation_profile[index - 1].distance_km,
      true,
    );
  }
});

test('累计爬升先平滑短周期 GPS 海拔噪声', () => {
  const points = [100, 101, 99, 102, 100, 101, 99, 100].map((elevation, index) => ({
    latitude: 22 + index * 0.001,
    longitude: 114,
    elevation,
  }));

  const parsed = parseGpx(trackGpx(points));

  assert.equal(parsed.elevation_m, 0);
  assert.equal(parsed.elevation_loss_m, 0);
  assert.equal(parsed.elevation_min_m, 99);
  assert.equal(parsed.elevation_max_m, 102);
});

test('拒绝 DTD、实体和结构损坏的 XML', () => {
  const cases = [
    '<!DOCTYPE gpx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><gpx>&xxe;</gpx>',
    '<gpx><trk><trkseg><trkpt lat="22" lon="114"></trkseg></trk></gpx>',
  ];

  for (const source of cases) {
    assert.throws(() => parseGpx(Buffer.from(source)), {
      code: 'GPX_INVALID',
      message: '这个文件不是有效的 GPX，请重新导出后上传',
    });
  }
});

test('拒绝超限、无海拔、非法坐标和非法海拔文件', () => {
  assert.throws(() => parseGpx(Buffer.alloc(MAX_GPX_BYTES + 1, 32)), {
    code: 'GPX_TOO_LARGE',
    message: '文件超过 4 MB，请选择更小的 GPX',
  });
  assert.throws(
    () =>
      parseGpx(
        trackGpx([
          { latitude: 22, longitude: 114 },
          { latitude: 22.01, longitude: 114.01 },
        ]),
      ),
    {
      code: 'GPX_ELEVATION_REQUIRED',
      message: 'GPX 中没有海拔信息，暂时无法生成海拔曲线',
    },
  );
  assert.throws(
    () =>
      parseGpx(
        trackGpx([
          { latitude: 91, longitude: 114, elevation: 10 },
          { latitude: 22.01, longitude: 114.01, elevation: 20 },
        ]),
      ),
    {
      code: 'GPX_INVALID',
      message: '这个文件不是有效的 GPX，请重新导出后上传',
    },
  );
  assert.throws(
    () =>
      parseGpx(
        trackGpx([
          { latitude: 22, longitude: 114, elevation: -1001 },
          { latitude: 22.01, longitude: 114.01, elevation: 20 },
        ]),
      ),
    {
      code: 'GPX_INVALID',
      message: '这个文件不是有效的 GPX，请重新导出后上传',
    },
  );
});

test('超过来源点上限时提示先简化路线', () => {
  const source = trackGpx([
    { latitude: 22, longitude: 114, elevation: 10 },
    { latitude: 22.01, longitude: 114.01, elevation: 20 },
    { latitude: 22.02, longitude: 114.02, elevation: 30 },
  ]);

  assert.throws(() => parseGpx(source, { maxSourcePoints: 2 }), {
    code: 'GPX_TOO_MANY_POINTS',
    message: '路线点过多，请先简化路线后再上传',
  });
});
