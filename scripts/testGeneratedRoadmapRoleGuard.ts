import { getExactRoleProfile } from '../lib/roleProfiles';
import { validateGeneratedRoadmapRoleGuard } from '../lib/validateGeneratedRoadmapRoleGuard';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function profile(title: string, industry?: string) {
  const roleProfile = getExactRoleProfile(title, industry);
  assert(roleProfile, `Missing role profile for ${title}`);
  return roleProfile;
}

function runCase(
  name: string,
  input: { jobTitle: string; roleId?: string; roleProfile: unknown; generatedRoadmapText: unknown },
  expectedPassed: boolean
) {
  const result = validateGeneratedRoadmapRoleGuard(input);
  assert(
    result.passed === expectedPassed,
    `${name} expected ${expectedPassed ? 'PASS' : 'FAIL'} but got ${result.passed ? 'PASS' : 'FAIL'}: ${JSON.stringify(result)}`
  );
  return { name, expected: expectedPassed ? 'PASS' : 'FAIL', actual: result.passed ? 'PASS' : 'FAIL', result };
}

const airportProfile = profile('Nhân viên check-in sân bay', 'Vận tải - Logistics');
const serverProfile = profile('Nhân viên phục vụ bàn (Waiter/Waitress)', 'Nhà hàng - Khách sạn - Du lịch');
const restaurantManagerProfile = profile('Quản lý nhà hàng', 'Nhà hàng - Khách sạn - Du lịch');
const dentistProfile = profile('Nha sĩ', 'Y tế - Chăm sóc sức khỏe');

const contaminatedLiveLikeRoadmap = {
  weeks: [
    {
      week: 1,
      tasks: [
        'Viết rõ 3 role có thể trả cao hơn cho Nhân viên check-in sân bay; ghi mức lương mục tiêu, yêu cầu chính và lý do bạn phù hợp.',
        'Chụp lại hoặc lưu 5 tin tuyển dụng/band lương liên quan để làm bằng chứng thị trường.',
      ],
    },
  ],
  notes: [
    'Chuẩn bị cabin crew portfolio',
    'Xin feedback từ senior crew',
    'Hoàn thiện route readiness',
    'Tìm hiểu lộ trình lên purser',
  ],
};

const results = [
  runCase('airport check-in bad output', {
    jobTitle: 'Nhân viên check-in sân bay',
    roleProfile: airportProfile,
    generatedRoadmapText: 'W1: tạo hồ sơ cabin crew, xin feedback senior crew và luyện announcement cabin cho tuyến bay.',
  }, false),
  runCase('live contaminated airport check-in output must fail', {
    jobTitle: 'Nhân viên check-in sân bay',
    roleId: 'nhan vien check-in san bay__van tai - logistics',
    roleProfile: airportProfile,
    generatedRoadmapText: contaminatedLiveLikeRoadmap,
  }, false),
  runCase('airport check-in good output', {
    jobTitle: 'Nhân viên check-in sân bay',
    roleProfile: airportProfile,
    generatedRoadmapText: 'W1: lập checklist check-in tại quầy, kiểm tra hộ chiếu và visa, in boarding pass, ghi lỗi hành lý ký gửi và xin feedback supervisor/gate.',
  }, true),
  runCase('restaurant server bad output', {
    jobTitle: 'Nhân viên phục vụ nhà hàng',
    roleProfile: serverProfile,
    generatedRoadmapText: 'W1: làm dashboard food cost, P&L, COGS và gross margin để trình owner nhà hàng.',
  }, false),
  runCase('restaurant server good output', {
    jobTitle: 'Nhân viên phục vụ nhà hàng',
    roleProfile: serverProfile,
    generatedRoadmapText: 'W1: ghi order bằng POS, nắm menu, upsell món phù hợp, phục vụ món đúng bàn, dọn bàn nhanh và xin feedback khách.',
  }, true),
  runCase('restaurant manager good output', {
    jobTitle: 'Quản lý nhà hàng',
    roleProfile: restaurantManagerProfile,
    generatedRoadmapText: 'W1: lập SOP ca, đo food cost, labor cost, tồn kho và doanh thu theo ca; review complaint và audit phục vụ cuối tuần.',
  }, true),
  runCase('non-HR bad output', {
    jobTitle: 'Nha sĩ',
    roleProfile: dentistProfile,
    generatedRoadmapText: 'W1: xây recruitment funnel, HR dashboard, time-to-fill và onboarding checklist cho phòng khám.',
  }, false),
];

const liveRegression = results.find(item => item.name === 'live contaminated airport check-in output must fail');
assert(liveRegression, 'Missing live contaminated airport check-in regression result');
assert(liveRegression.result.forbiddenHits.includes('cabin crew'), 'Expected cabin crew forbidden hit');
assert(liveRegression.result.forbiddenHits.includes('senior crew'), 'Expected senior crew forbidden hit');
assert(liveRegression.result.forbiddenHits.includes('purser'), 'Expected purser forbidden hit');
assert(liveRegression.result.forbiddenHits.includes('route readiness'), 'Expected route readiness forbidden hit');
assert(liveRegression.result.missingRequiredTerms.length > 0, 'Expected missing required airport terms');

console.log(JSON.stringify({ passed: true, results }, null, 2));
