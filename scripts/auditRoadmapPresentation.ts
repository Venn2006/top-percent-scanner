import fs from 'node:fs';
import path from 'node:path';
import {
  getPremiumRolePreviewForRole,
  getRoleLanguage,
  getSimulatorSkillsForRole,
  getTourismRoleProfile,
  getWorkTiersForRole,
  type SimulatorSkillBase,
  type WorkTierBase,
} from '../lib/roleTaxonomy';
import {
  driverDeliveryAchievements,
  driverDeliverySkillBank,
  dentalAssistantSkillBank,
  dentalSkillBank,
  hasFactorySkillLeakForRoadmapRole,
  hasGenericSkillLeakForDentalRole,
  hasKitchenSkillLeakForRestaurantNonChefRole,
  hasJuniorMarketingSkillLeakForManagerRole,
  hasManagerSkillLeakForFrontlineServiceRole,
  isDentalAssistantRoadmapRole,
  isDentalRoadmapRole,
  hotelFrontlineSkillBank,
  hotelManagerSkillBank,
  isDriverDeliveryRoadmapRole,
  isHotelFrontlineRoadmapRole,
  isHotelManagerRoadmapRole,
  isMarketingManagerRoadmapRole,
  isRestaurantFrontlineRoadmapRole,
  isRestaurantManagerRoadmapRole,
  marketingManagerSkillBank,
  normalizeRoadmapText,
  restaurantFrontlineSkillBank,
  restaurantManagerSkillBank,
} from '../lib/roadmapPresentation';

const driverRoles = [
  'Tài xế taxi',
  'Shipper giao hàng',
  'Nhân viên giao nhận',
  'Tài xế công nghệ',
  'Tài xế giao hàng',
];

const forbiddenForDriver = /5s|qc checklist|van hanh may|san luong|line leader|ho so len to pho|ho so len to truong|to truong san xuat|to pho san xuat|tesol|celta|ielts|power bi|python|tai chinh|financial/i;
const managerMarketingRoles = ['Brand Manager', 'Marketing Manager', 'Head of Marketing', 'Trade Marketing Manager'];
const juniorMarketing = /edit video|short-form|photoshop|canva|content calendar|copywriting chuyen doi|portfolio campaign|viet cv|linkedin/i;
const kitchenLeak = /recipe card|plating|kitchen sop|phu bep|sous chef|bep truong|haccp/i;
const frontlineManagerLeak = /p&l|revpar|adr|executive dashboard|owner\/gm|director|budget khach san|budget nha hang/i;
const genericDentalLeak = /excel|canva|powerpoint|viet cv|linkedin|tieng anh b2|portfolio ca nhan|power bi|python|tesol|celta/i;

const issues: string[] = [];

const taxonomyDefaultSkills: SimulatorSkillBase[] = [1, 2, 3, 4].map(index => ({
  id: `audit-roadmap-${index}`,
  label: `AUDIT_ROADMAP_${index}`,
  boost: 0.1,
  pctBoost: 1,
}));

const taxonomyDefaultTiers: WorkTierBase[] = [1, 2, 3, 4].map(index => ({
  name: `AUDIT_TIER_${index}`,
  mul: 1 + index / 10,
  color: '#94a3b8',
  badge: String(index),
}));

