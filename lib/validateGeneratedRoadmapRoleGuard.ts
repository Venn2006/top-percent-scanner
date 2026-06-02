export interface GeneratedRoadmapRoleGuardInput {
  jobTitle: string;
  roleProfile: unknown;
  generatedRoadmapText: string;
}

export interface GeneratedRoadmapRoleGuardResult {
  passed: boolean;
  reason: string;
  forbiddenHits: string[];
  missingRequiredTerms: string[];
}

const globalHrForbidden = [
  'recruitment funnel',
  'onboarding checklist',
  'HR dashboard',
  'time-to-fill',
  'C&B benchmark',
  'JD analysis',
  'headcount',
  'employee retention',
  'HR data',
  'HR KPI',
];

const cabinCrewForbidden = [
  'cabin crew',
  'flight attendant',
  'senior crew',
  'purser',
  'in-flight',
  'checklist cabin',
  'announcement cabin',
  'grooming cabin crew',
  'route readiness',
];

const airportCheckinRequired = [
  'check-in',
  'boarding pass',
  'hộ chiếu',
  'visa',
  'hành lý',
  'quầy check-in',
  'hành khách',
  'supervisor',
  'gate',
  'baggage',
];

const restaurantServerForbidden = [
  'food cost',
  'labor cost',
  'P&L',
  'COGS',
  'gross margin',
  'budget ownership',
  'menu engineering',
];

const restaurantServerRequired = [
  'order',
  'bàn',
  'khách',
  'menu',
  'upsell',
  'POS',
  'phục vụ món',
  'dọn bàn',
];

const restaurantManagerRequired = [
  'food cost',
  'labor cost',
  'doanh thu theo ca',
  'tồn kho',
  'SOP',
  'complaint',
  'lịch làm việc',
  'audit phục vụ',
];

const restaurantBasicOnlyTerms = [
  'chỉ dọn bàn',
  'chỉ bưng món',
  'chỉ ghi order',
  'chào khách đơn giản',
  'phục vụ bàn cơ bản',
];

const genericTerms = [
  'giao tiếp hiệu quả',
  'nâng cao chuyên môn',
  'quản lý thời gian',
  'làm việc nhóm',
  'tư duy phản biện',
  'phát triển bản thân',
  'xây dựng thương hiệu cá nhân',
];

const stopWords = new Set([
  'cho', 'cua', 'voi', 'theo', 'bang', 'trong', 'ngoai', 'nghe', 'nganh', 'viec', 'lam', 'task', 'case',
  'skill', 'kpi', 'proof', 'asset', 'portfolio', 'evidence', 'roadmap', 'checklist', 'feedback', 'output',
  'hang', 'nhan', 'vien', 'quan', 'ly', 'chuyen', 'mon', 'chuan', 'dung', 'quy', 'trinh', 'thuc', 'te',
]);

export function normalizeGeneratedRoadmapGuardText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}&+./%-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenText(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(item => flattenText(item));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(item => flattenText(item));
  return [];
}

function containsTerm(normalizedText: string, term: string) {
  const normalizedTerm = normalizeGeneratedRoadmapGuardText(term);
  if (!normalizedTerm) return false;
  return normalizedText.includes(normalizedTerm);
}

function findTerms(normalizedText: string, terms: string[]) {
  return terms.filter(term => containsTerm(normalizedText, term));
}

function countTerms(normalizedText: string, terms: string[]) {
  return findTerms(normalizedText, terms).length;
}

function isHrRole(identity: string) {
  return /\bhr\b|human resources|nhan su|tuyen dung|recruit|headhunter|talent acquisition|c&b|hrbp|people operations|hanh chinh nhan su/.test(identity);
}

function isCabinCrewRole(identity: string) {
  return /tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|purser/.test(identity);
}

function isAirportCheckinRole(identity: string) {
  return /nhan vien check[- ]?in san bay|check[- ]?in san bay|airport ground|passenger service|ground service|dich vu mat dat|quay check[- ]?in/.test(identity);
}

function isRestaurantServerRole(identity: string) {
  if (/manager|quan ly|giam doc|truong phong|supervisor|lead|leader|captain|f&b manager|fb manager/.test(identity)) return false;
  return /nhan vien phuc vu nha hang|nhan vien phuc vu ban|waiter|waitress|server|restaurant server|phuc vu nha hang|phuc vu ban/.test(identity);
}

