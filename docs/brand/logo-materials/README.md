# 此里 Logo 物料

本目录维护微信小程序内可直接使用的品牌 Logo 物料。所有文件均基于项目现有 `brand-logo` 组件的“此里 + 路线 + 品牌红节点”结构生成，不引入新的品牌图形。

## 统一规范

- 主背景：`#211F1C`
- 主文字：`#FFFFFF`
- 品牌强调色：`#E13B2B`
- 排版：中文粗体、最大填充、视觉居中
- 平台主图：PNG，`144 × 144 px`，黑底白字
- 源文件：`source/` 下的 SVG，可继续无损导出其他尺寸
- 小程序运行时只保留 `miniprogram/assets/brand/logo-circle-144.png` 与 `logo-share-500x400.png`，其余平台物料不进入小程序包

## 物料清单

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `docs/brand/logo-materials/generated/logo-wechat-144.png` | 144 × 144 | 微信小程序平台头像、基础 Logo |
| `docs/brand/logo-materials/generated/logo-square-1024.png` | 1024 × 1024 | 高清方形 Logo、应用商店与宣发备用 |
| `docs/brand/logo-materials/generated/logo-circle-144.png` | 144 × 144 | 圆形头像、圆形裁切场景 |
| `docs/brand/logo-materials/generated/logo-photo-watermark-360x144.png` | 360 × 144 | 照片角标、水印 |
| `docs/brand/logo-materials/generated/logo-share-500x400.png` | 500 × 400 | 微信分享图、分享卡片 |
| `docs/brand/logo-materials/generated/logo-loading-512.gif` | 512 × 512 | 加载动画 |
| `docs/brand/logo-materials/generated/loading-frames/loading-00.png` ～ `loading-07.png` | 512 × 512 | 小程序端逐帧加载动画 |

## 使用说明

- 上传微信小程序平台 Logo 时，优先使用 `logo-wechat-144.png`。
- 圆形容器不要再次裁切方形 Logo，直接使用 `logo-circle-144.png`，避免文字和路线节点被截断。
- 照片水印建议贴近右下角或左下角，并保留至少 12 px 安全边距。
- 小程序运行时若不使用 GIF，可依次播放 `loading-frames/` 下的 8 张 PNG，每帧约 110 ms。
- 需要新增尺寸时，请从 `source/` 的 SVG 导出，不要从现有 PNG 二次放大。
