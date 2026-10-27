# PR B 颜色与字体字面量迁移映射

本清单绑定迁移前基线 `main@c0bd3b56`，是 PR B 对 app.wxss 外 53 处颜色字面量的唯一权威清单。`direct` 行要求当前字面量与 token 当前值机械等价；`fallback-only` 行只移除未生效的 fallback，保留已存在全局 token 的实际有效值。不得近似合并 alpha 档位，也不得在本片启用 V1 新叠层值。

| # | file:line | current literal | migration type | token | token current value |
| --- | --- | --- | --- | --- | --- |
| 1 | `miniprogram/pages/activities/index.wxss:310` | `rgba(12, 10, 7, 0)` | `direct` | `--scrim-activity-cover-clear` | `rgba(12, 10, 7, 0)` |
| 2 | `miniprogram/pages/activities/index.wxss:311` | `rgba(12, 10, 7, 0)` | `direct` | `--scrim-activity-cover-clear` | `rgba(12, 10, 7, 0)` |
| 3 | `miniprogram/pages/activities/index.wxss:312` | `rgba(12, 10, 7, 0.68)` | `direct` | `--scrim-activity-cover-strong` | `rgba(12, 10, 7, 0.68)` |
| 4 | `miniprogram/pages/activities/index.wxss:334` | `rgba(12, 10, 7, 0.72)` | `direct` | `--surface-media-tag` | `rgba(12, 10, 7, 0.72)` |
| 5 | `miniprogram/pages/activity-detail/index.wxss:37` | `rgba(12, 10, 7, 0)` | `direct` | `--scrim-activity-detail-cover-clear` | `rgba(12, 10, 7, 0)` |
| 6 | `miniprogram/pages/activity-detail/index.wxss:38` | `rgba(12, 10, 7, 0)` | `direct` | `--scrim-activity-detail-cover-clear` | `rgba(12, 10, 7, 0)` |
| 7 | `miniprogram/pages/activity-detail/index.wxss:39` | `rgba(12, 10, 7, 0.72)` | `direct` | `--scrim-activity-detail-cover-strong` | `rgba(12, 10, 7, 0.72)` |
| 8 | `miniprogram/pages/activity-detail/index.wxss:61` | `rgba(12, 10, 7, 0.72)` | `direct` | `--surface-media-tag` | `rgba(12, 10, 7, 0.72)` |
| 9 | `miniprogram/pages/activity-detail/index.wxss:103` | `rgba(12, 10, 7, 0.6)` | `direct` | `--surface-countdown` | `rgba(12, 10, 7, 0.6)` |
| 10 | `miniprogram/pages/activity-detail/index.wxss:714` | `rgba(12, 10, 7, 0.68)` | `direct` | `--surface-dialog-backdrop` | `rgba(12, 10, 7, 0.68)` |
| 11 | `miniprogram/pages/activity-detail/index.wxss:734` | `rgba(12, 10, 7, 0.56)` | `direct` | `--surface-dialog-control` | `rgba(12, 10, 7, 0.56)` |
| 12 | `miniprogram/pages/activity-detail/index.wxss:759` | `rgba(12, 10, 7, 0.76)` | `direct` | `--scrim-attendee-card-strong` | `rgba(12, 10, 7, 0.76)` |
| 13 | `miniprogram/pages/activity-detail/index.wxss:759` | `rgba(12, 10, 7, 0)` | `direct` | `--scrim-attendee-card-clear` | `rgba(12, 10, 7, 0)` |
| 14 | `miniprogram/pages/activity-detail/index.wxss:785` | `rgba(255, 255, 255, 0.18)` | `direct` | `--surface-attendee-avatar-glass` | `rgba(255, 255, 255, 0.18)` |
| 15 | `miniprogram/pages/admin/activity-edit/index.wxss:291` | `rgba(12, 10, 7, 0.78)` | `direct` | `--surface-media-index` | `rgba(12, 10, 7, 0.78)` |
| 16 | `miniprogram/pages/admin/activity-edit/index.wxss:319` | `rgba(12, 10, 7, 0.82)` | `direct` | `--surface-media-action` | `rgba(12, 10, 7, 0.82)` |
| 17 | `miniprogram/pages/admin/activity-edit/index.wxss:326` | `rgba(165, 42, 28, 0.92)` | `direct` | `--surface-media-danger` | `rgba(165, 42, 28, 0.92)` |
| 18 | `miniprogram/pages/admin/activity-list/index.wxss:180` | `#fff` | `direct` | `--color-on-action` | `#ffffff` |
| 19 | `miniprogram/pages/admin/activity-list/index.wxss:190` | `rgba(0, 0, 0, 0.08)` | `direct` | `--shadow-swipe-color` | `rgba(0, 0, 0, 0.08)` |
| 20 | `miniprogram/pages/admin/activity-list/index.wxss:351` | `rgba(192, 50, 31, 0.08)` | `fallback-only` | `--color-status-warning-soft` | `#fff2c7` |
| 21 | `miniprogram/pages/admin/activity-list/index.wxss:450` | `rgba(192, 50, 31, 0.08)` | `fallback-only` | `--color-status-warning-soft` | `#fff2c7` |
| 22 | `miniprogram/pages/admin/activity-list/index.wxss:540` | `rgba(12, 10, 7, 0.56)` | `direct` | `--surface-photo-count` | `rgba(12, 10, 7, 0.56)` |
| 23 | `miniprogram/pages/admin/club-application-detail/index.wxss:160` | `rgba(255, 255, 255, 0.3)` | `direct` | `--surface-upload-progress-track` | `rgba(255, 255, 255, 0.3)` |
| 24 | `miniprogram/pages/admin/club-applications/index.wxss:70` | `#fff` | `fallback-only` | `--color-on-media` | `#ffffff` |
| 25 | `miniprogram/pages/admin/club-applications/index.wxss:106` | `rgba(12, 10, 7, 0.1)` | `direct` | `--scrim-club-admin-top` | `rgba(12, 10, 7, 0.1)` |
| 26 | `miniprogram/pages/admin/club-applications/index.wxss:107` | `rgba(12, 10, 7, 0.05)` | `direct` | `--scrim-club-admin-mid` | `rgba(12, 10, 7, 0.05)` |
| 27 | `miniprogram/pages/admin/club-applications/index.wxss:108` | `rgba(12, 10, 7, 0.72)` | `direct` | `--scrim-club-admin-strong` | `rgba(12, 10, 7, 0.72)` |
| 28 | `miniprogram/pages/admin/club-applications/index.wxss:122` | `rgba(255, 255, 255, 0.86)` | `direct` | `--color-club-admin-eyebrow` | `rgba(255, 255, 255, 0.86)` |
| 29 | `miniprogram/pages/admin/club-applications/index.wxss:134` | `#fff` | `direct` | `--color-on-media` | `#ffffff` |
| 30 | `miniprogram/pages/admin/review-detail/index.wxss:319` | `rgba(192, 50, 31, 0.08)` | `fallback-only` | `--color-status-warning-soft` | `#fff2c7` |
| 31 | `miniprogram/pages/club/center/index.wxss:34` | `rgba(255, 255, 255, 0.08)` | `direct` | `--surface-club-fallback-shine` | `rgba(255, 255, 255, 0.08)` |
| 32 | `miniprogram/pages/club/center/index.wxss:34` | `rgba(255, 255, 255, 0)` | `direct` | `--surface-club-fallback-clear` | `rgba(255, 255, 255, 0)` |
| 33 | `miniprogram/pages/club/center/index.wxss:35` | `rgba(255, 255, 255, 0.12)` | `direct` | `--surface-club-fallback-glow` | `rgba(255, 255, 255, 0.12)` |
| 34 | `miniprogram/pages/club/center/index.wxss:46` | `rgba(12, 10, 7, 0.1)` | `direct` | `--scrim-club-cover-top` | `rgba(12, 10, 7, 0.1)` |
| 35 | `miniprogram/pages/club/center/index.wxss:47` | `rgba(12, 10, 7, 0.05)` | `direct` | `--scrim-club-cover-mid` | `rgba(12, 10, 7, 0.05)` |
| 36 | `miniprogram/pages/club/center/index.wxss:48` | `rgba(12, 10, 7, 0.78)` | `direct` | `--scrim-club-cover-strong` | `rgba(12, 10, 7, 0.78)` |
| 37 | `miniprogram/pages/club/center/index.wxss:56` | `rgba(255, 255, 255, 0.7)` | `direct` | `--border-club-location` | `rgba(255, 255, 255, 0.7)` |
| 38 | `miniprogram/pages/club/center/index.wxss:63` | `rgba(12, 10, 7, 0.4)` | `direct` | `--surface-club-location` | `rgba(12, 10, 7, 0.4)` |
| 39 | `miniprogram/pages/club/center/index.wxss:80` | `rgba(12, 10, 7, 0.42)` | `direct` | `--surface-club-identity` | `rgba(12, 10, 7, 0.42)` |
| 40 | `miniprogram/pages/club/center/index.wxss:89` | `rgba(255, 255, 255, 0.85)` | `direct` | `--border-club-avatar` | `rgba(255, 255, 255, 0.85)` |
| 41 | `miniprogram/pages/club/center/index.wxss:119` | `rgba(255, 255, 255, 0.84)` | `direct` | `--color-club-intro` | `rgba(255, 255, 255, 0.84)` |
| 42 | `miniprogram/pages/credential/index.wxss:86` | `rgba(255, 255, 255, 0.3)` | `direct` | `--border-credential-divider` | `rgba(255, 255, 255, 0.3)` |
| 43 | `miniprogram/pages/credential/index.wxss:107` | `rgba(255, 255, 255, 0.12)` | `direct` | `--surface-credential-chip` | `rgba(255, 255, 255, 0.12)` |
| 44 | `miniprogram/pages/credential/index.wxss:109` | `rgba(255, 255, 255, 0.2)` | `direct` | `--border-credential-chip` | `rgba(255, 255, 255, 0.2)` |
| 45 | `miniprogram/pages/profile/index.wxss:53` | `rgba(12, 10, 7, 0.08)` | `direct` | `--scrim-profile-hero-top` | `rgba(12, 10, 7, 0.08)` |
| 46 | `miniprogram/pages/profile/index.wxss:54` | `rgba(12, 10, 7, 0.04)` | `direct` | `--scrim-profile-hero-soft` | `rgba(12, 10, 7, 0.04)` |
| 47 | `miniprogram/pages/profile/index.wxss:55` | `rgba(12, 10, 7, 0.42)` | `direct` | `--scrim-profile-hero-mid` | `rgba(12, 10, 7, 0.42)` |
| 48 | `miniprogram/pages/profile/index.wxss:56` | `rgba(12, 10, 7, 0.94)` | `direct` | `--scrim-profile-hero-strong` | `rgba(12, 10, 7, 0.94)` |
| 49 | `miniprogram/pages/profile/index.wxss:111` | `rgba(255, 255, 255, 0.78)` | `direct` | `--color-profile-eyebrow` | `rgba(255, 255, 255, 0.78)` |
| 50 | `miniprogram/pages/profile/index.wxss:139` | `rgba(255, 255, 255, 0.86)` | `direct` | `--color-profile-meta` | `rgba(255, 255, 255, 0.86)` |
| 51 | `miniprogram/pages/registrations/index.wxss:214` | `#fff` | `direct` | `--color-on-action` | `#ffffff` |
| 52 | `miniprogram/pages/registrations/index.wxss:262` | `rgba(0, 0, 0, 0)` | `direct` | `--scrim-registration-cover-clear` | `rgba(0, 0, 0, 0)` |
| 53 | `miniprogram/pages/registrations/index.wxss:262` | `rgba(0, 0, 0, 0.35)` | `direct` | `--scrim-registration-cover-strong` | `rgba(0, 0, 0, 0.35)` |

## 字体字面量

| file:line | current font family | token | token current value |
| --- | --- | --- | --- |
| `miniprogram/components/activity-card/index.wxss:58` | `'Songti SC', STSong, serif` | `--font-family-editorial` | `'Songti SC', STSong, serif` |