function isRestaurantManagerRole(identity: string) {
  return /quan ly nha hang|restaurant manager|f&b manager|fb manager|food and beverage manager|quan ly f&b|giam sat nha hang|restaurant supervisor/.test(identity);
}

function profileVocabulary(roleProfile: unknown) {
  const rawProfileText = flattenText(roleProfile).join(' | ');
  const values = flattenText(roleProfile)
    .map(value => String(value).trim())
    .filter(value => value.length >= 4);
  const phrases = new Set<string>();

  for (const value of values) {
    const normalized = normalizeGeneratedRoadmapGuardText(value);
    if (!normalized || normalized.length < 4) continue;
    if (normalized.length <= 42 && normalized.split(' ').length <= 5) phrases.add(normalized);
    const tokens = normalized
      .split(' ')
      .filter(token => token.length >= 4 && !stopWords.has(token) && !/^\d+$/.test(token));
    for (const token of tokens) phrases.add(token);
    for (let i = 0; i < tokens.length - 1; i++) phrases.add(`${tokens[i]} ${tokens[i + 1]}`);
  }

  return {
    rawProfileText,
    terms: [...phrases].filter(term => term.length >= 4).slice(0, 120),
  };
}

function hasProfileVocabulary(normalizedText: string, roleProfile: unknown) {
  const { rawProfileText, terms } = profileVocabulary(roleProfile);
  if (!rawProfileText.trim() || terms.length === 0) return true;
  const hits = terms.filter(term => normalizedText.includes(term));
  if (hits.length >= 3) return true;
  const genericHits = findTerms(normalizedText, genericTerms);
  return !(genericHits.length >= 4 && hits.length < 2);
}

function result(reason: string, forbiddenHits: string[], missingRequiredTerms: string[]): GeneratedRoadmapRoleGuardResult {
  return {
    passed: forbiddenHits.length === 0 && missingRequiredTerms.length === 0,
    reason,
    forbiddenHits: [...new Set(forbiddenHits)],
    missingRequiredTerms: [...new Set(missingRequiredTerms)],
  };
}

export function validateGeneratedRoadmapRoleGuard(input: GeneratedRoadmapRoleGuardInput): GeneratedRoadmapRoleGuardResult {
  const identity = normalizeGeneratedRoadmapGuardText(`${input.jobTitle} ${flattenText(input.roleProfile).slice(0, 8).join(' ')}`);
  const text = normalizeGeneratedRoadmapGuardText(input.generatedRoadmapText);
  const forbiddenHits: string[] = [];
  const missingRequiredTerms: string[] = [];

  if (!text) return result('roadmap_text_empty', [], ['generatedRoadmapText']);

  if (!isHrRole(identity)) forbiddenHits.push(...findTerms(text, globalHrForbidden));
  if (!isCabinCrewRole(identity)) forbiddenHits.push(...findTerms(text, cabinCrewForbidden));

  if (isAirportCheckinRole(identity)) {
    forbiddenHits.push(...findTerms(text, cabinCrewForbidden));
    if (countTerms(text, airportCheckinRequired) < 3) missingRequiredTerms.push('airport_checkin_terms_min_3');
  }

  if (isRestaurantServerRole(identity)) {
    forbiddenHits.push(...findTerms(text, restaurantServerForbidden));
    if (countTerms(text, restaurantServerRequired) < 3) missingRequiredTerms.push('restaurant_server_terms_min_3');
  }

  if (isRestaurantManagerRole(identity)) {
    if (countTerms(text, restaurantManagerRequired) < 3) missingRequiredTerms.push('restaurant_manager_terms_min_3');
    const managerTermCount = countTerms(text, restaurantManagerRequired);
    const basicOnlyCount = countTerms(text, restaurantBasicOnlyTerms);
    if (basicOnlyCount >= 2 && managerTermCount < 3) forbiddenHits.push(...findTerms(text, restaurantBasicOnlyTerms));
  }

  if (!hasProfileVocabulary(text, input.roleProfile)) missingRequiredTerms.push('role_profile_vocabulary');

  if (forbiddenHits.length > 0) return result('forbidden_terms_detected', forbiddenHits, missingRequiredTerms);
  if (missingRequiredTerms.length > 0) return result('missing_required_role_terms', forbiddenHits, missingRequiredTerms);
  return result('passed', [], []);
}
