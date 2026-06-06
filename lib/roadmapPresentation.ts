export function normalizeRoadmapText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

export function isDriverDeliveryRoadmapRole(value: string) {
  const text = normalizeRoadmapText(value);
  return /tai xe|taxi|xe om|shipper|giao hang|giao nhan|container|dispatcher|dieu phoi van tai|van tai|driver|delivery|courier|rider/.test(text);
}

export function isMarketingManagerRoadmapRole(value: string) {
  const text = normalizeRoadmapText(value);
  return /brand manager|marketing manager|marketing lead|head of marketing|brand lead|brand director|marketing director|category manager|trade marketing manager|product marketing manager|growth manager|campaign manager|quan ly marketing|truong phong marketing|giam doc marketing|quan ly thuong hieu|truong nhom marketing|truong nhom thuong hieu/.test(text);
}

export function isRestaurantManagerRoadmapRole(value: string) {
  const text = normalizeRoadmapText(value);
  return /quan ly nha hang|giam doc nha hang|restaurant manager|restaurant director|general manager nha hang|f&b manager|fnb manager|f&b director|food and beverage manager|floor manager nha hang|shift manager nha hang|cua hang truong nha hang/.test(text);
}

export function isRestaurantFrontlineRoadmapRole(value: string) {
  const text = normalizeRoadmapText(value);
  if (isRestaurantManagerRoadmapRole(text)) return false;
  return /nhan vien nha hang|le tan nha hang|phuc vu nha hang|nhan vien phuc vu ban|phuc vu ban|waiter|waitress|server nha hang|thu ngan nha hang|cashier nha hang|hostess nha hang|host nha hang/.test(text);
}

export function isHotelManagerRoadmapRole(value: string) {
  const text = normalizeRoadmapText(value);
  return /quan ly khach san|giam doc khach san|hotel manager|hotel director|general manager khach san|gm khach san|front office manager|rooms division manager|revenue manager.*khach san|operations manager.*khach san/.test(text);
}

export function isHotelFrontlineRoadmapRole(value: string) {
  const text = normalizeRoadmapText(value);
  if (isHotelManagerRoadmapRole(text)) return false;
  return /nhan vien khach san|le tan khach san|hotel receptionist|front desk|front office staff|guest service|dat phong khach san|reservation khach san|nhan vien dat phong khach san/.test(text);
}

export function isSpaRoadmapRole(value: string) {
  const text = normalizeRoadmapText(value);
  return /spa|massage|facial|cham soc da|tri lieu|lieu trinh|body treatment|body scrub|body wrap|aromatherapy|hot stone|deep tissue/.test(text);
}

export function spaSkillBank() {
  return [
    'Massage Swedish/deep tissue/hot stone',
    'Facial va cham soc da mat',
    'Body scrub/body wrap/aromatherapy',
    'Tu van lieu trinh va san pham spa',
    'Nhan dien chong chi dinh suc khoe',
    'Ve sinh thiet bi va phong tri lieu',
    'Dat lich va quan ly ca dieu tri',
    'Upsell lieu trinh va membership',
  ];
}

export function hasHousekeepingSkillLeakForSpaRole(role: string, value: string) {
  if (!isSpaRoadmapRole(role)) return false;
  const text = normalizeRoadmapText(value);
  return /housekeeping|buong phong|don phong|room attendant|room cleaning|checklist phong|check-out room|checkout room|amenities|minibar|laundry handover|lost & found|lost and found|room speed|pms|front desk|front office/.test(text);
}

export function isDentalRoadmapRole(value: string) {
  const text = normalizeRoadmapText(value);
  return /nha si|dentist|bac si nha khoa|nha khoa|rang ham mat|dental doctor|dental clinician|implant|chinh nha|orthodontic/.test(text) && !/tro ly nha khoa|phu ta nha khoa|dental assistant/.test(text);
}

export function isDentalAssistantRoadmapRole(value: string) {
  const text = normalizeRoadmapText(value);
  return /tro ly nha khoa|phu ta nha khoa|dental assistant|dental nurse/.test(text);
}

export function dentalSkillBank() {
  return [
    'Kham chan doan va treatment plan',
    'Ho so benh an nha khoa an danh',
    'Vo khuan va an toan thu thuat',
    'Tu van ca dieu tri cho benh nhan',
    'X-quang/CBCT va photo intraoral',
    'Theo doi dau, bien chung va tai kham',
    'Case restorative/endo/perio/implant',
    'Feedback benh nhan va bac si phu trach',
  ];
}

export function dentalAssistantSkillBank() {
  return [
    'Chuan bi ghe va bo dung cu',
    'Vo khuan dung cu va infection control',
    'Ho tro hut/suction va chuyen dung cu',
    'Chup phim/lay dau hieu theo chi dinh',
    'Huong dan benh nhan sau dieu tri',
    'Lich hen va follow-up tai kham',
    'Ton kho vat tu nha khoa',
    'Feedback bac si va dieu duong truong',
  ];
}

export function hasGenericSkillLeakForDentalRole(role: string, value: string) {
  if (!isDentalRoadmapRole(role) && !isDentalAssistantRoadmapRole(role)) return false;
  const text = normalizeRoadmapText(value);
  return /excel\/google sheets dashboard|canva\/powerpoint|viet cv|linkedin|tieng anh b2|portfolio ca nhan|quan ly viec bang checklist|power bi|python|tesol|celta|lesson plan|content calendar|edit video|photoshop/.test(text);
}

