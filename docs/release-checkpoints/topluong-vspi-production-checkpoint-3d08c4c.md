# TopLuong VSPI Production Checkpoint - 3d08c4c

Date: 2026-06-05

## Current Production Commit

- Product commit: `3d08c4c fix(roadmap): harden payment gate and intake role UX`
- Branch: `main`
- Deployment path: GitHub `main` -> Vercel Git integration
- Vercel status: Ready
- Production aliases:
  - `https://topluong.com`
  - `https://www.topluong.com`

## Why This Release Exists

This checkpoint captures the production state after a critical 79K roadmap payment-gate and intake UX fix.

The release addressed four issues:

- Pending 79K direct restore could previously return a paid-like state at the end of the restore branch.
- 29K -> 79K draft handoff hydrated `job`/target context but did not hydrate `currentJobTitle`.
- Roadmap current/target role intake lacked autocomplete and quick role suggestions.
- QR payment screen showed the QR image but lacked direct open/copy transfer helpers.

## Fix Summary In `3d08c4c`

- Hardened `/api/roadmap/generate` GET restore so pending 79K records remain pending and do not expose generated or paid-only state.
- Preserved current role, target role, salary, target salary, duration, and access state across 29K -> 79K handoff and paid recovery.
- Added role autocomplete/datalist support for current and target role fields.
- Added a same-role growth shortcut so users can keep their current role and focus on skill growth.
- Added QR/payment actions for opening QR separately and copying transfer content, amount, and account details.

## Production Smoke Summary

### Pending 79K Must Not Unlock

- Test record: `VSPI-2026-7HUE-4VEU / W4GLQV6PZTCN`.
- Pending direct restore returned:
  - `status: pending`.
  - `code: PAYMENT_PENDING`.
- Did not leak:
  - `paid`.
  - `roadmap_json`.
  - `task_progress`.
- `POST /api/roadmap/generate`: `0`.

### Payment Polling Must Not Unlock

- Test record: `VSPI-2026-MQY8-L49A / JEUUUGQQH2GL`.
- "Kiem tra chuyen khoan" remained pending.
- Roadmap unlocked: no.
- `POST /api/roadmap/generate`: `0`.

### Manual Confirm Recovery

- Manual confirm exact VSPI: `VSPI-2026-7HUE-4VEU`.
- Result: success.
- Paid recovery GET after confirm returned:
  - `status: paid`.
  - `roadmap_json`: missing as expected.
- Preserved:
  - Barista role.
  - Current salary: `8,000,000`.
  - Target salary: `12,000,000`.
  - Duration: `6` months.
- Did not ask to pay again in API recovery path.
- `POST /api/roadmap/generate`: `0`.

### 29K -> 79K Handoff And Role UX

- 29K session handoff filled current job: Barista.
- Target role filled Barista from same-role flow.
- Salary filled: `8,000,000`.
- Current role autocomplete visible.
- Target/current datalist inputs present.
- Same-role button set target/current to Barista.
- CTA was not silently disabled.

### QR Payment UX

- QR visible.
- "Mo QR trang rieng" visible.
- "Copy noi dung CK" visible.
- "Copy so tien 79K" visible.
- "Copy tai khoan" visible.

## Regression Smoke

- Known generated roadmap restore: PASS.
  - Record: `VSPI-2026-MYCW-N3JQ / GWLSCOCHEEHQ / 0222222222`.
  - Returned `status: generated`.
  - `roadmap_json`: present.
  - `task_progress`: present.
  - `POST /api/roadmap/generate`: `0`.
- `/api/jobs`: 315 jobs, 315 `role_id`, 0 missing, 0 duplicate.
- `/admin?t=3d08c4c`: loads auth screen/no crash.
- `/my-progress?t=3d08c4c`: loads recovery hub and masked-access copy.
- Certificate export: PASS.
  - PNG dimensions: `1080x1350`.
  - Evidence/fallback text visible, not blank.

## Audits PASS

- `npx tsx scripts/auditRoadmapPaymentAndIntakeUx.ts`
- `npx tsx scripts/auditRoadmapFutureGoalIntake.ts`
- `npx tsx scripts/auditRoadmapResumeProgress.ts`
- `npx tsx scripts/auditRoadmapHistoryReopen.ts`
- `npx tsx scripts/auditRoadmapCreateFlowE2E.ts`
- `npx tsx scripts/auditReportToRoadmapStateHandoff.ts`
- `npx tsx scripts/auditPaidReportEntitlement.ts`
- `npx tsx scripts/auditCertificateExportLayout.ts`

No lint/build/typecheck were rerun after deploy because no code changed in the deploy step and the Vercel production build for `3d08c4c` completed successfully.

## Cleanup

Exact test roadmap rows were deleted only after dry-run:

- `VSPI-2026-7HUE-4VEU / W4GLQV6PZTCN`.
  - Dry-run: 1 row.
  - Delete: 1 row.
  - Follow-up: 0 rows left.
- `VSPI-2026-MQY8-L49A / JEUUUGQQH2GL`.
  - Dry-run: 1 row.
  - Delete: 1 row.
  - Follow-up: 0 rows left.

Safety confirmations:

- No customer data deleted.
- No real payment created.
- No live LLM call made.

## Artifacts

Artifact folder:

- `C:\Users\Venn\top-percent-step-payment-gate-intake-smoke`

Key files:

- `pending-79k-restore.json`
- `polling-payment-pending.json`
- `manual-confirm-paid-restore.json`
- `handoff-29k-to-79k.png`
- `role-autocomplete.png`
- `qr-actions.png`
- `regression-known-restore.json`
- `api-jobs-summary.json`
- `certificate-regression-export.png`
- `cleanup.json`

## Current Caveat

- Signed production webhook / real bank payment is still not smoke-tested because production `WEBHOOK_SECRET_KEY` is unavailable in the local smoke context.
- Payment gate, manual recovery, pending behavior, QR helpers, role autocomplete, and 29K -> 79K handoff are production-smoked and safe for controlled soft launch.

## Future Retest Checklist

- Pending 79K direct restore should return `PAYMENT_PENDING`, not `paid`.
- Payment polling should not unlock pending records.
- Manual confirm should recover paid/no-roadmap state without charging again or generating automatically.
- 29K -> 79K handoff should prefill current job and salary.
- Current and target role fields should show autocomplete/suggestions.
- Same-role growth shortcut should keep target role equal to current role and allow CTA when required fields are valid.
- QR screen should expose open/copy transfer actions.
- Existing generated roadmap restore should not call `POST /api/roadmap/generate`.
- Certificate export should remain `1080x1350` with visible evidence/fallback text.

## Future Work Rules

- Do not use `git add .`.
- Do not deploy a dirty worktree.
- Do not create real payment for smoke unless explicitly approved.
- Do not delete customer data.
- Cleanup test data only after exact dry-run confirmation.
- Do not call live LLM unless the step explicitly requires a controlled live canary.
- Trace root cause before fixing.
- Every step must report files changed, tests/audits, commit hash, git status, and production status.
