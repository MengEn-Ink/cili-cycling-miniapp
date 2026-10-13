# UI Sync Evidence: main@7038e5c

- Source baseline: `7038e5c44a958e4d553b218f2303217773c96310`
- Capture date: 2026-10-13
- Viewport: `726 x 1570` pixels
- Mini program: WeChat DevTools and `miniprogram-automator@0.12.1`
- Pages prototype: Chrome 155 headless against the local `docs/` server

Each covered route has a `*-devtools.png` source screenshot and a
`*-pages.png` prototype screenshot. The comparison covers route identity,
runtime fixture content, information hierarchy, visible states, controls,
spacing, and light-theme readability. The Pages site is an interactive
high-fidelity prototype, not a pixel-for-pixel simulator rendering.

`devtools-results.json` records seven passing read-only runtime assertions,
zero failures, and zero exceptions for activities, registrations, activity
detail, and credential. The activity-management screenshot was captured
separately through the same Automator channel after opening
`pages/admin/activity-list/index`; it is not included in those seven
assertions.

All five Pages screenshots were visually checked for missing images,
horizontal overflow, clipping, overlap, and low-contrast text. The activity
detail copy control was also exercised and returned `轨迹链接已复制`.
