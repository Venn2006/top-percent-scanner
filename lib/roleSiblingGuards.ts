import type { RoleProfile } from '@/lib/roleProfiles';

export interface RoleSiblingGuardRule {
  family: string;
  keys: string[];
  required?: string[];
  minRequired?: number;
  forbidden?: string[];
  reason: string;
}

export interface RoleSiblingGuardInput {
  jobTitle: string;
  roleId?: string | null;
  roleProfile?: RoleProfile | null | unknown;
  text: unknown;
}

export interface RoleSiblingGuardResult {
  passed: boolean;
  forbiddenHits: string[];
  missingRequiredTerms: string[];
  requiredHits: string[];
  matchedRules: string[];
}

export const ROLE_SIBLING_GUARD_RULES: RoleSiblingGuardRule[] = [
  { family: 'education/school', keys: ['nhan vien y te truong hoc__y te - cham soc suc khoe'], required: ['so cuu', 'ho so suc khoe', 'y te hoc duong', 'theo doi suc khoe hoc sinh', 'thuoc', 'phong y te', 'tai nan hoc duong', 'phoi hop phu huynh', 'benh truyen nhiem', 'kham suc khoe dinh ky'], minRequired: 5, forbidden: ['giao an', 'giang day', 'cham bai', 'lop hoc tieng anh', 'lesson plan', 'mentor', 'tutor', 'IELTS', 'Cambridge', 'tuyen sinh', 'sales admission'], reason: 'school_healthcare_must_not_be_teacher_or_admissions' },
  { family: 'education/school', keys: ['giao vien tieu hoc__giao duc', 'giao vien tieng anh__giao duc', 'giao vien mam non__giao duc'], forbidden: ['so cuu y te', 'ho so suc khoe', 'phong y te', 'thuoc', 'benh truyen nhiem', 'kham suc khoe dinh ky'], reason: 'teacher_must_not_be_school_healthcare' },
  { family: 'education/school', keys: ['nhan vien tu van du hoc__giao duc'], required: ['tu van du hoc', 'study abroad', 'ho so', 'visa', 'checklist', 'crm follow-up', 'offer/visa', 'admissions', 'enrollment', 'shortlist truong'], minRequired: 5, forbidden: ['giang day', 'cham bai', 'giao an', 'so cuu', 'ho so suc khoe', 'quay check-in', 'boarding pass'], reason: 'study_abroad_consultant_must_not_be_teacher_healthcare_or_airport' },
  { family: 'education/school', keys: ['quan ly trung tam ngoai ngu__giao duc'], required: ['tuyen sinh', 'lich hoc', 'giao vien', 'hoc vien', 'phu huynh', 'tai tuc', 'doanh thu trung tam', 'van hanh trung tam', 'xep lop', 'chat luong lop hoc'], minRequired: 5, forbidden: ['chi giang day', 'cham bai', 'giao an ca nhan', 'mentor 1-1 thuan', 'so cuu y te'], reason: 'language_center_manager_must_not_be_teacher_only' },
  { family: 'F&B', keys: ['bartender__nha hang - khach san - du lich'], required: ['bartender', 'pha che', 'cocktail', 'mocktail', 'do uong', 'quay bar', 'bar station', 'recipe', 'dinh luong', 'garnish', 'upsell', 'POS', 'ton kho quay bar', 've sinh quay bar', 'speed of service', 'khach hang'], minRequired: 5, forbidden: ['Dau bep', 'Sous Chef', 'Bep truong', 'Kitchen Manager', 'Ca truong bep', 'Phu bep', 'Bep chinh', 'mise en place', 'so che', 'ra mon', 'kitchen KPI', 'food cost ownership', 'P&L', 'labor cost ownership', 'bep nong', 'bep lanh', 'line cook', 'commis'], reason: 'bartender_must_not_be_kitchen' },
  { family: 'F&B', keys: ['barista (pha che ca phe)__nha hang - khach san - du lich'], required: ['barista', 'ca phe', 'espresso', 'recipe', 'do uong', 'quay bar', 'ticket time', 'wastage', 'upsell'], minRequired: 4, forbidden: ['Dau bep', 'Sous Chef', 'Bep truong', 'Kitchen Manager', 'mise en place', 'so che'], reason: 'barista_must_not_be_chef_kitchen' },
  { family: 'F&B', keys: ['phu bep__nha hang - khach san - du lich'], required: ['phu bep', 'so che', 'bao quan', 'dinh luong', 've sinh khu vuc', 'ban giao ca'], minRequired: 4, forbidden: ['bartender', 'cocktail', 'mocktail', 'mixologist', 'P&L', 'food cost ownership'], reason: 'prep_cook_must_not_be_bar_or_manager' },
  { family: 'F&B', keys: ['nhan vien phuc vu ban (waiter/waitress)__nha hang - khach san - du lich'], required: ['khach', 'ban', 'order', 'menu', 'POS', 'phuc vu mon', 'don ban', 'upsell'], minRequired: 4, forbidden: ['P&L', 'food cost ownership', 'labor cost ownership'], reason: 'server_must_not_own_manager_metrics' },
  { family: 'F&B', keys: ['quan ly nha hang__nha hang - khach san - du lich'], required: ['food cost', 'labor cost', 'ton kho', 'SOP', 'KPI', 'team', 'complaint'], minRequired: 5, reason: 'restaurant_manager_requires_manager_terms' },
  { family: 'beauty/spa', keys: ['nhan vien spa khach san__nha hang - khach san - du lich'], required: ['spa', 'massage', 'facial', 'cham soc da', 'lieu trinh', 'tri lieu', 'body treatment', 'aromatherapy', 'phong tri lieu', 'chong chi dinh'], minRequired: 5, forbidden: ['housekeeping', 'buong phong', 'don phong', 'room attendant', 'room cleaning', 'checklist phong', 'check-out room', 'amenities', 'minibar', 'laundry handover', 'lost & found', 'lost and found', 'room speed', 'PMS', 'front desk', 'front office'], reason: 'hotel_spa_must_not_be_housekeeping' },
  { family: 'healthcare', keys: ['nha si__y te - cham soc suc khoe'], required: ['rang', 'benh an nha khoa', 'dieu tri', 'x-quang', 'phong kham', 'vo khuan', 'tu van dieu tri'], minRequired: 4, forbidden: ['giang day', 'giao an', 'recruitment', 'HR dashboard', 'ban thuoc tai quay'], reason: 'dentist_must_not_be_hr_teacher_or_pharmacy_counter' },
  { family: 'healthcare', keys: ['dieu duong vien__y te - cham soc suc khoe'], forbidden: ['dieu tri tuy', 'nho rang', 'tram composite', 'ke don thuoc doc lap', 'giao an'], reason: 'nurse_must_not_be_doctor_dentist_or_teacher' },
  { family: 'accounting/finance', keys: ['ke toan thanh toan__ke toan - kiem toan - tai chinh', 'ke toan thue__ke toan - kiem toan - tai chinh', 'ke toan tong hop__ke toan - tai chinh'], forbidden: ['CFO', 'Finance Director', 'P&L owner', 'board reporting', 'capital strategy', 'headcount ownership'], reason: 'accountants_must_not_be_cfo' },
  { family: 'accounting/finance', keys: ['ke toan truong__ke toan - kiem toan - tai chinh'], required: ['closing calendar', 'tax/audit compliance', 'control checklist', 'team ke toan', 'cashflow', 'dashboard', 'ban giam doc', 'controller', 'internal control'], minRequired: 4, reason: 'chief_accountant_requires_control_scope' },
  { family: 'accounting/finance', keys: ['cfo (giam doc tai chinh)__ke toan - kiem toan - tai chinh'], required: ['cashflow', 'P&L', 'capital', 'board', 'budget', 'forecast', 'financial strategy'], minRequired: 4, reason: 'cfo_requires_executive_finance_scope' },
  { family: 'sales/retail', keys: ['nhan vien ban hang sieu thi__ban le - sieu thi'], forbidden: ['quan ly ca', 'doanh thu cua hang', 'lich nhan su', 'ton kho toan cua hang', 'P&L', 'team KPI ownership'], reason: 'retail_staff_must_not_be_store_manager' },
  { family: 'sales/retail', keys: ['quan ly cua hang__ban le - sieu thi'], required: ['doanh thu cua hang', 'ton kho', 'lich ca', 'team', 'KPI', 'trung bay', 'that thoat', 'complaint'], minRequired: 4, reason: 'store_manager_requires_store_ops_terms' },
  { family: 'logistics/aviation', keys: ['nhan vien kho van__van tai - logistics'], forbidden: ['quan ly kho toan bo', 'inventory strategy', 'team KPI ownership', 'flight attendant', 'cabin crew', 'boarding pass'], reason: 'warehouse_staff_must_not_be_manager_or_aviation' },
  { family: 'logistics/aviation', keys: ['truong kho__chuoi cung ung - logistics'], required: ['ton kho', 'layout kho', 'cycle count', 'nhap xuat', 'team kho', 'KPI kho', 'that thoat', 'SOP'], minRequired: 4, reason: 'warehouse_manager_requires_manager_terms' },
  { family: 'logistics/aviation', keys: ['nhan vien check-in san bay__van tai - logistics'], required: ['check-in', 'boarding pass', 'ho chieu', 'visa', 'hanh ly', 'quay check-in', 'hanh khach', 'passenger service', 'supervisor', 'gate', 'baggage'], minRequired: 5, forbidden: ['cabin crew', 'Purser', 'senior crew', 'flight attendant', 'in-flight', 'route readiness'], reason: 'airport_checkin_must_not_be_cabin' },
  { family: 'logistics/aviation', keys: ['tiep vien hang khong__van tai - logistics'], required: ['cabin crew', 'cabin safety', 'service recovery', 'announcement', 'grooming', 'in-flight', 'Purser'], minRequired: 3, forbidden: ['quay check-in', 'boarding pass', 'Passenger Service Agent', 'Ground Service Supervisor'], reason: 'flight_attendant_must_not_be_checkin' },
  { family: 'media/event-host', keys: ['mc / nguoi dan chuong trinh__truyen thong - bao chi'], required: ['showreel', 'voice sample', 'script', 'run-of-show', 'cue san khau', 'xu ly tinh huong live', 'feedback agency', 'rate card', 'booking lead', 'khan gia'], minRequired: 5, forbidden: ['github', 'typescript', 'javascript', 'api integration', 'system design', 'debugging', 'technical doc', 'sql', 'code review'], reason: 'mc_host_must_not_be_tech_or_generic_office' },
  { family: 'marketing/executive', keys: ['cmo (giam doc marketing)__quan tri dieu hanh'], required: ['CMO', 'brand strategy', 'campaign P&L', 'budget', 'media mix', 'brand health', 'growth', 'board', 'revenue'], minRequired: 4, forbidden: ['Brand Manager', 'Marketing Lead tai SME', 'Marketing Lead', 'junior marketing', 'campaign execution only', 'xin review luong'], reason: 'cmo_must_not_be_lower_marketing_path' },
  { family: 'marketing/executive', keys: ['ceo / tong giam doc__quan tri dieu hanh'], required: ['CEO', 'P&L', 'board', 'operating dashboard', 'strategy memo', 'org design', 'stakeholder', 'executive'], minRequired: 4, forbidden: ['xin review HR', 'len quan ly', 'Specialist', 'Senior / Specialist', 'Manager CEO', 'Head CEO', 'employee appraisal'], reason: 'ceo_must_not_be_employee_progression_copy' },
  { family: 'HR', keys: ['chuyen vien tuyen dung__nhan su'], forbidden: ['HR Director', 'People Director', 'Head of HR', 'department strategy'], reason: 'recruiter_must_not_be_hr_director' },
  { family: 'HR', keys: ['chuyen vien c&b (luong thuong & phuc loi)__nhan su'], required: ['C&B', 'luong', 'phuc loi', 'benchmark', 'payroll'], minRequired: 3, forbidden: ['recruiter funnel only'], reason: 'cb_must_not_be_recruiter_only' },
  { family: 'HR', keys: ['truong phong nhan su__nhan su'], required: ['HR', 'dashboard', 'team', 'retention', 'policy', 'C&B'], minRequired: 3, forbidden: ['recruiter-only', 'chi tuyen dung'], reason: 'hr_director_must_not_be_recruiter_only' },
];

