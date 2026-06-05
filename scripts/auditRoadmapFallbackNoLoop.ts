import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildDeterministicRoadmapFallback } from '../lib/buildDeterministicRoadmapFallback';
import { getAllRoleProfiles } from '../lib/roleProfiles';

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function collectText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join('\n');
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(collectText).join('\n');
  return '';
}

const roleProfile = getAllRoleProfiles().find(profile => profile.key === 'mc / nguoi dan chuong trinh__truyen thong - bao chi') || null;
const generateRoute = fs.readFileSync('app/api/roadmap/generate/route.ts', 'utf8');

const roadmap = buildDeterministicRoadmapFallback({
  roleProfile,
  canonicalRoleTitle: roleProfile?.title || 'MC / Người dẫn chương trình',
  canonicalRoleId: roleProfile?.key || null,
  userInputs: {
    durationMonths: 6,
    currentPosition: 'MC / Người dẫn chương trình',
    futureGoalText: 'Tăng fee bằng showreel, feedback khách hàng, rate card và xử lý sân khấu live.',
    weeklyTime: '3-5 giờ/tuần',
  },
}) as any;

const allText = collectText(roadmap);
assert.doesNotMatch(allText, /Cập nhật bằng chứng vòng|Cap nhat bang chung vong|vòng nâng cấp|vong nang cap/i, 'fallback roadmap must not contain loop-only evidence copy');
assert(Array.isArray(roadmap.weeks), 'fallback roadmap must include weeks');
assert.equal(roadmap.weeks.length, 24, '6-month fallback roadmap must include 24 weeks');

const normalizedTasks = roadmap.weeks.flatMap((week: any) => Array.isArray(week.tasks) ? week.tasks.map((task: string) => normalize(task)) : []);
const uniqueTasks = new Set(normalizedTasks);
assert(uniqueTasks.size >= 18, `fallback tasks must be meaningfully varied, got ${uniqueTasks.size} unique tasks`);

const firstCycle = collectText(roadmap.weeks.slice(0, 4));
const secondCycle = collectText(roadmap.weeks.slice(4, 8));
const fourthCycle = collectText(roadmap.weeks.slice(12, 16));
assert.match(secondCycle, /truoc\/sau|KPI|ca viec that|feedback/i, 'second cycle must advance into real-work KPI/feedback, not repeat seed copy');
assert.match(fourthCycle, /portfolio|rate card|template|trinh bay/i, 'later cycle must package portfolio/rate-card/template evidence');
assert.notEqual(normalize(firstCycle), normalize(secondCycle), 'cycle 2 copy must differ from cycle 1');
assert.match(generateRoute, /function hasFallbackLoopCopy/, 'restore route must detect old loop-copy roadmaps');
assert.match(generateRoute, /context: 'restore-loop-copy'/, 'restore route must repair loop-copy with deterministic fallback');
assert.match(generateRoute, /task_progress: data\.task_progress \|\| {}/, 'loop-copy repair must preserve existing task_progress');

console.log(JSON.stringify({
  passed: true,
  role: roleProfile?.title || 'MC / Người dẫn chương trình',
  weeks: roadmap.weeks.length,
  uniqueTasks: uniqueTasks.size,
  bannedLoopCopy: 0,
}, null, 2));