const roadmapTaxonomyChecks = [
  { role: 'Product Manager', required: /roadmap|backlog|delivery|stakeholder|team/i, forbidden: /edit video|canva|content calendar|tesol|celta|lesson plan/i },
  { role: 'IT Project Manager', required: /roadmap|backlog|delivery|stakeholder|team/i, forbidden: /edit video|canva|content calendar|tesol|celta|lesson plan/i },
  { role: 'Chief Accountant / Accounting Manager', required: /closing|tax|audit|control|finance reporting/i, forbidden: /tesol|celta|lesson plan|cabin|recipe card|recruiting funnel|time-to-fill|onboarding|c&b|hr dashboard|people dashboard|talent acquisition/i },
  { role: 'Truong phong kinh doanh', required: /pipeline|forecast|quota|coaching|key account/i, forbidden: /tesol|celta|lesson plan|pms accuracy|recipe card/i },
  { role: 'Quan ly van hanh toa nha', required: /tenant|vendor|maintenance|safety|budget/i, forbidden: /tesol|celta|lesson plan|teacher|recipe card/i },
  { role: 'Quan ly chuoi cung ung', required: /s&op|otif|vendor|inventory|exception/i, forbidden: /tesol|celta|lesson plan|teacher|recipe card/i },
  { role: 'Quan ly spa', required: /booking|service quality|rebooking|hygiene|roster/i, forbidden: /tesol|celta|lesson plan|factory|line leader/i },
  { role: 'Giam doc y te', required: /patient flow|clinical quality|safety|staffing|compliance/i, forbidden: /tesol|celta|lesson plan|teacher utilization/i },
  { role: 'Event Coordinator', required: /run-of-show|vendor|budget|onsite|client feedback/i, forbidden: /typescript|github|tesol|celta|factory/i },
  { role: 'Quan ly cua hang', required: /store|roster|inventory|shrinkage|customer experience/i, forbidden: /tesol|celta|lesson plan|teacher utilization/i },
  { role: 'Nhan vien y te truong hoc', required: /so cuu|suc khoe hoc sinh|thuoc|di ung|truyen nhiem/i, forbidden: /tesol|celta|lesson plan|teacher utilization|ielts/i },
  { role: 'Tu van du hoc', required: /study abroad|visa|crm follow-up|offer|enrollment/i, forbidden: /teacher utilization|center manager|lesson plan|tesol|celta/i },
  { role: 'Tai xe taxi', required: /dung gio|route|an toan|rating|bang lai/i, forbidden: forbiddenForDriver },
];

for (const check of roadmapTaxonomyChecks) {
  const skillText = getSimulatorSkillsForRole(check.role, taxonomyDefaultSkills)
    .map(skill => normalizeRoadmapText(skill.label))
    .join(' | ');
  if (/AUDIT_ROADMAP/.test(skillText)) issues.push(`${check.role}: roadmap taxonomy fell back to default skills`);
  if (!check.required.test(skillText)) issues.push(`${check.role}: roadmap taxonomy lacks expected skills -> ${skillText}`);
  if (check.forbidden.test(skillText)) issues.push(`${check.role}: roadmap taxonomy contains forbidden skills -> ${skillText}`);
}

const tourismForbidden = /pms|check-in|front office|room cleaning|amenities|minibar|table service|pos\/order|food cost|revpar|adr|p&l khach san|p&l nha hang|teacher utilization|tesol|celta|lesson plan/i;
const hospitalityRoleChecks = [
  { role: 'Huong dan vien du lich', kind: 'tour_guide', required: /thuyet minh|lich trinh|su co tour|feedback/i, forbidden: /upsell|booking\/revenue|pms|check-in|front office|table service|pos\/order|food cost|room cleaning/i },
  { role: 'Nhan vien booking du lich', kind: 'travel_booking', required: /booking|voucher|payment|nha cung cap|handover/i, forbidden: /pms|check-in|table service|food cost|revpar|adr/i },
  { role: 'Nhan vien dieu hanh tour', kind: 'tour_ops_staff', required: /tour file|nha cung cap|timeline|chi phi|feedback/i, forbidden: tourismForbidden },
  { role: 'Truong nhom dieu hanh tour', kind: 'tour_ops_lead', required: /dashboard|vendor|cost|margin|risk|team/i, forbidden: /pms|check-in|table service|food cost|room cleaning/i },
  { role: 'Sale khach le du lich', kind: 'travel_sales_fit', required: /nhu cau|lich trinh|bao gia|follow-up|deposit/i, forbidden: /pms|check-in|table service|food cost|room cleaning/i },
  { role: 'Sale khach doan du lich', kind: 'travel_sales_group', required: /quy mo|proposal|quotation|margin|b2b|repeat/i, forbidden: /pms|check-in|table service|food cost|room cleaning/i },
  { role: 'Nhan vien nha hang', kind: null, required: /pos|order accuracy|table service|upsell|handover/i, forbidden: /pms|revpar|adr|tour file|thuyet minh/i },
  { role: 'Le tan nha hang', kind: null, required: /pos|order accuracy|table service|upsell|handover/i, forbidden: /pms|revpar|adr|tour file|thuyet minh/i },
  { role: 'Quan ly nha hang', kind: null, required: /shift operations|labor cost|food cost|service quality|p&l/i, forbidden: /pms accuracy|tour file|thuyet minh/i },
  { role: 'Giam doc nha hang', kind: null, required: /shift operations|labor cost|food cost|service quality|p&l/i, forbidden: /pms accuracy|tour file|thuyet minh/i },
  { role: 'Nhan vien khach san', kind: null, required: /check-in|pms|guest request|complaint|handover/i, forbidden: /table service|pos\/order|food cost|tour file|thuyet minh/i },
  { role: 'Le tan khach san', kind: null, required: /check-in|pms|guest request|complaint|handover/i, forbidden: /table service|pos\/order|food cost|tour file|thuyet minh/i },
  { role: 'Quan ly khach san', kind: null, required: /occupancy|adr|revpar|staffing|p&l|dashboard/i, forbidden: /table service|pos\/order|tour file|thuyet minh/i },
  { role: 'Giam doc khach san', kind: null, required: /occupancy|adr|revpar|staffing|p&l|dashboard/i, forbidden: /table service|pos\/order|tour file|thuyet minh/i },
];

