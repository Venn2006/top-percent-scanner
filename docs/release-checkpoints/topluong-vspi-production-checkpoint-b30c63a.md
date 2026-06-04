# TopLuong VSPI Production Checkpoint - b30c63a

Date: 2026-06-04

## Current Production Commit

- Commit: `b30c63a fix(roadmap): support custom role generation without exact profile`
- Branch: `main`
- Status: production checkpoint after STEP 82A deploy and controlled live custom-role canary
- Previous production product commit: `9548821 fix(roadmap): collect future goal and target role separately`
- Latest docs checkpoint before this release: `52ee146 docs(release): add live 79k canary results`

## Production Aliases

- `https://topluong.com`
- `https://www.topluong.com`

## Why This Release Exists

STEP 82 production canary found a blocker in custom unsupported-role generation:

- Custom-role checkout correctly persisted `role_id = null`.
- The record correctly indicated custom target-role mode instead of silently mapping to an unrelated canonical role.
- However, `POST /api/roadmap/generate` still entered the exact role-lock profile path.
- Exact role lookup failed for the unsupported custom role.
- Production returned `503 ROADMAP_GENERATION_FAILED`.

The issue affected paid 79K roadmap generation for unsupported/custom roles after the future-goal intake redesign.

## Root Cause

- `buildRoadmapRoleSkills()` required an exact role profile.
- Custom roles intentionally have no exact role profile and should not receive a fake canonical `role_id`.
- The generate path did not branch into custom-safe skill and prompt logic before attempting exact role-profile resolution.
- As a result, unsupported custom roles could pass checkout but fail at generation time.

## Fix Summary In `b30c63a`

- Custom mode no longer resolves free-text target role into an exact `role_id`.
- Generation uses `buildCustomRoadmapRoleSkills()` when custom target-role mode is active.
- Generated custom roadmaps include a `custom_role_notice`.
- Prompt context marks unsupported custom roles with `custom_no_benchmark_role_id`.
- Prompt instructions forbid silent canonicalization into unrelated supported jobs.
- Prompt instructions forbid exact percentile or exact benchmark claims for unsupported custom roles.
- Deterministic fallback carries the limited-benchmark notice.
- Future-goal intake audit coverage was strengthened for custom unsupported-role assertions.

## STEP 82A Production Canary Result

STEP 82A deployed `b30c63a` through Vercel Git integration and reran a controlled live custom-role canary. No product code was changed during the deploy step, no real payment was created, and no customer data was deleted.

### Custom Role Canary

- Custom role: `Chuyên viên trị liệu nghệ thuật`.
- Final UTF-8 test phone: `0333333305`.
- Final UTF-8 VSPI/access: `VSPI-2026-M9CK-YTTX` / `YI8ZUMY7MI2S`.
- Unlock path: manual admin unlock only.
- Real payment: none.
- Customer data deletion: none.

### Checkout And Generation

- Checkout status: `200`.
- Persisted `roleId`: `null`.
- Persisted `customTargetRole`: `true`.
- Wrong canonical mapping: none observed.
- `POST /api/roadmap/generate`: `200`.
- Live generate call count for the final UTF-8 record: exactly `1`.
- Generated role/title: `Chuyên viên trị liệu nghệ thuật`.
- Limited benchmark/custom-role notice: present.
- Exact percentile precision claim: none observed.
- Duration/tasks: `6` milestones, `24` weeks, `24` tasks.

### Content Quality

Required custom-role context was present, including:

- `trị liệu nghệ thuật`
- `portfolio`
- `ca tư vấn`
- `khách hàng`
- `đạo đức`
- `ranh giới`
- `dịch vụ`
- `kết quả`
- `giá`

Forbidden unrelated-role hits: `0`.

### Progress, Reopen, And Certificate

- Progress/evidence: PASS, with `2` completed tasks persisted.
- Reopen by phone/access: PASS.
- Reopen `POST /api/roadmap/generate`: `0` calls observed.
- No `AI đang phân tích hồ sơ` state on reopen.
- No blank create form fallback.
- Certificate export: PASS.
- Certificate PNG dimensions: `1080x1350`.
- Evidence rows: visible/readable.

