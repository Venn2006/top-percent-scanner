# TopLuong VSPI Production Checkpoint - 964425f

Date: 2026-06-04

## Current Production Commit

- Commit: `964425f fix(roadmap): restore generated roadmaps without fallback`
- Branch: `main`
- Status: production checkpoint after STEP 87A deploy and restore-hydration smoke
- Previous production product commit: `e6f2279 fix(progress): improve customer recovery hub`
- Production aliases:
  - `https://topluong.com`
  - `https://www.topluong.com`

## Why This Release Exists

STEP 86A deployed the `/my-progress` recovery hub and most production smoke checks passed:

- Phone lookup recovery cards rendered.
- Access-code privacy masking worked.
- Controlled 29K and 79K recovery cards worked.
- Controlled paid 79K without `roadmap_json` opened paid recovery without calling generation.

However, the known generated 79K roadmap restore was blocked:

- URL: `https://topluong.com/roadmap?restore=1&id=VSPI-2026-MYCW-N3JQ&accessCode=GWLSCOCHEEHQ&phone=0222222222&t=e6f2279-direct-focused`
- Expected: open saved generated roadmap with progress/evidence/certificate.
- Actual on `e6f2279`: landed on public 79K create form.
- It asked for current role, target role, and salary again.
- `POST /api/roadmap/generate`: `0`.
- `GET /api/roadmap/generate`: `1`.

This was not a regeneration bug. It was a restore GET/hydration fallback bug.

## Root Cause

- Production GET restore for a generated roadmap returned `roadmap_json` and `task_progress`, but still used ambiguous `status: paid`.
- The GET route did not return saved `roadmap_json` immediately.
- It continued into role-safety and quality-repair logic.
- It still contained a GET-side low-quality fallback/regeneration path.
- One direct production fetch took about `49s`.
- The client could remain on, or fall back to, blank public intake before saved roadmap hydration completed.

Observed production response shape before the fix:

- HTTP: `200`.
- `roadmap_json`: present.
- `task_progress`: present.
- `status`: `paid`.
- `vspi_id`: `VSPI-2026-MYCW-N3JQ`.
- `accessCode`: `GWLSCOCHEEHQ`.
- `role_id`: `f&b manager__nha hang - khach san - du lich`.
- `job_title`: `F&B Manager`.

## Fix Summary In `964425f`

- Existing saved `roadmap_json` returns immediately from GET restore.
- Generated records return `status: generated`.
- Saved `task_progress` returns unchanged as canonical progress.
- Paid records without `roadmap_json` still return `status: paid`.
- Frontend restore accepts `paid`, `generated`, and `ready`.
- No `POST /api/roadmap/generate` is introduced for restore.
- Existing generated roadmaps are not forced through new future-goal intake validation.

## STEP 87A Deployment

- Deployment path: GitHub `main` -> Vercel Git integration.
- Pushed range: `e6f2279..964425f`.
- Vercel deployment: `https://top-percent-scanner-jhbgbpmiv-trongvan2006-gmailcoms-projects.vercel.app`.
- Vercel status: Ready.
- Build log confirmed exact source: `Cloning github.com/Venn2006/top-percent-scanner (Branch: main, Commit: 964425f)`.
- Vercel build completed successfully.
- Production aliases confirmed:
  - `https://topluong.com`
  - `https://www.topluong.com`

## STEP 87A Production Smoke

### Direct API Restore

Tested:

- `/api/roadmap/generate?restore=1&id=VSPI-2026-MYCW-N3JQ&accessCode=GWLSCOCHEEHQ&phone=0222222222`

Result:

- HTTP: `200`.
- Timing: `2914ms`.
- `status`: `generated`.
- `roadmap_json`: present.
- `task_progress`: present.
- `vspi_id`: `VSPI-2026-MYCW-N3JQ`.
- `accessCode`: `GWLSCOCHEEHQ`.
- `role_id`: `f&b manager__nha hang - khach san - du lich`.
- `job_title`: `F&B Manager`.
- `duration_months`: `6`.
- No POST generation.
- No live LLM call.

### Known Generated Roadmap UI

Direct restore URL:

- `https://topluong.com/roadmap?restore=1&id=VSPI-2026-MYCW-N3JQ&accessCode=GWLSCOCHEEHQ&phone=0222222222&t=964425f-direct-focused`

Result:

- Saved/generated roadmap view opened directly.
- Public create form appeared: no.
- Blank current-role / target-role / salary intake appeared: no.
- `AI dang phan tich` state appeared: no.
- `POST /api/roadmap/generate`: `0`.
- `GET /api/roadmap/generate`: `1`.
- Resume panel visible.
- Progress visible.
- Evidence area visible.
- Certificate area visible.
- Known role visible: `F&B Manager`.

### `/my-progress` Recovery Flow

Phone lookup:

- Phone: `0222222222`.

Result:

- Recovery cards appeared.
- Known 79K card visible: `F&B Manager`.
- Access code masked: `GWLS....EHQ` in text form, rendered as `GWLS....EHQ`/bullet-masked in UI.
- Full access-code leak in phone-only view: no.
- Exact access flow passed.
- Card action opened canonical restore URL:
  - `/roadmap?restore=1&id=VSPI-2026-MYCW-N3JQ&accessCode=GWLSCOCHEEHQ&phone=0222222222`
