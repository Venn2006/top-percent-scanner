import { getExactRoleProfile } from '../lib/roleProfiles';
import { ROADMAP_ROLE_GUARD_SAFE_ERROR, validateFinalRoadmapBeforePersist } from '../lib/roadmapFinalRoleGuard';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const roleId = 'nhan vien check-in san bay__van tai - logistics';
const roleProfile = getExactRoleProfile('Nhân viên check-in sân bay', 'Vận tải - Logistics')
  || getExactRoleProfile('NhÃ¢n viÃªn check-in sÃ¢n bay', 'Váº­n táº£i - Logistics');

assert(roleProfile, 'Missing airport check-in role profile');

const contaminatedLiveLikeRoadmap = {
  format: 'expert_v2',
  goal: 'Lộ trình thực thi tăng lương cho Nhân viên check-in sân bay',
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

const goodAirportCheckinRoadmap = {
  weeks: [
    {
      week: 1,
      tasks: [
        'Lập checklist check-in tại quầy check-in cho 20 hành khách, kiểm tra hộ chiếu, visa trước khi in boarding pass.',
        'Ghi log lỗi hành lý ký gửi, case khách thiếu giấy tờ và bước gọi supervisor/gate/baggage khi cần.',
      ],
    },
  ],
};

const badGuard = validateFinalRoadmapBeforePersist({
  vspiId: 'VSPI-TEST-FINAL-GUARD',
  jobTitle: 'Nhân viên check-in sân bay',
  roleId,
  roleProfile,
  finalRoadmap: contaminatedLiveLikeRoadmap,
});

const expectedStatus = badGuard.passed ? 200 : 503;
const wouldSaveContaminatedRoadmap = badGuard.passed;

assert(!badGuard.passed, `Expected final guard to fail contaminated roadmap: ${JSON.stringify(badGuard)}`);
assert(expectedStatus === 503, 'Expected route-level behavior to return 503/safe error');
assert(!wouldSaveContaminatedRoadmap, 'Contaminated roadmap must not be saved');
assert(badGuard.forbiddenHits.includes('cabin crew'), 'Expected cabin crew forbidden hit');
assert(badGuard.forbiddenHits.includes('senior crew'), 'Expected senior crew forbidden hit');
assert(badGuard.forbiddenHits.includes('purser'), 'Expected purser forbidden hit');
assert(badGuard.forbiddenHits.includes('route readiness'), 'Expected route readiness forbidden hit');
assert(badGuard.missingRequiredTerms.length > 0, 'Expected missing airport check-in required terms');

const goodGuard = validateFinalRoadmapBeforePersist({
  vspiId: 'VSPI-TEST-FINAL-GUARD-GOOD',
  jobTitle: 'Nhân viên check-in sân bay',
  roleId,
  roleProfile,
  finalRoadmap: goodAirportCheckinRoadmap,
});

assert(goodGuard.passed, `Expected good airport check-in roadmap to pass: ${JSON.stringify(goodGuard)}`);

console.log(JSON.stringify({
  passed: true,
  contaminatedRoadmap: {
    guardPassed: badGuard.passed,
    expectedStatus,
    safeError: ROADMAP_ROLE_GUARD_SAFE_ERROR,
    wouldSaveContaminatedRoadmap,
    forbiddenHits: badGuard.forbiddenHits,
    missingRequiredTerms: badGuard.missingRequiredTerms,
  },
  goodAirportCheckinRoadmap: {
    guardPassed: goodGuard.passed,
    forbiddenHits: goodGuard.forbiddenHits,
    missingRequiredTerms: goodGuard.missingRequiredTerms,
  },
}, null, 2));