### Cleanup

Two STEP 82A test records were cleaned up by exact VSPI/access after dry-run verification:

- Encoding-tainted first attempt: `VSPI-2026-NHWS-NR8K` / `R03DSBRGGHDO`.
  - Dry-run: `1` roadmap row, `0` payment events.
  - Delete: `1` roadmap row, `0` payment events.
  - Follow-up: `0` rows left.
- Final UTF-8 record: `VSPI-2026-M9CK-YTTX` / `YI8ZUMY7MI2S`.
  - Dry-run: `1` roadmap row, `0` payment events.
  - Delete: `1` roadmap row, `0` payment events.
  - Follow-up: `0` rows left.

No customer data was deleted. No real payment was created.

## Regression Summary

- `auditRoadmapFutureGoalIntake`: PASS.
- `auditRoadmapResumeProgress`: PASS.
- `auditCertificateExportLayout`: PASS.
- `auditSameIndustryRoleContaminationFull`: PASS.
- `/api/jobs`: `315` total, `315` with `role_id`, `0` missing, `0` duplicate.
- Existing exact-role roadmap reopen: PASS, with `0` `POST /api/roadmap/generate` calls.
- Barista CTA regression: PASS.
- `/admin?t=b30c63a`: `200`, no obvious crash.
- `/roadmap`: readable Vietnamese in production smoke.

## STEP 84 - Payment And Access Recovery E2E Smoke

STEP 84 smoked controlled production payment/access recovery paths without changing code, deploying, creating a real payment, or deleting customer data. The smoke covered pending checkout creation, manual admin confirm, paid access recovery, mismatch denial, admin scoping, and exact test-row cleanup.

### 29K Report Access Smoke

- Test phone: `0333333401`.
- VSPI/access: `VSPI-2026-JRRL-NWLS` / access is the VSPI ID.
- Checkout: `200`.
- Pending status before confirm: `pending` via `/api/premium/verify`.
- Manual confirm: PASS on canonical `https://www.topluong.com`.
- Report lookup: PASS, `/api/report-lookup` status `200`.
- Report UI: paid/unlocked, no paywall.
- Role remained: `Barista`.
- Wrong phone + correct VSPI: denied, `403`.
- Correct phone + wrong VSPI: denied, `404`.
- Empty phone/access: validation, `400`.

### 79K Roadmap Access Smoke

- Test phone: `0333333402`.
- VSPI/access: `VSPI-2026-AAQJ-DKLJ` / `RSGGNAWKEO2H`.
- Checkout: `200`.
- Pending before confirm: paid lookup denied as expected, `404`.
- Manual confirm: PASS on canonical `https://www.topluong.com`.
- Paid recovery: PASS, `/api/roadmap/generate` GET status `200`, returned `status: paid`.
- `roadmap_json` before generation: missing/false as expected.
- UI showed paid recovery/intake state, not public unpaid blank form.
- Did not ask the user to pay again.
- Preserved Barista target, current salary `8.0M`, duration `6 tháng`, phone/access.
- `POST /api/roadmap/generate`: `0`.
- Wrong phone/access: denied, `404`.
- Empty phone/access: validation, `400`.

### Admin Safety

- `/admin?t=b30c63a` auth required: PASS.
- Authenticated dashboard loads: PASS.
- Manual confirm/actions visible: PASS.
- Cleanup actions visible: PASS.
- Unauthenticated manual confirm: denied, `401`.
- Admin operations were scoped by exact VSPI.
- Note: admin API/login should use canonical `https://www.topluong.com` because non-`www` redirects to `www`.

### STEP 84 Cleanup

- 29K `VSPI-2026-JRRL-NWLS`:
  - Dry-run: `1` row.
  - Delete: `1` row.
  - Follow-up: `0` rows left.
- 79K `VSPI-2026-AAQJ-DKLJ`:
  - Dry-run: `1` row.
  - Delete: `1` row.
  - Follow-up: `0` rows left.
- Customer data deleted: no.
- Real payment created: no.

### STEP 84 Audits