- Opened generated roadmap directly.
- Public create form after card open: no.
- `POST /api/roadmap/generate`: `0`.

### Certificate Regression

- Certificate panel visible.
- Certificate PNG exported.
- Export dimensions: `1080x1350`.
- File: `step87a-certificate-export.png`.
- Note: the known record currently showed `0/24` progress/evidence in this smoke, so this verifies export/render path and clean placeholder state, not a non-empty evidence record.

### Other Regression Smoke

- `/api/jobs`: `315` jobs, `315` with `role_id`, `0` missing, `0` duplicate.
- `/admin?t=964425f`: loads, no obvious crash.
- `/roadmap?t=964425f`: future-goal intake loads.
- Barista no-submit CTA path:
  - Exact `Barista (Pha che ca phe)` suggestion selected.
  - Role badge visible.
  - CTA enabled.
  - Checkout POST: `0`.
  - Generate POST: `0`.

Paid no-roadmap path was not re-created in STEP 87A to avoid unnecessary test data. Existing local and production recovery coverage from prior steps remains relevant: paid records without `roadmap_json` return `status: paid` and show paid recovery/intake, not a public unpaid blank form.

## Audits

STEP 87A audits all passed:

- `auditRoadmapRestoreHydration`: PASS.
- `auditRoadmapHistoryReopen`: PASS.
- `auditMyProgressRecoveryUX`: PASS.
- `auditRoadmapResumeProgress`: PASS.
- `auditReportToRoadmapStateHandoff`: PASS.
- `auditCertificateExportLayout`: PASS.
- `auditRoadmapFutureGoalIntake`: PASS.

No code changes were made during STEP 87A, so local lint/build/typecheck were not rerun in the deploy step. Vercel production build was the authoritative build confirmation and passed for commit `964425f`.

## Current Feature Status

### Free Scan

- `/api/jobs` remains healthy with `315` jobs and `315` role IDs.
- Representative free-scan and role-boundary coverage from previous checkpoints remains valid.

### 29K Report

- Paid report access and recovery paths remain covered by previous controlled smoke.
- Mismatch denial and access validation were previously verified.

### 79K Roadmap

- Future-goal intake remains active.
- Current and target roles remain separated.
- Exact-role CTA path remains usable after role selection.
- Saved generated roadmaps now reopen directly through `/roadmap` restore URLs.
- `/my-progress` can list masked recovery cards and open exact-access generated roadmaps.
- Existing generated roadmaps do not call generation on restore.

### Progress, Evidence, And Certificate

- Server `task_progress` remains canonical for restore.
- Resume panel is visible after reopening generated roadmaps.
- Certificate export still produces `1080x1350` PNG.

### Admin

- `/admin?t=964425f` loads without obvious crash.
- Prior admin manual-confirm and cleanup-scoping smoke remains valid.

### Payment And Recovery

- No real payment was created in STEP 87A.
- No customer data was deleted.
- Paid-no-roadmap recovery behavior remains covered by previous tests and local audits.

## Known Caveats

- Broad live paid 79K generation for all roles remains not fully production-proven.
- Real payment webhook/live bank payment was not exercised.
- STEP 87A did not create a fresh paid no-roadmap controlled record.
- The known restore record used in STEP 87A is an existing generated `F&B Manager` roadmap and was treated read-only.
- The known record showed `0/24` progress in STEP 87A smoke, so certificate export was checked for dimensions and render path rather than non-empty evidence content.

## Evidence Artifacts

STEP 87A artifacts were saved outside the repo under:

- Folder: `C:\Users\Venn\top-percent-step87a-restore-smoke`
- `step87a-api-restore-shape.json`
- `step87a-known-roadmap-direct.png`
- `step87a-known-roadmap-network.json`
- `step87a-my-progress-card.png`
- `step87a-my-progress-exact-open.json`
- `step87a-my-progress-exact-opened.png`
- `step87a-certificate-panel.png`
- `step87a-certificate-export.png`
- `step87a-roadmap-barista-cta-selected.json`
- `step87a-regression.json`
- `step87a-vercel-build-logs.txt`

## Future Retest Checklist

- Direct known generated restore URL opens saved roadmap, not public create form.
- `/my-progress` phone-only view masks access codes.
- `/my-progress` exact access opens canonical restore URL.
- Restore produces `0` `POST /api/roadmap/generate` calls.
- Paid no-roadmap record opens paid recovery/intake and does not ask user to pay again.
- Future-goal intake still separates current role, target role, future goal, and target salary.
- Same-role growth and career-switch CTA paths still enable only after exact role selection or custom confirmation.
- Certificate export remains `1080x1350` with no overflow.
- `/api/jobs` remains `315` total and `315` role IDs.
- `/admin` loads and admin actions remain scoped.

## Future Work Rules

- Do not use `git add .`.
- Do not deploy a dirty worktree.
- Do not create real payments.
- Do not delete customer data.
- Do not call live LLM unless the step explicitly requires a controlled canary.
- Trace root cause before fixes.
- Every step must report files changed, tests/audits, commit hash, git status, and production status.
