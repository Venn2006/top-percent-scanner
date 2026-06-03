import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildDeterministicRoadmapFallback } from '../lib/buildDeterministicRoadmapFallback';
import { getRoleProfileById } from '../lib/roleProfiles';

const scannedFiles = [
  'app/roadmap/page.tsx',
  'app/roadmap/layout.tsx',
  'app/api/roadmap/generate/route.ts',
  'lib/buildDeterministicRoadmapFallback.ts',
  'lib/roadmapPresentation.ts',
  'lib/roadmapPromptCanonical.ts',
  'lib/roadmapAccess.ts',
  'lib/roadmapAccessServer.ts',
].filter(file => fs.existsSync(file));

const mojibakePatterns: Array<{ label: string; re: RegExp }> = [
  { label: 'double encoded UTF-8 lead', re: /\u00c3[\u0192\u201a\u201e\u2020]/g },
  { label: 'Vietnamese CP1252 tone bytes', re: /\u00e1[\u00ba\u00bb][\u0080-\u00ff\u2020-\u2021\u0152-\u0178\u2018-\u201d]?/g },
  { label: 'curly quote CP1252 mojibake', re: /\u00e2\u20ac[\u0080-\u00ff\u0152-\u0178\u2018-\u201d]?/g },
  { label: 'replacement character', re: /\ufffd/g },
  { label: 'specific owner tokens', re: /L\u00c3|tr\u00c3|l\u00c6|ngh\u00c3|c\u00c3\u00a1 nh\u00c3/g },
  { label: 'Vietnamese letter CP1252 mojibake', re: /\u00c4[\u0192\u2018\u0090]|\u00c6[\u00a1\u00b0]/g },
];

function findMojibake(text: string) {
  const hits: Array<{ label: string; match: string }> = [];
  for (const pattern of mojibakePatterns) {
    for (const match of text.matchAll(pattern.re)) hits.push({ label: pattern.label, match: match[0] });
  }
  return hits;
}

const fileFailures: Array<{ file: string; line: number; label: string; text: string }> = [];
for (const file of scannedFiles) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const hits = findMojibake(line);
    for (const hit of hits) fileFailures.push({ file, line: index + 1, label: hit.label, text: line.trim().slice(0, 220) });
  });
}

const roadmapSource = fs.readFileSync('app/roadmap/page.tsx', 'utf8');
const requiredRoadmapPhrases = [
  'L\u1ed9 tr\u00ecnh',
  't\u0103ng l\u01b0\u01a1ng',
  'c\u00e1 nh\u00e2n h\u00f3a',
  'ngh\u1ec1 nghi\u1ec7p',
  'b\u1eb1ng ch\u1ee9ng',
  'vi\u1ec7c t\u1eebng tu\u1ea7n',
  'KPI tr\u01b0\u1edbc/sau',
  'ch\u1ee9ng nh\u1eadn',
];
const missingPhrases = requiredRoadmapPhrases.filter(phrase => !roadmapSource.includes(phrase));

const fallbackCases = [
  { name: 'Bartender', roleId: 'bartender__nha hang - khach san - du lich' },
  { name: 'CMO', roleId: 'cmo (giam doc marketing)__quan tri dieu hanh' },
  { name: 'CEO', roleId: 'ceo / tong giam doc__quan tri dieu hanh' },
  { name: 'Nhân viên check-in sân bay', roleId: 'nhan vien check-in san bay__van tai - logistics' },
];
const fallbackResults = fallbackCases.map(item => {
  const roleProfile = getRoleProfileById(item.roleId);
  assert.ok(roleProfile, `Missing role profile for ${item.name}`);
  const roadmap = buildDeterministicRoadmapFallback({
    roleProfile,
    canonicalRoleTitle: roleProfile.title,
    canonicalRoleId: roleProfile.key,
    userInputs: {
      currentPosition: roleProfile.title,
      twoYearGoal: `Tăng lương trong vai trò ${roleProfile.title}`,
      weeklyTime: '3-5 giờ/tuần',
    },
  });
  const text = JSON.stringify(roadmap);
  return {
    name: item.name,
    roleId: item.roleId,
    mojibakeHits: findMojibake(text).map(hit => hit.match),
    containsRoadmapWord: text.includes('Lộ trình') || text.includes('Bản đồ bằng chứng'),
  };
});
const fallbackFailures = fallbackResults.filter(item => item.mojibakeHits.length > 0);

assert.deepEqual(fileFailures, [], 'Roadmap/user-facing source contains mojibake markers');
assert.deepEqual(missingPhrases, [], 'Roadmap page is missing required clean Vietnamese phrases');
assert.deepEqual(fallbackFailures, [], 'Deterministic fallback output contains mojibake markers');

console.log(JSON.stringify({
  passed: true,
  scannedFiles,
  mojibakeMarkersRemaining: 0,
  requiredVietnamesePhrases: requiredRoadmapPhrases,
  fallbackRoadmapOutput: fallbackResults.map(item => ({ name: item.name, roleId: item.roleId, mojibakeHits: item.mojibakeHits.length })),
}, null, 2));