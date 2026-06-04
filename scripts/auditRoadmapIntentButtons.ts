import fs from 'node:fs';
import assert from 'node:assert/strict';
import { findClosestRoleProfiles } from '../lib/roleProfiles';
import { detectRoadmapIntentPhrase } from '../lib/roadmapAccess';

const source = fs.readFileSync('app/roadmap/page.tsx', 'utf8');

function assertIntentButtonsWired() {
  for (const handler of ['showIntentIndustries', 'showIntentRoleSuggestions', 'focusManualIntentInput', 'selectIntentIndustry']) {
    assert.match(source, new RegExp(`const ${handler} =`), `${handler} handler must exist`);
  }
  assert.match(source, /onClick=\{showIntentIndustries\}/, 'Chọn nhóm ngành must call showIntentIndustries');
  assert.match(source, /onClick=\{showIntentRoleSuggestions\}/, 'Chọn nghề gần nhất must call showIntentRoleSuggestions');
  assert.match(source, /onClick=\{focusManualIntentInput\}/, 'Nhập nghề mong muốn must call focusManualIntentInput');
  assert.match(source, /onClick=\{\(\) => selectIntentIndustry\(industry\)\}/, 'industry chips must select an industry');
  assert.match(source, /setIntentActionMode\('industry'\)/, 'industry action must set visible mode');
  assert.match(source, /setIntentActionMode\('suggestions'\)/, 'suggestion action must set visible mode');
  assert.match(source, /setIntentActionMode\('manual'\)/, 'manual action must set visible mode');
  assert.match(source, /jobInputRef\.current\?\.focus\(\)/, 'manual action must focus job input');
  assert.match(source, /Đang chọn:/, 'active selected mode label must be visible');
  assert.match(source, /intentIndustryOptions\.map/, 'industry picker must render visible category choices');
  assert.match(source, /POPULAR_INTENT_ROLE_IDS/, 'intent-only suggestions must use curated role ids when no exact input exists');
}

function assertIntentPhrasesDoNotFuzzyToCleaner() {
  const intentInputs = [
    'Mới tốt nghiệp',
    'Sinh viên mới tốt nghiệp chưa rõ định hướng',
    '3+ năm dậm chân',
    'lương dậm chân',
    'Muốn đổi hướng',
    'chưa biết làm nghề gì',
    'đổi ngành',
    'tìm hướng đi',
  ];
  const forbidden = /vệ sinh|tap vu|tạp vụ|thu gom rác|ve sinh|garbage|cleaner/i;
  for (const input of intentInputs) {
    assert.ok(detectRoadmapIntentPhrase(input), `${input} must be detected as roadmap intent`);
    const suggestions = findClosestRoleProfiles(input, 5);
    assert.equal(suggestions.length, 0, `${input} must not trigger fuzzy role suggestions`);
    assert.doesNotMatch(JSON.stringify(suggestions), forbidden, `${input} must not suggest cleaner/garbage roles`);
  }
}

assertIntentButtonsWired();
assertIntentPhrasesDoNotFuzzyToCleaner();

console.log(JSON.stringify({
  passed: true,
  buttons: ['Chọn nhóm ngành', 'Chọn nghề gần nhất', 'Nhập nghề mong muốn'],
  activeMode: true,
  noCleanerGarbageSuggestions: true,
}, null, 2));
