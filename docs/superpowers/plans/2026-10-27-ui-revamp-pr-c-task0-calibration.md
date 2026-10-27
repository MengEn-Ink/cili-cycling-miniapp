# UI Revamp PR C Task 0 Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One writer owns the calibration code and evidence; the judge stays read-only.

**Goal:** Restore and harden the fixed-host Task 0 probe so visual baselines can only be frozen from empirically measured iPhone X PNG evidence on the target macOS host, with separate Android typography and bright-photo scrim evidence.

**Architecture:** Reuse the previously audited calibration probe from historical commit `e0b09677` as a source reference, not as an unreviewed cherry-pick. The probe collects exact host/tool/device facts, hashes the host UUID with a domain separator, reads PNG dimensions from the PNG header, fences HEAD/porcelain before and after, and emits `PASSED/COMPLETED` or `BLOCKED/NOT_RUN`. A reviewer-approved immutable calibration record is then transformed into the checked-in environment manifest; Android and bright-photo samples remain labeled supplemental, not baseline dimensions.

**Tech Stack:** Node.js CommonJS/ESM tests, WeChat DevTools CLI, miniprogram-automator 0.12.1, macOS CoreGraphics/JXA Accessibility, PNG header parsing, SHA-256, GitHub Actions contract tests.

---

## Dependencies and files

- Requires PR B merged and verified on main.
- Source reference: `git show e0b09677:scripts/e2e/visual-calibrate.cjs` and its tests/fixture. Re-implement only the audited minimal behavior; do not merge the historical branch.

**Create**

- `scripts/e2e/visual-calibrate.cjs`
- `scripts/e2e/visual-calibrate.node-test.mjs`
- `scripts/e2e/fixtures/visual-calibration-project/` — tourist appid, one settings page, no cloud root or credentials.
- `scripts/e2e/approve-visual-environment.mjs` and tests — reviewer-controlled conversion from immutable PASS evidence to manifest.
- `e2e/visual-environment.json` — only after PASS evidence and independent approval.
- `docs/verification/2026-10-27-ui-revamp-pr-c-task0.md`
- `docs/evidence/YYYY-MM-DD-visual-calibration-<head>/` — `calibration.json`, README, PNG, supplemental Android/font/scrim artifacts after sanitization.

**Modify**

- `package.json` — `test:visual-calibration`, `visual:calibrate`, approval command; hook tests into validate, never run host probe in generic CI.
- `docs/verification/wechat-devtools-e2e.md`
- `docs/high-priority-issues.md` — update UI V1 and Governance V2 in lockstep.

## Task 1: Recreate tests before probe code

- [ ] Branch from the PR B post-merge main in a clean worktree `chore/ui-task0-calibration-20261027`; record start HEAD/porcelain.
- [ ] Restore the historical test intent into `scripts/e2e/visual-calibrate.node-test.mjs` before the implementation file exists.
- [ ] Tests must cover exact version drift, dirty start/end, HEAD drift, missing/ambiguous host UUID, raw UUID non-leakage, PNG signature/24-byte dimensions, device/SDK/DPR, Auto Fit false, unique DevTools window, Accessibility timeout vs permission failure, output path confinement, safe temp deletion, and manifest refusal from BLOCKED evidence.
- [ ] Add new tests for supplemental evidence labels:

  ```js
  assert.equal(calibration.baseline.kind, 'ios-iphone-x');
  assert.equal(calibration.supplemental.android.kind, 'font-fallback-functional');
  assert.equal(calibration.supplemental.android.baselineEligible, false);
  assert.equal(calibration.supplemental.brightPhoto.fixture, 'lakeside.jpg');
  ```

- [ ] Run `node --test scripts/e2e/visual-calibrate.node-test.mjs`; expect `MODULE_NOT_FOUND`. Save RED output.
- [ ] Commit tests: `test(visual): 锁定 Task 0 校准边界`.

## Task 2: Implement the fail-closed probe

- [ ] Implement the historical exported API: `assessCalibration`, `buildEnvironmentManifest`, `collectHostProbe`, `executeCalibration`, `hashDirectory`, `normalizeSimulatorProbe`, `parseArguments`, `parsePngHeader`, `parseWindowInventory`, `persistCalibrationEvidence`, `readAutomatorVersion`, `readCoreGraphicsWindow`, `readDevtoolsVersion`, `readMachineFingerprintSha256`, `readMacosVersion`, `readSimulatorSettings`, `runDevtoolsProbe`, `safeRemoveCalibrationTemp`.
- [ ] Keep constants exact and explicit after live re-verification: runner `cili-visual-macos-01`, iPhone X 375×812 DPR3, automator 0.12.1, current DevTools/macOS/base-library versions. If any live version differs from the historical constants, update tests and docs in the same commit; never accept arbitrary non-empty versions.
- [ ] Derive host identity only as:

  ```js
  createHash('sha256').update(`cili-visual-host-v1\0${uuid.toLowerCase()}`).digest('hex');
  ```

  Raw UUID must never enter stdout, JSON, README, screenshots, or errors.
- [ ] Parse width/height from big-endian PNG header offsets 16/20; do not infer size from DPR, toolbar labels, runner labels, or historical PNGs.
- [ ] Collect repository snapshots before opening DevTools and after screenshot persistence; PASS requires equal 40-char HEAD and empty porcelain both times.
- [ ] Use at least a 30-second JXA/Accessibility timeout and distinct reason codes for permission, timeout, ambiguous window, device mismatch, tool drift, and repository drift.
- [ ] Run tests GREEN and commit: `feat(visual): 恢复固定主机 Task 0 探针`.

