import { buildDeterministicRoadmapFallback } from '../lib/buildDeterministicRoadmapFallback';
import { repairRoadmapAfterRoleGuardFail } from '../lib/repairRoadmapAfterRoleGuardFail';
import { validateFinalRoadmapBeforePersist } from '../lib/roadmapFinalRoleGuard';
import { getRoleProfileById } from '../lib/roleProfiles';
import { roadmapToSearchableText } from '../lib/validateGeneratedRoadmapRoleGuard';

const AIRPORT_CHECKIN_ROLE_ID = 'nhan vien check-in san bay__van tai - logistics';
const roleProfile = getRoleProfileById(AIRPORT_CHECKIN_ROLE_ID);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function lowerText(value: unknown) {
  return roadmapToSearchableText(value).toLowerCase();
}

const userInputs = {
  currentPosition: 'Nhân viên check-in sân bay',
  mainWeakness: 'Cần giảm lỗi check-in và xử lý khách thiếu giấy tờ',
  twoYearGoal: 'Lên Senior Passenger Service Agent hoặc Ground Service Supervisor',
  educationLevel: 'Trung cấp/Cao đẳng',
  strongSkills: 'Giao tiếp tốt, chịu áp lực ca đông khách',
  proofAssets: 'Feedback supervisor, checklist giấy tờ, log lỗi check-in',
  weeklyTime: '5 giờ/tuần',
};

const contaminatedRoadmap = {
  format: 'expert_v2',
  goal: 'Sai nghề',
  summary: 'Cabin crew roadmap',
  weeks: [
    {
      week: 1,
      focus: 'Cabin crew readiness',
      tasks: ['Làm cabin crew route readiness với senior crew và purser.'],
      milestone: 'Có route readiness.',
    },
  ],
};

const finalGuard = validateFinalRoadmapBeforePersist({
  jobTitle: 'Nhân viên check-in sân bay',
  roleId: AIRPORT_CHECKIN_ROLE_ID,
  roleProfile,
  finalRoadmap: contaminatedRoadmap,
});

assert(!finalGuard.passed, 'contaminated roadmap must fail final guard before repair');

const mustInclude = ['check-in', 'boarding pass', 'hộ chiếu', 'visa', 'hành lý', 'quầy check-in', 'hành khách', 'supervisor'];
const forbidden = ['cabin crew', 'senior crew', 'purser', 'in-flight', 'flight attendant', 'checklist cabin', 'announcement cabin', 'grooming cabin crew', 'route readiness'];

function validateCleanAirportRoadmap(value: unknown) {
  const guard = validateFinalRoadmapBeforePersist({
    jobTitle: 'Nhân viên check-in sân bay',
    roleId: AIRPORT_CHECKIN_ROLE_ID,
    roleProfile,
    finalRoadmap: value,
  });
  const text = lowerText(value);
  const mustHits = mustInclude.filter(term => text.includes(term));
  const forbiddenHits = forbidden.filter(term => text.includes(term));
  assert(guard.passed, `roadmap must pass final guard: ${JSON.stringify(guard)}`);
  assert(mustHits.length >= 4, `roadmap must contain at least 4 required terms, got ${mustHits.join(', ')}`);
  assert(forbiddenHits.length === 0, `roadmap must not contain forbidden terms: ${forbiddenHits.join(', ')}`);
  return { guard, mustHits, forbiddenHits };
}

function assertRenderableSchema(value: unknown) {
  const roadmap = value as Record<string, any>;
  assert(typeof roadmap.goal === 'string' && roadmap.goal.length > 0, 'roadmap.goal must be non-empty string');
  assert(typeof roadmap.summary === 'string' && roadmap.summary.length > 0, 'roadmap.summary must be non-empty string');
  assert(Array.isArray(roadmap.weeks) && roadmap.weeks.length >= 4, 'roadmap.weeks must have at least 4 weeks');
  assert(Array.isArray(roadmap.weeks[0].tasks) && roadmap.weeks[0].tasks.length >= 3, 'week tasks must render');
  assert(typeof roadmap.markdown === 'string' && roadmap.markdown.includes('W1'), 'markdown must include W1 content');
  assert(roadmap.actionPlan?.milestones?.[0]?.weeks?.[0]?.tasks?.length >= 3, 'actionPlan weekly tasks must render');
}

async function testDirtyRepairFallsBack() {
  const result = await repairRoadmapAfterRoleGuardFail({
    failedRoadmap: contaminatedRoadmap,
    finalGuardResult: finalGuard,
    roleProfile,
    canonicalRoleTitle: 'Nhân viên check-in sân bay',
    canonicalRoleId: AIRPORT_CHECKIN_ROLE_ID,
    userInputs,
    callModel: async () => JSON.stringify(contaminatedRoadmap),
  });

  assert(result.source === 'fallback', 'dirty repair output must use deterministic fallback');
  const validation = validateCleanAirportRoadmap(result.roadmap);
  assertRenderableSchema(result.roadmap);
  return validation;
}

async function testCleanRepairUsed() {
  const cleanRepair = buildDeterministicRoadmapFallback({
    roleProfile,
    canonicalRoleTitle: 'Nhân viên check-in sân bay',
    canonicalRoleId: AIRPORT_CHECKIN_ROLE_ID,
    userInputs,
  });
  const result = await repairRoadmapAfterRoleGuardFail({
    failedRoadmap: contaminatedRoadmap,
    finalGuardResult: finalGuard,
    roleProfile,
    canonicalRoleTitle: 'Nhân viên check-in sân bay',
    canonicalRoleId: AIRPORT_CHECKIN_ROLE_ID,
    userInputs,
    callModel: async () => JSON.stringify(cleanRepair),
  });

  assert(result.source === 'repair', 'clean repair output must be used before fallback');
  const validation = validateCleanAirportRoadmap(result.roadmap);
  assertRenderableSchema(result.roadmap);
  return validation;
}

async function main() {
  assert(roleProfile, `missing role profile ${AIRPORT_CHECKIN_ROLE_ID}`);
  const fallbackValidation = await testDirtyRepairFallsBack();
  const repairValidation = await testCleanRepairUsed();

  console.log(JSON.stringify({
    passed: true,
    contaminatedOutputFallbackToClean: {
      source: 'fallback',
      guardPassed: fallbackValidation.guard.passed,
      mustIncludeHits: fallbackValidation.mustHits,
      forbiddenHits: fallbackValidation.forbiddenHits,
    },
    cleanRepairUsed: {
      source: 'repair',
      guardPassed: repairValidation.guard.passed,
      mustIncludeHits: repairValidation.mustHits,
      forbiddenHits: repairValidation.forbiddenHits,
    },
    schemaRenderTest: 'PASS',
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