for (const check of hospitalityRoleChecks) {
  const tourismProfile = getTourismRoleProfile(check.role);
  if (check.kind && tourismProfile?.kind !== check.kind) issues.push(`${check.role}: wrong tourism kind ${tourismProfile?.kind || 'none'}`);
  if (!check.kind && tourismProfile) issues.push(`${check.role}: should not be tourism kind ${tourismProfile.kind}`);
  const skills = getSimulatorSkillsForRole(check.role, taxonomyDefaultSkills).map(skill => normalizeRoadmapText(skill.label)).join(' | ');
  const preview = getPremiumRolePreviewForRole(check.role);
  const language = getRoleLanguage(check.role);
  const tiers = getWorkTiersForRole(check.role, taxonomyDefaultTiers).map(tier => normalizeRoadmapText(tier.name)).join(' | ');
  const text = normalizeRoadmapText([skills, tiers, preview.coreSkill, preview.path, preview.firstAction, preview.cvBullet, ...preview.skills, language.rolePath, language.mainSkill, language.proofAsset, language.kpiGuidance].join(' | '));
  if (/AUDIT_ROADMAP|AUDIT_TIER/.test(text)) issues.push(`${check.role}: hospitality/tourism fallback default`);
  if (!check.required.test(text)) issues.push(`${check.role}: missing specific hospitality/tourism value -> ${text}`);
  if (check.forbidden.test(text)) issues.push(`${check.role}: cross-domain hospitality/tourism leak -> ${text}`);
}

for (const role of driverRoles) {
  if (!isDriverDeliveryRoadmapRole(role)) issues.push(`${role}: not detected as driver_delivery`);

  const skillText = driverDeliverySkillBank().map(normalizeRoadmapText).join(' | ');
  if (forbiddenForDriver.test(skillText)) issues.push(`${role}: driver skill bank contains forbidden terms`);
  if (!/dung gio|toi uu tuyen|an toan|rating|giao nhan|giao hang/.test(skillText)) {
    issues.push(`${role}: driver skill bank lacks delivery-specific value`);
  }

  const achievements = driverDeliveryAchievements(12, 24).map(normalizeRoadmapText).join(' | ');
  if (forbiddenForDriver.test(achievements)) issues.push(`${role}: driver achievements contain forbidden terms`);
  if (!/log chuyen|log don|dung gio|rating|feedback|bang lai|giao tre|hoan don/.test(achievements)) {
    issues.push(`${role}: driver achievements lack HR-verifiable evidence`);
  }

  for (const leak of ['Vận hành máy đúng SOP', '5S và an toàn lao động', 'QC checklist', 'Hồ sơ lên tổ phó/tổ trưởng']) {
    if (!hasFactorySkillLeakForRoadmapRole(role, leak)) issues.push(`${role}: failed to flag factory leak "${leak}"`);
  }
}