function normalizeGuardText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110Ä‘Ä]/g, 'd')
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

export function roleSiblingRoadmapText(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function containsTerm(normalizedText: string, term: string) {
  const normalizedTerm = normalizeGuardText(term);
  if (!normalizedTerm) return false;
  return normalizedText.includes(normalizedTerm);
}

function findTerms(normalizedText: string, terms: string[]) {
  return terms.filter(term => containsTerm(normalizedText, term));
}

function profileKey(roleProfile: RoleSiblingGuardInput['roleProfile']) {
  if (!roleProfile || typeof roleProfile !== 'object') return null;
  const key = (roleProfile as { key?: unknown }).key;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function getRoleSiblingGuardRules(input: Pick<RoleSiblingGuardInput, 'jobTitle' | 'roleId' | 'roleProfile'>) {
  const keys = new Set<string>();
  if (input.roleId) keys.add(input.roleId.trim());
  const profileId = profileKey(input.roleProfile);
  if (profileId) keys.add(profileId);
  const normalizedIdentity = normalizeGuardText(`${input.jobTitle} ${input.roleId || ''} ${flattenText(input.roleProfile).slice(0, 6).join(' ')}`);

  return ROLE_SIBLING_GUARD_RULES.filter(rule => {
    if (rule.keys.some(key => keys.has(key))) return true;
    return rule.keys.some(key => normalizedIdentity.includes(normalizeGuardText(key.split('__')[0])));
  });
}

export function validateRoleSiblingGuard(input: RoleSiblingGuardInput): RoleSiblingGuardResult {
  const rules = getRoleSiblingGuardRules(input);
  const normalizedText = normalizeGuardText(roleSiblingRoadmapText(input.text));
  const forbiddenHits: string[] = [];
  const missingRequiredTerms: string[] = [];
  const requiredHits: string[] = [];
  const matchedRules: string[] = [];

  for (const rule of rules) {
    matchedRules.push(rule.reason);
    forbiddenHits.push(...(rule.forbidden ? findTerms(normalizedText, rule.forbidden) : []));

    if (rule.required?.length) {
      const hits = findTerms(normalizedText, rule.required);
      requiredHits.push(...hits);
      if (hits.length < (rule.minRequired || rule.required.length)) {
        missingRequiredTerms.push(`${rule.reason}_required_min_${rule.minRequired || rule.required.length}`);
      }
    }
  }

  return {
    passed: forbiddenHits.length === 0 && missingRequiredTerms.length === 0,
    forbiddenHits: unique(forbiddenHits),
    missingRequiredTerms: unique(missingRequiredTerms),
    requiredHits: unique(requiredHits),
    matchedRules: unique(matchedRules),
  };
}

export function buildRoleSiblingBoundaryPrompt(input: Pick<RoleSiblingGuardInput, 'jobTitle' | 'roleId' | 'roleProfile'>) {
  const rules = getRoleSiblingGuardRules(input);
  if (!rules.length) return '';
  return rules.map(rule => [
    `ROLE SIBLING BOUNDARY (${rule.reason})`,
    rule.required?.length ? `Required own-role terms: ${rule.required.join(', ')}` : '',
    rule.minRequired ? `Minimum required own-role hits: ${rule.minRequired}` : '',
    rule.forbidden?.length ? `Forbidden sibling terms: ${rule.forbidden.join(', ')}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

export function getDeterministicFallbackTerms(input: Pick<RoleSiblingGuardInput, 'jobTitle' | 'roleId' | 'roleProfile'>) {
  const rules = getRoleSiblingGuardRules(input);
  return {
    required: unique(rules.flatMap(rule => rule.required || [])),
    forbidden: unique(rules.flatMap(rule => rule.forbidden || [])),
    rules: rules.map(rule => rule.reason),
  };
}
