# Tabbar Theme Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove white flashes and bottom white exposure during native tab switching by making the CILI dark shell authoritative from the first platform paint.

**Architecture:** Keep the native tabbar and make static app configuration, the global `page` surface, and each tab page root agree on one dark background. Lock the contract with static tests so page lifecycle and network timing cannot reintroduce a light intermediate frame.

**Tech Stack:** WeChat Mini Program JSON/WXSS, TypeScript, Vitest.

---

### Task 1: Lock the first-paint shell contract

**Files:**
- Modify: `tests/tabbar-safe-area-contract.test.ts`

- [ ] Add a failing test asserting `window.navigationBarBackgroundColor`, `window.backgroundColor`, `window.backgroundColorTop`, and `window.backgroundColorBottom` are `#0b0b0c`, with white navigation text and light pull-down indicators.
- [ ] Add a failing test asserting the global `page` selector has `background: #0b0b0c` and each tab page JSON carries a dark page fallback.
- [ ] Add a failing test asserting all three tab roots have `min-height: 100vh`, a dark background, and the shared safe-area padding contract.
- [ ] Run `npx vitest run tests/tabbar-safe-area-contract.test.ts` and confirm failures point to the old light app shell.

### Task 2: Make the native shell dark before page code runs

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/pages/activities/index.json`
- Modify: `miniprogram/pages/registrations/index.json`
- Modify: `miniprogram/pages/profile/index.json`
- Modify: `miniprogram/pages/activities/index.wxss`

- [ ] Set all app window and system background fields to `#0b0b0c`, navigation text to white, and pull-down text to light.
- [ ] Change only the global page canvas from the old light background to CILI black; retain existing component primitives and page-local charcoal surfaces.
- [ ] Add explicit dark background fallbacks to the three tab page configs and the activities page surface.
- [ ] Run the focused test and confirm it passes without adding runtime color calls or custom tabbar code.

### Task 3: Regression gate and review handoff

**Files:**
- Verify all files from Tasks 1–2.

- [ ] Run `npm run format:check`, `npm run lint`, `npm run typecheck`, focused tab/lifecycle/theme tests, and `git diff --check`.
- [ ] Commit the isolated Phase 2 UI change.
- [ ] Request independent review of the exact commit range; do not merge or upload until Phase 1 and the latest-main rebase decision are cleared.
