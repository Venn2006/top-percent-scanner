import fs from 'node:fs';
import { formatBenchmarkCell, type BenchmarkCellDisplay, type ReportAccessLevel } from '../lib/reportEntitlementDisplay';

interface Failure {
  area: string;
  reason: string;
  sample?: string;
}

const scanner = fs.readFileSync('app/components/TopPercentScanner.tsx', 'utf8');
const reportPage = fs.readFileSync('app/report/page.tsx', 'utf8');
const displayHelper = fs.readFileSync('lib/reportEntitlementDisplay.ts', 'utf8');
const failures: Failure[] = [];

const forbiddenPaidTexts = ['Mở khóa 29K', 'Mở khóa để xem', 'Premium', '?'];

function requireCheck(area: string, reason: string, ok: boolean, sample?: string) {
  if (!ok) failures.push({ area, reason, sample });
}

function hasForbiddenPaidText(cell: BenchmarkCellDisplay) {
  return forbiddenPaidTexts.filter(term => cell.text.includes(term));
}

function auditCell(area: string, accessLevel: ReportAccessLevel, value: number | null, expectedState: BenchmarkCellDisplay['state']) {
  const cell = formatBenchmarkCell({ accessLevel, value, label: 'top10' });
  requireCheck(area, 'unexpected_state', cell.state === expectedState, JSON.stringify(cell));
  const forbidden = accessLevel === 'free' ? [] : hasForbiddenPaidText(cell);
  requireCheck(area, 'paid_cell_contains_forbidden_copy', forbidden.length === 0, JSON.stringify({ cell, forbidden }));
  return cell;
}

const freeLocked = auditCell('free report', 'free', null, 'locked');
const paidFull = auditCell('paid29 full benchmark', 'paid29', 68_000_000, 'visible');
const paidMissingTop10 = auditCell('paid29 missing top10', 'paid29', null, 'missing');
const paidMissingTop5 = formatBenchmarkCell({ accessLevel: 'paid29', value: null, label: 'top5' });
const paid79Missing = auditCell('paid79 missing benchmark', 'paid79', null, 'missing');

requireCheck(
  'free report',
  'free_state_should_allow_locked_rows',
  freeLocked.text === 'Premium',
  JSON.stringify(freeLocked)
);

requireCheck(
  'paid29 full benchmark',
  'paid_full_data_should_show_number',
  paidFull.text === '68.0M' && paidFull.state === 'visible',
  JSON.stringify(paidFull)
);

requireCheck(
  'paid29 missing data',
  'paid_missing_top10_top5_should_explain_missing_data_per_row',
  paidMissingTop10.text === 'Chưa đủ mẫu dữ liệu để hiển thị Top 10 cho nghề này'
    && paidMissingTop5.text === 'Chưa đủ mẫu dữ liệu để hiển thị Top 5 cho nghề này'
    && paid79Missing.text === 'Chưa đủ mẫu dữ liệu để hiển thị Top 10 cho nghề này',
  JSON.stringify({ paidMissingTop10, paidMissingTop5, paid79Missing })
);

requireCheck(
  'paid29 missing data',
  'paid_missing_rows_must_not_show_bare_question_mark',
  !paidMissingTop10.text.includes('?') && !paidMissingTop5.text.includes('?'),
  JSON.stringify({ paidMissingTop10, paidMissingTop5 })
);

requireCheck(
  'paid percentile ladder',
  'unlocked_ladder_should_use_paid_benchmark_formatter',
  /formatBenchmarkCell\(\{\s*accessLevel:\s*unlocked\s*\?\s*'paid29'\s*:\s*'free'/.test(scanner),
  'PercentileLadderCard must pass paid29 when unlocked.'
);

requireCheck(
  'paid percentile ladder',
  'paid_missing_ladder_should_render_missing_copy_not_placeholder',
  /cell\.state\s*===\s*'missing'/.test(scanner) && !/row\.salary\s*\?\s*fmtM\(row\.salary\)\s*:\s*'\.\.\.'/.test(scanner),
  'Unlocked ladder rows must not fall back to ... for missing paid data.'
);

requireCheck(
  'restored report page',
  'restored_paid_report_should_render_top10_and_top5_with_formatter',
  /formatBenchmarkCell\(\{\s*accessLevel:\s*'paid29',[^}]+label:\s*'top10'/.test(reportPage)
    && /formatBenchmarkCell\(\{\s*accessLevel:\s*'paid29',[^}]+label:\s*'top5'/.test(reportPage),
  'app/report/page.tsx should show Top 10 and Top 5 as values or missing-data copy.'
);

requireCheck(
  'display helper',
  'helper_should_never_lock_paid_report_rows',
  !/isPaid[^\n]+locked/.test(displayHelper) && /if \(!isPaid && isGatedRow\)/.test(displayHelper),
  'Only free gated rows may return locked.'
);

console.log(JSON.stringify({
  free: freeLocked,
  paid29: paidFull,
  missingData: { top10: paidMissingTop10, top5: paidMissingTop5 },
  paid79: paid79Missing,
  lockedPaywallHitsInPaidContent: failures.filter(f => f.reason.includes('forbidden')),
  failures,
}, null, 2));

if (failures.length > 0) process.exit(1);