## Task 3: Add the tourist fixture and supplemental samples

- [ ] Create a minimal fixture with `appid: touristappid`, `miniprogramRoot: miniprogram/`, no `cloudfunctionRoot`, one `pages/settings/index`, and no real user/cloud data.
- [ ] Fixture contains a local copy or deterministic reference hash for the approved `lakeside.jpg` bright sample, the editorial string `黑分解 ride`, long Chinese text, tabular digits, white-on-photo text, and a 44px control marker.
- [ ] The iPhone X pass captures the settings fixture and bright-photo sample. The Android simulator pass captures only font fallback, wrapping, cropping, and scrim readability; its report sets `baselineEligible:false`.
- [ ] Add fixture hash stability/mutation tests and verify no network/cloud write.
- [ ] Commit: `test(visual): 增加字体与亮图校准样本`.

## Task 4: Separate probe from reviewer approval

- [ ] `visual-calibrate.cjs --output docs/evidence/<date>-visual-calibration-<shortsha>` writes new files with `wx`, never overwrites evidence, and never writes `e2e/visual-environment.json`.
- [ ] `approve-visual-environment.mjs` accepts only a repo-relative `calibration.json`, verifies its SHA, PASS status, exact start/end HEAD, empty porcelain, exact host/tool fields, PNG header facts, and an explicit reviewer approval record. It copies only non-sensitive facts into the manifest.
- [ ] Add tests proving BLOCKED, NOT_RUN, missing reviewer, stale SHA, or modified evidence cannot create a manifest.
- [ ] Add package scripts:

  ```json
  "test:visual-calibration": "node --test scripts/e2e/visual-calibrate.node-test.mjs scripts/e2e/approve-visual-environment.node-test.mjs",
  "visual:calibrate": "node scripts/e2e/visual-calibrate.cjs"
  ```

  Hook only `test:visual-calibration` into generic `validate`.
- [ ] Commit: `build(visual): 接入 Task 0 校准门禁`.

## Task 5: Run Task 0 on the target host

- [ ] Fence processes/ports without killing MCP; prove no project window/automation port and preserve the MCP daemon.
- [ ] Run the probe from a clean committed SHA on the actual target host. If Accessibility, device, Auto Fit, versions, or host identity fail, write BLOCKED evidence, update both P1 rows, send a blocked attention message with exact operator action, and stop. Do not soften the verdict.
- [ ] On iPhone X PASS, record logical systemInfo 375×812/DPR3 and empirical PNG dimensions/header/hash. Do not copy historical `731×1583` or any guessed size unless the new PNG independently produces it.
- [ ] Run supplemental Android typography and `lakeside.jpg` scrim captures; label them functional supplemental evidence only.
- [ ] Hand PASS evidence to the judge. Only after independent hash/host/tool/HEAD verification, run the approval command to create `e2e/visual-environment.json`.
- [ ] After target-host calibration is approved, recapture the phase3 UI-sync evidence for all 16 manifest pages at 340/375/430 logical widths (16×3). Use the calibrated host and empirical PNG contract, preserve actual-content summaries and states, and do not use masks or the 390-wide functional巡检 screenshots as baseline evidence.
- [ ] Recompute the current UI source digest from that approved 16×3 capture, update `docs/ui-sync-manifest.json` `source.digest` to the new digest, and delete the entire `source.valuePreservation` provenance entry. Do not retain a closed or empty provenance placeholder.
- [ ] Commit sanitized evidence/manifest/report and update both P1 rows to `PR_C_EVIDENCE_READY / REVIEW_PENDING`.

## Task 6: Full gates, PR, merge, and main proof

- [ ] Run `npm run test:visual-calibration`, `npm run check:design`, `npm run check:ui-sync -- --strict`, `OUT_DIR=/tmp/cili-pr-c-validate npm run validate`, coverage, audit, and diff checks with start/end fences.
- [ ] Prove `npm run check:ui-sync -- --strict` passes with no `source.valuePreservation` field and ordinary strict equality between the recomputed current source digest and `docs/ui-sync-manifest.json` `source.digest`; any provenance-assisted pass is a failure for PR C.
- [ ] Judge independently verifies unit tests, evidence hashes, raw UUID absence, PNG header, Android label boundary, and manifest derivation.
- [ ] Open a PR limited to calibration code/fixture/docs/evidence/manifest/package wiring. Require PR checks and merge by frozen head.
- [ ] After main CI, update both P1 rows to PR C merged. Baseline availability authorizes route-family visual work; it does not itself prove any UI slice, development upload, experience version, or physical UAT.

## Self-review

- [ ] No raw UUID or account/cloud identifier is stored.
- [ ] Logical 375×812 and empirical PNG dimensions remain separate fields.
- [ ] Android screenshots are never baseline-eligible.
- [ ] Generic CI runs tests, not the host probe.
- [ ] Missing execution remains BLOCKED/NOT_RUN, never PASS.
- [ ] HEAD and porcelain are recorded both before and after every long probe.
- [ ] Phase3 contains 16 pages × 340/375/430 captures from the calibrated target host, `source.digest` is rebound to their current source, the entire `source.valuePreservation` entry is deleted, and strict UI-sync passes by ordinary digest equality without provenance.
