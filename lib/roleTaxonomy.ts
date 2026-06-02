import { repairMojibakeDeep } from './mojibake';
import { getExactRoleProfile } from './roleProfiles';

export type RoleSegment =
  | 'it'
  | 'semiconductor'
  | 'finance'
  | 'accounting'
  | 'sales'
  | 'retail'
  | 'real_estate'
  | 'marketing'
  | 'media_content'
  | 'design'
  | 'photography'
  | 'healthcare'
  | 'pharma_chemical'
  | 'education'
  | 'school_leadership'
  | 'freelance_teaching'
  | 'language_center'
  | 'education_admissions'
  | 'hr'
  | 'legal'
  | 'admin_office'
  | 'statistics_data'
  | 'customer_service'
  | 'logistics'
  | 'procurement_supply'
  | 'engineering'
  | 'blue_collar'
  | 'construction'
  | 'environment_energy'
  | 'agriculture'
  | 'research'
  | 'consulting'
  | 'pilot'
  | 'aviation'
  | 'driver_delivery'
  | 'hospitality'
  | 'fnb'
  | 'beauty_spa'
  | 'security'
  | 'cleaning'
  | 'events'
  | 'creator_entertainment'
  | 'sports_fitness'
  | 'business_owner'
  | 'executive'
  | 'fresh'
  | 'general';

export interface SimulatorSkillBase {
  id: string;
  label: string;
  boost: number;
  pctBoost: number;
}

export interface WorkTierBase {
  name: string;
  mul: number;
  color: string;
  badge: string;
}

export interface PremiumRolePreview {
  roleLabel: string;
  coreSkill: string;
  path: string;
  firstAction: string;
  skills: string[];
  cvBullet: string;
}

export interface RoleLanguage {
  rolePath: string;
  mainSkill: string;
  proofAsset: string;
  opportunityList: string;
  portfolioWord: string;
  productWord: string;
  kpiGuidance: string;
}

const segmentLabels: Record<RoleSegment, string> = {
  it: 'Công nghệ / IT',
  semiconductor: 'Công nghệ bán dẫn',
  finance: 'Tài chính / Ngân hàng / Bảo hiểm',
  accounting: 'Kế toán / Kiểm toán',
  sales: 'Kinh doanh / Sales',
  retail: 'Bán lẻ / Siêu thị',
  real_estate: 'Bất động sản / Quản lý tòa nhà',
  marketing: 'Marketing / Growth / Brand',
  media_content: 'Truyền thông / Nội dung / Báo chí',
  design: 'Thiết kế / Sáng tạo',
  photography: 'Nhiếp ảnh / Photographer',
  healthcare: 'Y tế / Chăm sóc sức khỏe',
  pharma_chemical: 'Dược phẩm / Hóa chất',
  education: 'Giáo dục / Trường học',
  school_leadership: 'Lãnh đạo trường học / Hiệu trưởng',
  freelance_teaching: 'Giáo viên tự do / Gia sư / Online course',
  language_center: 'Giáo dục - Trung tâm ngoại ngữ',
  education_admissions: 'Tư vấn tuyển sinh / Admissions / Du học',
  hr: 'Nhân sự / People Operations',
  legal: 'Pháp lý / Compliance',
  admin_office: 'Hành chính / Văn phòng',
  statistics_data: 'Thống kê / Dữ liệu / Báo cáo',
  customer_service: 'Dịch vụ khách hàng / CRM',
  logistics: 'Logistics / Xuất nhập khẩu',
  procurement_supply: 'Mua hàng / Kế hoạch / Supply',
  engineering: 'Sản xuất / Kỹ thuật',
  blue_collar: 'Blue-collar / Thợ thủ công / Nghề tay nghề',
  construction: 'Xây dựng / Bất động sản kỹ thuật',
  environment_energy: 'Môi trường / Năng lượng',
  agriculture: 'Nông nghiệp / Thủy sản',
  research: 'Nghiên cứu / Học thuật',
  consulting: 'Tư vấn / Consulting',
  pilot: 'Phi cong / Flight deck',
  aviation: 'Hàng không / Cabin Crew',
  driver_delivery: 'Vận tải / Tài xế / Giao nhận',
  hospitality: 'Nhà hàng - Khách sạn - Du lịch',
  fnb: 'F&B / Bếp / Nhà hàng',
  beauty_spa: 'Làm đẹp / Spa / Salon',
  security: 'An ninh / Bảo vệ',
  cleaning: 'Vệ sinh / Tạp vụ / Môi trường',
  events: 'MC / Sự kiện / Biểu diễn',
  creator_entertainment: 'Creator / Nghệ thuật / Giải trí',
  sports_fitness: 'Thể thao / Fitness',
  business_owner: 'Kinh doanh tự do / Chủ hộ kinh doanh',
  executive: 'Quản trị điều hành',
  fresh: 'Mới tốt nghiệp / Chưa rõ hướng',
  general: 'Thị trường lao động chung',
};

export function getRoleSegmentLabel(segment: RoleSegment) {
  return segmentLabels[segment];
}

function shouldUseExactRoleProfiles() {
  return process.env.ROLE_PROFILE_GENERATION !== '1';
}

const segmentMatchers: Array<[RoleSegment, RegExp]> = [
  ['fresh', /fresher|new graduate|sinh vien|moi tot nghiep|moi ra truong|chua ro dinh huong|chua dinh huong/],
  ['photography', /nhiep anh|photographer|chup anh|chup hinh|photo studio|retoucher|photo editor|cinematographer|director of photography|\bdop\b/],
  ['pilot', /phi cong|pilot|co pho|co-pilot|first officer|airline pilot|flight deck|buong lai|lai may bay|captain pilot|captain bay|captain hang khong/],
  ['aviation', /tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|check in san bay|nhan vien mat dat hang khong|ground staff airline/],
  ['fnb', /dau bep|chef|bep truong|bep pho|sous chef|phu bep|cook|kitchen|barista|bartender|pha che|f&b|fnb|food and beverage/],
  ['events', /\bmc\b|nguoi dan|dan chuong trinh|host|event coordinator|to chuc su kien|su kien|event host|livestream host|presenter|moderator|wedding mc/],
  ['school_leadership', /hieu truong|hieu pho|principal|vice principal|headmaster|school leader|school director/],
  ['freelance_teaching', /gia su|private tutor|giao vien tu do|freelance teacher|online teacher|day online|day kem|online course|course creator|e-learning|lms/],
  ['education_admissions', /tu van du hoc|study abroad|overseas education|education consultant|admissions counselor|admission counselor|admissions consultant|tu van tuyen sinh|tuyen sinh|enrollment advisor|student recruitment|visa du hoc/],
  ['language_center', /quan ly.*trung tam.*ngoai ngu|trung tam ngoai ngu|english center|language center|giao vu|academic coordinator|academic admin/],
  ['healthcare', /nhan vien y te truong hoc|y te truong hoc|y te hoc duong|school nurse|school health|school medical|nurse school|health officer.*school/],
  ['education', /giao vien|giang vien|teacher|teaching assistant|tro giang|bao mau|mam non|preschool|kindergarten|dao tao|huong nghiep|career counselor|l&d|learning|curriculum|thiet ke chuong trinh dao tao|hieu truong|hieu pho|school|university|lecturer/],
  ['blue_collar', /blue[- ]collar|lao dong tay nghe|cong nhan tay nghe|tho thu cong|tho moc|carpenter|woodworker|tho may|tailor|tho dien|electrician|tho dien nuoc|tho ong nuoc|plumber|tho sua chua|mechanic|tho han|welder|tho tien|tho phay|setter|tho ne|mason|tho xay|bricklayer|tho son|painter|ky thuat vien dien lanh|bao tri may|lap dat he thong pccc/],
  ['engineering', /cong nhan van hanh may|machine operator|production operator|factory worker|van hanh may|operator san xuat/],
  ['beauty_spa', /spa|salon|phun xam|tham my|tho cat toc|stylist toc|barber|hair stylist|nail|makeup|trang diem/],
  ['security', /bao ve|an ninh|security|giam sat an ninh/],
  ['cleaning', /ve sinh|tap vu|thu gom rac|cleaner|cleaning/],
  ['driver_delivery', /tai xe|xe om|shipper|giao hang|container|dispatcher|dieu phoi van tai|van tai|driver/],
  ['hospitality', /khach san|nha hang|du lich|le tan|buong phong|dat phong|revenue manager|huong dan vien|waiter|waitress|phuc vu ban/],
  ['logistics', /nhan vien kho|kho hang|warehouse|ecommerce warehouse|e-commerce warehouse/],
  ['retail', /ban le|sieu thi|thu ngan|cua hang|quan ly cua hang|merchandiser|trung bay hang hoa|kiem kho|tu van dien thoai|tu van my pham|ecommerce|e-commerce|thuong mai dien tu|san thuong mai/],
  ['real_estate', /bat dong san|bds|moi gioi|quan ly toa nha|phat trien du an|dinh gia bat dong san/],
  ['construction', /xay dung|cong trinh|kien truc|noi that|mep|co dien lanh|ket cau|giam sat cong trinh|quan ly du an xay dung|tho ho/],
  ['logistics', /logistics|supply chain|chuoi cung ung|freight|forwarder|xuat nhap khau|import export|hai quan|kho van|nhan vien kho|kho hang|warehouse|truong kho|chung tu logistics|ke hoach phan phoi/],
  ['procurement_supply', /mua hang|thu mua|purchasing|procurement|planner|hoach dinh san xuat|ke hoach phan phoi/],
  ['customer_service', /cham soc khach hang|dich vu khach hang|tong dai|call center|crm executive|technical support|ho tro ky thuat/],
  ['hr', /nhan su|human resources|\bhr\b|tuyen dung|recruit|headhunter|c&b|luong thuong|phuc loi|hrbp|people operations|people ops/],
  ['legal', /phap ly|phap che|luat su|thu ky toa an|hop dong|legal|compliance/],
  ['healthcare', /tro ly nha khoa|nha khoa|phong kham/],
  ['admin_office', /hanh chinh|van phong|thu ky|tro ly|le tan van phong|van thu|luu tru|dau thau|iso/],
  ['statistics_data', /statistician|statistics officer|reporting analyst|data reporting|bao cao du lieu|thong ke du lieu|nhap lieu|data entry/],
  ['finance', /tai chinh|chuyen vien tai chinh|financial specialist|ngan hang|bank|bao hiem|tin dung|fintech|dau tu|chung khoan|risk|rm\b|quan ly quan he khach hang|giao dich vien|thanh toan quoc te|tham dinh ton that|giam dinh bao hiem|cfo|finance|financial/],
  ['accounting', /ke toan|kiem toan|accountant|accounting|tax|thue|ngan quy|hoach dinh ngan sach|chief accountant|controller/],
  ['engineering', /fsqa|dam bao chat luong thuc pham|quality assurance food|food safety quality/],
  ['sales', /sales|kinh doanh|ban hang|account executive|business development|phat trien thi truong|key account|telesales|sales supervisor|trade marketing|fmcg|medical representative|trinh duoc vien/],
  ['marketing', /marketing|brand|seo|social media|digital marketing|performance marketing|pr executive|growth|campaign|advertising|quang cao|cmo/],
  ['media_content', /bao chi|phong vien|nha bao|bien tap|copywriter|content|bien dich|phien dich|content producer|nha san xuat noi dung/],
  ['design', /designer|thiet ke|ui\/ux|ux|graphic|motion|3d artist|animator|video editor|creative director|product designer|brand designer|game designer/],
  ['it', /\bit\b|developer|software|frontend|backend|fullstack|full-stack|data scientist|data engineer|data analyst|ml engineer|machine learning|business analyst|product manager|scrum master|project manager|devops|cloud|aws|gcp|azure|qa|tester|database administrator|\bdba\b|sysadmin|system administrator|solution architect|tech lead|cto|cybersecurity|erp|sap|blockchain|game developer|embedded|it support|helpdesk|noc|network/],
  ['semiconductor', /ban dan|semiconductor|rtl|verification engineer|physical design|ic design|process engineer/],
  ['healthcare', /bac si|dieu duong|nha si|nha khoa|phong kham|duoc si|xet nghiem|x quang|sieu am|ho ly|dinh duong|y te|tam ly|vat ly tri lieu|healthtech|benh vien|thu y/],
  ['pharma_chemical', /duoc pham|hoa chat|kiem nghiem duoc|dang ky san pham|ky su hoa|r&d|nghien cuu phat trien/],
  ['agriculture', /nong nghiep|thuy san|nong san|trong trot|chan nuoi|nong trai|ky su nong nghiep|ky su thuy san/],
  ['engineering', /fsqa|dam bao chat luong thuc pham|quality assurance food|food safety quality/],
  ['engineering', /ky su|san xuat|factory|manufacturing|qa\/qc|quality|cong nghe|giam sat san xuat|quan doc|bao tri thiet bi|lean|ie engineer|hse|an toan lao dong|vat lieu|co khi|tu dong hoa|dien tu|vien thong|cap quang|dien luc|dau khi/],
  ['environment_energy', /moi truong|esg|sustainability|phat trien ben vung|xu ly chat thai|xu ly nuoc thai|quan trac|kiem soat o nhiem|nang luong|solar|wind|tai tao/],
  ['agriculture', /nong nghiep|thuy san|nong san|trong trot|chan nuoi|nong trai/],
  ['research', /nghien cuu|hoc thuat|scientist|researcher|ai\/ml researcher/],
  ['consulting', /consulting|tu van quan ly|tu van chien luoc|management consultant|tu van erp|tu van thue/],
  ['creator_entertainment', /streamer|youtuber|dien vien|nghe si|nhac si|nhac cong|giai tri/],
  ['sports_fitness', /fitness|gym|yoga|huan luyen vien|hlv|personal trainer|boi loi/],
  ['business_owner', /chu quan|chu xuong|chu cua hang|kinh doanh online|dropshipping|shopee|tap hoa|owner|founder/],
  ['executive', /ceo|coo|cfo|cto|general director|tong giam doc|giam doc vung|vp|pho tong giam doc|managing director|giam doc nha may|giam doc kinh doanh|marketing director/],
];

