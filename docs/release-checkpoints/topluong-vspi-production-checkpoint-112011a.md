# TopLuong VSPI Production Checkpoint - 112011a

Date: 2026-06-04

## Stable Production Commit

- Commit: `112011a fix(roadmap): show certificate evidence in canvas export`
- Branch: `main`
- Status: stable production checkpoint after STEP 75 representative smoke

## Production Aliases

- `https://topluong.com`
- `https://www.topluong.com`

## Fix History Since STEP 69

- STEP 70/71 fixed saved 79K roadmap reopen and certificate export layout issues. The reopen flow now loads an existing generated roadmap by phone/access code instead of falling back to the public create form. Certificate export was scoped to a fixed `1080x1350` canvas, with wrapped title/footer and meaningful evidence rows.
- STEP 72 deployed `3d94cd9 fix(roadmap): restore saved roadmaps and certificate export`. Production reopen passed, but certificate export still failed because evidence text was invisible in the exported PNG.
- STEP 73 fixed the remaining certificate canvas evidence rendering issue locally.
- STEP 74 deployed `112011a fix(roadmap): show certificate evidence in canvas export`. Production certificate export passed: evidence rows were visible/readable, title did not ellipsize, footer did not overflow, and PNG dimensions were `1080x1350`.
- STEP 75 ran representative production smoke across free scan, role/report boundaries, 79K handoff/reopen, certificate/evidence, and admin visibility. No blocker was found.

## Current Feature Status

### Free Scan

- Production `/api/jobs` returns `315` jobs.
- All `315` jobs have `role_id`.
- Missing `role_id`: `0`.
- Representative production scan covered 18 roles and passed after respecting API rate limits.
- No sibling-role contamination blocker was found in the tested roles.

### 29K Report

- Local and production-adjacent report audits passed.
- Role boundary audit passed for all 315 public jobs.
- Missing Top 10 / Top 5 benchmark data uses clear missing-data copy instead of bare `?`.
- Known risky role boundaries tested include airport check-in vs flight attendant, restaurant server vs restaurant manager, school nurse vs teacher, accountant vs chief accountant, and executive roles.

### 79K Roadmap

- Report-to-roadmap state handoff audits passed.
- Saved roadmap reopen by phone/access code passed in production.
- Reopen does not return to the blank public create form.
- Reopen does not show disabled CTA copy `Nhập nghề nghiệp trước khi tạo lộ trình.` for an already generated roadmap.
- Duration consistency passed: `3/6/9` months map to `12/24/36` weeks/tasks.

### Certificate / Evidence

- Production certificate export passed at `1080x1350`.
- Evidence rows under `Evidence log đã nộp` are visible/readable in exported PNG.
- Low-information notes such as `ok` fall back to meaningful task/output text.
- Certificate title wraps without ellipsis.
- Verify footer does not overflow or get clipped.
- No extra right-side white capture area observed.

### Admin

- `/admin` loads and remains auth-gated.
- Authenticated admin dashboard loads.
- Customer-care/admin actions visible: `Dọn test`, `Xóa dòng`, `Xóa SĐT`, `Xóa VSPI`, and manual 29K/79K unlock.
- No customer data was deleted during smoke.

### Payment / Recovery

- No real payment was created during STEP 74/75.
- Existing paid 79K recovery path by phone/access code passed for the known production record.
- Manual/admin controls remain visible for owner-managed recovery flows.

### Role Profiles

- Role profile count: `315`.
- Duplicate role IDs: `0`.
- Role profile contamination audit: PASS, `315` clean profiles, `0` flagged.
- Public jobs point to existing role profiles.

## Audit / Test Results Summary

Passed in STEP 75:

- `npx tsx scripts/auditSameIndustryRoleContaminationFull.ts`
- `npx tsx scripts/auditAllReportRoleBoundaries.ts`
- `npx tsx scripts/auditSalaryPercentileConsistency.ts`
- `npx tsx scripts/auditPaidReportEntitlement.ts`
- `npx tsx scripts/auditRoadmapDurationConsistency.ts`
- `npx tsx scripts/auditReportToRoadmapStateHandoff.ts`
- `npx tsx scripts/auditRoadmapMojibake.ts`
- `npx tsx scripts/auditCertificateExportLayout.ts`
- `npx tsx scripts/e2eRoadmap79kCanary.ts` dry-run role-lock canary
- `npm run verify:role-profiles`
- `npm run lint`
- `npm run build`
- `npx tsc --noEmit --pretty false`

Production smoke artifacts from STEP 74/75 were saved outside the repo under:

- `C:\Users\Venn\top-percent-step74-smoke`
- `C:\Users\Venn\top-percent-step75-smoke`

## Known Caveats / Not-Yet-Proven Areas

- Live generated 79K canaries for newly paid test records were not executed in STEP 75 because that would require creating paid test records and calling live LLM.
- Dry-run role-lock canary passed, but this checkpoint must not be read as proof that every live LLM generation path is fully production-proven.
- The known reopened production roadmap used for smoke is `VSPI-2026-MYCW-N3JQ`, displayed as `F&B Manager`. That record is useful for reopen/certificate regression checks, but it is not proof of every role's live generated roadmap quality.
- Production `/api/scan` has rate limiting. Representative role smoke should be paced; rapid batches can return `429` and should not be treated as app logic failures without retrying after the window clears.
- Admin cleanup actions were visually verified only. No customer deletion was performed.

## Future Retest Checklist

Use this when a future bug report touches report, roadmap, certificate, role leakage, or recovery flows:

1. Confirm deployed production commit and aliases.
2. Check `git status --short` before any change.
3. Reproduce the bug with exact input: job, salary, city, experience, phone/access code if relevant.
4. Capture screenshot or artifact outside the repo.
5. Check `/api/jobs`: total jobs, jobs with `role_id`, missing `role_id`.
6. Run role boundary audits before editing role/report logic.
7. For 29K bugs, check visible report copy, role map, career ladder, benchmark labels, and missing-data copy.
8. For 79K bugs, check handoff state, selected role ID, duration, access code, saved roadmap JSON, progress/evidence, and certificate export.
9. For certificate bugs, verify exported PNG dimensions, evidence rows, title wrapping, footer wrapping, and capture bounds.
10. For admin bugs, verify auth gate first, then authenticated UI visibility without deleting data.
11. After any fix, run focused audit plus lint/build/typecheck.
12. Deploy only from clean GitHub `main` via Vercel Git integration, then repeat production smoke.

## Rules For Future Codex Work

- Do not use `git add .`.
- Do not deploy a dirty worktree.
- Do not create a real payment during tests.
- Do not delete customer data.
- Trace root cause before fixing.
- Keep edits scoped to the bug or checkpoint file.
- Preserve user/customer data and production payment safety.
- Each step report must include files changed, tests/audits run, commit hash, and production status.
- If a live LLM canary is requested, run only the minimum approved test record path and clean up exact test VSPI after a dry-run confirms it is safe.
- If production smoke contradicts local audits, treat production evidence as authoritative and do not claim PASS.
