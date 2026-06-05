import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildDeterministicRoadmapFallback } from '../lib/buildDeterministicRoadmapFallback';
import { validateRoadmapQualityGate } from '../lib/roadmapQualityGate';
import { validateFinalRoadmapBeforePersist } from '../lib/roadmapFinalRoleGuard';
import { getRoleProfileById } from '../lib/roleProfiles';

function collectText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join('\n');
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(collectText).join('\n');
  return '';
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase();
}

function hits(text: string, terms: string[]) {
  const normalized = normalize(text);
  return terms.filter(term => normalized.includes(normalize(term)));
}

const generateRoute = fs.readFileSync('app/api/roadmap/generate/route.ts', 'utf8');

const cases = [
  {
    name: 'Barista',
    roleId: 'barista (pha che ca phe)__nha hang - khach san - du lich',
    required: ['barista', 'ca phe', 'espresso', 'do uong', 'upsell', 'ticket time'],
    forbidden: ['sous chef', 'mise en place', 'bep truong'],
  },
  {
    name: 'Bartender',
    roleId: 'bartender__nha hang - khach san - du lich',
    required: ['bartender', 'cocktail', 'mocktail', 'quay bar', 'recipe', 'upsell'],
    forbidden: ['sous chef', 'mise en place', 'bep truong'],
  },
  {
    name: 'Airport check-in',
    roleId: 'nhan vien check-in san bay__van tai - logistics',
    required: ['check-in', 'boarding pass', 'visa', 'hanh ly', 'hanh khach', 'gate'],
    forbidden: ['cabin crew', 'purser', 'in-flight'],
  },
  {
    name: 'MC host',
    roleId: 'mc / nguoi dan chuong trinh__truyen thong - bao chi',
    required: ['showreel', 'run-of-show', 'script', 'san khau', 'rate card', 'agency'],
    forbidden: ['github', 'typescript', 'sql', 'api integration'],
  },
  {
    name: 'F&B Manager',
    roleId: 'f&b manager__nha hang - khach san - du lich',
    required: ['shift', 'labor cost', 'food cost', 'service quality', 'complaint', 'dashboard'],
    forbidden: ['sous chef', 'mise en place', 'line cook'],
  },
  {
    name: 'CMO',
    roleId: 'cmo (giam doc marketing)__quan tri dieu hanh',
    required: ['cmo', 'brand strategy', 'campaign', 'budget', 'board', 'revenue'],
    forbidden: ['junior marketing', 'xin review luong'],
  },
  {
    name: 'CEO',
    roleId: 'ceo / tong giam doc__quan tri dieu hanh',
    required: ['ceo', 'p&l', 'board', 'operating dashboard', 'strategy', 'stakeholder'],
    forbidden: ['specialist', 'xin review hr'],
  },
  {
    name: 'School health',
    roleId: 'nhan vien y te truong hoc__y te - cham soc suc khoe',
    required: ['so cuu', 'ho so suc khoe', 'y te hoc duong', 'thuoc', 'phu huynh'],
    forbidden: ['giao an', 'ielts', 'mentor'],
  },
];

const results = cases.map(item => {
  const profile = getRoleProfileById(item.roleId);
  assert(profile, `${item.name}: missing role profile`);
  const roadmap = buildDeterministicRoadmapFallback({
    roleProfile: profile,
    canonicalRoleTitle: profile.title,
    canonicalRoleId: item.roleId,
    userInputs: {
      durationMonths: 6,
      currentPosition: profile.title,
      futureGoalText: `Tang luong dung nghe ${profile.title} bang KPI, bang chung va feedback that.`,
      weeklyTime: '3-5 gio/tuan',
    },
  });
  const text = collectText(roadmap);
  const quality = validateRoadmapQualityGate({
    roadmap,
    jobTitle: profile.title,
    roleId: item.roleId,
    roleProfile: profile,
    expectedDurationMonths: 6,
  });
  const finalGuard = validateFinalRoadmapBeforePersist({
    vspiId: `quality-${item.name}`,
    jobTitle: profile.title,
    roleId: item.roleId,
    roleProfile: profile,
    finalRoadmap: roadmap,
  });
  const requiredHits = hits(text, item.required);
  const forbiddenHits = hits(text, item.forbidden);
  assert(quality.passed, `${item.name}: quality gate failed ${JSON.stringify(quality)}`);
  assert(finalGuard.passed, `${item.name}: final role guard failed ${JSON.stringify(finalGuard)}`);
  assert(requiredHits.length >= Math.min(4, item.required.length), `${item.name}: missing required role terms ${requiredHits.join(', ')}`);
  assert.equal(forbiddenHits.length, 0, `${item.name}: forbidden contamination ${forbiddenHits.join(', ')}`);
  assert.doesNotMatch(text, /Cập nhật bằng chứng vòng|Cap nhat bang chung vong|vòng nâng cấp|vong nang cap|Dua output vao ca viec that va do truoc|Ap dung vao ca viec that, do loi\/toc do\/chat luong/i, `${item.name}: must not contain loop-copy fallback text`);
  return {
    name: item.name,
    taskCount: quality.metrics.taskCount,
    uniqueTaskRatio: Number(quality.metrics.uniqueTaskRatio.toFixed(2)),
    roleSpecificHits: quality.metrics.roleSpecificHits.slice(0, 8),
    evidenceHits: quality.metrics.evidenceHits,
    progressionHits: quality.metrics.progressionHits,
  };
});