export function normalizeRoleText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[đĐ]/g, 'd')
    .replace(/[đĐ]/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const genericStatisticsRolePattern = /(^| )(chuyen vien|nhan vien|can bo|staff|specialist|officer|analyst)? ?thong ke( |$)|statistician|statistics officer|reporting analyst|data reporting|bao cao du lieu|thong ke du lieu|nhap lieu|data entry/;
const productionStatisticsRolePattern = /thong ke san xuat|production statistic|production statistics|manufacturing statistic|manufacturing statistics|bao cao san xuat|production reporting/;
const schoolHealthcareRolePattern = /nhan vien y te truong hoc|y te truong hoc|y te hoc duong|school nurse|school health|school medical|nurse school|health officer.*school/;
const studyAbroadAdmissionsRolePattern = /tu van du hoc|du hoc|study abroad|overseas education|visa du hoc/;
const englishTeacherRolePattern = /giao vien tieng anh|english teacher|ielts teacher|toeic teacher|cambridge teacher|ielts|toeic|cambridge|tesol|celta|ngon ngu anh/;
const publicSubjectTeacherRolePattern = /giao vien (toan|vat ly|ly|hoa|hoa hoc|lich su|su|dia ly|dia|ngu van|van|tin hoc|sinh hoc|sinh|gdcd|cong nghe|my thuat|am nhac|the duc)|teacher (math|physics|chemistry|history|geography|literature|informatics|computer science|biology|civics|technology|art|music|pe)/;
const languageCenterManagerRolePattern = /quan ly.*trung tam.*(ngoai ngu|tieng anh)|giam doc.*trung tam.*(ngoai ngu|tieng anh)|pho giam doc.*trung tam.*(ngoai ngu|tieng anh)|center manager.*(english|language)|language center manager|english center manager|academic operations manager.*(english|language)|academic manager.*(english|language)/;
const postalRolePattern = /buu dien|buu chinh|postal|post office|mail carrier|chuyen phat|parcel post/;
const airportGroundRolePattern = /check[- ]?in san bay|nhan vien mat dat hang khong|ground staff airline|airport ground|boarding gate|dcs check[- ]?in/;
const radiologyTechRolePattern = /x[- ]?quang|chan doan hinh anh|radiology|radiographer|imaging technician|ct scanner|mri technician/;
const productDevelopmentRolePattern = /ky su phat trien san pham|npd|new product development|r&d thuc pham|product development engineer/;
const networkOperationsRolePattern = /\bnoc\b|network operations|network engineer|ky thuat mang|quan tri mang|network administrator|network specialist|network support|ha tang mang|network infrastructure/;
const telecomInfrastructureRolePattern = /vien thong|telecom|telecommunication|cap quang|fiber optic|fibre optic|ftth|truyen dan|tram bts|bts station|radio access network|\bran\b/;
const securitiesBrokerRolePattern = /moi gioi chung khoan|stock broker|securities broker|broker chung khoan|tu van dau tu chung khoan|chung khoan/;
const insuranceRolePattern = /bao hiem|insurance|phi nhan tho|non[- ]?life|general insurance|underwriting|underwriter|claim|claims|boi thuong|giam dinh ton that|tham dinh ton that|tai tuc|policy wording|broker bao hiem|moi gioi bao hiem/;
const marketingManagerRolePattern = /brand manager|marketing manager|marketing lead|head of marketing|brand lead|brand director|marketing director|category manager|trade marketing manager|product marketing manager|growth manager|campaign manager|quan ly marketing|truong phong marketing|giam doc marketing|quan ly thuong hieu|truong nhom marketing|truong nhom thuong hieu/;
const restaurantManagerRolePattern = /quan ly nha hang|giam doc nha hang|restaurant manager|restaurant director|general manager nha hang|f&b manager|fnb manager|f&b director|food and beverage manager|floor manager nha hang|shift manager nha hang|cua hang truong nha hang/;
const restaurantFrontlineRolePattern = /nhan vien nha hang|le tan nha hang|phuc vu nha hang|nhan vien phuc vu ban|phuc vu ban|waiter|waitress|server nha hang|thu ngan nha hang|cashier nha hang|hostess nha hang|host nha hang/;
const hotelManagerRolePattern = /quan ly khach san|giam doc khach san|hotel manager|hotel director|general manager khach san|gm khach san|front office manager|rooms division manager|revenue manager.*khach san|operations manager.*khach san/;
const hotelFrontlineRolePattern = /nhan vien khach san|le tan khach san|hotel receptionist|front desk|front office staff|guest service|dat phong khach san|reservation khach san|nhan vien dat phong khach san/;
const tourGuideRolePattern = /huong dan vien( du lich)?|tour guide|tour leader|local guide|hdv du lich|hdv tour/;
const tourOpsLeadRolePattern = /truong nhom dieu hanh tour|tour operations lead|tour operations manager|travel operations manager|tour operator manager|tour manager/;
const tourOpsStaffRolePattern = /nhan vien dieu hanh tour|dieu hanh tour|tour operator|tour coordinator|travel operations|operation tour|tour operation/;
const travelBookingRolePattern = /nhan vien booking du lich|booking du lich|booking tour|travel booking|ticketing tour|dat tour|dat dich vu du lich|reservation tour/;
const travelSalesGroupRolePattern = /sale khach doan du lich|sales khach doan|sale doan|group tour sales|corporate travel sales|mice sales|sale mice|sales mice|khach doan/;
const travelSalesFitRolePattern = /sale khach le du lich|sales khach le|sale tour|sales tour|ban tour|tu van tour|travel consultant|travel sales|khach le/;
const dentalRolePattern = /nha si|dentist|bac si nha khoa|nha khoa|rang ham mat|dental doctor|dental clinician|implant|chinh nha|orthodontic/;
const dentalAssistantRolePattern = /tro ly nha khoa|phu ta nha khoa|dental assistant|dental nurse/;
const veterinaryRolePattern = /bac si thu y|thu y|veterinarian|veterinary|animal doctor|pet clinic|phong kham thu y|chan nuoi thu y/;
const nutritionRolePattern = /chuyen vien dinh duong|tu van dinh duong|dinh duong vien|nutritionist|dietitian|dietician|clinical nutrition|sports nutrition|meal plan|che do an|khau phan|tu van an uong/;
const executiveRolePattern = /\b(ceo|coo|cfo|cto|vp)\b|vice president|chief executive|chief operating|chief financial|chief technology|general director|deputy general director|managing director|tong giam doc|pho tong giam doc|giam doc dieu hanh|giam doc vung|giam doc khoi|giam doc nha may|giam doc kinh doanh|marketing director|operations director/;
const semiconductorRolePattern = /ban dan|semiconductor|rtl|verification engineer|physical design|ic design|process engineer/;
const accountingManagerRolePattern = /chief accountant|accounting manager|ke toan truong|truong phong ke toan|controller/;
const salesManagerRolePattern = /truong phong kinh doanh|sales manager|sales supervisor|giam sat kinh doanh|national sales manager|key account manager|sales director|giam doc kinh doanh/;
const retailManagerRolePattern = /quan ly cua hang|store manager|store supervisor|retail manager|category manager|area manager ban le|cua hang truong/;
const propertyOpsRolePattern = /quan ly toa nha|quan ly van hanh toa nha|building manager|property manager|facility manager|facilities manager|building operations/;
const constructionManagerRolePattern = /quan ly du an xay dung|construction project manager|construction manager|site manager|project manager xay dung/;
const logisticsManagerRolePattern = /quan ly chuoi cung ung|supply chain manager|logistics manager|warehouse manager|truong kho|transport manager/;
const beautySpaManagerRolePattern = /quan ly spa|spa manager|salon manager|quan ly salon/;
const healthcareManagerRolePattern = /quan ly benh vien|giam doc y te|medical director|hospital manager|clinic manager|healthcare manager/;
const eventOpsRolePattern = /event coordinator|event manager|event producer|to chuc su kien|dieu phoi su kien/;
const customerServiceManagerRolePattern = /truong phong dich vu khach hang|customer service manager|customer success manager|crm manager|call center manager/;
const hrManagerRolePattern = /truong phong nhan su|hr manager|human resources manager|people operations manager|head of hr|hrbp manager/;
const securityManagerRolePattern = /truong nhom bao ve|security supervisor|security manager|giam sat an ninh/;
const sportsFitnessManagerRolePattern = /quan ly phong gym|gym manager|fitness manager|studio manager|program owner/;
const designDirectorRolePattern = /creative director|design director|head of design|art director|design lead/;
const itManagerRolePattern = /product manager|project manager|it project manager|scrum master|engineering manager|tech lead|technical lead|team lead|head of engineering|vp engineering/;

export function isSchoolHealthcareRole(jobTitle: string, industry?: string | null) {
  return schoolHealthcareRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

export function isEnglishTeacherRole(jobTitle: string, industry?: string | null) {
  if (isSchoolHealthcareRole(jobTitle, industry)) return false;
  if (isLanguageCenterManagerRole(jobTitle, industry)) return false;
  return englishTeacherRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

export function isLanguageCenterManagerRole(jobTitle: string, industry?: string | null) {
  return languageCenterManagerRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

export function isVeterinaryRole(jobTitle: string, industry?: string | null) {
  return veterinaryRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

export function isNutritionRole(jobTitle: string, industry?: string | null) {
  return nutritionRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

export function isPublicSubjectTeacherRole(jobTitle: string, industry?: string | null) {
  const normalized = normalizeRoleText(`${jobTitle} ${industry || ''}`);
  return publicSubjectTeacherRolePattern.test(normalized) && !englishTeacherRolePattern.test(normalized);
}

export function isStatisticsDataRole(jobTitle: string, industry?: string | null) {
  const title = normalizeRoleText(jobTitle);
  const text = normalizeRoleText(`${jobTitle} ${industry || ''}`);
  if (/nhan vien kho.*thuong mai dien tu|kho.*thuong mai dien tu|kho.*ecommerce|ecommerce warehouse|e-commerce warehouse/.test(text)) return false;
  if (/van hanh san thuong mai dien tu|ecommerce operator|e-commerce operator|marketplace operator|san thuong mai/.test(text)) return false;
  return genericStatisticsRolePattern.test(title) && !productionStatisticsRolePattern.test(text);
}

function isStudyAbroadAdmissionsRole(jobTitle: string, industry?: string | null) {
  return studyAbroadAdmissionsRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

function isPostalRole(jobTitle: string, industry?: string | null) {
  return postalRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

function isAirportGroundRole(jobTitle: string, industry?: string | null) {
  return airportGroundRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

function isRadiologyTechRole(jobTitle: string, industry?: string | null) {
  return radiologyTechRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

function isProductDevelopmentRole(jobTitle: string, industry?: string | null) {
  return productDevelopmentRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

function isNetworkOperationsRole(jobTitle: string, industry?: string | null) {
  return networkOperationsRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

function isTelecomInfrastructureRole(jobTitle: string, industry?: string | null) {
  const text = normalizeRoleText(`${jobTitle} ${industry || ''}`);
  const industryText = normalizeRoleText(industry || '');
  if (genericStatisticsRolePattern.test(text) && !/buu chinh|vien thong|telecom|isp|nha mang|cap quang|fiber|ftth|bts/.test(industryText)) return false;
  return telecomInfrastructureRolePattern.test(text);
}

function isSecuritiesBrokerRole(jobTitle: string, industry?: string | null) {
  return securitiesBrokerRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

export function isInsuranceRole(jobTitle: string, industry?: string | null) {
  return insuranceRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

export type SkilledTradeProfile = {
  id: string;
  segment: RoleSegment;
  pattern: RegExp;
  forbidden?: RegExp;
  skills: string[];
  tiers: string[];
  preview: Omit<PremiumRolePreview, 'roleLabel'>;
  language: RoleLanguage;
};

const skilledTradeProfiles: SkilledTradeProfile[] = [
  {
    id: 'hvac',
    segment: 'blue_collar',
    pattern: /ky thuat vien dien lanh|dien lanh|hvac|may lanh|dieu hoa|chiller|vrv|vrf|kho lanh/,
    forbidden: /cnc|laser|han tig|han mig|may cong nghiep|qc thanh pham|plc|oee|lean|six sigma/,
    skills: ['Chan doan loi dieu hoa/may lanh/chiller bang ap suat, dong dien va nhiet do', 'Lap dat, bao tri va ve sinh he thong dieu hoa dung quy trinh', 'Xu ly ro gas, hut chan khong, nap gas va kiem tra leak an toan', 'Bao gia vat tu, SLA sua chua va ban giao nghiem thu cho khach'],
    tiers: ['Tho phu/dien lanh dan dung co ban', 'Ky thuat vien dien lanh doc lap', 'HVAC technician cho toa nha/chuoi/cold room', 'Team lead bao tri HVAC/chiller/VRF'],
    preview: {
      coreSkill: 'chan doan loi HVAC + lap dat/bao tri + xu ly gas/leak + nghiem thu SLA',
      path: 'Ky thuat vien dien lanh -> HVAC technician -> Team lead bao tri HVAC/chiller',
      firstAction: 'dong goi 10 ca sua/lap dat dien lanh: trieu chung, do ap suat/dong dien/nhiet do, vat tu thay, thoi gian xu ly, bao hanh va feedback khach',
      skills: ['HVAC diagnosis', 'Gas/leak handling', 'Installation/maintenance', 'SLA handover'],
      cvBullet: 'Chung minh tay nghe dien lanh bang case sua/lap dat HVAC, do ap suat-dong dien-nhiet do, xu ly ro gas, nghiem thu va feedback khach; khong ghi skill nghe khac khong lien quan.',
    },
    language: {
      rolePath: 'Ky thuat vien dien lanh / HVAC Technician / Bao tri chiller-VRF / Team lead HVAC',
      mainSkill: 'HVAC fault diagnosis + installation/maintenance + refrigerant leak handling + customer handover/SLA',
      proofAsset: '10 case dien lanh da an thong tin gom loai may/he thong, loi ban dau, thong so do ap suat-dong dien-nhiet do, vat tu, thoi gian xu ly, ket qua nghiem thu va feedback khach',
      opportunityList: 'doi bao tri toa nha, nha thau HVAC, trung tam bao hanh dieu hoa, chuoi ban le dien may, cold room/kho lanh, khach san/toa nha hoac team chiller-VRF',
      portfolioWord: 'HVAC service log',
      productWord: 'case sua/lap dat dien lanh',
      kpiGuidance: 'KPI dien lanh: first-time fix rate, thoi gian xu ly, so ca bao hanh lai, leak rate sau sua, ticket SLA, so ca lap dat nghiem thu dat va feedback khach.',
    },
  },
  {
    id: 'industrial-electrician',
    segment: 'blue_collar',
    pattern: /tho dien cong nghiep|dien cong nghiep|tu dien|mccb|contactor|relay|bien tan|motor|dong co dien|dien nha xuong/,
    forbidden: /cnc|laser|may lanh|gas lanh|son nuoc|ong nuoc/,
    skills: ['Doc so do dien va dau noi tu dien cong nghiep', 'Kiem tra motor, contactor, relay, MCCB va bien tan', 'Xu ly su co mat pha, qua tai, chap cham va downtime an toan', 'Lockout/tagout, bien ban sua chua va checklist bao tri dinh ky'],
    tiers: ['Tho dien cong nghiep phu viec', 'Tho dien cong nghiep doc lap', 'Bao tri dien nha may/toa nha', 'Lead electrical maintenance'],
    preview: {
      coreSkill: 'tu dien cong nghiep + motor/bien tan + xu ly downtime + an toan dien',
      path: 'Tho dien cong nghiep -> Bao tri dien -> Electrical maintenance lead',
      firstAction: 'dong goi 5 ca su co dien: trieu chung, so do/tu dien lien quan, phep do, nguyen nhan, action va thoi gian downtime giam',
      skills: ['Industrial panel', 'Motor/VFD', 'Troubleshooting', 'Electrical safety'],
      cvBullet: 'Chung minh tho dien cong nghiep bang ca sua tu dien, motor/bien tan, downtime giam va checklist an toan dien.',
    },
    language: {
      rolePath: 'Tho dien cong nghiep / Electrical Maintenance Technician / Lead bao tri dien',
      mainSkill: 'industrial panel troubleshooting + motor/VFD maintenance + electrical safety + downtime reduction',
      proofAsset: 'case su co dien da an thong tin gom so do/tu dien, phep do, nguyen nhan, linh kien, action, downtime va bien ban an toan',
      opportunityList: 'nha may, toa nha, data center, nha thau M&E, bao tri dien cong nghiep hoac electrical maintenance team',
      portfolioWord: 'electrical maintenance log',
      productWord: 'case sua/bảo tri dien cong nghiep',
      kpiGuidance: 'KPI tho dien cong nghiep: downtime giam, so su co lap lai, PM completion, an toan zero incident, thoi gian xu ly va ty le thiet bi chay on dinh.',
    },
  },
  {
    id: 'residential-electrician',
    segment: 'blue_collar',
    pattern: /tho dien dan dung|dien dan dung|lap dat dien nha|sua dien nha|dien gia dung/,
    forbidden: /cnc|laser|han tig|may lanh|plc|oee/,
    skills: ['Lap dat day, CB/RCD, o cam va den dung tai', 'Tim loi ro dien, chap cham, qua tai va mat nguon', 'Doc ban ve dien dan dung va tinh vat tu co ban', 'Bao gia, an toan thi cong va ban giao cho khach'],
    tiers: ['Tho phu dien dan dung', 'Tho dien dan dung doc lap', 'Tho dien nha pho/can ho co bao gia tot', 'Doi truong dien dan dung/smart home co ban'],
    preview: {
      coreSkill: 'lap dat dien dan dung + tim loi ro/chap + tinh vat tu + ban giao an toan',
      path: 'Tho dien dan dung -> Tho doc lap -> Doi truong/smart home co ban',
      firstAction: 'lap log 10 ca dien dan dung: loi ban dau, phep do, vat tu, thoi gian xu ly, anh truoc-sau va feedback khach',
      skills: ['Wiring/CB/RCD', 'Fault finding', 'Material estimate', 'Customer handover'],
      cvBullet: 'Chung minh tho dien dan dung bang log lap dat/sua loi, an toan CB/RCD, bao gia vat tu va feedback khach.',
    },
    language: {
      rolePath: 'Tho dien dan dung / Residential Electrician / Doi truong dien nha pho-can ho',
      mainSkill: 'wiring/CB/RCD installation + fault finding + material estimate + safe customer handover',
      proofAsset: '10 ca dien dan dung gom loi ban dau, phep do, vat tu, anh truoc-sau duoc phep, thoi gian xu ly va feedback khach',
      opportunityList: 'doi thi cong nha pho/can ho, nha thau dien dan dung, bao tri chung cu, smart home co ban hoac tu nhan don dich vu',
      portfolioWord: 'residential electrical service log',
      productWord: 'case sua/lap dat dien dan dung',
      kpiGuidance: 'KPI dien dan dung: so ca hoan thanh, loi bao hanh lai, thoi gian xu ly, an toan zero incident, do chinh xac bao gia va feedback khach.',
    },
  },
  {
    id: 'plumbing',
    segment: 'blue_collar',
    pattern: /tho nuoc|tho ong nuoc|plumber|cap thoat nuoc|ong nuoc|ro ri nuoc|thong tac/,
    forbidden: /cnc|laser|han tig|may lanh|plc|oee/,
    skills: ['Doc duong ong cap-thoat nuoc va tim diem ro ri', 'Sua/thay van, siphon, bom, thiet bi ve sinh va ong PVC/PPR', 'Thu ap, chong tham diem dau noi va nghiem thu khong ro', 'Bao gia vat tu, xu ly khan cap va don dep ban giao'],
    tiers: ['Tho phu ong nuoc', 'Tho nuoc dan dung doc lap', 'Tho cap thoat nuoc cong trinh/toa nha', 'Doi truong plumbing/facility'],
    preview: {
      coreSkill: 'tim ro ri + sua ong/van/bom + thu ap + nghiem thu khong ro',
      path: 'Tho nuoc -> Plumbing technician -> Facility/plumbing lead',
      firstAction: 'dong goi 10 ca sua nuoc: vi tri loi, vat tu, cach thu ap/chong ro, thoi gian xu ly va feedback khach',
      skills: ['Leak diagnosis', 'Pipe/valve repair', 'Pressure test', 'Customer handover'],
      cvBullet: 'Chung minh tho nuoc bang case ro ri/cap thoat, thu ap, vat tu dung va nghiem thu khong ro lai.',
    },
    language: {
      rolePath: 'Tho nuoc / Plumbing Technician / Facility plumbing lead',
      mainSkill: 'leak diagnosis + pipe/valve repair + pressure testing + clean handover',
      proofAsset: '10 case ong nuoc da an thong tin gom vi tri loi, nguyen nhan, vat tu, phep thu ap, anh truoc-sau neu duoc phep, thoi gian xu ly va feedback',
      opportunityList: 'doi plumbing cong trinh, bao tri toa nha, chung cu, khach san, nha thau MEP hoac dich vu sua chua dan dung',
      portfolioWord: 'plumbing service log',
      productWord: 'case sua/lap dat ong nuoc',
      kpiGuidance: 'KPI tho nuoc: first-time fix, so ca ro lai, thoi gian xu ly, dung vat tu, ty le nghiem thu dat va feedback khach.',
    },
  },
  {
    id: 'pccc-installer',
    segment: 'blue_collar',
    pattern: /pccc|fire protection|bao chay|chua chay|sprinkler|hydrant|bom chua chay/,
    forbidden: /cnc|laser|may lanh|son nuoc|content|sales funnel/,
    skills: ['Lap dat ong, dau phun, tu bao chay va thiet bi PCCC dung ban ve', 'Test ap, test chuong/den, bom va checklist nghiem thu', 'Bao tri dinh ky, thay the thiet bi va log loi he thong', 'An toan thi cong, ho so nghiem thu va compliance PCCC'],
    tiers: ['Tho phu lap dat PCCC', 'Tho lap dat PCCC doc lap', 'Ky thuat vien bao tri/nghiem thu PCCC', 'Doi truong lap dat-bao tri PCCC'],
    preview: {
      coreSkill: 'lap dat PCCC + test ap/bao chay + bao tri + ho so nghiem thu',
      path: 'Tho lap dat PCCC -> Technician bao tri/nghiem thu -> Doi truong PCCC',
      firstAction: 'dong goi 3 hang muc PCCC da lam: ban ve, thiet bi, test ap/test chuong, loi da sua va bien ban nghiem thu',
      skills: ['PCCC installation', 'Pressure/alarm test', 'Maintenance log', 'Compliance handover'],
      cvBullet: 'Chung minh tay nghe PCCC bang ho so lap dat, test ap/bao chay, bao tri, nghiem thu va compliance.',
    },
    language: {
      rolePath: 'Tho lap dat he thong PCCC / PCCC Maintenance Technician / Doi truong PCCC',
      mainSkill: 'PCCC installation + pressure/alarm testing + maintenance log + compliance handover',
      proofAsset: 'ho so PCCC da an thong tin gom hang muc, thiet bi, ban ve, test ap/test chuong, loi khac phuc, bien ban nghiem thu va checklist an toan',
      opportunityList: 'nha thau PCCC, bao tri toa nha, nha may, chung cu, MEP contractor hoac doi nghiem thu-bao tri PCCC',
      portfolioWord: 'PCCC installation/maintenance log',
      productWord: 'case lap dat/bao tri PCCC',
      kpiGuidance: 'KPI PCCC: ty le test dat, loi lap lai, tien do lap dat, checklist bao tri dung han, zero safety incident va ho so nghiem thu khong bi tra ve.',
    },
  },
  {
    id: 'machine-maintenance',
    segment: 'blue_collar',
    pattern: /ky thuat vien bao tri may|bao tri may moc|bao tri thiet bi|maintenance technician|mechanical maintenance/,
    forbidden: /content|sales funnel|tesol|celta|lesson plan/,
    skills: ['Preventive maintenance plan va critical equipment list', 'Breakdown RCA, MTTR/MTBF va spare part strategy', 'Condition monitoring: vibration, temperature, current/noise', 'Safety lockout, maintenance log va repeat-failure prevention'],
    tiers: ['Bao tri may phu viec', 'Ky thuat vien bao tri doc lap', 'Maintenance technician nhieu may', 'Maintenance lead/TPM owner'],
    preview: {
      coreSkill: 'PM checklist + fault diagnosis + spare part replacement + downtime log',
      path: 'Ky thuat vien bao tri may -> Senior maintenance -> Maintenance lead/TPM owner',
      firstAction: 'lap log 10 ca bao tri: thiet bi, loi, downtime, linh kien, action, sau sua chay on dinh bao lau',
      skills: ['PM checklist', 'Fault diagnosis', 'Spare parts', 'Downtime log'],
      cvBullet: 'Chung minh bao tri may bang PM checklist, log downtime, thay linh kien, chong loi lap lai va an toan thiet bi.',
    },
    language: {
      rolePath: 'Ky thuat vien bao tri may moc / Maintenance Technician / Maintenance Lead',
      mainSkill: 'preventive maintenance + fault diagnosis + spare part replacement + downtime reduction',
      proofAsset: '10 case bao tri da an thong tin gom thiet bi, loi, downtime, phep kiem tra, linh kien, action, ket qua sau sua va de xuat chong lap loi',
      opportunityList: 'nha may, xuong san xuat, bao tri thiet bi, facility maintenance, TPM team hoac nha cung cap may moc',
      portfolioWord: 'maintenance case log',
      productWord: 'case bao tri/sua may',
      kpiGuidance: 'KPI bao tri may: PM completion, downtime giam, MTTR, so loi lap lai, spare part accuracy, zero safety incident va availability thiet bi.',
    },
  },
  {
    id: 'electronics-technician',
    segment: 'engineering',
    pattern: /ky thuat vien dien tu|dien tu|electronics technician|sua mach|pcb|linh kien dien tu/,
    forbidden: /cnc|han tig|may lanh|food cost|tesol/,
    skills: ['Doc so do mach va do kiem bang dong ho/oscilloscope neu co', 'Chan doan loi nguon, sensor, board, cap tin hieu va linh kien', 'Han/sua mach, thay linh kien va test sau sua', 'Ghi log loi, serial, firmware/setting va bien ban bao hanh'],
    tiers: ['Ky thuat vien dien tu junior', 'Technician sua/test board doc lap', 'Senior electronics technician', 'Lead test/repair lab'],
    preview: {
      coreSkill: 'board diagnosis + measurement + component repair + test log',
      path: 'Ky thuat vien dien tu -> Senior repair/test technician -> Lead test lab',
      firstAction: 'dong goi 10 ca sua/test board: loi, phep do, linh kien, action, test pass/fail va ty le quay lai bao hanh',
      skills: ['Circuit diagnosis', 'Measurement', 'Component repair', 'Test log'],
      cvBullet: 'Chung minh ky thuat dien tu bang case do kiem, sua board/linh kien, test sau sua va log bao hanh.',
    },
    language: {
      rolePath: 'Ky thuat vien dien tu / Electronics Repair-Test Technician / Lead test lab',
      mainSkill: 'circuit diagnosis + measurement + component repair + test/QA log',
      proofAsset: '10 case dien tu da an thong tin gom model/board, loi, phep do, linh kien thay, thao tac sua, test pass/fail va bao hanh quay lai neu co',
      opportunityList: 'trung tam bao hanh, xuong sua board, nha may dien tu, lab test, SMT/PCBA repair hoac field service thiet bi dien tu',
      portfolioWord: 'electronics repair/test log',
      productWord: 'case sua/test dien tu',
      kpiGuidance: 'KPI ky thuat dien tu: first-pass repair, ty le bao hanh lai, thoi gian chan doan, so board test pass, loi lap lai va do chinh xac log sua chua.',
    },
  },
  {
    id: 'automotive-mechanic',
    segment: 'blue_collar',
    pattern: /sua chua o to|co khi o to|auto mechanic|automotive|gara|garage|obd|dong co o to/,
    forbidden: /cnc|laser|may lanh dan dung|pccc|son nuoc/,
    skills: ['Chan doan loi gam-may-dien bang trieu chung, OBD va phep kiem tra', 'Bao duong phanh, treo, dong co, dieu hoa o to va thay the phu tung dung quy trinh', 'Bao gia phu tung/cong, giai thich loi va ban giao xe cho khach', 'QC sau sua, road test va log bao hanh quay lai'],
    tiers: ['Tho phu gara', 'Tho sua o to doc lap', 'Technician chuyen gam-may-dien', 'To truong/diagnostic lead gara'],
    preview: {
      coreSkill: 'OBD/diagnosis + repair procedure + parts estimate + road test/QC',
      path: 'Tho sua o to -> Diagnostic technician -> To truong gara',
      firstAction: 'dong goi 10 ca sua o to: loi, ma OBD neu co, phep kiem tra, phu tung, cong sua, road test va bao hanh',
      skills: ['OBD diagnosis', 'Repair procedure', 'Parts estimate', 'Road test/QC'],
      cvBullet: 'Chung minh tho sua o to bang case chan doan, OBD/phep kiem tra, phu tung, road test va bao hanh quay lai.',
    },
    language: {
      rolePath: 'Tho sua chua o to / Automotive Technician / Diagnostic lead gara',
      mainSkill: 'OBD/fault diagnosis + repair procedure + parts estimate + road test/QC',
      proofAsset: '10 case sua o to da an thong tin gom trieu chung, ma loi/phep kiem tra, phu tung, cong sua, road test, ket qua va bao hanh quay lai neu co',
      opportunityList: 'gara, dai ly o to, trung tam dich vu, fleet maintenance, dong son/cham soc xe hoac diagnostic technician',
      portfolioWord: 'automotive repair log',
      productWord: 'case chan doan/sua o to',
      kpiGuidance: 'KPI sua o to: first-time fix, comeback rate, thoi gian chan doan, doanh thu cong/phu tung, road test pass va feedback khach.',
    },
  },
  {
    id: 'welder',
    segment: 'blue_collar',
    pattern: /tho han|welder|han tig|han mig|han que|han inox|han co khi/,
    forbidden: /may lanh|gas lanh|ong nuoc|tesol|finance/,
    skills: ['Han TIG/MIG/que theo vat lieu va ban ve', 'Chuan bi moi han, jig/fixture va kiem soat bien dang', 'Kiem tra moi han, do kin/do ben va sua loi han', 'An toan han cat, PPE va nang suat theo don hang'],
    tiers: ['Tho han co ban', 'Tho han TIG/MIG doc ban ve', 'Tho han ap luc/inox/ket cau', 'To truong han/QC moi han'],
    preview: {
      coreSkill: 'TIG/MIG/que + doc ban ve + QC moi han + an toan han cat',
      path: 'Tho han -> Tho han chuyen vat lieu -> To truong/QC han',
      firstAction: 'tao portfolio 10 moi han: vat lieu, phuong phap, ban ve, anh moi han, loi da sua va tieu chi QC',
      skills: ['TIG/MIG welding', 'Drawing reading', 'Weld QC', 'Welding safety'],
      cvBullet: 'Chung minh tho han bang moi han co anh, vat lieu, phuong phap, doc ban ve, QC va an toan.',
    },
    language: {
      rolePath: 'Tho han / Welder TIG-MIG / To truong han-QC moi han',
      mainSkill: 'TIG/MIG/arc welding + drawing reading + weld QC + safety/productivity',
      proofAsset: 'portfolio moi han gom vat lieu, phuong phap han, ban ve, anh moi han duoc phep, loi da sua, tieu chi QC va nang suat',
      opportunityList: 'xuong co khi, ket cau thep, inox, nha may, nha thau cong nghiep, shipyard hoac to truong han',
      portfolioWord: 'welding portfolio',
      productWord: 'case moi han/QC han',
      kpiGuidance: 'KPI tho han: so moi han dat, ty le rework, nang suat/ca, loi han, an toan lao dong va kha nang doc ban ve/vat lieu.',
    },
  },
  {
    id: 'cnc-machinist',
    segment: 'blue_collar',
    pattern: /tho tien|tho phay|cnc|machinist|tien cnc|phay cnc/,
    forbidden: /may lanh|gas lanh|pccc|ong nuoc|lesson plan/,
    skills: ['Doc ban ve, dung sai va chon dao/che do cat', 'Set up may tien/phay CNC, goc toa do va fixture', 'Kiem tra kich thuoc bang thuoc cap/panme/dong ho so', 'Giam phe pham, rework va ghi log chuong trinh/dao cu'],
    tiers: ['Tho tien/phay co ban', 'CNC operator doc ban ve', 'CNC machinist set up duoc may', 'CNC lead/programming-QC'],
    preview: {
      coreSkill: 'doc ban ve + set up CNC + do kiem dung sai + giam phe pham',
      path: 'Tho tien/phay -> CNC operator -> CNC setup/programming lead',
      firstAction: 'dong goi 5 chi tiet da gia cong: ban ve, dung sai, dao cu, cycle time, ty le dat va loi da sua',
      skills: ['Drawing/tolerance', 'CNC setup', 'Measurement', 'Scrap reduction'],
      cvBullet: 'Chung minh CNC bang chi tiet da gia cong, dung sai, set up, do kiem, cycle time va phe pham giam.',
    },
    language: {
      rolePath: 'Tho tien/phay CNC / CNC Machinist / CNC setup-programming lead',
      mainSkill: 'drawing/tolerance reading + CNC setup + measurement QC + scrap/rework reduction',
      proofAsset: '5-10 chi tiet da an thong tin gom ban ve/dung sai, vat lieu, dao cu, set up, cycle time, ket qua do kiem va loi da giam',
      opportunityList: 'xuong CNC, co khi chinh xac, khuon mau, nha may, machining supplier, CNC setup lead hoac programming-QC track',
      portfolioWord: 'CNC machining portfolio',
      productWord: 'case gia cong CNC',
      kpiGuidance: 'KPI CNC: first-pass yield, scrap/rework, cycle time, dung sai dat, thoi gian set up, tool life va so chi tiet giao dung han.',
    },
  },
  {
    id: 'machine-setter',
    segment: 'blue_collar',
    pattern: /tho dieu chinh may|setter|setup machine|can chinh may|chinh may|khuon/,
    forbidden: /may lanh|son nuoc|pccc|content/,
    skills: ['Setup thong so may/khuon truoc chay hang', 'Can chinh loi kich thuoc, ba via, lech mau hoac loi lap lai', 'Ghi standard setting va doi ca/handover ro rang', 'Giam thoi gian setup, scrap va dung may'],
    tiers: ['Setter phu viec', 'Setter doc lap 1-2 dong may', 'Senior setter nhieu ma hang', 'Line setup lead'],
    preview: {
      coreSkill: 'setup may/khuon + can chinh loi + standard setting + giam scrap',
      path: 'Tho dieu chinh may -> Senior setter -> Line setup lead',
      firstAction: 'lap log 10 lan setup: ma hang, thong so, loi ban dau, action, scrap/cycle time truoc-sau va handover',
      skills: ['Machine setup', 'Parameter tuning', 'Standard setting', 'Scrap reduction'],
      cvBullet: 'Chung minh setter bang log setup may, thong so chuan, scrap giam, cycle time va handover ca.',
    },
    language: {
      rolePath: 'Tho dieu chinh may / Machine Setter / Line setup lead',
      mainSkill: 'machine setup + parameter tuning + standard setting + scrap/downtime reduction',
      proofAsset: 'log setup da an thong tin gom ma hang, thong so, loi ban dau, action can chinh, scrap/cycle time truoc-sau va handover ca',
      opportunityList: 'nha may ep nhua, bao bi, co khi, may mac, dien tu, production line, senior setter hoac line setup lead',
      portfolioWord: 'machine setup log',
      productWord: 'case setup/can chinh may',
      kpiGuidance: 'KPI setter: setup time, first-pass yield, scrap/rework, downtime, so ma hang setup duoc va loi lap lai giam.',
    },
  },
  {
    id: 'industrial-sewing',
    segment: 'blue_collar',
    pattern: /tho may cong nghiep|may cong nghiep|sewing operator|garment|chuyen may/,
    forbidden: /cnc|han tig|may lanh|pccc|plc/,
    skills: ['May dung cong doan, duong may va tieu chuan QC', 'Canh chinh may/kim/chi co ban va xu ly loi duong may', 'Tang nang suat theo SAM/target va giam hang loi', 'Doc techpack/mau va handover cho to truong/QC'],
    tiers: ['Tho may cong doan co ban', 'Tho may nhieu cong doan', 'Tho may hang kho/hang mau', 'To pho/to truong chuyen may'],
    preview: {
      coreSkill: 'duong may QC + nhieu cong doan + nang suat SAM + giam loi hang',
      path: 'Tho may cong nghiep -> Tho may nhieu cong doan -> To pho/to truong chuyen may',
      firstAction: 'lap bang 10 ma hang/cong doan: target, san luong, loi, cach sua, ty le dat va feedback QC/to truong',
      skills: ['Sewing QC', 'Multi-operation', 'SAM/productivity', 'Defect reduction'],
      cvBullet: 'Chung minh tho may bang san luong, cong doan lam duoc, loi giam, QC dat va kha nang doc mau/techpack.',
    },
    language: {
      rolePath: 'Tho may cong nghiep / Multi-skill sewer / To pho-to truong chuyen may',
      mainSkill: 'sewing quality + multi-operation skill + SAM productivity + defect reduction',
      proofAsset: 'bang cong doan da an thong tin gom ma hang, target, san luong, loi, QC dat, cong doan lam duoc va feedback to truong/QC',
      opportunityList: 'xuong may, nha may garment, hang mau, chuyen may xuat khau, QC line, to pho/to truong chuyen may',
      portfolioWord: 'sewing operation log',
      productWord: 'case nang suat/chat luong duong may',
      kpiGuidance: 'KPI tho may: san luong/ca, ty le loi, so cong doan lam duoc, dat SAM/target, rework giam va QC pass.',
    },
  },
  {
    id: 'carpenter',
    segment: 'blue_collar',
    pattern: /tho moc|moc dan dung|woodworker|carpenter|noi that go|do go/,
    forbidden: /may lanh|pccc|gas lanh|plc|tesol/,
    skills: ['Doc ban ve/kich thuoc va boc tach vat tu go/phu kien', 'Cat, rap, xu ly be mat va hoan thien dung sai', 'Lap dat noi that tai cong trinh va xu ly phat sinh', 'Bao gia, anh truoc-sau va feedback khach/designer'],
    tiers: ['Tho moc phu viec', 'Tho moc doc lap', 'Tho moc noi that/cao cap', 'Doi truong xuong/lap dat noi that'],
    preview: {
      coreSkill: 'doc ban ve + boc tach vat tu + hoan thien go + lap dat noi that',
      path: 'Tho moc -> Tho noi that cao cap -> Doi truong xuong/lap dat',
      firstAction: 'dong goi 5 san pham/du an moc: ban ve, vat tu, anh truoc-sau, loi da xu ly, thoi gian va feedback khach',
      skills: ['Drawing/material takeoff', 'Wood finishing', 'Installation', 'Client feedback'],
      cvBullet: 'Chung minh tho moc bang san pham/du an, ban ve, vat tu, hoan thien, lap dat va feedback khach/designer.',
    },
    language: {
      rolePath: 'Tho moc / Furniture carpenter / Doi truong xuong-lap dat noi that',
      mainSkill: 'drawing/material takeoff + wood fabrication/finishing + installation + client handover',
      proofAsset: '5-10 du an/san pham da an thong tin gom ban ve/kich thuoc, vat tu, anh truoc-sau, loi da xu ly, thoi gian va feedback khach/designer',
      opportunityList: 'xuong moc, noi that, showroom, nha thau lap dat, designer/studio, hang go cao cap hoac doi truong xuong',
      portfolioWord: 'woodworking/interior portfolio',
      productWord: 'case san pham/du an moc',
      kpiGuidance: 'KPI tho moc: dung kich thuoc, loi/rework, tien do lap dat, hao hut vat tu, feedback khach va so san pham hoan thien dat chuan.',
    },
  },
  {
    id: 'painter',
    segment: 'blue_collar',
    pattern: /tho son|painter|son nuoc|son cong trinh|son nha|son ba/,
    forbidden: /cnc|may lanh|han tig|pccc|plc/,
    skills: ['Xu ly be mat, ba/xa nha va chong tham truoc son', 'Pha son, len mau va thi cong lot-phu dung quy trinh', 'Kiem soat lem, bong troc, mau khong deu va rework', 'Bao gia dien tich, vat tu va ban giao cong trinh sach'],
    tiers: ['Tho son phu viec', 'Tho son nha dan dung', 'Tho son cong trinh/chong tham', 'Doi truong son/hoan thien'],
    preview: {
      coreSkill: 'xu ly be mat + pha/len mau + QC hoan thien + bao gia vat tu',
      path: 'Tho son -> Tho hoan thien cong trinh -> Doi truong son',
      firstAction: 'dong goi 5 cong trinh/khong gian son: hien trang, vat tu, quy trinh, anh truoc-sau, loi da sua va feedback khach',
      skills: ['Surface prep', 'Paint application', 'Finish QC', 'Material estimate'],
      cvBullet: 'Chung minh tho son bang anh truoc-sau, xu ly be mat, vat tu, loi/rework giam va ban giao sach.',
    },
    language: {
      rolePath: 'Tho son / Painter hoan thien / Doi truong son cong trinh',
      mainSkill: 'surface preparation + paint application + finish QC + material estimate',
      proofAsset: '5-10 cong trinh/khong gian da an thong tin gom hien trang, vat tu, quy trinh, anh truoc-sau, loi da sua va feedback khach',
      opportunityList: 'doi son nha, cong trinh hoan thien, nha thau xay dung, chong tham, noi that hoac doi truong son',
      portfolioWord: 'painting/finishing portfolio',
      productWord: 'case son/hoan thien',
      kpiGuidance: 'KPI tho son: dien tich/ca, loi lem-bong-troc, rework, dung mau, hao hut vat tu, tien do va feedback khach.',
    },
  },
  {
    id: 'mason',
    segment: 'blue_collar',
    pattern: /tho ho|tho xay|mason|bricklayer|xay to|op lat|xay dung dan dung/,
    forbidden: /cnc|may lanh|han tig|plc|tesol/,
    skills: ['Doc kich thuoc, lay cot/moc va xay-to-op lat dung chuan', 'Tron vat lieu, canh phang/thang va kiem soat hao hut', 'Sua loi nut, bong, lech cot va nghiem thu hang muc', 'An toan cong trinh, tien do va ban giao sach'],
    tiers: ['Tho phu xay', 'Tho ho/xay doc lap', 'Tho hoan thien/op lat', 'Doi truong to xay-hoan thien'],
    preview: {
      coreSkill: 'lay moc/kich thuoc + xay-to-op lat + QC nghiem thu + an toan cong trinh',
      path: 'Tho ho/tho xay -> Tho hoan thien -> Doi truong to xay',
      firstAction: 'dong goi 5 hang muc da lam: kich thuoc, vat lieu, anh truoc-sau, loi da sua, tien do va nghiem thu',
      skills: ['Layout/level', 'Masonry/finishing', 'Quality check', 'Site safety'],
      cvBullet: 'Chung minh tho ho bang hang muc xay-to-op lat, dung kich thuoc, QC nghiem thu, tien do va an toan.',
    },
    language: {
      rolePath: 'Tho ho / Tho xay / Tho hoan thien / Doi truong to xay',
      mainSkill: 'layout/level control + masonry/finishing + quality handover + site safety',
      proofAsset: '5-10 hang muc da an thong tin gom kich thuoc, vat lieu, anh truoc-sau, loi da sua, tien do, nghiem thu va feedback doi truong/khach',
      opportunityList: 'doi xay dung dan dung, nha thau hoan thien, op lat, sua nha, cong trinh nho hoac doi truong to xay',
      portfolioWord: 'masonry/finishing work log',
      productWord: 'case xay-to-hoan thien',
      kpiGuidance: 'KPI tho ho: tien do hang muc, loi nghiem thu, hao hut vat tu, an toan, dung kich thuoc/moc va so hang muc ban giao dat.',
    },
  },
];

export function getSkilledTradeProfile(jobTitle: string, industry?: string | null): SkilledTradeProfile | null {
  const text = normalizeRoleText(`${jobTitle} ${industry || ''}`);
  if (/ky su mep|mep engineer|co dien lanh/.test(text) && /ky su|engineer|mep/.test(text)) return null;
  return skilledTradeProfiles.find(profile => profile.pattern.test(text)) || null;
}

function isMarketingManagerRole(jobTitle: string, industry?: string | null) {
  return marketingManagerRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

export function isRestaurantManagerRole(jobTitle: string, industry?: string | null) {
  return restaurantManagerRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

export function isRestaurantFrontlineRole(jobTitle: string, industry?: string | null) {
  const text = normalizeRoleText(`${jobTitle} ${industry || ''}`);
  return !restaurantManagerRolePattern.test(text) && restaurantFrontlineRolePattern.test(text);
}

export function isHotelManagerRole(jobTitle: string, industry?: string | null) {
  return hotelManagerRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

export function isHotelFrontlineRole(jobTitle: string, industry?: string | null) {
  const text = normalizeRoleText(`${jobTitle} ${industry || ''}`);
  return !hotelManagerRolePattern.test(text) && hotelFrontlineRolePattern.test(text);
}

export type TourismRoleKind = 'tour_guide' | 'tour_ops_lead' | 'tour_ops_staff' | 'travel_booking' | 'travel_sales_group' | 'travel_sales_fit';

export interface TourismRoleProfile {
  kind: TourismRoleKind;
  skillId: string;
  skills: string[];
  tiers: string[];
  preview: Omit<PremiumRolePreview, 'roleLabel'>;
  language: RoleLanguage;
}

export function getTourismRoleProfile(jobTitle: string, industry?: string | null): TourismRoleProfile | null {
  const text = normalizeRoleText(`${jobTitle} ${industry || ''}`);
  if (isRestaurantManagerRole(jobTitle, industry) || isRestaurantFrontlineRole(jobTitle, industry) || isHotelManagerRole(jobTitle, industry) || isHotelFrontlineRole(jobTitle, industry)) return null;

  if (tourGuideRolePattern.test(text)) {
    return {
      kind: 'tour_guide',
      skillId: 'tour-guide',
      skills: ['Thuyết minh tuyến điểm và storytelling', 'Điều phối lịch trình, điểm danh và đúng giờ', 'Xử lý sự cố tour và an toàn khách', 'Feedback khách và báo cáo sau tour'],
      tiers: ['HDV local/tour ngắn ngày', 'HDV tour nội địa có feedback tốt', 'HDV inbound/outbound tuyến khó', 'Tour Leader / Training Guide'],
      preview: {
        coreSkill: 'thuyết minh tuyến điểm + điều phối đoàn + xử lý sự cố tour + feedback khách',
        path: 'Hướng dẫn viên du lịch -> Senior Guide -> Tour Leader / Training Guide',
        firstAction: 'đóng gói 3 tour đã dẫn: lịch trình, điểm thuyết minh, sự cố đã xử lý, feedback khách và báo cáo sau tour',
        skills: ['Route storytelling', 'Tour coordination', 'Incident handling', 'Guest feedback'],
        cvBullet: 'Chứng minh năng lực HDV bằng lịch trình đã dẫn, feedback khách, tình huống sự cố và báo cáo sau tour; không map sang lễ tân/booking khách sạn.',
      },
      language: {
        rolePath: 'Hướng dẫn viên du lịch / Senior Guide / Tour Leader',
        mainSkill: 'thuyết minh tuyến điểm + quản lý đoàn + đúng timeline + xử lý sự cố tour',
        proofAsset: 'tour log gồm lịch trình, điểm danh, timeline, nội dung thuyết minh, sự cố đã xử lý, feedback khách và xác nhận điều hành',
        opportunityList: 'công ty tour inbound/outbound, tour leader, HDV tuyến khó, training guide hoặc điều phối tour có kinh nghiệm thực địa',
        portfolioWord: 'tour guide evidence log',
        productWord: 'bằng chứng dẫn tour',
        kpiGuidance: 'KPI hướng dẫn viên: đúng timeline, điểm danh đủ, feedback khách, số sự cố xử lý êm, an toàn đoàn, đánh giá điều hành và tỷ lệ tour lặp lại.',
      },
    };
  }

  if (tourOpsLeadRolePattern.test(text)) {
    return {
      kind: 'tour_ops_lead',
      skillId: 'tour-ops-lead',
      skills: ['Dieu phoi nhieu tour va roster HDV/xe', 'Cost/margin tour va vendor SLA', 'Risk log, escalation va backup plan', 'Dashboard van hanh tour va coaching team'],
      tiers: ['Tour ops lead nhom nho', 'Truong nhom dieu hanh tour co KPI', 'Tour Operations Manager', 'Travel Ops / Product Manager'],
      preview: {
        coreSkill: 'multi-tour coordination + cost/margin + vendor SLA + escalation governance',
        path: 'Truong nhom dieu hanh tour -> Tour Operations Manager -> Travel Ops/Product Manager',
        firstAction: 'lap dashboard 10 tour gan nhat: timeline, vendor, chi phi, margin, su co, feedback khach va bai hoc cho team',
        skills: ['Tour ops dashboard', 'Vendor SLA', 'Margin control', 'Escalation'],
        cvBullet: 'Chung minh truong nhom dieu hanh tour bang dashboard tour, vendor SLA, cost/margin, risk log va coaching team.',
      },
      language: {
        rolePath: 'Tour Operations Lead / Tour Operations Manager / Travel Ops',
        mainSkill: 'dieu phoi nhieu tour + vendor SLA + cost/margin + risk escalation + coaching team',
        proofAsset: 'dashboard van hanh tour gom timeline, nha cung cap, xe/HDV, chi phi, margin, su co, feedback va action log',
        opportunityList: 'tour operations manager, travel ops, product tour, inbound/outbound operations hoac MICE operations',
        portfolioWord: 'tour operations portfolio',
        productWord: 'case van hanh tour',
        kpiGuidance: 'KPI truong nhom dieu hanh tour: on-time tour, vendor SLA, cost variance, margin, su co/escalation, feedback khach va nang luc team.',
      },
    };
  }

  if (tourOpsStaffRolePattern.test(text)) {
    return {
      kind: 'tour_ops_staff',
      skillId: 'tour-ops-staff',
      skills: ['Lap lich trinh, costing va tour file', 'Dieu xe, HDV, ve va nha cung cap', 'Xu ly thay doi truoc-trong-sau tour', 'Handover va bao cao chi phi/feedback'],
      tiers: ['Nhan vien dieu hanh tour co ban', 'Tour Operator co tour file khong loi', 'Senior Tour Operator', 'Tour Ops Lead'],
      preview: {
        coreSkill: 'tour file + dieu phoi nha cung cap + timeline + xu ly thay doi tour',
        path: 'Nhan vien dieu hanh tour -> Senior Tour Operator -> Tour Ops Lead',
        firstAction: 'dong goi 5 tour da dieu hanh: tour file, vendor, xe/HDV, chi phi, timeline, su co va feedback',
        skills: ['Tour file', 'Vendor coordination', 'Timeline', 'Cost log'],
        cvBullet: 'Chung minh dieu hanh tour bang tour file, timeline, nha cung cap, chi phi, su co da xu ly va feedback sau tour.',
      },
      language: {
        rolePath: 'Tour Operator / Nhan vien dieu hanh tour / Senior Tour Operator',
        mainSkill: 'tour file + lich trinh + nha cung cap + timeline + xu ly thay doi tour',
        proofAsset: 'bo tour file da an thong tin gom lich trinh, booking dich vu, xe/HDV, chi phi, timeline, issue log va feedback sau tour',
        opportunityList: 'inbound/outbound tour operator, land tour operator, MICE operations, travel product hoac tour ops lead',
        portfolioWord: 'tour operator portfolio',
        productWord: 'tour file co bang chung',
        kpiGuidance: 'KPI dieu hanh tour: tour file khong loi, on-time service, cost variance, vendor confirmation, issue resolution, feedback khach/HDV va handover dung han.',
      },
    };
  }

  if (travelBookingRolePattern.test(text)) {
    return {
      kind: 'travel_booking',
      skillId: 'travel-booking',
      skills: ['Booking ve, phong va dich vu dung deadline', 'Voucher, xac nhan va payment/deposit log', 'Xu ly hoan huy/thay doi voi nha cung cap', 'Handover booking file cho dieu hanh/HDV'],
      tiers: ['Booking du lich co ban', 'Booking specialist it loi', 'Senior Travel Booking/Ticketing', 'Travel Operations Coordinator'],
      preview: {
        coreSkill: 'booking accuracy + supplier confirmation + payment/deposit log + handover file',
        path: 'Nhan vien booking du lich -> Senior Booking/Ticketing -> Travel Operations Coordinator',
        firstAction: 'tao log 20 booking: yeu cau, nha cung cap, xac nhan, voucher, thanh toan, thay doi va loi da tranh',
        skills: ['Booking accuracy', 'Supplier confirmation', 'Voucher/payment log', 'Handover file'],
        cvBullet: 'Chung minh booking du lich bang log booking khong loi, xac nhan nha cung cap, voucher/payment va handover cho dieu hanh/HDV.',
      },
      language: {
        rolePath: 'Travel Booking / Ticketing / Reservation Specialist',
        mainSkill: 'booking accuracy + xac nhan nha cung cap + voucher/payment + handover tour file',
        proofAsset: 'booking log da an thong tin gom yeu cau, nha cung cap, gia, deadline, xac nhan, voucher, payment/deposit va thay doi/hoan huy',
        opportunityList: 'travel agency booking, ticketing, reservation, inbound/outbound operations hoac travel operations coordinator',
        portfolioWord: 'travel booking evidence log',
        productWord: 'booking file khong loi',
        kpiGuidance: 'KPI booking du lich: booking accuracy, deadline hit rate, so loi voucher/payment, supplier response time, cancellation/change handled va handover dung han.',
      },
    };
  }

  if (travelSalesGroupRolePattern.test(text)) {
    return {
      kind: 'travel_sales_group',
      skillId: 'travel-sales-group',
      skills: ['Qualification doan: quy mo, muc dich, ngan sach', 'Proposal/quotation doan va dieu kien dich vu', 'Phoi hop dieu hanh tour, vendor va risk', 'Pipeline B2B, margin va repeat account'],
      tiers: ['Sale khach doan junior', 'Group Tour Sales co proposal tot', 'MICE/Corporate Travel Sales', 'Key Account Travel Sales'],
      preview: {
        coreSkill: 'B2B/group qualification + proposal tour + margin + coordination risk',
        path: 'Sale khach doan du lich -> MICE/Corporate Travel Sales -> Key Account Travel Sales',
        firstAction: 'dong goi 10 deal/doan: nhu cau, quy mo, ngan sach, proposal, margin, ly do thang/thua va repeat potential',
        skills: ['Group qualification', 'Tour proposal', 'Margin', 'B2B pipeline'],
        cvBullet: 'Chung minh sale khach doan bang pipeline B2B, proposal, margin, coordination risk va repeat account.',
      },
      language: {
        rolePath: 'Group Tour Sales / MICE Sales / Corporate Travel Sales',
        mainSkill: 'qualification khach doan + proposal/quotation + margin + phoi hop dieu hanh tour',
        proofAsset: 'pipeline khach doan gom quy mo, muc dich, ngan sach, proposal, bao gia, margin, trang thai chot va feedback/repeat',
        opportunityList: 'MICE, corporate travel, group tour sales, key account travel, inbound/outbound B2B sales',
        portfolioWord: 'group travel sales portfolio',
        productWord: 'case ban tour khach doan',
        kpiGuidance: 'KPI sale khach doan du lich: qualified leads, proposal sent, win rate, average deal size, margin, repeat account va feedback sau tour.',
      },
    };
  }

  if (travelSalesFitRolePattern.test(text)) {
    return {
      kind: 'travel_sales_fit',
      skillId: 'travel-sales-fit',
      skills: ['Tu van nhu cau, ngan sach va lich trinh khach le', 'Thiet ke bao gia tour FIT ro dieu kien', 'Follow-up lead, deposit va ty le chot', 'Feedback sau tour va referral/repeat'],
      tiers: ['Sale tour khach le junior', 'Travel Consultant co conversion tot', 'Senior FIT Travel Sales', 'Travel Product/Sales Lead'],
      preview: {
        coreSkill: 'tu van nhu cau + thiet ke lich trinh + bao gia FIT + follow-up chot deposit',
        path: 'Sale khach le du lich -> Senior Travel Consultant -> Travel Product/Sales Lead',
        firstAction: 'tao tracker 20 lead khach le: nhu cau, ngan sach, lich trinh, bao gia, follow-up, deposit va ly do mat/chot',
        skills: ['Needs discovery', 'FIT quotation', 'Follow-up', 'Conversion'],
        cvBullet: 'Chung minh sale khach le du lich bang tracker lead, lich trinh/bao gia, follow-up, deposit va feedback/referral.',
      },
      language: {
        rolePath: 'Travel Consultant / Sale khach le du lich / FIT Travel Sales',
        mainSkill: 'tu van nhu cau + thiet ke lich trinh + bao gia FIT + follow-up chot deposit',
        proofAsset: 'tracker lead khach le gom nhu cau, ngan sach, lich trinh, bao gia, follow-up, deposit, feedback va ly do thang/thua',
        opportunityList: 'travel consultant, FIT tour sales, luxury/private tour, inbound/outbound sales hoac travel product sales',
        portfolioWord: 'FIT travel sales portfolio',
        productWord: 'case chot tour khach le',
        kpiGuidance: 'KPI sale khach le du lich: qualified lead, quote-to-deposit, follow-up SLA, average booking value, cancellation, feedback sau tour va referral/repeat.',
      },
    };
  }

  return null;
}

export function isDentalRole(jobTitle: string, industry?: string | null) {
  const text = normalizeRoleText(`${jobTitle} ${industry || ''}`);
  return dentalRolePattern.test(text) && !dentalAssistantRolePattern.test(text);
}

export function isDentalAssistantRole(jobTitle: string, industry?: string | null) {
  return dentalAssistantRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`));
}

function getEducationAdmissionsLabels(jobTitle: string, industry?: string | null) {
  if (isStudyAbroadAdmissionsRole(jobTitle, industry)) {
    return {
      rolePath: 'Senior Study Abroad Counselor / Admissions Lead / Student Recruitment Lead',
      mainSkill: 'tư vấn chọn trường-ngành + checklist hồ sơ/visa + CRM follow-up + conversion hồ sơ',
      proofAsset: 'tracker 20 lead/hồ sơ đã ẩn thông tin gồm nhu cầu, ngân sách, shortlist trường, checklist giấy tờ, deadline, offer/visa outcome, next step và feedback khách',
      opportunityList: 'công ty tư vấn du học, phòng admissions quốc tế, student recruitment, enrollment team, đối tác trường quốc tế hoặc agency giáo dục có KPI hồ sơ rõ',
      portfolioWord: 'study abroad counseling portfolio',
      productWord: 'case tư vấn hồ sơ du học',
      kpiGuidance: 'KPI tư vấn du học: lead qualified, consultation booked, hồ sơ nộp đúng hạn, offer rate, visa pass rate, enrollment conversion, SLA follow-up, tỷ lệ thiếu giấy tờ và feedback khách.',
    } satisfies RoleLanguage;
  }
  return {
    rolePath: 'Senior Enrollment Counselor / Admissions Specialist / Student Recruitment Lead',
    mainSkill: 'tư vấn chương trình học + qualification nhu cầu-phụ huynh/học viên + CRM follow-up + conversion nhập học',
    proofAsset: 'tracker 20 lead đã ẩn thông tin gồm nguồn lead, nhu cầu học, ngân sách/học phí, chương trình phù hợp, lịch tư vấn/placement test, trạng thái đăng ký-đóng phí-nhập học, next step và feedback khách',
    opportunityList: 'trung tâm ngoại ngữ, trường đại học tư thục, trường quốc tế, phòng admissions, enrollment team hoặc student recruitment có KPI tuyển sinh rõ',
    portfolioWord: 'enrollment counseling portfolio',
    productWord: 'case tư vấn tuyển sinh',
    kpiGuidance: 'KPI tư vấn tuyển sinh: lead qualified, consultation booked, placement test booked, application/registration submitted, payment/enrollment conversion, SLA follow-up, tỷ lệ no-show, tỷ lệ thiếu thông tin và feedback khách.',
  } satisfies RoleLanguage;
}

export function detectRoleSegment(jobTitle: string, industry?: string | null): RoleSegment {
  const exactProfile = shouldUseExactRoleProfiles() ? getExactRoleProfile(jobTitle, industry) : null;
  if (exactProfile?.segment) return exactProfile.segment as RoleSegment;
  const earlyText = normalizeRoleText(`${jobTitle} ${industry || ''}`);
  if (/nhan vien kho.*thuong mai dien tu|kho.*thuong mai dien tu|kho.*ecommerce|ecommerce warehouse|e-commerce warehouse/.test(earlyText)) return 'logistics';
  if (/van hanh san thuong mai dien tu|ecommerce operator|e-commerce operator|marketplace operator|san thuong mai/.test(earlyText)) return 'retail';
  if (productionStatisticsRolePattern.test(normalizeRoleText(`${jobTitle} ${industry || ''}`))) return 'engineering';
  if (isStatisticsDataRole(jobTitle, industry)) return 'statistics_data';
  if (isSchoolHealthcareRole(jobTitle, industry)) return 'healthcare';
  const text = normalizeRoleText(`${jobTitle} ${industry || ''}`);
  const skilledTrade = getSkilledTradeProfile(jobTitle, industry);
  if (skilledTrade) return skilledTrade.segment;
  if (/nhac si|nhac cong|dien vien|nghe si|streamer|youtuber/.test(text)) return 'creator_entertainment';
  if (isNetworkOperationsRole(jobTitle, industry)) return 'it';
  if (isTelecomInfrastructureRole(jobTitle, industry)) return 'engineering';
  if (isSecuritiesBrokerRole(jobTitle, industry)) return 'finance';
  if (isPostalRole(jobTitle, industry)) return 'logistics';
  if (isAirportGroundRole(jobTitle, industry)) return 'aviation';
  if (isRadiologyTechRole(jobTitle, industry)) return 'healthcare';
  if (isProductDevelopmentRole(jobTitle, industry)) return 'engineering';
  if (semiconductorRolePattern.test(text)) return 'semiconductor';
  if (accountingManagerRolePattern.test(text)) return 'accounting';
  if (salesManagerRolePattern.test(text)) return 'sales';
  if (retailManagerRolePattern.test(text)) return 'retail';
  if (propertyOpsRolePattern.test(text)) return 'real_estate';
  if (constructionManagerRolePattern.test(text)) return 'construction';
  if (logisticsManagerRolePattern.test(text)) return 'logistics';
  if (beautySpaManagerRolePattern.test(text)) return 'beauty_spa';
  if (healthcareManagerRolePattern.test(text)) return 'healthcare';
  if (eventOpsRolePattern.test(text)) return 'events';
  if (customerServiceManagerRolePattern.test(text)) return 'customer_service';
  if (hrManagerRolePattern.test(text)) return 'hr';
  if (securityManagerRolePattern.test(text)) return 'security';
  if (sportsFitnessManagerRolePattern.test(text)) return 'sports_fitness';
  if (designDirectorRolePattern.test(text)) return 'design';
  if (executiveRolePattern.test(text)) return 'executive';
  if (/phi cong|pilot|co pho|co-pilot|first officer|airline pilot|flight deck|buong lai|lai may bay|captain pilot|captain bay|captain hang khong/.test(text)) return 'pilot';
  if (/tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|check in san bay|nhan vien mat dat hang khong|ground staff airline/.test(text)) return 'aviation';
  if (/tai xe|taxi|xe om|shipper|giao hang|giao nhan|container|dispatcher|dieu phoi van tai|van tai|driver/.test(text)) return 'driver_delivery';
  for (const [segment, matcher] of segmentMatchers) {
    if (matcher.test(text)) return segment;
  }
  return 'general';
}

function skill(base: SimulatorSkillBase, id: string, label: string): SimulatorSkillBase {
  return { ...base, id, label };
}

function getSpecializedManagerSkillLabels(jobTitle: string, industry?: string | null): { id: string; labels: string[] } | null {
  const text = normalizeRoleText(`${jobTitle} ${industry || ''}`);
  if (itManagerRolePattern.test(text)) return { id: 'it-manager', labels: ['Backlog/roadmap va uu tien theo business value', 'Delivery timeline, risk log va stakeholder update', 'Technical quality gate: review, incident, debt', 'Mentoring/phan cong team va KPI sprint'] };
  if (accountingManagerRolePattern.test(text)) return { id: 'accounting-manager', labels: ['Closing calendar va soat xet bao cao', 'Tax/audit compliance va control checklist', 'Phan cong team ke toan va SLA chung tu', 'Cashflow/reporting dashboard cho ban giam doc'] };
  if (salesManagerRolePattern.test(text)) return { id: 'sales-manager', labels: ['Sales forecast va pipeline review', 'Quota, territory va coaching doi sales', 'Key account plan va deal governance', 'Dashboard conversion, win rate va doanh thu'] };
  if (retailManagerRolePattern.test(text)) return { id: 'retail-manager', labels: ['Store P&L, doanh so va conversion', 'Roster nhan su, ca lam va training tai cua hang', 'Inventory, shrinkage va trung bay hang hoa', 'Customer experience, complaint va repeat customer'] };
  if (propertyOpsRolePattern.test(text)) return { id: 'property-ops', labels: ['Tenant/resident SLA va complaint log', 'Bao tri, nha thau va incident response', 'An ninh, ve sinh, PCCC va checklist toa nha', 'Budget van hanh va bao cao owner/BQL'] };
  if (constructionManagerRolePattern.test(text)) return { id: 'construction-manager', labels: ['Tien do, cost variance va lookahead plan', 'Dieu phoi nha thau, RFI va issue log', 'QA/QC nghiem thu va safety compliance', 'Bao cao chu dau tu voi risk/action owner'] };
  if (logisticsManagerRolePattern.test(text)) return { id: 'logistics-manager', labels: ['S&OP, demand/supply planning va OTIF', 'Carrier/vendor performance va cost-to-serve', 'Inventory accuracy, kho van va exception dashboard', 'Team SOP, escalation va continuous improvement'] };
  if (beautySpaManagerRolePattern.test(text)) return { id: 'beauty-manager', labels: ['Booking, therapist roster va utilization', 'Service quality, hygiene SOP va complaint recovery', 'Rebooking, membership va retail upsell', 'Doanh thu/dich vu, margin va feedback khach'] };
  if (healthcareManagerRolePattern.test(text)) return { id: 'healthcare-manager', labels: ['Patient flow, wait time va service SLA', 'Clinical quality, safety incident va compliance', 'Staffing/budget phong khoa hoac benh vien', 'Dashboard patient satisfaction va risk log'] };
  if (eventOpsRolePattern.test(text)) return { id: 'event-ops', labels: ['Run-of-show, timeline va cue sheet', 'Vendor/venue coordination va budget control', 'Risk plan, rehearsal va onsite issue log', 'Client feedback va post-event report'] };
  if (customerServiceManagerRolePattern.test(text)) return { id: 'cs-manager', labels: ['SLA, backlog va staffing forecast', 'QA calibration va coaching agent', 'Escalation playbook va complaint root cause', 'CSAT/NPS, retention va knowledge base owner'] };
  if (hrManagerRolePattern.test(text)) return { id: 'hr-manager', labels: ['Workforce plan va recruiting funnel', 'C&B benchmark, policy va budget nhan su', 'Onboarding/training completion va HR SLA', 'Retention, engagement va people dashboard'] };
  if (languageCenterManagerRolePattern.test(text)) return { id: 'language-center-manager', labels: ['Enrollment funnel va trial-to-paid dashboard', 'Class fill, teacher utilization va roster lop', 'Retention, renewal va dropout/refund reasons', 'Parent complaint SLA va revenue per class'] };
  if (securityManagerRolePattern.test(text)) return { id: 'security-manager', labels: ['Roster ca truc, patrol plan va site coverage', 'Incident escalation, CCTV va access control', 'PCCC/so cuu, training va compliance checklist', 'Bao cao rui ro cho BQL/khach hang'] };
  if (sportsFitnessManagerRolePattern.test(text)) return { id: 'fitness-manager', labels: ['Membership sales, retention va class utilization', 'Coach roster, training quality va payroll', 'Service SOP, hygiene va complaint recovery', 'Dashboard doanh thu, churn va feedback hoi vien'] };
  if (designDirectorRolePattern.test(text)) return { id: 'design-director', labels: ['Creative direction va brand/design governance', 'Design system, review cadence va quality bar', 'Stakeholder brief, scope va delivery risk', 'Team mentoring va business impact dashboard'] };
  return null;
}

function managerLanguage(id: string, roleLabel: string): RoleLanguage | null {
  const shared = {
    portfolioWord: `${roleLabel} evidence portfolio`,
    productWord: `case ${roleLabel}`,
  };
  const map: Record<string, RoleLanguage> = {
    'it-manager': { rolePath: 'Product/Project/Tech Lead / Engineering Manager track', mainSkill: 'roadmap/backlog ownership + delivery governance + stakeholder update + team quality', proofAsset: 'roadmap/backlog, delivery plan, risk log, sprint/incident dashboard, review note va feedback stakeholder', opportunityList: 'product company, platform team, project/program management, engineering management hoac tech lead scope lon', kpiGuidance: 'KPI IT manager/lead: delivery predictability, cycle time, incident rate, stakeholder satisfaction, team throughput va tech debt/risk closed.', ...shared },
    'accounting-manager': { rolePath: 'Chief Accountant / Accounting Manager / Controller track', mainSkill: 'closing governance + tax/audit compliance + internal control + finance reporting dashboard', proofAsset: 'closing calendar, reconciliation/control checklist, tax/audit file, team SLA va dashboard cho ban giam doc', opportunityList: 'chief accountant, controller, finance operations, MNC accounting hoac ERP-enabled company', kpiGuidance: 'KPI accounting manager: days-to-close, audit findings, tax compliance, reporting accuracy, team SLA va control exceptions.', ...shared },
    'sales-manager': { rolePath: 'Sales Supervisor / Sales Manager / Key Account / Sales Director track', mainSkill: 'pipeline governance + sales coaching + quota/forecast + key account strategy', proofAsset: 'CRM pipeline, forecast, quota plan, coaching log, win/loss review va key account plan', opportunityList: 'B2B/FMCG/SaaS sales manager, key account, national sales, trade sales hoac sales director track', kpiGuidance: 'KPI sales manager: quota attainment, forecast accuracy, pipeline coverage, win rate, average deal size, team activity quality va retention account.', ...shared },
    'retail-manager': { rolePath: 'Store Manager / Retail Operations / Area Manager track', mainSkill: 'store P&L + roster + inventory/shrinkage + customer experience', proofAsset: 'store dashboard gom sales, conversion, basket size, shrinkage, roster, display audit va complaint/repeat log', opportunityList: 'store manager, retail ops, area supervisor, category/merchandising hoac chuoi ban le', kpiGuidance: 'KPI retail manager: sales/store, conversion, basket size, shrinkage, inventory accuracy, staff productivity va review/complaint.', ...shared },
    'property-ops': { rolePath: 'Building / Property / Facility Operations track', mainSkill: 'tenant SLA + vendor/maintenance + safety-security-cleaning + operating budget', proofAsset: 'building ops dashboard, tenant complaint log, vendor SLA, maintenance/PCCC checklist va budget report', opportunityList: 'property management, facility management, building operations, serviced apartment hoac mall/office operation', kpiGuidance: 'KPI property ops: tenant SLA, complaint resolution, downtime, maintenance cost, vendor SLA, safety incidents va budget variance.', ...shared },
    'construction-manager': { rolePath: 'Construction Project Manager / Site Manager / PM track', mainSkill: 'schedule-cost-quality-safety governance + contractor coordination', proofAsset: 'lookahead plan, cost variance, RFI/issue log, QA/QC checklist, safety record va owner report', opportunityList: 'project management, main contractor, developer, QS/BIM/PMO hoac construction manager', kpiGuidance: 'KPI construction manager: schedule variance, cost variance, rework, safety, RFI closure, handover quality va contractor performance.', ...shared },
    'logistics-manager': { rolePath: 'Supply Chain / Logistics / Warehouse / Transport Manager track', mainSkill: 'S&OP + OTIF + vendor/carrier cost + inventory accuracy + exception governance', proofAsset: 'S&OP dashboard, OTIF report, carrier/vendor scorecard, inventory accuracy, exception log va cost saving case', opportunityList: 'supply chain manager, logistics manager, warehouse/transport lead, planning hoac operations excellence', kpiGuidance: 'KPI logistics manager: OTIF, inventory accuracy, cost-to-serve, lead time, vendor SLA, exception rate va team productivity.', ...shared },
    'beauty-manager': { rolePath: 'Spa / Salon Manager / Service Operations track', mainSkill: 'booking utilization + service quality + rebooking/membership + hygiene SOP + team roster', proofAsset: 'booking dashboard, therapist roster, service checklist, rebooking/retail upsell, complaint recovery va feedback khach', opportunityList: 'spa/salon manager, clinic beauty ops, chain manager hoac service quality lead', kpiGuidance: 'KPI spa/salon manager: booking utilization, rebooking, membership, retail upsell, complaint, review score, hygiene audit va staff productivity.', ...shared },
    'healthcare-manager': { rolePath: 'Clinic / Hospital / Medical Operations Manager track', mainSkill: 'patient flow + clinical quality/safety + staffing/budget + compliance dashboard', proofAsset: 'patient flow dashboard, wait-time report, safety incident log, staffing/budget view, compliance checklist va patient feedback', opportunityList: 'clinic manager, hospital operations, medical director office, quality/safety lead hoac healthcare service manager', kpiGuidance: 'KPI healthcare manager: wait time, patient satisfaction, safety incidents, compliance, staffing productivity, budget variance va service SLA.', ...shared },
    'event-ops': { rolePath: 'Event Coordinator / Event Manager / Producer track', mainSkill: 'run-of-show + vendor/budget + onsite risk + client feedback', proofAsset: 'run-of-show, vendor checklist, budget tracker, rehearsal note, onsite issue log va post-event report', opportunityList: 'event agency, brand activation, corporate event, wedding/event production hoac producer track', kpiGuidance: 'KPI event ops: timeline hit rate, budget variance, vendor SLA, issue resolved, client satisfaction, repeat booking va margin/event.', ...shared },
    'cs-manager': { rolePath: 'Customer Service / Call Center / Customer Success Manager track', mainSkill: 'SLA staffing + QA coaching + escalation root cause + CSAT/NPS retention', proofAsset: 'SLA dashboard, QA calibration sheet, coaching log, escalation RCA, knowledge base update va CSAT/NPS report', opportunityList: 'CS manager, call center manager, customer success, CRM operations hoac service quality lead', kpiGuidance: 'KPI CS manager: SLA, backlog, QA score, FCR, escalation rate, CSAT/NPS, churn/retention va agent productivity.', ...shared },
    'hr-manager': { rolePath: 'HR Manager / People Operations / HRBP / Head of HR track', mainSkill: 'workforce planning + C&B/policy + talent pipeline + retention/engagement dashboard', proofAsset: 'workforce plan, recruiting funnel, C&B benchmark, policy rollout, engagement/retention dashboard va HR SLA', opportunityList: 'HR manager, HRBP, people operations, C&B/L&D lead hoac head of HR track', kpiGuidance: 'KPI HR manager: time-to-fill, offer acceptance, retention, engagement, training completion, HR SLA, payroll/C&B accuracy va hiring quality.', ...shared },
    'language-center-manager': { rolePath: 'Language Center Manager / Academic Operations Manager / Education Growth Lead', mainSkill: 'enrollment funnel + class fill + teacher utilization + retention/renewal + complaint SLA', proofAsset: 'dashboard trung tam gom lead-to-enrollment, trial-to-paid, active students, class fill, teacher utilization, retention/renewal, dropout/refund reasons, parent complaint SLA va revenue per class', opportunityList: 'quan ly trung tam ngoai ngu, academic operations, campus manager, education growth, program manager hoac multi-center operations', kpiGuidance: 'KPI quan ly trung tam ngoai ngu: lead-to-enrollment, trial-to-paid, active students, class fill rate, teacher utilization, retention/renewal, dropout/refund rate, parent complaint SLA, revenue per class va margin lop.', ...shared },
    'security-manager': { rolePath: 'Security Supervisor / Site Security Manager track', mainSkill: 'site coverage + incident escalation + CCTV/access control + PCCC/compliance training', proofAsset: 'patrol roster, incident log, CCTV/access note, PCCC drill/training checklist va client/BQL report', opportunityList: 'security supervisor, site manager, control room, safety-security team hoac facility security lead', kpiGuidance: 'KPI security manager: coverage, incident response time, patrol compliance, access/CCTV issue, PCCC drill, training completion va client feedback.', ...shared },
    'fitness-manager': { rolePath: 'Gym / Fitness Studio Manager / Program Owner track', mainSkill: 'membership retention + coach roster + class utilization + service quality dashboard', proofAsset: 'membership dashboard, class utilization, coach roster, retention/churn report, complaint log va feedback hoi vien', opportunityList: 'gym manager, studio manager, PT lead, fitness operations hoac program owner', kpiGuidance: 'KPI fitness manager: membership growth, churn, class utilization, PT revenue, coach productivity, complaint rate va review score.', ...shared },
    'design-director': { rolePath: 'Design Lead / Creative Director / Head of Design track', mainSkill: 'creative direction + design governance + stakeholder scope + team review cadence', proofAsset: 'creative brief, design system/review log, campaign/product impact, stakeholder feedback va team coaching note', opportunityList: 'creative director, design lead, head of design, agency/product design leadership hoac brand studio', kpiGuidance: 'KPI design director: brand consistency, design cycle time, stakeholder approval, campaign/product impact, team quality va reuse/design system adoption.', ...shared },
  };
  return map[id] || null;
}

function getSpecializedManagerLanguage(jobTitle: string, industry?: string | null): RoleLanguage | null {
  const match = getSpecializedManagerSkillLabels(jobTitle, industry);
  if (!match) return null;
  return managerLanguage(match.id, jobTitle.trim() || 'manager role');
}

function buildSimulatorSkillsForRole(
  jobTitle: string,
  defaultSkills: SimulatorSkillBase[],
  industry?: string | null
): SimulatorSkillBase[] {
  const segment = detectRoleSegment(jobTitle, industry);
  const b = defaultSkills;
  const specializedManagerSkills = getSpecializedManagerSkillLabels(jobTitle, industry);
  if (specializedManagerSkills) {
    return specializedManagerSkills.labels.map((label, index) => skill(b[index] || b[0], `${specializedManagerSkills.id}-${index + 1}`, label));
  }
  if (isSchoolHealthcareRole(jobTitle, industry)) {
    return [
      'So cuu hoc duong va quy trinh chuyen tuyen',
      'So suc khoe hoc sinh va theo doi thuoc/di ung',
      'Bao cao su co, tiem chung va benh truyen nhiem',
      'Giao tiep phu huynh-giao vien khi co ca y te',
    ].map((label, index) => skill(b[index] || b[0], `school-healthcare-${index + 1}`, label));
  }
  if (isMarketingManagerRole(jobTitle, industry)) {
    return [
      'Brand positioning va consumer insight',
      'Brand health, awareness va consideration',
      'Campaign P&L, budget va media mix',
      'Go-to-market launch plan va agency briefing',
    ].map((label, index) => skill(b[index] || b[0], `marketing-manager-${index + 1}`, label));
  }
  if (isRestaurantManagerRole(jobTitle, industry)) {
    return [
      'Vận hành ca, điều phối sàn và chất lượng dịch vụ',
      'Roster nhân sự, labor cost và training ca',
      'Food cost, tồn kho, hao hụt và table turn',
      'P&L nhà hàng, complaint recovery và dashboard owner',
    ].map((label, index) => skill(b[index] || b[0], `restaurant-manager-${index + 1}`, label));
  }
  if (isRestaurantFrontlineRole(jobTitle, industry)) {
    return [
      'POS/order accuracy va bill log',
      'Table service SOP va shift handover',
      'Upsell combo/mon phu hop tai ban',
      'Xu ly complaint khach va feedback quan ly ca',
    ].map((label, index) => skill(b[index] || b[0], `restaurant-frontline-${index + 1}`, label));
  }
  if (isHotelManagerRole(jobTitle, industry)) {
    return [
      'Occupancy, ADR, RevPAR va revenue coordination',
      'Roster nhan su, service SLA va SOP audit',
      'Guest experience, review score va complaint escalation',
      'P&L/budget khach san va operating dashboard',
    ].map((label, index) => skill(b[index] || b[0], `hotel-manager-${index + 1}`, label));
  }
  if (isHotelFrontlineRole(jobTitle, industry)) {
    return [
      'Check-in/check-out SOP va PMS accuracy',
      'Guest request SLA va shift handover',
      'Upsell phong/dich vu phu hop',
      'Complaint recovery va review feedback',
    ].map((label, index) => skill(b[index] || b[0], `hotel-frontline-${index + 1}`, label));
  }
  const tourismProfile = getTourismRoleProfile(jobTitle, industry);
  if (tourismProfile) {
    return tourismProfile.skills.map((label, index) => skill(b[index] || b[0], `${tourismProfile.skillId}-${index + 1}`, label));
  }
  const skilledTrade = getSkilledTradeProfile(jobTitle, industry);
  if (skilledTrade) {
    return skilledTrade.skills.map((label, index) => skill(b[index] || b[0], `${skilledTrade.id}-${index + 1}`, label));
  }
  if (isVeterinaryRole(jobTitle, industry)) {
    return [
      'Animal triage va chan doan thu y theo loai vat nuoi',
      'Vaccination, parasite control va ho so dieu tri',
      'Surgery/anesthesia safety va infection control cho thu cung',
      'Tu van chu nuoi, follow-up va case evidence da an thong tin',
    ].map((label, index) => skill(b[index] || b[0], `veterinary-${index + 1}`, label));
  }
  if (isNutritionRole(jobTitle, industry)) {
    return [
      'Nutrition assessment va khai thac khau phan an',
      'Meal plan/che do an theo muc tieu va benh ly lien quan',
      'Counseling thay doi hanh vi an uong va follow-up',
      'Theo doi chi so: can nang, BMI, vong eo, duong huyet/lipid neu co',
    ].map((label, index) => skill(b[index] || b[0], `nutrition-${index + 1}`, label));
  }
  if (isInsuranceRole(jobTitle, industry)) {
    return [
      'Underwriting va danh gia rui ro hop dong bao hiem',
      'Claims/boi thuong va giam dinh ton that dung quy trinh',
      'Policy wording, dieu khoan loai tru va coverage gap',
      'Broker/client account management va renewal ratio',
    ].map((label, index) => skill(b[index] || b[0], `insurance-${index + 1}`, label));
  }
  if (isDentalRole(jobTitle, industry)) {
    return [
      'Kham chan doan va treatment plan nha khoa',
      'Vo khuan, an toan thu thuat va infection control',
      'X-quang/CBCT, photo intraoral va ho so benh an an danh',
      'Tu van ca dieu tri, tai kham va feedback benh nhan',
    ].map((label, index) => skill(b[index] || b[0], `dental-${index + 1}`, label));
  }
  if (isDentalAssistantRole(jobTitle, industry)) {
    return [
      'Chuan bi ghe, dung cu va infection control',
      'Ho tro suction/chuyen dung cu theo quy trinh',
      'Huong dan benh nhan va follow-up tai kham',
      'Ton kho vat tu, lich hen va feedback bac si',
    ].map((label, index) => skill(b[index] || b[0], `dental-assistant-${index + 1}`, label));
  }
  if (isNetworkOperationsRole(jobTitle, industry)) {
    return [
      'Monitoring NOC, alert triage va escalation dung SLA',
      'Troubleshooting network incident bang log, topology va ticket',
      'Change window, rollback plan va post-incident review',
      'Uptime/SLA dashboard va documentation cho ha tang mang',
    ].map((label, index) => skill(b[index] || b[0], `network-ops-${index + 1}`, label));
  }
  if (isTelecomInfrastructureRole(jobTitle, industry)) {
    return [
      'Khao sat tuyen, thiet ke/phuong an trien khai cap quang hoac tram',
      'Do kiem suy hao, acceptance test va ho so nghiem thu',
      'Xu ly su co hien truong, splice/ODF va handover ky thuat',
      'SLA bao tri, an toan hien truong va bao cao downtime mang',
    ].map((label, index) => skill(b[index] || b[0], `telecom-infra-${index + 1}`, label));
  }
  const bySegment: Partial<Record<RoleSegment, string[]>> = {
    photography: ['Retouching cao cấp: skin, màu, dodge & burn', 'Set ánh sáng thương mại cho studio/product/beauty', 'Chốt deal B2B với brand, agency và studio', 'Hybrid photo-video + color grading để tăng giá job'],
    blue_collar: ['Vận hành máy nghề: CNC, laser, hàn TIG/MIG hoặc máy công nghiệp', 'Báo giá theo vật tư, công và biên lợi nhuận', 'Quay quy trình làm để kéo đơn custom', 'QC thành phẩm và SOP giao hàng đúng hẹn'],
    beauty_spa: ['Tay nghề dịch vụ chủ lực có ảnh trước/sau', 'Tư vấn gói liệu trình và upsell đúng nhu cầu', 'Giữ chân khách quay lại và referral', 'Portfolio TikTok/IG kèm feedback thật'],
    fnb: ['Kiểm soát food cost và hao hụt nguyên liệu', 'Giữ tốc độ ra món và chuẩn plating giờ cao điểm', 'Dẫn ca bếp, training phụ bếp và giữ SOP', 'HACCP/an toàn bếp + costing menu chuẩn'],
    events: ['Showreel 60-90 giây bán được năng lực dẫn', 'Kịch bản lời dẫn theo brief và brand voice', 'Xử lý tình huống live và giữ nhịp sân khấu', 'Rate card + feedback khách/agency rõ ràng'],
    pilot: ['Flight deck SOP va checklist an toan bay', 'Type rating, recurrent training va simulator check', 'Cockpit CRM, ATC radio va phraseology', 'Flight hours/logbook, route readiness va incident-free record'],
    aviation: ['Checklist an toàn bay và quy trình cabin chuẩn', 'Xử lý complaint và trấn an hành khách khó', 'Announcement tiếng Anh rõ, tự tin, đúng ngữ cảnh', 'Grooming, teamwork và feedback từ senior crew'],
    school_leadership: ['Hồ sơ bổ nhiệm, phụ cấp và thi đua đúng bối cảnh', 'Dashboard chất lượng nhà trường và an toàn học sinh', 'Quản trị phụ huynh, giáo viên và rủi ro complaint', 'Tuyển sinh/retention/P&L nếu ở tư thục hoặc quốc tế'],
    freelance_teaching: ['Ứng dụng AI soạn giáo án và bài tập cá nhân hóa', 'Thiết kế khóa học online có video, quiz và workbook', 'Tỷ lệ giữ chân học viên, renewal và referral', 'Chốt gói học theo outcome, không bán giờ lẻ'],
    education: ['Giáo án bộ môn bám chuẩn đầu ra', 'Ma trận đề, rubric chấm bài và nhận xét', 'Dashboard tiến bộ điểm số học sinh', 'Hồ sơ chuyên môn, thi đua và phụ đạo/bồi dưỡng'],
    language_center: ['Enrollment funnel và trial-to-paid', 'Retention/churn học viên theo lớp', 'Teacher utilization và class fill rate', 'Parent complaint SLA và renewal rate'],
    education_admissions: isStudyAbroadAdmissionsRole(jobTitle, industry)
      ? ['Qualification nhu cầu du học và ngân sách gia đình', 'Checklist hồ sơ trường/visa không lỗi', 'CRM follow-up lead đến nộp hồ sơ', 'Tỷ lệ offer, visa pass và nhập học']
      : ['Qualification nhu cầu học và ngân sách/học phí', 'Tư vấn chương trình, lớp hoặc ngành phù hợp', 'CRM follow-up lead đến đăng ký/placement test', 'Tỷ lệ tư vấn, đóng phí và nhập học'],
    it: ['Feature ownership có số đo production', 'System design/API/database debugging', 'Cloud/DevOps hoặc bảo mật theo role', 'English-facing documentation và stakeholder update'],
    semiconductor: ['EDA/tool flow và timing closure', 'Verification/testbench hoặc RTL quality', 'Yield/process documentation', 'Cross-site English technical review'],
    finance: ['Financial modeling/credit/investment case', 'Risk, compliance và dashboard theo danh mục', 'Power BI/Excel automation cho báo cáo', 'Deal/portfolio performance có số'],
    accounting: ['Closing/reporting đúng hạn', 'Tax/compliance checklist', 'Power Query/Excel automation', 'Audit trail và kiểm soát sai lệch'],
    sales: ['CRM pipeline và forecast', 'Cold message/proposal theo pain point', 'Conversion rate theo từng stage', 'Chốt deal/key account có ticket size rõ'],
    retail: ['Doanh số/ca và conversion tại điểm bán', 'Tồn kho, trưng bày và shrinkage', 'Upsell/cross-sell theo nhóm hàng', 'CSKH và khách quay lại'],
    real_estate: ['Nguồn hàng và lead pipeline', 'Tư vấn pháp lý/giao dịch căn bản', 'Tour/chốt cọc có kịch bản', 'Case giao dịch và referral khách'],
    marketing: ['Performance dashboard: CTR, CVR, CAC, ROAS', 'Content/creative testing có giả thuyết', 'Attribution theo campaign', 'Go-to-market case study'],
    media_content: ['Portfolio bài/clip đã publish', 'Biên tập theo brief và deadline', 'SEO/distribution hoặc audience retention', 'Interview/source handling và fact-check'],
    design: ['Portfolio case study có problem-solution-impact', 'Figma/design system hoặc motion workflow', 'User/business metric: conversion, retention, task success', 'Stakeholder presentation và design rationale'],
    healthcare: ['Clinical protocol/checklist an toàn', 'Case bệnh án đã ẩn danh và follow-up', 'Giao tiếp bệnh nhân/người nhà', 'Chứng chỉ chuyên khoa hoặc kỹ thuật thiết bị'],
    pharma_chemical: ['Regulatory/QA documentation', 'Lab testing hoặc R&D protocol', 'GMP/GLP/compliance checklist', 'Medical/product knowledge theo danh mục'],
    hr: ['Recruiting funnel/time-to-fill', 'Onboarding/training completion', 'C&B benchmark hoặc HR dashboard', 'Retention/churn và employee feedback'],
    legal: ['Soạn/rà hợp đồng và risk memo', 'Compliance checklist theo ngành', 'Case dispute/negotiation đã ẩn danh', 'Stakeholder advisory rõ khuyến nghị'],
    admin_office: ['SOP hành chính và SLA xử lý yêu cầu', 'Quản lý lịch/tài liệu/hồ sơ không lỗi', 'Vendor/contract tracking', 'Excel/Sheets dashboard vận hành'],
    statistics_data: ['Excel/Sheets và Power Query làm sạch dữ liệu', 'Pivot/dashboard báo cáo định kỳ', 'Đối soát sai lệch và data quality log', 'Diễn giải insight ngắn cho quản lý'],
    customer_service: ['CSAT/NPS và first response time', 'Ticket handling và escalation script', 'Knowledge base/SOP xử lý lỗi', 'Case giữ khách hoặc giảm complaint'],
    logistics: ['Shipment tracking và on-time delivery', 'Customs/docs accuracy', 'Cost per shipment và exception handling', 'Carrier/vendor coordination'],
    procurement_supply: ['Supplier shortlist và RFQ comparison', 'Cost saving có bằng chứng', 'PO/contract/SLA tracking', 'Inventory/planning accuracy'],
    engineering: ['OEE/năng suất/lỗi giảm', 'Lean/Six Sigma hoặc RCA thực tế', 'PLC/automation/process improvement', 'SOP an toàn và training line'],
    construction: ['Shop drawing/BIM/BOQ theo role', 'Tiến độ, cost và quality checklist công trình', 'Hồ sơ nghiệm thu và safety compliance', 'Điều phối nhà thầu/stakeholder'],
    environment_energy: ['Monitoring/report môi trường đúng chuẩn', 'Compliance permit và audit trail', 'Waste/water/energy KPI', 'Incident response và cải tiến quy trình'],
    agriculture: ['Yield/FCR/tỷ lệ hao hụt theo mùa vụ', 'QC nông sản/thủy sản', 'Quy trình kỹ thuật trồng/chăn nuôi', 'Traceability và tiêu chuẩn VietGAP/GLOBALG.A.P.'],
    research: ['Research design và thống kê', 'Dataset/codebook/lab notebook sạch', 'Paper/report/presentation đã publish', 'Grant/industry problem framing'],
    consulting: ['Problem structuring và issue tree', 'Client-ready slide/storyline', 'Model/analysis có giả định rõ', 'Workshop/stakeholder management'],
    driver_delivery: ['Đúng giờ, an toàn và tỷ lệ hoàn thành đơn', 'Route optimization và fuel/cost control', 'CSKH khi giao nhận', 'Hồ sơ bằng lái/chứng chỉ phù hợp'],
    hospitality: ['Chat luong trai nghiem khach/don', 'Lich trinh hoac booking file khong loi', 'Xu ly phat sinh va handover ro rang', 'Feedback khach va bao cao sau ca/tour'],
    security: ['Patrol checklist và incident log', 'CCTV/access control', 'Xử lý tình huống và báo cáo ca', 'An toàn PCCC/sơ cứu cơ bản'],
    cleaning: ['Checklist khu vực và SLA sạch', 'Dụng cụ/hóa chất đúng chuẩn', 'Before-after evidence', 'Phản hồi khách/nội bộ và xử lý phát sinh'],
    creator_entertainment: ['Content/IP portfolio', 'Audience retention và lịch publish', 'Brand deal/rate card', 'Community và monetization funnel'],
    sports_fitness: ['Assessment đầu vào và tracking tiến bộ', 'Thiết kế giáo án tập theo mục tiêu', 'Retention hội viên/học viên', 'Before-after/testimonial đúng chuẩn'],
    business_owner: ['P&L đơn giản và dòng tiền', 'Sản phẩm chủ lực và biên lợi nhuận', 'Kênh bán/retention/referral', 'SOP vận hành không phụ thuộc chủ'],
    executive: ['P&L ownership và strategy memo', 'Operating dashboard', 'Stakeholder/board communication', 'Org design và succession plan'],
  };

  const labels = bySegment[segment];
  if (!labels) return defaultSkills;
  return labels.map((label, index) => skill(b[index] || b[0], `${segment}-${index + 1}`, label));
}

export function getSimulatorSkillsForRole(
  jobTitle: string,
  defaultSkills: SimulatorSkillBase[],
  industry?: string | null
): SimulatorSkillBase[] {
  const exactProfile = shouldUseExactRoleProfiles() ? getExactRoleProfile(jobTitle, industry) : null;
  if (exactProfile?.skills?.length) {
    return repairMojibakeDeep(exactProfile.skills.slice(0, 4).map((label, index) => ({
      ...(defaultSkills[index] || defaultSkills[0]),
      id: `profile-${exactProfile.titleKey}-${index + 1}`,
      label,
    })));
  }
  return repairMojibakeDeep(buildSimulatorSkillsForRole(jobTitle, defaultSkills, industry));
}

function buildWorkTiersForRole(jobTitle: string, defaultTiers: WorkTierBase[], industry?: string | null): WorkTierBase[] {
  const segment = detectRoleSegment(jobTitle, industry);
  if (isRestaurantManagerRole(jobTitle, industry)) {
    return [
      { ...defaultTiers[0], name: 'Quản lý ca nhà hàng nhỏ' },
      { ...defaultTiers[1], name: 'Restaurant Manager có KPI ca rõ' },
      { ...defaultTiers[2], name: 'Quản lý chuỗi/venue doanh thu cao' },
      { ...defaultTiers[3], name: 'F&B Ops / Area Manager' },
    ];
  }
  if (isRestaurantFrontlineRole(jobTitle, industry)) {
    return [
      { ...defaultTiers[0], name: 'Phuc vu/thu ngan ca co ban' },
      { ...defaultTiers[1], name: 'Nhan vien ca chuan SOP va upsell' },
      { ...defaultTiers[2], name: 'Senior service / cashier lead' },
      { ...defaultTiers[3], name: 'Ca trưởng sàn nhà hàng' },
    ];
  }
  if (isHotelManagerRole(jobTitle, industry)) {
    return [
      { ...defaultTiers[0], name: 'Quan ly khach san/bo phan quy mo nho' },
      { ...defaultTiers[1], name: 'Hotel Manager co SOP va review KPI' },
      { ...defaultTiers[2], name: 'Khach san/resort doanh thu cao' },
      { ...defaultTiers[3], name: 'GM / Multi-property Operations' },
    ];
  }
  if (isHotelFrontlineRole(jobTitle, industry)) {
    return [
      { ...defaultTiers[0], name: 'Front desk/guest service ca co ban' },
      { ...defaultTiers[1], name: 'Le tan chuan PMS, SLA va upsell' },
      { ...defaultTiers[2], name: 'Senior front desk / reservation lead' },
      { ...defaultTiers[3], name: 'Front office supervisor' },
    ];
  }
  const tourismProfile = getTourismRoleProfile(jobTitle, industry);
  if (tourismProfile) {
    return tourismProfile.tiers.map((name, index) => ({ ...defaultTiers[index], name }));
  }
  const skilledTrade = getSkilledTradeProfile(jobTitle, industry);
  if (skilledTrade) {
    return skilledTrade.tiers.map((name, index) => ({ ...defaultTiers[index], name }));
  }
  if (isDentalRole(jobTitle, industry)) {
    return [
      { ...defaultTiers[0], name: 'Nha si tong quat/phong kham nho' },
      { ...defaultTiers[1], name: 'Nha si co case va protocol ro' },
      { ...defaultTiers[2], name: 'Nha si chuyen sau/clinic premium' },
      { ...defaultTiers[3], name: 'Lead dentist / clinical director' },
    ];
  }
  if (isDentalAssistantRole(jobTitle, industry)) {
    return [
      { ...defaultTiers[0], name: 'Tro ly nha khoa ca co ban' },
      { ...defaultTiers[1], name: 'Phu ta chuan infection control' },
      { ...defaultTiers[2], name: 'Senior dental assistant' },
      { ...defaultTiers[3], name: 'Dieu phoi phong thu thuat nha khoa' },
    ];
  }
  if (isNetworkOperationsRole(jobTitle, industry)) {
    return [
      { ...defaultTiers[0], name: 'NOC/Network support ca co ban' },
      { ...defaultTiers[1], name: 'Network specialist co SLA va ticket ro' },
      { ...defaultTiers[2], name: 'Senior NOC / Network operations engineer' },
      { ...defaultTiers[3], name: 'Network lead / Infrastructure operations lead' },
    ];
  }
  if (isTelecomInfrastructureRole(jobTitle, industry)) {
    return [
      { ...defaultTiers[0], name: 'Ky thuat vien hien truong tuyen/tram' },
      { ...defaultTiers[1], name: 'Telecom technician co nghiem thu va SLA' },
      { ...defaultTiers[2], name: 'Ky su vien thong / fiber operations senior' },
      { ...defaultTiers[3], name: 'Telecom project / field operations lead' },
    ];
  }
  if (segment === 'executive') {
    return [
      { ...defaultTiers[0], name: 'Director/Deputy GM tai SME co P&L hep' },
      { ...defaultTiers[1], name: 'Pho TGD/GM khoi co operating KPI' },
      { ...defaultTiers[2], name: 'BU Head/COO/CFO tai cong ty lon' },
      { ...defaultTiers[3], name: 'Group executive / MD / C-level' },
    ];
  }
  const tiers: Partial<Record<RoleSegment, WorkTierBase[]>> = {
    photography: [
      { name: 'Job lẻ / chụp đại trà', mul: 1.00, color: '#94a3b8', badge: '📷' },
      { name: 'Studio / ngách rõ', mul: 1.25, color: '#60a5fa', badge: '💡' },
      { name: 'Brand / agency retainer', mul: 1.65, color: '#34d399', badge: '🎬' },
      { name: 'DOP / production house', mul: 2.05, color: '#fbbf24', badge: '🏆' },
    ],
    blue_collar: [
      { name: 'Thợ phụ / nhận job lẻ', mul: 1.00, color: '#94a3b8', badge: '🧰' },
      { name: 'Thợ chính có máy', mul: 1.25, color: '#60a5fa', badge: '⚙️' },
      { name: 'Ngách custom premium', mul: 1.6, color: '#34d399', badge: '🛠️' },
      { name: 'Workshop / B2B supplier', mul: 2.00, color: '#fbbf24', badge: '🏆' },
    ],
    fnb: [
      { name: 'Quán/nhà hàng nhỏ', mul: 1.00, color: '#94a3b8', badge: '🍳' },
      { name: 'Chuỗi nhà hàng có KPI', mul: 1.25, color: '#60a5fa', badge: '🍽️' },
      { name: 'Khách sạn / resort / catering', mul: 1.55, color: '#34d399', badge: '🏨' },
      { name: 'Bếp trưởng / bếp trung tâm', mul: 1.95, color: '#fbbf24', badge: '🏆' },
    ],
    events: [
      { name: 'Show nhỏ / local event', mul: 1.00, color: '#94a3b8', badge: '🎤' },
      { name: 'Wedding / activation', mul: 1.25, color: '#60a5fa', badge: '🎪' },
      { name: 'Corporate / livestream', mul: 1.55, color: '#34d399', badge: '🎬' },
      { name: 'Premium host có rate card', mul: 1.95, color: '#fbbf24', badge: '🏆' },
    ],
    pilot: [
      { name: 'First Officer noi dia / narrow-body', mul: 1.00, color: '#94a3b8', badge: 'FLT' },
      { name: 'First Officer quoc te / type-rated', mul: 1.25, color: '#60a5fa', badge: 'FO' },
      { name: 'Captain / route-aircraft scope cao hon', mul: 1.65, color: '#34d399', badge: 'CPT' },
      { name: 'Training Captain / Check Pilot', mul: 2.05, color: '#fbbf24', badge: 'TRI' },
    ],
    aviation: [
      { name: 'Hãng nội địa / crew mới', mul: 1.00, color: '#94a3b8', badge: '✈️' },
      { name: 'Tuyến ổn định / service chuẩn', mul: 1.22, color: '#60a5fa', badge: '🧳' },
      { name: 'Tuyến quốc tế / senior crew', mul: 1.55, color: '#34d399', badge: '🌏' },
      { name: 'Purser / trainer', mul: 1.95, color: '#fbbf24', badge: '🏆' },
    ],
    education: [
      { name: 'Giáo viên bộ môn / hồ sơ nền', mul: 1.00, color: '#94a3b8', badge: 'GV' },
      { name: 'Giáo viên nòng cốt có chuyên đề', mul: 1.25, color: '#60a5fa', badge: 'CM' },
      { name: 'Tổ phó/Tổ trưởng chuyên môn', mul: 1.6, color: '#34d399', badge: 'TC' },
      { name: 'Lead học thuật bộ môn / giáo viên cốt cán', mul: 2.0, color: '#fbbf24', badge: 'LD' },
    ],
    freelance_teaching: [
      { name: 'Dạy lẻ theo giờ', mul: 1.00, color: '#94a3b8', badge: '✍️' },
      { name: 'Gói học theo outcome', mul: 1.28, color: '#60a5fa', badge: '📘' },
      { name: 'Cohort / khóa online', mul: 1.65, color: '#34d399', badge: '🎥' },
      { name: 'Academy / IP giáo trình', mul: 2.05, color: '#fbbf24', badge: '🏆' },
    ],
    statistics_data: [
      { name: 'Nhân viên thống kê / nhập liệu có kiểm tra', mul: 1.00, color: '#94a3b8', badge: '📊' },
      { name: 'Chuyên viên báo cáo dữ liệu', mul: 1.22, color: '#60a5fa', badge: '📈' },
      { name: 'Reporting / Data Analyst', mul: 1.55, color: '#34d399', badge: '🧮' },
      { name: 'BI / Planning / Analytics Lead', mul: 1.95, color: '#fbbf24', badge: '🏆' },
    ],
  };
  if (tiers[segment]) return tiers[segment]!;
  const label = getRoleSegmentLabel(segment).split('/')[0].trim();
  return [
    { ...defaultTiers[0], name: `${label} quy mô nhỏ / ít KPI` },
    { ...defaultTiers[1], name: `${label} có quy trình và KPI rõ` },
    { ...defaultTiers[2], name: `${label} premium / chuỗi / MNC` },
    { ...defaultTiers[3], name: `Lead / owner mảng ${label}` },
  ];
}

export function getWorkTiersForRole(jobTitle: string, defaultTiers: WorkTierBase[], industry?: string | null): WorkTierBase[] {
  const exactProfile = shouldUseExactRoleProfiles() ? getExactRoleProfile(jobTitle, industry) : null;
  if (exactProfile?.tiers?.length) {
    return repairMojibakeDeep(exactProfile.tiers.slice(0, 4).map((name, index) => ({
      ...(defaultTiers[index] || defaultTiers[0]),
      name,
    })));
  }
  return repairMojibakeDeep(buildWorkTiersForRole(jobTitle, defaultTiers, industry));
}

function buildPremiumRolePreviewForRole(jobTitle: string, industry?: string | null): PremiumRolePreview {
  const segment = detectRoleSegment(jobTitle, industry);
  const roleLabel = jobTitle.trim() || 'ngành của bạn';
  if (isMarketingManagerRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'brand strategy + campaign P&L + budget/media mix + brand health',
      path: 'Brand Manager -> Senior Brand Manager -> Marketing Lead / Head of Marketing',
      firstAction: 'dong goi 1 campaign thanh case study cap quan ly: business objective, insight, positioning, budget, agency/media governance, brand/business KPI va learning',
      skills: ['Brand strategy', 'Campaign P&L', 'Media mix', 'Brand health'],
      cvBullet: 'Chung minh vai tro Brand Manager bang brand health, market share/penetration, campaign P&L, budget efficiency va stakeholder ownership thay vi liet ke viec execution cap nhan vien.',
    };
  }
  if (isRestaurantManagerRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'vận hành ca + labor cost + food cost + service quality + P&L nhà hàng',
      path: 'Quản lý ca nhà hàng -> Restaurant Manager -> F&B Ops / Area Manager',
      firstAction: 'đóng gói 4 KPI ca gần nhất: doanh thu/table turn, labor cost, food cost/waste, complaint recovery và feedback owner/GM',
      skills: ['Shift operations', 'Labor cost', 'Food cost', 'Service quality'],
      cvBullet: 'Chứng minh năng lực quản lý nhà hàng bằng KPI ca, roster, food/labor cost, service quality và complaint recovery thay vì skill bếp hay recipe.',
    };
  }
  if (isRestaurantFrontlineRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'POS/order accuracy + table service SOP + upsell + complaint handling',
      path: 'Phục vụ/thu ngân -> Senior service/cashier -> Ca trưởng sàn nhà hàng',
      firstAction: 'lap log 10 bill/ban: order dung, bill khong loi, upsell neu co, complaint va feedback quan ly ca',
      skills: ['POS/order accuracy', 'Table service SOP', 'Upsell', 'Shift handover'],
      cvBullet: 'Chung minh nang luc phuc vu/thu ngan bang so bill/ca, order dung, upsell, handover va feedback quan ly ca theo dung level frontline.',
    };
  }
  if (isHotelManagerRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'occupancy + ADR/RevPAR + staffing SLA + guest experience + P&L khach san',
      path: 'Hotel/Front Office Manager -> Operations Manager -> GM / Multi-property Ops',
      firstAction: 'dong goi dashboard 1 trang: occupancy, ADR, RevPAR, review score, complaint SLA, staffing va 3 hanh dong toi uu thang nay',
      skills: ['Occupancy/ADR/RevPAR', 'Staffing SLA', 'Guest experience', 'P&L/budget'],
      cvBullet: 'Chung minh vai tro quan ly khach san bang occupancy, ADR/RevPAR, review score, complaint recovery, staffing va P&L/budget.',
    };
  }
  if (isHotelFrontlineRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'check-in/check-out SOP + PMS accuracy + guest request SLA + complaint recovery',
      path: 'Le tan/guest service -> Senior Front Desk -> Front Office Supervisor',
      firstAction: 'lap log 10 ca/check-in: booking dung tren PMS, thoi gian xu ly request, upsell neu co, complaint va feedback khach/quan ly',
      skills: ['PMS accuracy', 'Check-in SOP', 'Guest request SLA', 'Complaint recovery'],
      cvBullet: 'Chung minh nang luc le tan/front desk bang PMS accuracy, request SLA, upsell, handover va complaint recovery theo dung level frontline.',
    };
  }
  const tourismProfile = getTourismRoleProfile(jobTitle, industry);
  if (tourismProfile) {
    return { roleLabel, ...tourismProfile.preview };
  }
  const skilledTrade = getSkilledTradeProfile(jobTitle, industry);
  if (skilledTrade) {
    return { roleLabel, ...skilledTrade.preview };
  }
  if (isVeterinaryRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'animal triage + vaccination/deworming + surgery safety + owner communication',
      path: 'Bac si thu y -> Senior Veterinarian / Pet clinic lead / Veterinary hospital track',
      firstAction: 'dong goi 5 ca thu y da an thong tin: loai vat nuoi, trieu chung, chan doan, phac do, vaccination/deworming neu co, follow-up va feedback chu nuoi',
      skills: ['Animal triage', 'Vaccination/deworming', 'Surgery/anesthesia safety', 'Owner communication'],
      cvBullet: 'Chung minh nang luc bac si thu y bang case thu cung/chan nuoi da an thong tin, phac do dieu tri, an toan thu thuat, follow-up va feedback chu nuoi; khong viet nhu bac si dieu tri nguoi.',
    };
  }
  if (isNutritionRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'nutrition assessment + meal plan + behavior counseling + follow-up metrics',
      path: 'Chuyen vien dinh duong -> Senior Nutritionist / Dietitian / Wellness program lead',
      firstAction: 'dong goi 5 ca tu van dinh duong da an thong tin: muc tieu, khau phan hien tai, meal plan, rui ro/benh ly lien quan, chi so theo doi va ket qua follow-up',
      skills: ['Nutrition assessment', 'Meal planning', 'Diet counseling', 'Follow-up metrics'],
      cvBullet: 'Chung minh nang luc dinh duong bang case meal plan da an thong tin, thay doi khau phan, adherence, chi so truoc-sau va feedback khach/nguoi duoc tu van; khong viet nhu bac si lam sang chung.',
    };
  }
  if (isInsuranceRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'underwriting risk + claims/boi thuong + policy wording + broker/client renewal',
      path: 'Chuyen vien bao hiem phi nhan tho -> Underwriter / Claims Specialist / Account Executive / Risk Surveyor',
      firstAction: 'dong goi 5 case bao hiem da an thong tin: loai nghiep vu, rui ro, dieu khoan/coverage, premium/loss ratio neu co, claim/boi thuong hoac renewal outcome',
      skills: ['Underwriting risk', 'Claims handling', 'Policy wording', 'Renewal/account management'],
      cvBullet: 'Chung minh nang luc bao hiem phi nhan tho bang case underwriting/claims/renewal da an thong tin, dieu khoan hop dong, loss ratio, SLA boi thuong va feedback broker/khach hang; khong viet nhu nhom lap bao cao tai chinh noi bo.',
    };
  }
  if (isDentalRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'chan doan nha khoa + treatment plan + vo khuan + case lam sang an danh',
      path: 'Nha si tong quat -> Nha si chuyen sau/clinic premium -> Lead Dentist / Clinical Director',
      firstAction: 'dong goi 3 case nha khoa da an danh: chan doan, phim/anh trong mieng neu duoc phep, ke hoach dieu tri, protocol vo khuan, tai kham va feedback benh nhan',
      skills: ['Diagnosis/treatment plan', 'Infection control', 'Dental case evidence', 'Patient communication'],
      cvBullet: 'Chung minh nang luc nha si bang case dieu tri an danh, treatment plan, vo khuan, follow-up tai kham va feedback benh nhan, khong dung skill van phong generic.',
    };
  }
  if (isDentalAssistantRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'chuan bi ghe + infection control + ho tro thu thuat + follow-up benh nhan',
      path: 'Tro ly nha khoa -> Senior Dental Assistant -> Dieu phoi phong thu thuat',
      firstAction: 'lam checklist 1 ca nha khoa: chuan bi ghe, dung cu, vo khuan, suction/chuyen dung cu, huong dan sau dieu tri, lich tai kham va feedback bac si',
      skills: ['Chairside assisting', 'Infection control', 'Patient instruction', 'Supply/appointment log'],
      cvBullet: 'Chung minh nang luc phu ta nha khoa bang checklist ghe/dung cu, vo khuan, ho tro thu thuat, follow-up tai kham va feedback bac si.',
    };
  }
  if (isNetworkOperationsRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'NOC monitoring + incident triage + network troubleshooting + SLA uptime',
      path: 'NOC/Network Support -> Network Operations Engineer -> Network Lead',
      firstAction: 'dong goi 10 ticket/su co mang da xu ly: alert, root cause, log/topology, action, escalation, SLA va bai hoc sau incident',
      skills: ['NOC monitoring', 'Incident triage', 'Network troubleshooting', 'SLA/uptime'],
      cvBullet: 'Chung minh vai tro NOC/network bang ticket, log su co, change window, SLA uptime va post-incident review; khong map sang logistics hay kho van.',
    };
  }
  if (isTelecomInfrastructureRole(jobTitle, industry)) {
    return {
      roleLabel,
      coreSkill: 'telecom/fiber field ops + acceptance test + incident handling + maintenance SLA',
      path: 'Telecom technician -> Senior fiber/telecom engineer -> Field Operations Lead',
      firstAction: 'dong goi 3-5 ca trien khai/bao tri: khao sat tuyen, ban ve/ODF, do kiem suy hao, bien ban nghiem thu, su co va SLA khac phuc',
      skills: ['Fiber/telecom field ops', 'Acceptance test', 'Incident handling', 'Maintenance SLA'],
      cvBullet: 'Chung minh nang luc vien thong bang ho so tuyen/tram, OTDR/suy hao, nghiem thu, SLA bao tri va an toan hien truong; khong dung ngon ngu kho/logistics.',
    };
  }
  if (segment === 'education_admissions') {
    const studyAbroad = isStudyAbroadAdmissionsRole(jobTitle, industry);
    return {
      roleLabel,
      coreSkill: studyAbroad
        ? 'study abroad counseling + hồ sơ trường/visa + CRM follow-up + conversion'
        : 'enrollment counseling + tư vấn chương trình học + CRM follow-up + conversion nhập học',
      path: studyAbroad
        ? 'Tư vấn du học → Senior Counselor → Admissions/Student Recruitment Lead'
        : 'Tư vấn tuyển sinh → Senior Enrollment Counselor → Admissions/Student Recruitment Lead',
      firstAction: studyAbroad
        ? 'đóng gói 20 hồ sơ đã tư vấn thành tracker: nhu cầu, ngân sách, trường phù hợp, checklist giấy tờ, trạng thái offer/visa và next step'
        : 'đóng gói 20 lead đã tư vấn thành tracker: nguồn lead, nhu cầu học, học phí/ngân sách, chương trình phù hợp, lịch tư vấn/placement test, trạng thái đăng ký-đóng phí-nhập học và next step',
      skills: studyAbroad
        ? ['Study abroad counseling', 'Visa checklist', 'CRM follow-up', 'Offer/visa outcome']
        : ['Enrollment counseling', 'Program fit', 'CRM follow-up', 'Payment/enrollment conversion'],
      cvBullet: studyAbroad
        ? 'Chứng minh năng lực bằng funnel tư vấn, tỷ lệ nộp hồ sơ, offer/visa outcome, SLA follow-up và feedback khách theo đúng nghề admissions.'
        : 'Chứng minh năng lực bằng funnel tuyển sinh, lịch tư vấn, placement test/đăng ký, tỷ lệ đóng phí-nhập học, SLA follow-up và feedback khách.',
      };
  }
  if (isPublicSubjectTeacherRole(jobTitle, industry) || (segment === 'education' && !isEnglishTeacherRole(jobTitle, industry))) {
    return {
      roleLabel,
      coreSkill: 'giáo án bộ môn + ma trận đề/rubric + tiến bộ điểm số học sinh + hồ sơ chuyên môn',
      path: 'Giáo viên bộ môn -> Giáo viên nòng cốt/Tổ phó chuyên môn -> Tổ trưởng chuyên môn',
      firstAction: 'đóng gói 1 chương/bài đang dạy: giáo án bộ môn, ma trận đề, rubric chấm bài, điểm trước-sau, bài học sinh và nhận xét của tổ chuyên môn',
      skills: ['Giáo án bộ môn', 'Ma trận đề/rubric', 'Tiến bộ học sinh', 'Hồ sơ chuyên môn'],
      cvBullet: 'Chứng minh năng lực giáo viên bộ môn bằng tiến bộ điểm số, ma trận đề, rubric, hồ sơ chuyên môn và chuyên đề tổ đúng track trường học.',
    };
  }
  const specializedManagerLanguage = getSpecializedManagerLanguage(jobTitle, industry);
  if (specializedManagerLanguage) {
    const specializedManagerSkills = getSpecializedManagerSkillLabels(jobTitle, industry)?.labels || specializedManagerLanguage.mainSkill.split('+').map(s => s.trim()).slice(0, 4);
    return {
      roleLabel,
      coreSkill: specializedManagerLanguage.mainSkill,
      path: specializedManagerLanguage.rolePath,
      firstAction: `dong goi bang chung quan ly: ${specializedManagerLanguage.proofAsset}`,
      skills: specializedManagerSkills.slice(0, 4),
      cvBullet: `Chung minh bang ${specializedManagerLanguage.proofAsset}; khong viet nhu nhan vien execution thong thuong.`,
    };
  }
  const previews: Partial<Record<RoleSegment, Omit<PremiumRolePreview, 'roleLabel'>>> = {
    photography: {
      coreSkill: 'retouching cao cấp + ánh sáng thương mại + deal B2B',
      path: 'Photographer đại trà → Photographer ngách → Brand/Commercial Photographer',
      firstAction: 'đóng gói 10-15 ảnh đã retouch, lighting diagram, moodboard và rate card theo gói',
      skills: ['Retouching', 'Lighting', 'B2B deal', 'Hybrid video'],
      cvBullet: 'Chứng minh portfolio ngách, ảnh trước/sau retouch, setup ánh sáng và case brand thay vì chỉ ghi “chụp ảnh đẹp”.',
    },
    blue_collar: {
      coreSkill: 'tay nghề máy + báo giá + QC + kênh đơn custom',
      path: 'Thợ phụ → Thợ chính có máy/ngách → Workshop/B2B supplier',
      firstAction: 'quay 10 video quy trình, lập bảng giá theo vật tư/công/biên lợi nhuận và checklist QC',
      skills: ['Máy nghề', 'Báo giá', 'QC', 'TikTok/IG'],
      cvBullet: 'Chứng minh tay nghề bằng video quy trình, đơn custom, QC thành phẩm và khả năng giao đúng hẹn.',
    },
    fnb: {
      coreSkill: 'food cost + tốc độ ra món + chất lượng giờ cao điểm',
      path: 'Đầu bếp → Ca trưởng/Sous Chef → Bếp trưởng/Kitchen Manager',
      firstAction: 'đóng gói số food cost, waste rate, tốc độ ra món, rating khách và checklist SOP bếp',
      skills: ['Food cost', 'Waste rate', 'Kitchen SOP', 'Training phụ bếp'],
      cvBullet: 'Chứng minh food cost, waste, tốc độ ra món, chất lượng món và khả năng giữ chuẩn ca đông.',
    },
    events: {
      coreSkill: 'showreel + kịch bản sân khấu + xử lý tình huống live',
      path: 'MC phổ thông → MC corporate/activation/livestream có showreel và rate card',
      firstAction: 'tạo showreel 60-90 giây, 3 mẫu lời dẫn, feedback khách/agency và rate card',
      skills: ['Showreel', 'Lời dẫn', 'Xử lý live', 'Rate card'],
      cvBullet: 'Chứng minh số show, format sự kiện, feedback khách/agency và khả năng giữ timeline.',
    },
    pilot: {
      coreSkill: 'flight safety + SOP + type rating/recurrent training + cockpit CRM/ATC',
      path: 'First Officer -> Captain upgrade -> Training Captain / Check Pilot',
      firstAction: 'dong goi logbook/flight hours, type rating, recurrent/simulator check, SOP safety record va route-aircraft qualification',
      skills: ['Flight SOP', 'Type rating', 'Simulator check', 'ATC/CRM'],
      cvBullet: 'Chung minh bang flight hours/logbook, recurrent check, SOP safety record, CRM/ATC feedback va route-aircraft qualification; khong tron sang ngon ngu tiep vien.',
    },
    aviation: {
      coreSkill: 'an toàn bay + service recovery + tiếng Anh cabin + feedback senior crew',
      path: 'Cabin crew → Senior Cabin Crew / Purser / tuyến quốc tế',
      firstAction: 'lưu tình huống phục vụ thật, checklist safety-service, feedback senior crew và chứng chỉ training',
      skills: ['Cabin safety', 'Service recovery', 'Announcement', 'Teamwork'],
      cvBullet: 'Chứng minh chuẩn an toàn, xử lý khách khó, feedback senior crew và khả năng phục vụ tuyến khó.',
    },
    school_leadership: {
      coreSkill: 'quản trị trường học + hồ sơ bổ nhiệm/phụ cấp + chất lượng học thuật + phụ huynh',
      path: 'Hiệu phó/Hiệu trưởng → Head of School / School Director / quản lý cụm trường phù hợp bối cảnh',
      firstAction: 'tách rõ công lập hay tư thục, rồi đóng gói dashboard chất lượng, hồ sơ thi đua/bổ nhiệm hoặc retention/tuyển sinh',
      skills: ['School governance', 'Quality dashboard', 'Parent SLA', 'Enrollment/retention'],
      cvBullet: 'Chứng minh chất lượng nhà trường, phụ huynh, giáo viên, hồ sơ bổ nhiệm/phụ cấp hoặc tăng trưởng tuyển sinh thay vì tự hạ xuống track giáo viên.',
    },
    education: {
      coreSkill: 'giáo án bộ môn + ma trận đề/rubric + tiến bộ điểm số học sinh + hồ sơ chuyên môn',
      path: 'Giáo viên bộ môn → Giáo viên nòng cốt / Tổ phó chuyên môn → Tổ trưởng chuyên môn',
      firstAction: 'đóng gói 1 chương/bài thành giáo án bộ môn, ma trận đề, rubric, điểm trước-sau, bài học sinh đã ẩn danh và xác nhận dự giờ/góp ý',
      skills: ['Giáo án bộ môn', 'Ma trận đề', 'Rubric', 'Tiến bộ học sinh'],
      cvBullet: 'Chứng minh tiến bộ học sinh, ma trận đề, rubric, hồ sơ chuyên môn và chuyên đề tổ thay vì tự rẽ sang track trung tâm ngoại ngữ.',
    },
    freelance_teaching: {
      coreSkill: 'AI lesson plan + online course + retention học viên',
      path: 'Gia sư/dạy lẻ → Gói học outcome → Cohort/khóa online',
      firstAction: 'đóng gói gói học có test đầu vào, video, workbook, quiz và lịch feedback',
      skills: ['AI giáo án', 'Online course', 'Retention', 'Outcome package'],
      cvBullet: 'Chứng minh kết quả học viên, completion, testimonial và renewal/referral thay vì bán giờ dạy lẻ.',
    },
    language_center: {
      coreSkill: 'enrollment funnel + retention + teacher utilization',
      path: 'Vận hành trung tâm → Center Manager / Academic Operations / Growth giáo dục',
      firstAction: 'đóng gói active students, trial-to-paid, retention, class fill rate và complaint SLA',
      skills: ['Enrollment', 'Retention', 'Class fill', 'Teacher utilization'],
      cvBullet: 'Chứng minh tăng enrollment/retention, giảm complaint và tối ưu lịch giáo viên.',
    },
    general: {
      coreSkill: '1 kỹ năng nghề có output đo được',
      path: 'Làm theo mô tả công việc → người có portfolio, KPI và case study',
      firstAction: 'biến 1 việc đang làm thành file, dashboard, quy trình, video hoặc case study',
      skills: ['KPI nghề', 'Case study', 'CV/LinkedIn', 'Deal script'],
      cvBullet: 'Viết lại kinh nghiệm theo format: kỹ năng + sản phẩm + kết quả đo được.',
    },
  };

  const fallback = previews.general!;
  const preview = previews[segment] || languageBySegment[segment] && {
    coreSkill: languageBySegment[segment].mainSkill,
    path: languageBySegment[segment].rolePath,
    firstAction: `đóng gói bằng chứng: ${languageBySegment[segment].proofAsset}`,
    skills: languageBySegment[segment].mainSkill.split('+').map(s => s.trim()).slice(0, 4),
    cvBullet: `Chứng minh bằng ${languageBySegment[segment].proofAsset}, không mô tả công việc chung chung.`,
  } || fallback;

  return { roleLabel, ...preview };
}

export function getPremiumRolePreviewForRole(jobTitle: string, industry?: string | null): PremiumRolePreview {
  const exactProfile = shouldUseExactRoleProfiles() ? getExactRoleProfile(jobTitle, industry) : null;
  if (exactProfile?.preview) {
    return repairMojibakeDeep({
      roleLabel: jobTitle.trim() || exactProfile.title,
      ...exactProfile.preview,
    });
  }
  return repairMojibakeDeep(buildPremiumRolePreviewForRole(jobTitle, industry));
}

export const languageBySegment: Partial<Record<RoleSegment, RoleLanguage>> = {
  photography: {
    rolePath: 'Photographer ngách / Commercial Photographer / Brand retainer / DOP hybrid',
    mainSkill: 'retouching cao cấp + set ánh sáng thương mại + portfolio ngách + chốt deal B2B',
    proofAsset: 'portfolio 10-15 ảnh cùng ngách, ảnh trước-sau retouch, lighting diagram, moodboard, rate card và feedback/brief khách',
    opportunityList: 'brand, agency, studio, production house, F&B/fashion/product/real estate, wedding premium hoặc retainer dài hạn',
    portfolioWord: 'photography portfolio',
    productWord: 'case ảnh thương mại',
    kpiGuidance: 'KPI nhiếp ảnh: số job đúng ngách, tỷ lệ khách chốt, average fee/job, số ảnh được duyệt, thời gian bàn giao, feedback khách và retainer ký được.',
  },
  it: {
    rolePath: 'Owner của feature/module có số đo hoặc role product/platform/remote',
    mainSkill: 'project ownership + system/debugging + impact bằng số',
    proofAsset: 'case study feature/fix: vấn đề, giải pháp, latency/lỗi/thời gian giảm, link hoặc ảnh minh chứng',
    opportunityList: 'product company, platform team, fintech, SaaS, remote/APAC hoặc team có ownership rõ',
    portfolioWord: 'engineering portfolio',
    productWord: 'case kỹ thuật',
    kpiGuidance: 'KPI công nghệ: latency, bug rate, uptime, cycle time, số user/ticket, cost saving, test coverage hoặc conversion.',
  },
  finance: {
    rolePath: 'Finance Analyst / RM / Risk / Investment hoặc fintech/MNC finance role',
    mainSkill: 'financial modeling + risk/compliance + dashboard quyết định',
    proofAsset: 'financial model, credit/investment memo, portfolio/risk dashboard hoặc báo cáo tự động hóa',
    opportunityList: 'ngân hàng, bảo hiểm, chứng khoán, fintech, MNC finance hoặc risk/compliance team',
    portfolioWord: 'finance portfolio',
    productWord: 'mô hình/báo cáo tài chính',
    kpiGuidance: 'KPI tài chính: forecast accuracy, risk exposure, approval SLA, portfolio performance, reporting time saved và compliance findings.',
  },
  accounting: {
    rolePath: 'Senior Accountant / Chief Accountant / Controller track',
    mainSkill: 'closing đúng hạn + tax/compliance + automation báo cáo',
    proofAsset: 'closing checklist, reconciliation log, tax filing proof, audit trail hoặc file Power Query tự động hóa',
    opportunityList: 'MNC, fintech, công ty có ERP, audit/tax advisory hoặc controller track',
    portfolioWord: 'hồ sơ kế toán',
    productWord: 'bằng chứng kiểm soát số liệu',
    kpiGuidance: 'KPI kế toán: ngày closing, số lỗi điều chỉnh, audit finding, thời gian báo cáo giảm, tax compliance và SLA thanh toán.',
  },
  sales: {
    rolePath: 'B2B Sales / Key Account / Enterprise Sales / Sales Manager',
    mainSkill: 'pipeline CRM + proposal + conversion rate + forecast',
    proofAsset: 'tracker lead-to-meeting-to-close, proposal thắng deal, doanh số/ticket size và forecast accuracy',
    opportunityList: 'B2B, SaaS, FMCG, key account, enterprise sales hoặc sales supervisor/manager',
    portfolioWord: 'sales brag book',
    productWord: 'bằng chứng doanh số',
    kpiGuidance: 'KPI sales: quota attainment, conversion từng stage, ticket size, pipeline value, win rate, sales cycle và retention account.',
  },
  marketing: {
    rolePath: 'Performance/Growth/Product Marketing hoặc Brand owner có revenue impact',
    mainSkill: 'analytics + creative testing + attribution + go-to-market',
    proofAsset: 'campaign case study có spend, CTR, CVR, lead/revenue, CAC/ROAS và insight sau test',
    opportunityList: 'performance marketing, growth, product marketing, brand manager, trade marketing hoặc CMO track',
    portfolioWord: 'marketing portfolio',
    productWord: 'case campaign',
    kpiGuidance: 'KPI marketing: CTR, CVR, CAC, ROAS, qualified leads, pipeline, retention, revenue attribution và brand lift nếu có.',
  },
  design: {
    rolePath: 'Product Designer / Brand Designer / Motion/Creative Lead có case study đo impact',
    mainSkill: 'portfolio case study + design system/workflow + business metric',
    proofAsset: 'case study có brief, process, before-after, metric, prototype/file Figma/video và feedback stakeholder',
    opportunityList: 'product team, agency premium, brand studio, motion/video team hoặc remote design role',
    portfolioWord: 'design portfolio',
    productWord: 'case design',
    kpiGuidance: 'KPI design: conversion, task success, time-to-design, brand consistency, engagement, asset reuse và stakeholder approval.',
  },
  healthcare: {
    rolePath: 'Chuyên khoa / phòng khám tư / healthtech / quản lý y tế',
    mainSkill: 'clinical protocol + patient communication + case evidence ẩn danh',
    proofAsset: 'case lâm sàng đã ẩn danh, checklist an toàn, chứng chỉ chuyên khoa, feedback bệnh nhân hoặc protocol cải tiến',
    opportunityList: 'bệnh viện tư, phòng khám quốc tế, healthtech, pharma/medtech advisory hoặc quản lý y tế',
    portfolioWord: 'hồ sơ chuyên môn y tế',
    productWord: 'bằng chứng lâm sàng',
    kpiGuidance: 'KPI y tế: patient outcome, safety checklist, turnaround time, satisfaction, protocol adherence và số ca/kỹ thuật được xác nhận.',
  },
  hr: {
    rolePath: 'Talent Acquisition / C&B / L&D / HRBP / People Operations có KPI rõ',
    mainSkill: 'HR funnel + onboarding/training + retention dashboard',
    proofAsset: 'funnel tuyển dụng, time-to-fill, onboarding checklist, training feedback, C&B benchmark hoặc HR dashboard',
    opportunityList: 'team HR có KPI rõ, agency tuyển dụng, công ty tăng trưởng, L&D/C&B/HRBP hoặc people ops',
    portfolioWord: 'HR portfolio',
    productWord: 'case nhân sự',
    kpiGuidance: 'KPI HR: time-to-fill, offer acceptance, quality of hire, onboarding completion, training score, retention/churn và SLA nhân sự.',
  },
  legal: {
    rolePath: 'Legal Counsel / Compliance / Contract Manager / Legal Manager',
    mainSkill: 'contract review + risk memo + compliance checklist',
    proofAsset: 'mẫu risk memo đã ẩn thông tin, checklist hợp đồng, case xử lý tranh chấp/compliance và khuyến nghị cho business',
    opportunityList: 'in-house legal, compliance, fintech/bảo hiểm/ngân hàng, bất động sản, consulting hoặc law firm',
    portfolioWord: 'legal portfolio',
    productWord: 'bằng chứng pháp lý',
    kpiGuidance: 'KPI pháp lý: SLA rà hợp đồng, rủi ro giảm, số case xử lý, compliance finding, dispute outcome và stakeholder satisfaction.',
  },
  logistics: {
    rolePath: 'Logistics Coordinator / Forwarder / Warehouse Lead / Supply Chain Planner',
    mainSkill: 'shipment tracking + docs accuracy + exception handling + cost control',
    proofAsset: 'tracker shipment, bộ chứng từ sạch, case xử lý delay/customs, OTIF và cost per shipment',
    opportunityList: 'forwarder, xuất nhập khẩu, kho vận, supply chain, planner, purchasing hoặc logistics lead',
    portfolioWord: 'logistics portfolio',
    productWord: 'bằng chứng vận hành logistics',
    kpiGuidance: 'KPI logistics: OTIF, lead time, docs error rate, demurrage/detention, cost per shipment, inventory accuracy và exception resolution.',
  },
  engineering: {
    rolePath: 'Senior Engineer / Process/QA/Automation / Plant/Operations track',
    mainSkill: 'OEE + RCA + Lean/Six Sigma + automation/process improvement',
    proofAsset: 'A3/RCA report, before-after lỗi/năng suất, SOP, training material hoặc dashboard line',
    opportunityList: 'FDI/MNC, nhà máy có Lean, automation, QA/QC, process, maintenance hoặc plant operations',
    portfolioWord: 'engineering portfolio',
    productWord: 'case cải tiến kỹ thuật',
    kpiGuidance: 'KPI kỹ thuật/sản xuất: OEE, defect rate, downtime, yield, cycle time, safety incidents, cost saving và training completion.',
  },
  construction: {
    rolePath: 'Site Engineer / QS / BIM / Project Manager / Construction Manager',
    mainSkill: 'tiến độ + BOQ/shop drawing + nghiệm thu + safety công trình',
    proofAsset: 'bộ hồ sơ công trình: tiến độ, BOQ, checklist nghiệm thu, ảnh hiện trường, issue log và biên bản bàn giao',
    opportunityList: 'nhà thầu, chủ đầu tư, QS/BIM, MEP, project management, real estate development',
    portfolioWord: 'hồ sơ công trình',
    productWord: 'bằng chứng dự án',
    kpiGuidance: 'KPI xây dựng: tiến độ, cost variance, nghiệm thu đạt, lỗi rework, safety, RFI/issue resolution và bàn giao đúng hạn.',
  },
  customer_service: {
    rolePath: 'Senior CS / CRM / Technical Support / Customer Success',
    mainSkill: 'CSAT/NPS + ticket SLA + escalation script + retention',
    proofAsset: 'ticket dashboard, case giữ khách, knowledge base, script xử lý complaint và feedback khách',
    opportunityList: 'CRM, customer success, technical support, dịch vụ khách hàng B2B hoặc team vận hành có SLA',
    portfolioWord: 'CS portfolio',
    productWord: 'case chăm sóc khách hàng',
    kpiGuidance: 'KPI CS: first response time, resolution time, CSAT/NPS, ticket backlog, escalation rate, retention và complaint recurrence.',
  },
  semiconductor: {
    rolePath: 'Semiconductor Engineer / Verification / Physical Design / Process track',
    mainSkill: 'EDA/tool flow + verification quality + timing/yield evidence',
    proofAsset: 'log tool flow, testbench/report đã ẩn thông tin, timing/yield issue, checklist review và bài học fix lỗi',
    opportunityList: 'fabless, OSAT, design house, R&D bán dẫn, vendor EDA hoặc team process/yield',
    portfolioWord: 'semiconductor portfolio',
    productWord: 'case kỹ thuật bán dẫn',
    kpiGuidance: 'KPI bán dẫn: coverage, defect/yield, timing closure, review finding, cycle time, script/tool reuse và số issue được fix.',
  },
  retail: {
    rolePath: 'Store Supervisor / Category / Retail Operations / Area track',
    mainSkill: 'doanh số theo ca + tồn kho + trưng bày + khách quay lại',
    proofAsset: 'bảng doanh số, conversion, tồn kho/shrinkage, ảnh trưng bày, feedback khách và checklist vận hành cửa hàng',
    opportunityList: 'chuỗi bán lẻ, siêu thị, category, retail ops, area supervisor hoặc merchandiser',
    portfolioWord: 'retail portfolio',
    productWord: 'case vận hành bán lẻ',
    kpiGuidance: 'KPI bán lẻ: sales per shift, conversion, basket size, stock accuracy, shrinkage, display compliance và repeat customer.',
  },
  real_estate: {
    rolePath: 'Sales/Leasing / Property Management / Project Development track',
    mainSkill: 'lead pipeline + pháp lý giao dịch + tour/chốt cọc + referral',
    proofAsset: 'tracker nguồn hàng/lead, case tour-chốt cọc, checklist pháp lý cơ bản, feedback khách và referral',
    opportunityList: 'sàn BĐS, chủ đầu tư, leasing, property management, valuation hoặc project development',
    portfolioWord: 'real estate portfolio',
    productWord: 'case giao dịch/tài sản',
    kpiGuidance: 'KPI BĐS: số lead đủ chuẩn, số tour, tỷ lệ chốt cọc, time-to-close, occupancy, collection, complaint và referral.',
  },
  media_content: {
    rolePath: 'Content Producer / Editor / Reporter / Translator / Media Lead',
    mainSkill: 'portfolio publish + audience retention + deadline + fact-check',
    proofAsset: 'link bài/clip đã publish, brief, metric view/retention/SEO, feedback biên tập và checklist fact-check',
    opportunityList: 'media, agency, brand content, production house, newsroom, localization hoặc creator team',
    portfolioWord: 'content portfolio',
    productWord: 'case nội dung',
    kpiGuidance: 'KPI content/media: view, retention, CTR, publish cadence, deadline hit rate, edit rounds, SEO rank và engagement chất lượng.',
  },
  pharma_chemical: {
    rolePath: 'QA/QC / Regulatory / R&D / Product Specialist pharma-chemical',
    mainSkill: 'GMP/GLP documentation + lab protocol + regulatory/product evidence',
    proofAsset: 'protocol test, deviation/CAPA, hồ sơ đăng ký sản phẩm, checklist GMP/GLP hoặc report R&D đã ẩn thông tin',
    opportunityList: 'dược, hóa chất, QA/QC, regulatory affairs, R&D, medical/product specialist hoặc nhà máy GMP',
    portfolioWord: 'pharma-chemical portfolio',
    productWord: 'bằng chứng QA/R&D/regulatory',
    kpiGuidance: 'KPI dược/hóa: batch pass rate, deviation/CAPA closure, testing turnaround, regulatory SLA, audit finding và documentation accuracy.',
  },
  school_leadership: {
    rolePath: 'Hiệu trưởng/Hiệu phó công lập hoặc Head of School / School Director tư thục-quốc tế',
    mainSkill: 'school governance + quality assurance + parent trust + teacher quality + enrollment/retention theo bối cảnh',
    proofAsset: 'dashboard chất lượng nhà trường, hồ sơ thi đua/bổ nhiệm/phụ cấp, parent SLA, teacher quality review, retention/tuyển sinh và báo cáo rủi ro học thuật',
    opportunityList: 'công lập: hồ sơ bổ nhiệm, phụ cấp, thi đua, chất lượng chuyên môn; tư thục/quốc tế: Head of School, School Director, Academic Quality Lead hoặc quản lý cụm trường',
    portfolioWord: 'school leadership dossier',
    productWord: 'bằng chứng quản trị trường học',
    kpiGuidance: 'KPI hiệu trưởng/hiệu phó: chất lượng học thuật, hồ sơ thi đua, an toàn trường học, parent satisfaction, teacher quality, retention/tuyển sinh và complaint SLA tùy công lập hay tư thục.',
  },
  education: {
    rolePath: 'Giáo viên bộ môn / Giáo viên nòng cốt / Tổ trưởng chuyên môn',
    mainSkill: 'giáo án bộ môn + ma trận đề/rubric + tiến bộ điểm số học sinh + hồ sơ chuyên môn',
    proofAsset: 'giáo án bộ môn, ma trận đề, rubric chấm bài, điểm trước/sau, bài làm học sinh đã ẩn danh, hồ sơ chuyên môn, chuyên đề tổ và xác nhận dự giờ/góp ý',
    opportunityList: 'công lập/biên chế: thi đua, phụ cấp, tổ chuyên môn, giáo viên cốt cán; tư thục/quốc tế: subject lead, academic quality hoặc trưởng bộ môn',
    portfolioWord: 'hồ sơ chuyên môn giáo viên bộ môn',
    productWord: 'bằng chứng tiến bộ học sinh',
    kpiGuidance: 'KPI giáo viên bộ môn: tiến bộ điểm số, tỷ lệ hoàn thành bài, kết quả kiểm tra, hồ sơ chuyên môn, dự giờ, phụ đạo/bồi dưỡng, chuyên đề tổ và phản hồi phụ huynh/tổ chuyên môn.',
  },
  freelance_teaching: {
    rolePath: 'Gia sư premium / Online course / Cohort / Academy nhỏ',
    mainSkill: 'gói học theo outcome + course asset + renewal/referral',
    proofAsset: 'test đầu vào, workbook/video/quiz, bảng tiến bộ học viên, testimonial và lịch renewal/referral',
    opportunityList: 'gia sư premium, lớp nhóm nhỏ, cohort online, khóa tự học có feedback hoặc academy niche',
    portfolioWord: 'portfolio giảng dạy tự do',
    productWord: 'bằng chứng outcome học viên',
    kpiGuidance: 'KPI dạy tự do: completion, điểm trước/sau, renewal, referral, attendance, testimonial và doanh thu mỗi học viên/khóa.',
  },
  language_center: {
    rolePath: 'IELTS/Cambridge Teacher / Academic Ops / Center Manager / Education Growth',
    mainSkill: 'trial-to-paid + retention + teacher utilization + learning outcome',
    proofAsset: 'dashboard active students, trial-to-paid, retention, class fill, teacher utilization, pre/post test và complaint SLA',
    opportunityList: 'trung tâm ngoại ngữ, IELTS/Cambridge, academic operations, curriculum, admissions hoặc growth giáo dục',
    portfolioWord: 'language center portfolio',
    productWord: 'case vận hành lớp/ngôn ngữ',
    kpiGuidance: 'KPI trung tâm ngoại ngữ: active students, trial-to-paid, class fill rate, retention, teacher utilization, renewal, complaint SLA và revenue per class.',
  },
  admin_office: {
    rolePath: 'Executive Assistant / Office Admin / ISO / Tender / Operations Coordinator',
    mainSkill: 'SOP văn phòng + SLA xử lý + hồ sơ/tài liệu không lỗi',
    proofAsset: 'SOP, tracker yêu cầu, lịch/hồ sơ/vendor, checklist ISO/đấu thầu và log lỗi giảm',
    opportunityList: 'EA, office admin, operations coordinator, ISO, procurement admin, tender specialist hoặc văn phòng MNC',
    portfolioWord: 'admin operations portfolio',
    productWord: 'bằng chứng vận hành văn phòng',
    kpiGuidance: 'KPI hành chính: SLA xử lý, lỗi hồ sơ, thời gian phê duyệt, vendor cost, số ticket nội bộ, audit/ISO finding và deadline hit rate.',
  },
  statistics_data: {
    rolePath: 'Reporting Analyst / Data Analyst / Planning & BI support',
    mainSkill: 'data quality + Excel/Power Query/BI dashboard + đối soát sai lệch + diễn giải insight',
    proofAsset: 'data dictionary, file dữ liệu đã làm sạch, pivot/dashboard, report định kỳ, log đối soát sai lệch và insight note 1 trang',
    opportunityList: 'phòng kế hoạch, vận hành, tài chính, HR, sales ops, giáo dục, y tế, retail hoặc team BI/reporting có dữ liệu định kỳ',
    portfolioWord: 'reporting/data portfolio',
    productWord: 'bằng chứng báo cáo dữ liệu',
    kpiGuidance: 'KPI thống kê dữ liệu: độ chính xác báo cáo, thời gian chốt báo cáo, data error rate, số dashboard được dùng, deadline báo cáo, số insight được quản lý áp dụng và số giờ xử lý thủ công giảm.',
  },
  procurement_supply: {
    rolePath: 'Procurement / Purchasing / Planner / Supply Planning',
    mainSkill: 'RFQ comparison + supplier SLA + cost saving + planning accuracy',
    proofAsset: 'bảng so sánh nhà cung cấp, RFQ/PO tracker, cost saving, supplier scorecard và forecast/planning accuracy',
    opportunityList: 'procurement, purchasing, supply planning, production planning, category buyer hoặc supply chain team',
    portfolioWord: 'procurement portfolio',
    productWord: 'case mua hàng/kế hoạch',
    kpiGuidance: 'KPI mua hàng/supply: cost saving, supplier OTIF, PO cycle time, forecast accuracy, stockout, excess inventory và contract SLA.',
  },
  blue_collar: {
    rolePath: 'Thợ chính / Thợ máy / Ngách custom premium / Workshop B2B',
    mainSkill: 'tay nghề máy + báo giá + QC thành phẩm + kênh đơn custom',
    proofAsset: 'video quy trình, ảnh trước/sau, bảng cost vật tư-công-biên lợi nhuận, checklist QC và feedback khách',
    opportunityList: 'xưởng custom, showroom, contractor, designer partnership, B2B supplier hoặc mở workshop nhỏ',
    portfolioWord: 'hồ sơ tay nghề',
    productWord: 'bằng chứng sản phẩm thủ công',
    kpiGuidance: 'KPI thợ tay nghề: số đơn đạt chuẩn, lỗi hoàn thiện, thời gian làm, biên lợi nhuận, khách quay lại, đúng hẹn và đơn B2B.',
  },
  environment_energy: {
    rolePath: 'Environmental Engineer / EHS / Energy Analyst / Compliance track',
    mainSkill: 'monitoring report + compliance permit + waste/water/energy KPI',
    proofAsset: 'báo cáo quan trắc, permit/audit trail, incident log, dashboard nước-thải-năng lượng và CAPA',
    opportunityList: 'môi trường, xử lý nước/thải, EHS, năng lượng tái tạo, ESG hoặc compliance công nghiệp',
    portfolioWord: 'environment-energy portfolio',
    productWord: 'case môi trường/năng lượng',
    kpiGuidance: 'KPI môi trường/năng lượng: compliance finding, incident rate, waste/water/energy cost, audit closure, monitoring SLA và emission/resource reduction.',
  },
  agriculture: {
    rolePath: 'Farm/QA/Technical Agriculture / Aquaculture / Agri Supply track',
    mainSkill: 'yield/FCR + QC nông-thủy sản + traceability + quy trình kỹ thuật',
    proofAsset: 'bảng yield/FCR/hao hụt, checklist QC, nhật ký mùa vụ/ao nuôi, ảnh sản phẩm và traceability/VietGAP nếu có',
    opportunityList: 'trang trại, thủy sản, agri-tech, QA nông sản, thu mua, kỹ thuật vùng hoặc xuất khẩu nông sản',
    portfolioWord: 'agri portfolio',
    productWord: 'case mùa vụ/sản lượng',
    kpiGuidance: 'KPI nông nghiệp/thủy sản: yield, FCR, mortality/hao hụt, defect rate, grading, traceability, cost per unit và delivery quality.',
  },
  research: {
    rolePath: 'Researcher / Data/Stats / Lab / Academic-Industry Research',
    mainSkill: 'research design + dataset/codebook + publication/report + applied insight',
    proofAsset: 'research brief, dataset/codebook, notebook, analysis output, poster/paper/report và feedback reviewer/stakeholder',
    opportunityList: 'viện/trường, lab, think tank, data/research team, R&D hoặc research consulting',
    portfolioWord: 'research portfolio',
    productWord: 'bằng chứng nghiên cứu',
    kpiGuidance: 'KPI nghiên cứu: study completed, data quality, analysis reproducibility, publication/report, grant/proposal, citation/adoption và stakeholder usefulness.',
  },
  consulting: {
    rolePath: 'Management/ERP/Tax/Strategy Consultant / Project Lead',
    mainSkill: 'problem structuring + client-ready slide + model + stakeholder workshop',
    proofAsset: 'case deck đã ẩn thông tin, issue tree, model giả định, workshop note, recommendation và outcome sau triển khai',
    opportunityList: 'consulting, ERP, tax advisory, strategy, transformation, PMO hoặc internal consultant',
    portfolioWord: 'consulting portfolio',
    productWord: 'case tư vấn',
    kpiGuidance: 'KPI tư vấn: deliverable accepted, timeline, client satisfaction, savings/revenue impact, adoption rate, workshop outcome và proposal win.',
  },
  pilot: {
    rolePath: 'First Officer / Captain / Training Captain / Check Pilot',
    mainSkill: 'flight safety + type rating/recurrent training + cockpit CRM/ATC + flight hours/logbook',
    proofAsset: 'logbook/flight hours summary, type rating/recurrent training certificates, simulator check records where shareable, safety/incident-free record, route/aircraft qualification and instructor/check feedback',
    opportunityList: 'airlines, charter/corporate aviation, cargo aviation, flight training center, captain upgrade track, check pilot or simulator instructor track',
    portfolioWord: 'pilot evidence file',
    productWord: 'bang chung flight deck',
    kpiGuidance: 'KPI pilot: flight hours, safety/incident-free record, recurrent check pass, simulator performance, SOP compliance, route/aircraft qualification, cockpit CRM and ATC communication feedback.',
  },
  aviation: {
    rolePath: 'Senior Cabin Crew / Purser / Cabin Trainer / International Route',
    mainSkill: 'safety-service + service recovery + announcement tiếng Anh + senior crew feedback',
    proofAsset: 'checklist cabin, ghi âm announcement, feedback senior crew, certificate training và case service recovery đã che dữ liệu khách',
    opportunityList: 'hãng bay, tuyến quốc tế, senior cabin crew, purser, ground service premium hoặc cabin trainer',
    portfolioWord: 'cabin crew portfolio',
    productWord: 'bằng chứng dịch vụ bay',
    kpiGuidance: 'KPI cabin crew: safety checklist, service recovery, complaint handled, grooming/teamwork feedback, announcement practice và route readiness.',
  },
  driver_delivery: {
    rolePath: 'Driver / Dispatcher / Fleet Ops / Delivery Lead',
    mainSkill: 'đúng giờ + an toàn + route/fuel optimization + CSKH giao nhận',
    proofAsset: 'log chuyến/đơn, đúng giờ, fuel/cost, incident-free record, rating khách và chứng chỉ/bằng lái phù hợp',
    opportunityList: 'fleet, logistics, delivery platform, container, dispatcher, transport coordinator hoặc lead tài xế',
    portfolioWord: 'driver-delivery portfolio',
    productWord: 'bằng chứng vận hành giao nhận',
    kpiGuidance: 'KPI tài xế/giao nhận: on-time, completion rate, incident rate, fuel cost, route efficiency, rating khách và số đơn/chuyến.',
  },
  hospitality: {
    rolePath: 'Hotel/Tour Service Operations dung theo chuc danh cu the',
    mainSkill: 'chat luong phuc vu + file booking/lich trinh khong loi + xu ly phat sinh + feedback khach',
    proofAsset: 'log ca/tour da an thong tin gom yeu cau khach, lich trinh/booking, phat sinh, cach xu ly, feedback va nguoi xac nhan',
    opportunityList: 'khach san, resort, cong ty tour, dieu hanh tour, booking, guest service hoac travel operations phu hop voi chuc danh',
    portfolioWord: 'hospitality portfolio',
    productWord: 'case dich vu khach/tour',
    kpiGuidance: 'KPI hospitality/tour service: dung lich, file khong loi, thoi gian phan hoi, phat sinh xu ly em, feedback khach, handover va so loi lap lai.',
  },
  fnb: {
    rolePath: 'Chef / Sous Chef / Kitchen Manager / F&B Operations',
    mainSkill: 'food cost + waste rate + tốc độ ra món + kitchen SOP',
    proofAsset: 'recipe card, cost sheet, waste log, ảnh plating, speed log, feedback khách và checklist training phụ bếp',
    opportunityList: 'chuỗi nhà hàng, khách sạn, catering, bếp trung tâm, kitchen manager hoặc F&B ops',
    portfolioWord: 'hồ sơ bếp',
    productWord: 'case vận hành bếp',
    kpiGuidance: 'KPI bếp/F&B: food cost, waste, ticket time, complaint/rating món, số suất/ca, plating consistency và training completion.',
  },
  beauty_spa: {
    rolePath: 'Senior Technician / Stylist / Spa Consultant / Salon Owner track',
    mainSkill: 'tay nghề dịch vụ + ảnh trước/sau + upsell liệu trình + khách quay lại',
    proofAsset: 'ảnh trước/sau, feedback khách, menu dịch vụ, tỷ lệ khách quay lại/referral và checklist vệ sinh/an toàn',
    opportunityList: 'spa, salon, thẩm mỹ, nail/hair/makeup premium, trainer hoặc mở studio nhỏ',
    portfolioWord: 'beauty portfolio',
    productWord: 'case dịch vụ làm đẹp',
    kpiGuidance: 'KPI beauty/spa: khách quay lại, upsell, referral, before-after accepted, complaint, hygiene checklist và doanh thu mỗi khách.',
  },
  security: {
    rolePath: 'Security Guard / Shift Lead / CCTV-Access Control / Site Supervisor',
    mainSkill: 'patrol checklist + incident report + CCTV/access control + PCCC',
    proofAsset: 'incident log, patrol checklist, shift handover, CCTV/access note, PCCC/sơ cứu certificate và feedback site manager',
    opportunityList: 'an ninh tòa nhà, nhà máy, trung tâm thương mại, supervisor ca, CCTV/control room hoặc safety-security team',
    portfolioWord: 'security portfolio',
    productWord: 'bằng chứng an ninh ca trực',
    kpiGuidance: 'KPI an ninh: incident response time, patrol completion, handover accuracy, access violation, PCCC drill và site feedback.',
  },
  cleaning: {
    rolePath: 'Cleaning Lead / Housekeeping / Facility Hygiene / Environmental Services',
    mainSkill: 'checklist khu vực + hóa chất/dụng cụ chuẩn + before-after + SLA sạch',
    proofAsset: 'ảnh before-after, checklist khu vực, log hóa chất/dụng cụ, feedback khách/nội bộ và lịch xử lý phát sinh',
    opportunityList: 'facility, housekeeping, cleaning service, bệnh viện/khách sạn, team lead vệ sinh hoặc giám sát ca',
    portfolioWord: 'cleaning portfolio',
    productWord: 'bằng chứng chất lượng vệ sinh',
    kpiGuidance: 'KPI vệ sinh: area completion, rework, complaint, audit cleanliness score, chemical safety, response time và before-after verified.',
  },
  events: {
    rolePath: 'MC / Host / Event Coordinator / Livestream-Brand Activation track',
    mainSkill: 'showreel + script + rehearsal + live issue handling + rate card',
    proofAsset: 'showreel 60-90 giây, mẫu lời dẫn, ảnh/link show, feedback khách/agency, rate card và case xử lý sự cố sân khấu',
    opportunityList: 'corporate event, wedding, activation, livestream commerce, talkshow, event producer hoặc brand host',
    portfolioWord: 'MC/event portfolio',
    productWord: 'bằng chứng sân khấu/sự kiện',
    kpiGuidance: 'KPI MC/sự kiện: số show, feedback khách, đúng timeline, booking lead, tỷ lệ chốt show, fee trung bình và sự cố xử lý êm.',
  },
  creator_entertainment: {
    rolePath: 'Creator / Performer / Producer / Brand Partnership track',
    mainSkill: 'content/IP portfolio + retention audience + brand deal + monetization funnel',
    proofAsset: 'content calendar, analytics retention, rate card, brand brief, community feedback và case campaign/booking',
    opportunityList: 'creator, production, brand partnership, entertainment agency, livestream, performer hoặc producer',
    portfolioWord: 'creator portfolio',
    productWord: 'case nội dung/biểu diễn',
    kpiGuidance: 'KPI creator/giải trí: retention, engagement quality, posting cadence, brand deal value, conversion, audience growth và repeat booking.',
  },
  sports_fitness: {
    rolePath: 'Personal Trainer / Coach / Fitness Manager / Program Owner',
    mainSkill: 'assessment đầu vào + giáo án tập + tracking tiến bộ + retention hội viên',
    proofAsset: 'assessment sheet, giáo án, before-after/testimonial, attendance, retention và feedback hội viên/học viên',
    opportunityList: 'gym, studio, PT premium, yoga, swimming, team sport, fitness manager hoặc online coaching',
    portfolioWord: 'fitness coaching portfolio',
    productWord: 'case tiến bộ học viên',
    kpiGuidance: 'KPI fitness: attendance, retention, body/skill progress, goal completion, testimonial, referral và revenue per client.',
  },
  business_owner: {
    rolePath: 'Chủ hộ kinh doanh / Online seller / Workshop owner / Founder nhỏ',
    mainSkill: 'P&L + sản phẩm chủ lực + kênh bán + SOP vận hành',
    proofAsset: 'P&L đơn giản, bảng biên lợi nhuận, funnel/kênh bán, repeat/referral, SOP vận hành và feedback khách',
    opportunityList: 'shop online/offline, xưởng nhỏ, F&B nhỏ, dịch vụ local, marketplace, B2B supplier hoặc micro-SaaS nếu phù hợp',
    portfolioWord: 'business owner dashboard',
    productWord: 'case kinh doanh',
    kpiGuidance: 'KPI chủ kinh doanh: gross margin, cash flow, repeat rate, CAC nếu có, conversion, inventory days, defect/complaint và doanh thu mỗi sản phẩm chủ lực.',
  },
  executive: {
    rolePath: 'Head/Director/C-level / General Manager / P&L Owner',
    mainSkill: 'P&L ownership + operating dashboard + org design + board/stakeholder communication',
    proofAsset: 'strategy memo, operating dashboard, OKR/P&L result, org chart, decision log và stakeholder update',
    opportunityList: 'director/head/GM, plant director, regional manager, startup leadership hoặc business unit owner',
    portfolioWord: 'executive portfolio',
    productWord: 'case điều hành',
    kpiGuidance: 'KPI executive: revenue/margin, EBITDA/cost, OKR completion, team retention, operating cadence, risk reduction và strategic milestone.',
  },
  fresh: {
    rolePath: 'chọn 1 role đầu đời phù hợp và có offer tốt hơn sau thử việc',
    mainSkill: 'đọc JD + mini project + feedback mentor + CV đúng role',
    proofAsset: 'bảng so sánh 3 role, 1 mini project, 3 feedback, CV theo role và tracker apply',
    opportunityList: 'role entry/junior, internship trả lương, trainee, apprenticeship hoặc việc đầu đời có mentor rõ',
    portfolioWord: 'entry portfolio',
    productWord: 'bằng chứng sẵn sàng đi làm',
    kpiGuidance: 'KPI người mới: số JD phân tích, mini project hoàn thành, feedback nhận được, CV gửi đúng role, response rate và bài test pass.',
  },
};

function buildRoleLanguage(jobTitle: string, industry?: string | null): RoleLanguage {
  if (isMarketingManagerRole(jobTitle, industry)) {
    return {
      rolePath: 'Brand Manager / Senior Brand Manager / Marketing Lead / Head of Marketing',
      mainSkill: 'brand positioning + consumer insight + campaign P&L + budget/media mix + brand health',
      proofAsset: 'brand/campaign case study co business objective, insight, positioning, budget, media mix, agency governance, brand health va business KPI',
      opportunityList: 'Senior Brand Manager, Marketing Lead, Category Manager, Product Marketing Manager, Head of Marketing hoac FMCG/MNC brand team',
      portfolioWord: 'brand manager evidence portfolio',
      productWord: 'brand growth case study',
      kpiGuidance: 'KPI Brand Manager: awareness, consideration, preference, market share/penetration, revenue uplift, campaign P&L, budget efficiency, ROAS/CAC neu co, brand health va launch performance.',
    };
  }
  if (isSchoolHealthcareRole(jobTitle, industry)) {
    return {
      rolePath: 'Nhân viên y tế trường học / School Nurse senior / điều phối an toàn sức khỏe học đường',
      mainSkill: 'sơ cứu học đường + quản lý hồ sơ sức khỏe học sinh + protocol sự cố + phối hợp phụ huynh-giáo viên',
      proofAsset: 'sổ theo dõi sức khỏe học sinh đã ẩn thông tin, checklist sơ cứu, log sự cố/thuốc/dị ứng, kế hoạch tiêm chủng-truyền nhiễm và feedback của nhà trường/phụ huynh',
      opportunityList: 'trường tư thục-quốc tế, phòng y tế học đường, đơn vị school health, phòng khám nhi hợp tác trường học hoặc điều phối an toàn sức khỏe học sinh',
      portfolioWord: 'hồ sơ y tế học đường',
      productWord: 'bằng chứng an toàn sức khỏe học sinh',
      kpiGuidance: 'KPI y tế học đường: thời gian phản ứng sự cố, số hồ sơ sức khỏe cập nhật đúng hạn, tỷ lệ checklist sơ cứu đạt, số ca theo dõi thuốc/dị ứng không lỗi, buổi truyền thông sức khỏe, tiêm chủng/bệnh truyền nhiễm và feedback nhà trường-phụ huynh.',
    };
  }
  const tourismProfile = getTourismRoleProfile(jobTitle, industry);
  if (tourismProfile) return tourismProfile.language;
  const skilledTrade = getSkilledTradeProfile(jobTitle, industry);
  if (skilledTrade) {
    const skillBank = skilledTrade.skills.join('; ');
    return {
      ...skilledTrade.language,
      mainSkill: `${skilledTrade.language.mainSkill} + ${skillBank}`,
      proofAsset: `${skilledTrade.language.proofAsset}; skill bank bat buoc: ${skillBank}`,
    };
  }
  if (isVeterinaryRole(jobTitle, industry)) {
    return {
      rolePath: 'Bac si thu y / Senior Veterinarian / Pet clinic lead / Veterinary hospital track',
      mainSkill: 'animal triage + diagnosis + vaccination/deworming + surgery/anesthesia safety + owner communication',
      proofAsset: '5-10 case thu y da an thong tin gom loai vat nuoi, trieu chung, chan doan, phac do, vaccination/deworming, xet nghiem/hinh anh neu co, follow-up va feedback chu nuoi',
      opportunityList: 'phong kham thu y, benh vien thu y, pet clinic premium, farm/livestock health, veterinary pharma/diagnostics hoac clinic lead',
      portfolioWord: 'veterinary clinical portfolio',
      productWord: 'case thu y da an thong tin',
      kpiGuidance: 'KPI thu y: so ca kham/dieu tri, vaccination/deworming completion, follow-up adherence, complication/revisit rate, surgery/anesthesia safety, owner satisfaction va ho so dieu tri dung.',
    };
  }
  if (isNutritionRole(jobTitle, industry)) {
    return {
      rolePath: 'Chuyen vien dinh duong / Senior Nutritionist / Dietitian / Wellness program lead',
      mainSkill: 'nutrition assessment + meal planning + diet counseling + behavior change follow-up + outcome tracking',
      proofAsset: '5-10 case tu van dinh duong da an thong tin gom muc tieu, khau phan hien tai, meal plan, rui ro/benh ly lien quan, adherence, chi so truoc-sau va feedback khach/nguoi duoc tu van',
      opportunityList: 'phong kham dinh duong, wellness center, gym/sports nutrition, hospital nutrition department, corporate wellness, food/health brand hoac online nutrition coaching',
      portfolioWord: 'nutrition counseling portfolio',
      productWord: 'case meal plan da an thong tin',
      kpiGuidance: 'KPI dinh duong: so ca tu van, adherence meal plan, thay doi can nang/BMI/vong eo, chi so duong huyet-lipid neu co, ty le follow-up, muc do hai long va ket qua hanh vi an uong.',
    };
  }
  if (isInsuranceRole(jobTitle, industry)) {
    return {
      rolePath: 'Chuyen vien bao hiem phi nhan tho / Underwriter / Claims Specialist / Broker Account / Risk Surveyor',
      mainSkill: 'underwriting risk assessment + claims/boi thuong + policy wording + renewal/account management + loss ratio thinking',
      proofAsset: '5-10 case bao hiem da an thong tin gom loai nghiep vu, rui ro duoc danh gia, coverage/dieu khoan loai tru, premium/loss ratio neu co, claim/boi thuong hoac renewal outcome va feedback broker/khach hang',
      opportunityList: 'cong ty bao hiem phi nhan tho, broker bao hiem, underwriting team, claims/boi thuong, risk survey, bancassurance/corporate account hoac product insurance team',
      portfolioWord: 'insurance case portfolio',
      productWord: 'case underwriting/claims/renewal da an thong tin',
      kpiGuidance: 'KPI bao hiem phi nhan tho: quote/underwriting SLA, renewal ratio, loss ratio, claim cycle time, claim accuracy, premium written, broker/client retention, compliance policy wording va so case rui ro duoc xu ly dung.',
    };
  }
  if (isDentalRole(jobTitle, industry)) {
    return {
      rolePath: 'Nha si tong quat / Nha si chuyen sau / Lead Dentist / Clinical Director',
      mainSkill: 'chan doan nha khoa + treatment plan + vo khuan an toan + case lam sang an danh + giao tiep benh nhan',
      proofAsset: '3-5 case nha khoa da an danh gom trieu chung, chan doan, phim/anh trong mieng neu duoc phep, ke hoach dieu tri, protocol vo khuan, tai kham va feedback benh nhan',
      opportunityList: 'phong kham nha khoa tu nhan, chuoi nha khoa, clinic premium, implant/orthodontic/endodontic track hoac clinical lead',
      portfolioWord: 'dental clinical portfolio',
      productWord: 'case dieu tri nha khoa an danh',
      kpiGuidance: 'KPI nha si: so case hoan tat, treatment plan accepted, patient satisfaction, complication/rework rate, follow-up adherence, infection-control checklist, chair time va feedback bac si phu trach/benh nhan.',
    };
  }
  if (isDentalAssistantRole(jobTitle, industry)) {
    return {
      rolePath: 'Dental Assistant / Senior Dental Assistant / Dieu phoi phong thu thuat nha khoa',
      mainSkill: 'chuan bi ghe + vo khuan dung cu + ho tro thu thuat + huong dan benh nhan + follow-up tai kham',
      proofAsset: 'checklist ca nha khoa gom chuan bi ghe, dung cu, vo khuan, suction/chuyen dung cu, huong dan sau dieu tri, lich tai kham, ton kho vat tu va feedback bac si',
      opportunityList: 'phong kham nha khoa, chuoi nha khoa, clinic premium, senior dental assistant hoac treatment room coordinator',
      portfolioWord: 'dental assistant portfolio',
      productWord: 'bang chung ho tro thu thuat nha khoa',
      kpiGuidance: 'KPI tro ly nha khoa: chair setup time, dung cu/vo khuan khong loi, ho tro thu thuat dung nhip, lich tai kham dung, ton kho vat tu, patient instruction va feedback bac si.',
    };
  }
  if (isNetworkOperationsRole(jobTitle, industry)) {
    return {
      rolePath: 'NOC / Network Operations Engineer / Network Lead track',
      mainSkill: 'NOC monitoring + incident triage + network troubleshooting + change control + SLA uptime',
      proofAsset: '10 ticket su co mang da an thong tin gom alert, log/topology, root cause, action, escalation, downtime/SLA, change window va post-incident review',
      opportunityList: 'NOC, ISP, data center, enterprise network, cloud/network operations, managed service hoac infrastructure operations team',
      portfolioWord: 'network operations portfolio',
      productWord: 'case su co mang va SLA uptime',
      kpiGuidance: 'KPI NOC/network: uptime, MTTA, MTTR, so incident lap lai, change success rate, ticket SLA, escalation quality va post-incident action closed.',
    };
  }
  if (isTelecomInfrastructureRole(jobTitle, industry)) {
    return {
      rolePath: 'Telecom Technician / Telecom Engineer / Fiber Field Operations Lead',
      mainSkill: 'khao sat tuyen/tram + lap dat cap quang/vien thong + do kiem nghiem thu + xu ly su co + maintenance SLA',
      proofAsset: 'ho so trien khai/bao tri da an thong tin gom tuyen/tram, ODF/splice neu co, ket qua do suy hao/OTDR, bien ban nghiem thu, incident log, thoi gian khac phuc va checklist an toan hien truong',
      opportunityList: 'ISP, nha mang, nha thau vien thong, fiber rollout, data center connectivity, field operations hoac telecom project team',
      portfolioWord: 'telecom field operations portfolio',
      productWord: 'case trien khai/bao tri vien thong',
      kpiGuidance: 'KPI vien thong/cap quang: ty le nghiem thu dat, thoi gian khac phuc su co, suy hao/loi lap lai, SLA bao tri, an toan hien truong, dung tien do va so ca handover khong loi.',
    };
  }
  if (isRestaurantManagerRole(jobTitle, industry)) {
    return {
      rolePath: 'Restaurant Manager / F&B Operations / Area Manager',
      mainSkill: 'vận hành ca + roster/labor cost + food cost/tồn kho + service quality + P&L nhà hàng',
      proofAsset: 'dashboard ca/tháng gồm doanh thu, table turn, labor cost, food cost/waste, complaint recovery, roster và feedback owner/GM',
      opportunityList: 'chuỗi nhà hàng, cafe chain, casual dining, hotel F&B, cloud kitchen ops, area manager hoặc F&B operations',
      portfolioWord: 'restaurant manager evidence portfolio',
      productWord: 'case vận hành nhà hàng',
      kpiGuidance: 'KPI quản lý nhà hàng: doanh thu ca, table turn, labor cost, food cost, waste, complaint recovery, review score, training completion và schedule adherence.',
    };
  }
  if (isRestaurantFrontlineRole(jobTitle, industry)) {
    return {
      rolePath: 'Senior Service/Cashier / Shift Lead / Floor Captain',
      mainSkill: 'POS/order accuracy + table service SOP + upsell + shift handover + complaint tai ban',
      proofAsset: 'log 10-20 bill/ban da an thong tin gom order dung, bill khong loi, upsell, complaint, handover va feedback quan ly ca',
      opportunityList: 'chuoi nha hang, cafe, casual dining, khach san F&B, role senior service/cashier lead hoac ca truong san',
      portfolioWord: 'restaurant frontline portfolio',
      productWord: 'bang chung phuc vu/thu ngan nha hang',
      kpiGuidance: 'KPI phuc vu/thu ngan nha hang: order accuracy, bill error rate, table turn support, upsell, complaint handled, on-time shift, handover va feedback quan ly ca.',
    };
  }
  if (isHotelManagerRole(jobTitle, industry)) {
    return {
      rolePath: 'Hotel Manager / Operations Manager / General Manager track',
      mainSkill: 'occupancy + ADR/RevPAR + staffing SLA + guest experience + SOP audit + P&L/budget',
      proofAsset: 'operating dashboard gom occupancy, ADR, RevPAR, review score, complaint SLA, staffing, cost/budget va action log theo thang',
      opportunityList: 'khach san, resort, serviced apartment, hospitality chain, front office manager, operations manager hoac GM track',
      portfolioWord: 'hotel manager evidence portfolio',
      productWord: 'case van hanh khach san',
      kpiGuidance: 'KPI quan ly khach san: occupancy, ADR, RevPAR, review score, response time, complaint recovery, staff schedule, SOP audit, OTA/revenue action va budget variance.',
    };
  }
  if (isHotelFrontlineRole(jobTitle, industry)) {
    return {
      rolePath: 'Senior Front Desk / Guest Service / Front Office Supervisor track',
      mainSkill: 'check-in/check-out SOP + PMS accuracy + guest request SLA + upsell + complaint recovery',
      proofAsset: 'log check-in/request da an thong tin gom booking/PMS accuracy, request SLA, upsell, complaint recovery, shift handover va feedback khach/quan ly',
      opportunityList: 'khach san, resort, serviced apartment, front office, reservation, guest relations hoac front office supervisor',
      portfolioWord: 'front desk portfolio',
      productWord: 'bang chung le tan khach san',
      kpiGuidance: 'KPI le tan/front desk: check-in time, PMS/booking accuracy, request SLA, upsell, complaint recovery, review mention, handover accuracy va feedback quan ly ca.',
    };
  }
  const specializedManagerLanguage = getSpecializedManagerLanguage(jobTitle, industry);
  if (specializedManagerLanguage) return specializedManagerLanguage;
  const segment = detectRoleSegment(jobTitle, industry);
  if (segment === 'education_admissions') return getEducationAdmissionsLabels(jobTitle, industry);
  return languageBySegment[segment] || {
    rolePath: 'role tốt hơn trong cùng nghề hoặc môi trường trả premium hơn',
    mainSkill: 'KPI nghề + bằng chứng output + case study + kịch bản deal/apply',
    proofAsset: 'file/link/ảnh chụp chứng minh kết quả, số liệu trước/sau và người xác nhận',
    opportunityList: 'công ty/trường/trung tâm/nhà máy/role có khả năng trả cao hơn',
    portfolioWord: 'portfolio',
    productWord: 'sản phẩm/bằng chứng',
    kpiGuidance: 'KPI sát vai trò: thời gian xử lý, lỗi giảm, chất lượng bàn giao, phản hồi khách/quản lý, doanh thu/lead nếu có và số output được xác nhận.',
  };
}

export function getRoleLanguage(jobTitle: string, industry?: string | null): RoleLanguage {
  const exactProfile = shouldUseExactRoleProfiles() ? getExactRoleProfile(jobTitle, industry) : null;
  if (exactProfile?.language) return repairMojibakeDeep(exactProfile.language);
  return repairMojibakeDeep(buildRoleLanguage(jobTitle, industry));
}


