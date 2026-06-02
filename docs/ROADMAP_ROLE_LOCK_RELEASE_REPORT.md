# Release: Paid Roadmap 79k Role Lock

Production commit: `e047d1e`

Domain: https://topluong.com

## Problems Fixed

- Nha sĩ không còn ra HR.
- Nhân viên check-in sân bay không còn ra Cabin Crew.
- Nhân viên phục vụ không bị manager hóa.
- Quản lý nhà hàng giữ đúng skill manager.

## Safeguards

1. `role_profiles` contamination audit.
2. `selectedRoleId` exact `role_id`.
3. Generated roadmap guard.
4. Final guard before save/return.
5. Repair once.
6. Deterministic fallback.
7. Live production canary.

## Verified Commands

- `verify:roadmap-repair-fallback`
- `verify:roadmap-prompt-canonical`
- `verify:roadmap-final-guard`
- `verify:roadmap-guard`
- `verify:e2e-roadmap-79k`
- `verify:selected-role-id`
- `verify:role-profiles`
- `lint`
- `build`

## Live Canary

- `selectedRoleId = nhan vien check-in san bay__van tai - logistics`
- `original job_title = Tiếp viên hàng không`
- `result = 200 clean`
- `forbidden hits = 0`
- Test record cleaned.

## Monitoring Signals

- `ROADMAP_FINAL_GUARD_FAILED_REPAIRING`: AI first output failed role guard.
- `ROADMAP_REPAIR_PASSED`: repair model fixed output.
- `ROADMAP_REPAIR_FAILED_USING_FALLBACK`: repair failed, deterministic fallback used.
- `ROADMAP_FALLBACK_PASSED`: fallback saved clean roadmap.
- `ROADMAP_FALLBACK_FAILED_RETURNING_503`: customer saw safe error, needs urgent review.

## Release Lockdown

- Do not regenerate `data/role_profiles.json` without running `npm run verify:role-profiles`.
- Do not change roadmap generation prompts without running the full role-lock verification suite.
- Any production `ROADMAP_FALLBACK_FAILED_RETURNING_503` event should be treated as an urgent customer-impacting issue.
- Any forbidden role contamination in a saved roadmap is a release blocker.
