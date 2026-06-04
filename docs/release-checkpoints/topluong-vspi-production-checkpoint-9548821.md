# TopLuong VSPI Production Checkpoint - 9548821

Date: 2026-06-04

## Current Production Commit

- Commit: `9548821 fix(roadmap): collect future goal and target role separately`
- Branch: `main`
- Status: production checkpoint after STEP 78A deploy and smoke
- Product baseline before this deploy: `f51ad25 fix(roadmap): resume saved progress without regeneration`

## Production Aliases

- `https://topluong.com`
- `https://www.topluong.com`

## What Changed Since `112011a` / `f51ad25`

- `112011a fix(roadmap): show certificate evidence in canvas export` stabilized certificate PNG export. Evidence rows became visible/readable in the generated canvas, title/footer layout stayed inside bounds, and exported PNG dimensions were verified at `1080x1350`.
- `f51ad25 fix(roadmap): resume saved progress without regeneration` stabilized saved 79K roadmap recovery. Existing generated roadmaps open by phone/access code without calling `POST /api/roadmap/generate`, without showing AI analysis/generation state, and with persisted `task_progress` and evidence restored.
- `9548821 fix(roadmap): collect future goal and target role separately` redesigned the 79K intake. The user now writes the future goal in their own words, while current role and target role are stored separately. The old fixed intent cards and old hardcoded direction buttons are removed/hidden from the main intake.

## Current 79K Intake Behavior

- `futureGoalText`: required future-goal text. It is used as context only and must not become the canonical job title.
- `currentJobTitle` / `currentRoleId`: current work context. This can match the target role for same-role growth, or differ for career-switch cases.
- `targetJobTitle` / `targetRoleId`: roadmap destination and benchmark-safe role when a known role profile is selected.
- `targetSalary` / `targetSalaryAssessment`: desired compensation and assessment label such as realistic, stretch, or unrealistic/high ambition. Unrealistic targets warn the user but do not promise automatic salary increase.
- `customTargetRole` / `allowCustomTargetRole`: controlled fallback for unsupported roles. The UI shows a warning that benchmark/percentile may be less precise, while the roadmap can still be created from the user's description. Unsupported roles must not silently map to unrelated jobs.

## STEP 78A Production Smoke Summary

- Deployed through Vercel Git integration from GitHub `main`.
- Vercel build log confirmed: `Branch: main, Commit: 9548821`.
- Production deployment status: `Ready`.
- Production aliases confirmed: `https://topluong.com`, `https://www.topluong.com`.

### `/roadmap` Intake UI

- Old 3 intent cards are not visible in the main intake:
  - `Moi tot nghiep`
  - `3+ nam dam chan`
  - `Muon doi huong`
- Old 4 hardcoded direction buttons are not visible:
  - `O lai & tang luong`
  - `Doi sang role tra cao hon`
  - `Len quan ly/lead`
  - `Di sau chuyen mon`
- New `Mong muon tuong lai` field is visible.
- Current role and target role are clearly separated.
- Target salary field is visible.
- Mobile copy was readable.
- No production mojibake markers were observed on `/roadmap`.

### Same-Role Growth

- Test case: current `Barista`, target `Barista`, salary `8,000,000`, target salary `12,000,000`, duration `6 months`.
- Same current/target role was allowed.
- No forced career switch.
- No kitchen/chef target was auto-selected.
- CTA became enabled only after required fields were valid.
- No payment was created.

### Career Switch

- Test case: current `Nhan vien ban hang`, target marketing role.
- Current role and target role stayed separate.
- UI made the roadmap destination the target role.
- Salary warning/no-guarantee copy appeared for a stretch target.
- No silent wrong role mapping was observed.
- No payment was created.

### Unsupported / Custom Role

- Test case: `Bac si tam ly`.
- UI did not dead-end with only a missing exact-role message.
- Suggestions appeared, including psychology/doctor-adjacent options.
- Controlled custom option was visible.
- Custom warning was visible: benchmark/percentile may be less precise, but roadmap can still be created from description.
- No unrelated cleaner/garbage role mapping was observed.
- No payment was created.

### Target Salary Assessment

- Realistic label observed.
- Unrealistic/high-ambition label observed.
- Ambitious target warning observed.
- Copy did not promise automatic salary increase.

### Resume / Progress Regression

- Known record: phone `0222222222`, access code `GWLSCOCHEEHQ`.
- Existing roadmap opened directly.
- `POST /api/roadmap/generate`: `0` calls.
- No `AI dang phan tich ho so` state.
- No blank public create form fallback.
- Progress and evidence remained visible.
- Resume copy uses nearest missing task wording instead of misleading `Dang o tuan 1` wording.

### Certificate / Admin / Jobs Regression

- Certificate export still passed.
- Exported certificate PNG: `1080x1350`.
- Evidence rows were visible/readable.
- Verify footer did not overflow or get clipped.
- Same-origin production `/api/jobs`: `315` jobs, `315` with `role_id`, `0` missing, `0` duplicate role IDs.
- `/admin?t=9548821` loaded auth/admin screen with no crash.
- No real payment was created.
- No customer data was deleted.
- No broad live LLM call was made.

## Evidence Artifacts

STEP 78A production smoke artifacts were saved outside the repo under:

- `C:\Users\Venn\top-percent-step78a-smoke\roadmap-new-intake-mobile.png`
- `C:\Users\Venn\top-percent-step78a-smoke\same-role-growth.png`
- `C:\Users\Venn\top-percent-step78a-smoke\career-switch.png`
- `C:\Users\Venn\top-percent-step78a-smoke\custom-role-bac-si-tam-ly.png`
- `C:\Users\Venn\top-percent-step78a-smoke\resume-regression.png`
- `C:\Users\Venn\top-percent-step78a-smoke\certificate-regression.png`
- `C:\Users\Venn\top-percent-step78a-smoke\step78a-certificate-export.png`

## Known Caveats / Not-Yet-Proven Areas

- Broad live paid 79K LLM generation remains not fully production-proven.
- STEP 78A smoke tested intake, role selection, custom role handling, CTA enablement, resume/recovery, and certificate regression without creating payment.
- No real payment smoke was executed.
- The existing recovered roadmap used for resume/certificate smoke is useful for regression coverage but does not prove every role's live generated roadmap quality.

## Future Retest Checklist

Use this checklist for future bugs touching 79K intake, roadmap generation, recovery, or certificates:

1. Confirm deployed commit and aliases for production.
2. Check `git status --short` before editing anything.
3. Mobile `/roadmap`: verify old cards/buttons are absent and future-goal intake is visible.
4. Same-role growth: use a role such as Barista for both current and target role; CTA should enable after valid fields.
5. Career switch: use a current role and a different target role; current/target must stay separate.
6. Unsupported/custom role: use `Bac si tam ly` or another unsupported job; verify suggestions/custom warning and no silent wrong mapping.
7. Target salary warning: test realistic and unrealistic targets; no automatic salary promise.
8. Resume/progress: open a known paid/generated roadmap by phone/access code; verify no `POST /api/roadmap/generate` and persisted progress/evidence.
9. Certificate export: verify PNG dimensions, evidence rows, title wrapping, footer wrapping, and capture bounds.
10. Admin: verify auth/admin page loads without deleting data.
11. `/api/jobs`: verify `315` jobs, `315` role IDs, `0` missing, `0` duplicate.
12. After fixes, run focused audit plus lint/build/typecheck, then deploy only from clean GitHub `main` via Vercel Git integration.

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
- If production smoke contradicts local audits, treat production evidence as authoritative and do not claim PASS.
