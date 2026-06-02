import { getExactRoleProfile } from '../lib/roleProfiles';

const roleIds = {
  hvac: 'ky thuat vien dien lanh__ky thuat - tho lanh nghe',
  electronics: 'ky thuat vien dien tu__ky thuat - tho lanh nghe',
  studyAbroad: 'nhan vien tu van du hoc__giao duc',
  pilot: 'phi cong__van tai - logistics',
  auto: 'tho sua chua o to / co khi o to__ky thuat - tho lanh nghe',
  barista: 'barista (pha che ca phe)__nha hang - khach san - du lich',
  kitchenAssistant: 'phu bep__nha hang - khach san - du lich',
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[đ]/g, 'd')
    .replace(/[^\p{L}\p{N}&+./%-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getProfileById(roleId: string) {
  const [titleKey, industryKey] = roleId.split('__');
  const profile = getExactRoleProfile(titleKey, industryKey);
  assert(profile, `Missing profile ${roleId}`);
  assert(profile.key === roleId, `Resolved wrong profile for ${roleId}: ${profile.key}`);
  return profile;
}

function profileText(roleId: string) {
  return JSON.stringify(getProfileById(roleId));
}

function hasAny(text: string, terms: string[]) {
  const normalized = normalize(text);
  return terms.some(term => normalized.includes(normalize(term)));
}

function findAny(text: string, terms: string[]) {
  const normalized = normalize(text);
  return terms.filter(term => normalized.includes(normalize(term)));
}

function assertNotContains(roleName: string, text: string, terms: string[]) {
  const matched = findAny(text, terms);
  assert(matched.length === 0, `${roleName} still contains forbidden terms: ${matched.join(', ')}`);
}

function assertContainsAny(roleName: string, text: string, terms: string[]) {
  assert(hasAny(text, terms), `${roleName} lacks required terms. Expected one of: ${terms.join(', ')}`);
}

const hvacText = profileText(roleIds.hvac);
assertNotContains('Kỹ thuật viên điện lạnh', hvacText, ['chẩn đoán', 'bệnh án', 'bệnh nhân', 'clinical diagnosis', 'patient care']);
assertContainsAny('Kỹ thuật viên điện lạnh', hvacText, ['kiểm tra lỗi', 'phân tích nguyên nhân lỗi']);

const electronicsText = profileText(roleIds.electronics);
assertNotContains('Kỹ thuật viên điện tử', electronicsText, ['chẩn đoán', 'bệnh án', 'bệnh nhân', 'clinical diagnosis', 'patient care']);
assertContainsAny('Kỹ thuật viên điện tử', electronicsText, ['kiểm tra lỗi mạch', 'đo kiểm tín hiệu']);

const autoText = profileText(roleIds.auto);
assertNotContains('Thợ sửa chữa ô tô / Cơ khí ô tô', autoText, ['chẩn đoán', 'bệnh án', 'bệnh nhân', 'clinical diagnosis', 'patient care']);
assertContainsAny('Thợ sửa chữa ô tô / Cơ khí ô tô', autoText, ['đọc lỗi OBD', 'kiểm tra lỗi động cơ']);

const studyAbroadText = profileText(roleIds.studyAbroad);
assertContainsAny('Nhân viên tư vấn du học', studyAbroadText, ['visa']);
assertNotContains('Nhân viên tư vấn du học', studyAbroadText, ['boarding pass', 'hành lý ký gửi', 'quầy check-in', 'baggage service']);

const pilotText = profileText(roleIds.pilot);
assertNotContains('Phi công', pilotText, ['route readiness', 'cabin crew', 'senior crew', 'purser', 'checklist cabin']);
assertContainsAny('Phi công', pilotText, ['flight planning', 'pre-flight checklist', 'ATC communication']);

const baristaText = profileText(roleIds.barista);
assertNotContains('Barista', baristaText, ['food cost', 'P&L', 'gross margin', 'menu engineering', 'labor cost', 'budget ownership']);
assertContainsAny('Barista', baristaText, ['định lượng nguyên liệu', 'wastage']);

const kitchenAssistantText = profileText(roleIds.kitchenAssistant);
assertNotContains('Phụ bếp', kitchenAssistantText, ['food cost', 'P&L', 'gross margin', 'menu engineering', 'labor cost', 'budget ownership']);
assertContainsAny('Phụ bếp', kitchenAssistantText, ['sơ chế đúng định lượng', 'mise en place']);

console.log(JSON.stringify({
  passed: true,
  checkedRoles: Object.values(roleIds),
}, null, 2));
