export type ReportAccessLevel = 'free' | 'paid29' | 'paid79';
export type BenchmarkCellLabel = 'median' | 'top20' | 'top10' | 'top5' | 'top1';

export interface BenchmarkCellDisplay {
  text: string;
  state: 'visible' | 'locked' | 'missing';
  reason?: string;
}

const MISSING_TOP_COPY = 'Chưa đủ mẫu dữ liệu để hiển thị Top 10 / Top 5 cho nghề này';
const MISSING_GENERIC_COPY = 'Chưa đủ dữ liệu cho mốc này';

function formatVndMillion(value: number) {
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function formatBenchmarkCell(input: {
  accessLevel: ReportAccessLevel;
  value?: number | null;
  label: BenchmarkCellLabel;
}): BenchmarkCellDisplay {
  const isPaid = input.accessLevel === 'paid29' || input.accessLevel === 'paid79';
  const isGatedRow = input.label === 'top10' || input.label === 'top5' || input.label === 'top1';
  const value = Number(input.value || 0);

  if (!isPaid && isGatedRow) {
    return {
      text: 'Premium',
      state: 'locked',
      reason: 'Free report can show locked benchmark rows.',
    };
  }

  if (Number.isFinite(value) && value > 0) {
    return {
      text: formatVndMillion(value),
      state: 'visible',
    };
  }

  return {
    text: input.label === 'top10' || input.label === 'top5' ? MISSING_TOP_COPY : MISSING_GENERIC_COPY,
    state: 'missing',
    reason: 'Paid report is unlocked, but this benchmark tier does not have enough data.',
  };
}
