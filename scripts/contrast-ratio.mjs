// 纯 WCAG 相对亮度对比度计算：微信开发者工具 E2E 的按钮文字对比度运行时断言依赖它。
export function contrastRatio(a, b) {
  const luminance = (hex) => {
    if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error('颜色必须为六位十六进制');
    const [r, g, blue] = hex
      .slice(1)
      .match(/../g)
      .map((part) => {
        const channel = parseInt(part, 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * blue;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
