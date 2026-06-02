import { readFileSync } from 'node:fs';

const checks: Array<{ file: string; banned: RegExp[]; required: RegExp[] }> = [
  {
    file: 'app/api/history/route.ts',
    banned: [/Number\(percent\)/, /!percent/, /has_direct_data\s*===\s*true/],
    required: [/resolveTrustedSalaryBenchmark/, /percent:\s*resolved\.percentileBucket/],
  },
  {
    file: 'app/api/premium/checkout/route.ts',
    banned: [/typeof percent === 'number'/, /Number\(percent\)/],
    required: [/resolveTrustedSalaryBenchmark/, /percent:\s*resolved\.percentileBucket/],
  },
  {
    file: 'app/api/roadmap/checkout/route.ts',
    banned: [/Number\(target_salary\)/, /Number\(duration_months\) \|\| 3/, /!target_salary/],
    required: [/buildTrustedRoadmapTarget/, /normalizeRoadmapDuration/, /target_salary:\s*targetSalary/],
  },
  {
    file: 'app/api/group/route.ts',
    banned: [/Number\(percent\)/],
    required: [/resolveTrustedSalaryBenchmark/, /percent:\s*resolved\.percentileBucket/],
  },
  {
    file: 'app/api/zalo-subscribers/route.ts',
    banned: [/Number\(body\.percentile\)/, /Math\.round\(percentile\)/],
    required: [/resolveTrustedSalaryBenchmark/, /percentile:\s*resolved\.percentileBucket/],
  },
];

let failures = 0;
for (const check of checks) {
  const source = readFileSync(check.file, 'utf8');
  for (const pattern of check.banned) {
    if (pattern.test(source)) {
      console.error('[tamper-audit] FAIL ' + check.file + ': banned pattern ' + pattern);
      failures += 1;
    }
  }
  for (const pattern of check.required) {
    if (!pattern.test(source)) {
      console.error('[tamper-audit] FAIL ' + check.file + ': missing required pattern ' + pattern);
      failures += 1;
    }
  }
}

if (failures > 0) {
  process.exit(1);
}

console.log('[tamper-audit] PASS: sensitive percent/target fields are recomputed server-side.');
