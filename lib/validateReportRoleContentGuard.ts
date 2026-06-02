export interface ReportRoleContentGuardInput {
  jobTitle: string;
  roleId?: string | null;
  text: string;
}

export interface ReportRoleContentGuardResult {
  passed: boolean;
  requiredHits: string[];
  missingRequiredTerms: string[];
  forbiddenHits: string[];
  brokenNoDiacriticHits: string[];
}

const AIRPORT_CHECKIN_ROLE_ID = 'nhan vien check-in san bay__van tai - logistics';

const AIRPORT_CHECKIN_REQUIRED_TERMS = [
  'check-in',
  'boarding pass',
  'hộ chiếu',
  'visa',
  'hành lý',
  'quầy check-in',
  'hành khách',
  'passenger service',
  'supervisor',
  'gate',
  'baggage',
];

const AIRPORT_CHECKIN_FORBIDDEN_TERMS = [
  'cabin',
  'cabin crew',
  'senior cabin crew',
  'senior crew',
  'purser',
  'cabin leader',
  'cabin trainer',
  'international route',
  'in-flight',
  'flight attendant',
  'cabin safety',
  'english announcement',
  'announcement tiếng anh',
  'checklist cabin',
  'training cabin crew',
  'grooming',
  'route readiness',
  'grooming cabin crew',
];

const AIRPORT_CHECKIN_BROKEN_NO_DIACRITIC_PHRASES = [
  'tu thao tac',
  'ho chieu',
  'hanh ly',
  'co kpi',
  'quay check-in',
  'khach',
  'can gate',
  'can supervisor',
  'bang chung',
  'luong',
];

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9+#&.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAirportCheckinCase(jobTitle: string, roleId?: string | null) {
  if ((roleId || '').trim() === AIRPORT_CHECKIN_ROLE_ID) return true;
  const normalized = normalize(jobTitle);
  return /check[- ]?in san bay|passenger service|ground service/.test(normalized);
}

function termHits(text: string, terms: string[]) {
  const normalizedText = normalize(text);
  return terms.filter((term) => normalizedText.includes(normalize(term)));
}

export function validateReportRoleContentGuard(input: ReportRoleContentGuardInput): ReportRoleContentGuardResult {
  if (!isAirportCheckinCase(input.jobTitle, input.roleId)) {
    return {
      passed: true,
      requiredHits: [],
      missingRequiredTerms: [],
      forbiddenHits: [],
      brokenNoDiacriticHits: [],
    };
  }

  const requiredHits = termHits(input.text, AIRPORT_CHECKIN_REQUIRED_TERMS);
  const forbiddenHits = termHits(input.text, AIRPORT_CHECKIN_FORBIDDEN_TERMS);
  const rawLower = input.text.toLowerCase();
  const brokenNoDiacriticHits = AIRPORT_CHECKIN_BROKEN_NO_DIACRITIC_PHRASES.filter((term) => rawLower.includes(term));
  const missingRequiredTerms = AIRPORT_CHECKIN_REQUIRED_TERMS.filter(
    (term) => !requiredHits.includes(term),
  );

  return {
    passed: requiredHits.length >= 5 && forbiddenHits.length === 0 && brokenNoDiacriticHits.length === 0,
    requiredHits,
    missingRequiredTerms,
    forbiddenHits,
    brokenNoDiacriticHits,
  };
}
