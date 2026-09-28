export function weightedAverageSpeed(v: { distanceM: number; movingTimeS: number }[]) {
  const a = v.filter((x) => x.distanceM > 0 && x.movingTimeS > 0),
    s = a.reduce((n, x) => n + x.movingTimeS, 0);
  return s ? Number(((a.reduce((n, x) => n + x.distanceM, 0) / s) * 3.6).toFixed(2)) : 0;
}