for (const role of managerMarketingRoles) {
  if (!isMarketingManagerRoadmapRole(role)) issues.push(`${role}: not detected as marketing manager`);
  const skillText = marketingManagerSkillBank().map(normalizeRoadmapText).join(' | ');
  if (juniorMarketing.test(skillText)) issues.push(`${role}: manager skill bank contains junior execution terms`);
  if (!/brand positioning|brand health|campaign p&l|budget|media mix|market share|agency|dashboard/.test(skillText)) {
    issues.push(`${role}: manager skill bank lacks manager-level brand value`);
  }
  for (const leak of ['Edit video short-form', 'Photoshop cơ bản', 'Lập content calendar', 'Viết CV/LinkedIn dạng case study']) {
    if (!hasJuniorMarketingSkillLeakForManagerRole(role, leak)) issues.push(`${role}: failed to flag junior marketing leak "${leak}"`);
  }
}

const serviceRoleChecks = [
  {
    role: 'Nhan vien thu ngan nha hang',
    detector: isRestaurantFrontlineRoadmapRole,
    bank: restaurantFrontlineSkillBank,
    required: /pos|order accuracy|bill log|table service|upsell|handover/i,
    forbidden: frontlineManagerLeak,
  },
  {
    role: 'Phuc vu nha hang',
    detector: isRestaurantFrontlineRoadmapRole,
    bank: restaurantFrontlineSkillBank,
    required: /pos|order accuracy|table service|upsell|complaint|handover/i,
    forbidden: frontlineManagerLeak,
  },
  {
    role: 'Quan ly nha hang',
    detector: isRestaurantManagerRoadmapRole,
    bank: restaurantManagerSkillBank,
    required: /shift operations|labor cost|food cost|service quality|table turn|p&l|dashboard/i,
    forbidden: kitchenLeak,
  },
  {
    role: 'Le tan khach san',
    detector: isHotelFrontlineRoadmapRole,
    bank: hotelFrontlineSkillBank,
    required: /check-in|pms|booking accuracy|guest request|handover|review/i,
    forbidden: frontlineManagerLeak,
  },
  {
    role: 'Quan ly khach san',
    detector: isHotelManagerRoadmapRole,
    bank: hotelManagerSkillBank,
    required: /occupancy|adr|revpar|roster|review score|sop audit|p&l|dashboard/i,
    forbidden: /recipe card|plating|kitchen sop|tesol|celta|lesson plan/i,
  },
];

for (const check of serviceRoleChecks) {
  if (!check.detector(check.role)) issues.push(`${check.role}: wrong employee/manager detector`);
  const skillText = check.bank().map(normalizeRoadmapText).join(' | ');
  if (!check.required.test(skillText)) issues.push(`${check.role}: skill bank lacks expected service-level value`);
  if (check.forbidden.test(skillText)) issues.push(`${check.role}: skill bank contains wrong seniority/domain leak`);
}

for (const leak of ['Recipe card co dinh luong', 'Chuan plating gio cao diem', 'Kitchen SOP', 'HACCP/an toan bep']) {
  if (!hasKitchenSkillLeakForRestaurantNonChefRole('Quan ly nha hang', leak)) issues.push(`Quan ly nha hang: failed to flag kitchen leak "${leak}"`);
  if (!hasKitchenSkillLeakForRestaurantNonChefRole('Phuc vu nha hang', leak)) issues.push(`Phuc vu nha hang: failed to flag kitchen leak "${leak}"`);
}

for (const leak of ['P&L nha hang co ban', 'Operating dashboard cho owner/GM', 'ADR va RevPAR strategy', 'budget khach san']) {
  if (!hasManagerSkillLeakForFrontlineServiceRole('Nhan vien thu ngan nha hang', leak)) issues.push(`Thu ngan nha hang: failed to flag manager leak "${leak}"`);
  if (!hasManagerSkillLeakForFrontlineServiceRole('Le tan khach san', leak)) issues.push(`Le tan khach san: failed to flag manager leak "${leak}"`);
}

const dentalChecks = [
  {
    role: 'Nha si',
    detector: isDentalRoadmapRole,
    bank: dentalSkillBank,
    required: /chan doan|treatment plan|vo khuan|x-quang|cbct|case|tai kham|feedback/i,
  },
  {
    role: 'Tro ly nha khoa',
    detector: isDentalAssistantRoadmapRole,
    bank: dentalAssistantSkillBank,
    required: /chuan bi ghe|vo khuan|suction|dung cu|huong dan|tai kham|ton kho|feedback/i,
  },
];