- `auditPaidReportEntitlement`: PASS.
- `auditReportToRoadmapStateHandoff`: PASS.
- `auditRoadmapFutureGoalIntake`: PASS.
- `auditRoadmapResumeProgress`: PASS.
- `auditCertificateExportLayout`: PASS.
- `auditAdminDeleteActions`: PASS.
- `lint` / `build` / `typecheck`: not run because no product code changed.

## Updated Live 79K Caveat

Live 79K generation is now production-proven for these controlled future-goal cases:

1. Barista exact-role future-goal.
2. Nhân viên check-in sân bay exact-role future-goal.
3. Chuyên viên trị liệu nghệ thuật custom unsupported-role.

Remaining caveats:

- Payment/access recovery production smoke passed for controlled 29K and 79K test records.
- Existing verification covered pending checkout, manual confirm, access recovery, mismatch denial, admin scoping, and exact cleanup without charging anyone.
- Real payment webhook/live bank payment was not exercised.
- Broad live paid 79K generation for all roles remains not fully production-proven.
- Broad custom unsupported-role coverage remains limited.
- Optional AI spa custom canary was not run, to keep live LLM calls minimal.
- Real payment smoke was not executed.

## Evidence Artifacts

STEP 82A controlled live custom-role canary artifacts were saved outside the repo under:

- Folder: `C:\Users\Venn\top-percent-step82a-custom-canary`
- `step82a-custom-canary-rerun-state.json`
- `custom-art-therapy-rerun-roadmap-VSPI-2026-M9CK-YTTX.json`
- `step82a-browser-smoke-rerun.json`
- `step82a-custom-rerun-reopen.png`
- `step82a-custom-rerun-certificate-panel.png`
- `step82a-custom-rerun-certificate-export.png`
- `step82a-regression-smoke.json`
- `step82a-cleanup.json`

STEP 84 payment/access smoke artifacts were saved outside the repo under:

- Folder: `C:\Users\Venn\top-percent-step84-payment-access-smoke`
- `step84-29k-checkout.json`
- `step84-29k-manual-confirm.json`
- `step84-29k-report-unlock.png`
- `step84-79k-checkout.json`
- `step84-79k-manual-confirm.json`
- `step84-79k-paid-recovery.png`
- `step84-access-mismatch.json`
- `step84-admin-smoke.png`
- `step84-admin-authenticated-smoke.png`
- `step84-cleanup.json`
- `step84-confirm-access-www.json`
- `step84-browser-artifacts.json`

## Future Retest Checklist

Use this checklist for future issues touching custom roles, future-goal intake, roadmap generation, recovery, or certificates:

1. Confirm deployed commit and production aliases.
2. Check `git status --short` before editing anything.
3. Verify `/api/jobs`: `315` jobs, `315` role IDs, `0` missing, `0` duplicate.
4. Same-role exact-role canary: Barista should stay barista/cafe/beverage and avoid kitchen leakage.
5. Risky exact-role canary: Nhân viên check-in sân bay should stay airport ground/check-in and avoid cabin crew leakage.
6. Unsupported custom-role canary: custom mode should preserve `role_id = null`, show limited-benchmark warning, and avoid silent canonicalization.
7. Check custom roadmap output for limited-benchmark notice and no exact percentile/benchmark precision claims.
8. Reopen paid/generated roadmap by phone/access and confirm `POST /api/roadmap/generate` is not called.
9. Confirm progress/evidence persistence and certificate export after reopen.
10. Verify certificate PNG dimensions, evidence rows, title wrapping, footer wrapping, and capture bounds.
11. Verify `/admin` loads without deleting data.
12. Treat production smoke evidence as authoritative if it conflicts with local audits.

## Rules For Future Codex Work

- Do not use `git add .`.
- Do not deploy a dirty worktree.
- Do not create a real payment during tests.
- Do not delete customer data.
- Do not call live LLM broadly without an explicit, controlled canary request.
- Trace root cause before fixing.
- Keep edits scoped to the bug or checkpoint file.
- Preserve production payment and customer-data safety.
- Every step report must include files changed, audits/tests run, commit hash, git status, and production status.
- If production smoke contradicts local audits, do not claim PASS.