const weakRoadmap = {
  format: 'expert_v2',
  version: 2,
  goal: 'Generic roadmap',
  summary: 'Generic copy',
  weeks: Array.from({ length: 24 }, (_, index) => ({
    week: index + 1,
    focus: 'Dua output vao ca viec that va do truoc/sau',
    tasks: ['Ap dung vao ca viec that, do loi/toc do/chat luong truoc-sau cho Tao checklist cong viec that xoay quanh Showreel 60-90 giay ban duoc nang luc dan.'],
    milestone: 'Checkpoint co KPI truoc/sau tu tinh huong that.',
  })),
  actionPlan: {
    standardWeeks: 24,
    flexibleWeeks: 25,
    weeklyHours: '3-5 gio/tuan',
    completionRule: 'evidence',
    levelName: 'MC',
    milestones: Array.from({ length: 6 }, (_, month) => ({
      month: month + 1,
      title: 'Generic',
      objective: 'Generic',
      skills: ['Generic'],
      weeks: Array.from({ length: 4 }, (_, offset) => ({
        week: month * 4 + offset + 1,
        focus: 'Dua output vao ca viec that va do truoc/sau',
        checkpoint: 'Checkpoint co KPI truoc/sau tu tinh huong that.',
        tasks: [{
          title: 'Ap dung vao ca viec that, do loi/toc do/chat luong truoc-sau cho Tao checklist cong viec that xoay quanh Showreel 60-90 giay ban duoc nang luc dan.',
          skill: 'generic',
          output: 'generic',
          kpi: 'generic',
          doneDefinition: 'generic',
        }],
      })),
    })),
  },
};

const mcProfile = getRoleProfileById('mc / nguoi dan chuong trinh__truyen thong - bao chi');
const weakQuality = validateRoadmapQualityGate({ roadmap: weakRoadmap, jobTitle: mcProfile?.title || 'MC', roleId: mcProfile?.key, roleProfile: mcProfile, expectedDurationMonths: 6 });
assert(!weakQuality.passed, 'weak repeated roadmap must fail quality gate');
assert(weakQuality.reasons.includes('generic_or_loop_copy_detected') || weakQuality.reasons.includes('repeated_week_focuses'), `weak roadmap must fail for loop/generic copy ${JSON.stringify(weakQuality)}`);

assert.match(generateRoute, /validateRoadmapQualityGate/, 'generate route must use roadmap quality gate');
assert.match(generateRoute, /ROADMAP_QUALITY_GATE_FAILED/, 'LLM output must fail/retry when roadmap quality is weak');
assert.match(generateRoute, /!qualityGate\.passed/, 'saved/generated roadmap quality must be enforced');
assert.match(generateRoute, /guard\.passed && qualityGate\.passed/, 'deterministic fallback must also pass quality gate before use');
assert.match(generateRoute, /tao checklist cong viec that xoay quanh/, 'restore route must repair saved generic checklist-loop records before returning them');

console.log(JSON.stringify({
  passed: true,
  checkedRoles: results.length,
  results,
  weakRoadmapRejected: weakQuality.reasons,
}, null, 2));
