import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getSimulatorSkillsForRole } from '../lib/roleTaxonomy';

const roleProfiles = JSON.parse(fs.readFileSync('data/role_profiles.json', 'utf8')) as { profiles: Array<Record<string, any>> };
const roadmapSource = fs.readFileSync('app/roadmap/page.tsx', 'utf8');
const barista = roleProfiles.profiles.find(profile => profile.key === 'barista (pha che ca phe)__nha hang - khach san - du lich');

assert.ok(barista, 'Barista exact role profile must exist');

const firstSkill = String(barista.skills?.[0] || '');
const allText = JSON.stringify(barista, null, 2);
const simulator = getSimulatorSkillsForRole('Barista (Pha chế cà phê)', [1, 2, 3, 4].map(index => ({
  id: `base-${index}`,
  label: `BASE_${index}`,
  boost: 0.1,
  pctBoost: 10,
}))).map(skill => skill.label);

const required = [
  'Dial-in espresso',
  'latte art',
  'hao hụt',
  'average order value',
  'bar station',
  'POS/order accuracy',
  'complaint',
];

const forbiddenFirstSkill = /pha chế cà phê, espresso và đồ uống theo công thức chuẩn/i;

assert.doesNotMatch(firstSkill, forbiddenFirstSkill, 'first Barista upgrade skill must not be baseline coffee making');
for (const term of required) {
  assert.match(allText, new RegExp(term, 'i'), `Barista profile missing measurable skill: ${term}`);
}
assert.match(simulator.join('\n'), /Dial-in espresso/i, 'Barista simulator must start with dial-in espresso');
assert.doesNotMatch(simulator[0] || '', forbiddenFirstSkill, 'simulator first skill must not be baseline coffee making');
assert.match(roadmapSource, /Dial-in espresso/, 'roadmap Barista skill bank must include dial-in espresso');
assert.match(roadmapSource, /Wastage log sữa\/cà phê\/syrup/, 'roadmap Barista skill bank must include wastage log');

console.log(JSON.stringify({
  passed: true,
  firstSkill,
  simulatorFirstSkill: simulator[0],
  requiredHits: required.length,
}, null, 2));
