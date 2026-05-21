import {
  CAREER_COMPASS,
  CareerCompassEntry,
  SalaryBand,
  type CareerLadderStep,
} from './careerCompassData'

// ── Detect job group from job title ────────────────────────────────────────
export function detectJobGroup(jobTitle: string): CareerCompassEntry {
  const lower = jobTitle.toLowerCase().trim()

  // Iterate all groups (except FALLBACK) and score by keyword matches
  const groups = Object.entries(CAREER_COMPASS).filter(([key]) => key !== 'FALLBACK')

  let bestKey = 'FALLBACK'
  let bestScore = 0

  for (const [key, entry] of groups) {
    let score = 0
    for (const kw of entry.keywords) {
      if (lower.includes(kw.trim().toLowerCase())) {
        // Longer keyword = more specific = higher score
        score += kw.trim().length
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestKey = key
    }
  }

  return CAREER_COMPASS[bestKey]
}

// ── Detect salary band for a given job group ───────────────────────────────
export function detectSalaryBand(
  salary: number,
  entry: CareerCompassEntry
): SalaryBand {
  const bands = entry.salaryBands
  // Walk from highest to lowest — first band where salary >= min wins
  const order: SalaryBand[] = ['executive', 'lead', 'senior', 'mid', 'entry']
  for (const band of order) {
    if (salary >= bands[band].min) return band
  }
  return 'entry'
}

// ── Get next band min salary ───────────────────────────────────────────────
function getNextBandMin(entry: CareerCompassEntry, band: SalaryBand): number {
  const progression: Record<SalaryBand, SalaryBand | null> = {
    entry: 'mid',
    mid: 'senior',
    senior: 'lead',
    lead: 'executive',
    executive: null,
  }
  const next = progression[band]
  if (!next) return entry.salaryBands.executive.max
  return entry.salaryBands[next].min
}

// ── Format VND ─────────────────────────────────────────────────────────────
function fmtVND(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} triệu`
  return `${(n / 1_000).toFixed(0)}k`
}

// ── Main context builder ───────────────────────────────────────────────────
export interface CareerCompassContext {
  jobGroup: string
  band: SalaryBand
  bandLabel: string
  painPoint: string
  opportunity: string
  nextMilestone: string
  marketInsight: string
  topSkillGap: string
  nextBandMin: number
  nextBandMinFmt: string
  salaryGap: number
  salaryGapFmt: string
  salaryFmt: string
  currentBandRange: string
  careerLadder: CareerLadderStep[]
  isFallback: boolean  // true = nghề tự nhập, dữ liệu ước tính
}

export function getCareerCompassContext(
  jobTitle: string,
  salary: number,
  topPercent: number
): CareerCompassContext {
  const entry = detectJobGroup(jobTitle)
  const band = detectSalaryBand(salary, entry)
  const nextMin = getNextBandMin(entry, band)
  const gap = Math.max(0, nextMin - salary)
  // Kiểm tra có phải FALLBACK không (nghề tự nhập không có trong DB)
  const isFallback = entry.jobGroup === 'Thị trường lao động chung'

  return {
    jobGroup: entry.jobGroup,
    band,
    bandLabel: entry.salaryBands[band].label,
    painPoint: entry.painPoints[band],
    opportunity: entry.opportunities[band],
    nextMilestone: entry.nextMilestone[band],
    marketInsight: entry.marketInsight,
    topSkillGap: entry.topSkillGap,
    nextBandMin: nextMin,
    nextBandMinFmt: fmtVND(nextMin),
    salaryGap: gap,
    salaryGapFmt: gap > 0 ? fmtVND(gap) : '0',
    salaryFmt: fmtVND(salary),
    currentBandRange: `${fmtVND(entry.salaryBands[band].min)}–${fmtVND(entry.salaryBands[band].max)}`,
    careerLadder: entry.careerLadder || [],
    isFallback,
  }
}