export function restaurantManagerSkillBank() {
  return [
    'Vận hành ca và điều phối sàn',
    'Roster nhân sự và labor cost',
    'Food cost, hao hụt và tồn kho',
    'Chất lượng dịch vụ và complaint recovery',
    'Table turn và doanh thu/bàn',
    'Training phục vụ/thu ngân theo SOP',
    'P&L nhà hàng cơ bản',
    'Dashboard ca cho owner/GM',
  ];
}

export function restaurantFrontlineSkillBank() {
  return [
    'POS/order accuracy',
    'Table service SOP',
    'Upsell combo/mon phu hop',
    'Xu ly complaint khach tai ban',
    'Shift handover va bill log',
    'Ve sinh khu vuc va an toan thuc pham',
    'Feedback khach va quan ly ca',
    'Ho so phuc vu/thu ngan co KPI',
  ];
}

export function hotelManagerSkillBank() {
  return [
    'Occupancy, ADR va RevPAR',
    'Roster nhan su va service SLA',
    'OTA/revenue coordination',
    'Guest experience va review score',
    'SOP audit cac bo phan',
    'Complaint escalation va recovery',
    'P&L/budget khach san co ban',
    'Operating dashboard cho owner/GM',
  ];
}

export function hotelFrontlineSkillBank() {
  return [
    'Check-in/check-out SOP',
    'PMS/booking accuracy',
    'Guest request SLA',
    'Upsell phong/dich vu phu hop',
    'Complaint recovery tai quaya',
    'Shift handover log',
    'Review score va feedback khach',
    'Ho so front desk/guest service co KPI',
  ];
}

export function hasKitchenSkillLeakForRestaurantNonChefRole(role: string, value: string) {
  if (!isRestaurantManagerRoadmapRole(role) && !isRestaurantFrontlineRoadmapRole(role)) return false;
  const text = normalizeRoadmapText(value);
  return /recipe card|plating|kitchen sop|phu bep|sous chef|bep truong|toc do ra mon|haccp|dinh luong nguyen lieu|waste nguyen lieu/.test(text);
}

export function hasManagerSkillLeakForFrontlineServiceRole(role: string, value: string) {
  if (!isRestaurantFrontlineRoadmapRole(role) && !isHotelFrontlineRoadmapRole(role)) return false;
  const text = normalizeRoadmapText(value);
  return /p&l|profit and loss|revpar|adr|market share|brand health|executive dashboard|ban giam doc|owner\/gm|director|head of|budget khach san|budget nha hang/.test(text);
}

export function isExplicitFactoryRoadmapRole(value: string) {
  const text = normalizeRoadmapText(value);
  return /cong nhan|factory|production|san xuat|van hanh may|machine operator|operator line|line worker|qc line|qa line|to pho|to truong/.test(text);
}

export function hasFactorySkillLeakForRoadmapRole(role: string, value: string) {
  const text = normalizeRoadmapText(value);
  const leak = /\b5s\b|qc checklist|\bqc\b|qa line|san luong|nang suat line|van hanh may|an toan lao dong|cong nhan|nha may|to pho|to truong|line leader|\boee\b|\brca\b|lean|six sigma|plc|defect rate|downtime/.test(text);
  return leak && !isExplicitFactoryRoadmapRole(role);
}

export function hasJuniorMarketingSkillLeakForManagerRole(role: string, value: string) {
  if (!isMarketingManagerRoadmapRole(role)) return false;
  const text = normalizeRoadmapText(value);
  return /edit video|short-form|photoshop|canva|content calendar|copywriting chuyen doi|viet cv|linkedin dang case study|portfolio campaign|thiet ke hinh anh|lap content/.test(text);
}

export function marketingManagerSkillBank() {
  return [
    'Brand positioning va insight thi truong',
    'Brand health, awareness va consideration',
    'Campaign P&L, budget va media mix',
    'Go-to-market launch plan',
    'Agency/vendor briefing va review creative',
    'Market share, penetration va category growth',
    'Marketing dashboard cho ban giam doc',
    'Case study tang truong thuong hieu co so lieu',
  ];
}

export function driverDeliverySkillBank() {
  return [
    'Đúng giờ và tỷ lệ hoàn thành đơn',
    'Tối ưu tuyến đường',
    'An toàn giao thông',
    'Tiết kiệm nhiên liệu/chi phí',
    'CSKH khi giao nhận',
    'Xử lý phát sinh khi giao hàng',
    'Rating/feedback khách',
    'Hồ sơ bằng lái/app giao hàng',
  ];
}

export function driverDeliveryAchievements(done: number, total: number) {
  return [
    `Hoàn thành ${done}/${total} việc theo checklist tài xế/giao nhận có bằng chứng và KPI.`,
    'Có log chuyến/đơn gồm số đơn, đúng giờ, hủy/hoàn, phát sinh và cách xử lý.',
    'Có bằng chứng rating/feedback khách hoặc xác nhận từ điều phối/quản lý.',
    'Có checklist an toàn giao thông, tình trạng xe, giấy tờ/bằng lái và app/đơn hàng.',
    'Có case xử lý phát sinh: sai địa chỉ, khách không nghe máy, giao trễ, hàng lỗi hoặc hoàn đơn.',
    'Có hồ sơ giao nhận dùng được khi xin review hoặc ứng tuyển fleet/điều phối/tổ trưởng giao nhận.',
  ];
}