for (const check of dentalChecks) {
  if (!check.detector(check.role)) issues.push(`${check.role}: wrong dental detector`);
  const skillText = check.bank().map(normalizeRoadmapText).join(' | ');
  if (!check.required.test(skillText)) issues.push(`${check.role}: skill bank lacks dental value`);
  if (genericDentalLeak.test(skillText)) issues.push(`${check.role}: dental skill bank contains generic office/education leak`);
}

for (const leak of ['Excel/Google Sheets dashboard', 'Canva/PowerPoint trinh bay', 'Viet CV/LinkedIn dang case study', 'Tieng Anh B2+ cho cong viec']) {
  if (!hasGenericSkillLeakForDentalRole('Nha si', leak)) issues.push(`Nha si: failed to flag generic leak "${leak}"`);
}

const roadmapPage = fs.readFileSync(path.join(process.cwd(), 'app/roadmap/page.tsx'), 'utf8');
const roadmapApi = fs.readFileSync(path.join(process.cwd(), 'app/api/roadmap/generate/route.ts'), 'utf8');
if (/planText/.test(roadmapPage)) issues.push('roadmap certificate skill bank still uses planText for domain detection');
if (!/HR verify: \{displayVerifyUrl\}/.test(roadmapPage)) issues.push('certificate missing HR verification URL');
if (!/Evidence log/.test(roadmapPage)) issues.push('certificate missing evidence log block');
if (!/recipientName/.test(roadmapPage)) issues.push('certificate missing recipient full name binding');
if (!/marketingManagerSkillBank\(\)/.test(roadmapPage)) issues.push('roadmap page missing marketing manager skill bank');
if (!/restaurantManagerSkillBank\(\)/.test(roadmapPage)) issues.push('roadmap page missing restaurant manager skill bank');
if (!/restaurantFrontlineSkillBank\(\)/.test(roadmapPage)) issues.push('roadmap page missing restaurant frontline skill bank');
if (!/hotelManagerSkillBank\(\)/.test(roadmapPage)) issues.push('roadmap page missing hotel manager skill bank');
if (!/hotelFrontlineSkillBank\(\)/.test(roadmapPage)) issues.push('roadmap page missing hotel frontline skill bank');
if (!/dentalSkillBank\(\)/.test(roadmapPage)) issues.push('roadmap page missing dental skill bank');
if (!/dentalAssistantSkillBank\(\)/.test(roadmapPage)) issues.push('roadmap page missing dental assistant skill bank');
if (!/hasJuniorMarketingSkillLeakForManagerRole/.test(roadmapPage)) issues.push('roadmap page missing marketing manager junior-skill guard');
if (!/hasKitchenSkillLeakForRestaurantNonChefRole/.test(roadmapPage)) issues.push('roadmap page missing restaurant kitchen-skill guard');
if (!/hasManagerSkillLeakForFrontlineServiceRole/.test(roadmapPage)) issues.push('roadmap page missing frontline manager-skill guard');
if (!/hasGenericSkillLeakForDentalRole/.test(roadmapPage)) issues.push('roadmap page missing dental generic-skill guard');
if (!/taxonomyRoadmapSkillBank/.test(roadmapPage) || !/getSimulatorSkillsForRole/.test(roadmapPage)) issues.push('roadmap page is not using role taxonomy skill bank');
if (!/getRoadmapTaxonomySkillLabels/.test(roadmapApi) || !/Skill bank bat buoc/.test(roadmapApi)) issues.push('roadmap API prompt/action plan is not using role taxonomy skill bank');
if (!/isManagerOrExecutiveRoadmapRole/.test(roadmapApi)) issues.push('roadmap API missing manager/executive guard');
if (!/nonHrRoadmapLeakPattern/.test(roadmapApi) || !/sanitizeRoadmapIntakeForJob/.test(roadmapApi)) issues.push('roadmap API missing cross-role stale intake guard');
if (!/getSafeRoadmapRoleText/.test(roadmapPage) || !/sanitizeRoadmapCurrentPosition/.test(roadmapPage)) issues.push('roadmap UI missing cross-role stale profile guard');

if (issues.length) {
  console.error('ROADMAP_PRESENTATION_AUDIT issues=' + issues.length);
  for (const issue of issues) console.error(issue);
  process.exit(1);
}

console.log('PASS roadmap presentation/certificate driver_delivery, marketing manager, service seniority, dental and tourism-hospitality subrole checks');
