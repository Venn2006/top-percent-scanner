import type { RoleProfile } from '@/lib/roleProfiles';
import { buildRoleSiblingBoundaryPrompt } from '@/lib/roleSiblingGuards';
import { normalizeRoleProfileText } from '@/lib/roleProfiles';

export interface RoadmapGenerationContextInput {
  jobTitle: string;
  originalJobTitle?: string | null;
  roleProfile?: RoleProfile | null;
}

export interface RoadmapGenerationContext {
  canonicalRoleTitle: string;
  canonicalRoleId: string | null;
  originalJobTitleFromCheckout: string;
  hasRoleId: boolean;
  isOriginalDifferent: boolean;
  isAirportGroundCheckin: boolean;
  promptHeader: string;
  roleBoundaryPrompt: string;
  roleSiblingBoundaryPrompt: string;
}

export interface CanonicalRoadmapUserPromptInput {
  context: RoadmapGenerationContext;
  baseUserPrompt: string;
  jobTitle: string;
  outputJobTitle: string;
  preferredPathForCanonicalRole?: string;
}

const AIRPORT_CHECKIN_ROLE_ID = 'nhan vien check-in san bay__van tai - logistics';

function isAirportGroundCheckinRoleText(value: string) {
  const normalized = normalizeRoleProfileText(value);
  return /nhan vien check[- ]?in san bay|check[- ]?in san bay|airport ground|passenger service|ground service|dich vu mat dat|quay check[- ]?in|baggage service|gate agent/.test(normalized);
}

export function buildRoadmapGenerationContext(input: RoadmapGenerationContextInput): RoadmapGenerationContext {
  const canonicalRoleTitle = input.roleProfile?.title || input.jobTitle;
  const canonicalRoleId = input.roleProfile?.key || null;
  const originalJobTitleFromCheckout = input.originalJobTitle || input.jobTitle;
  const hasRoleId = Boolean(canonicalRoleId);
  const isOriginalDifferent = normalizeRoleProfileText(originalJobTitleFromCheckout) !== normalizeRoleProfileText(canonicalRoleTitle);
  const isAirportGroundCheckin = canonicalRoleId === AIRPORT_CHECKIN_ROLE_ID || isAirportGroundCheckinRoleText(canonicalRoleTitle);

  const promptHeader = [
    `Nghề nghiệp chính xác: ${canonicalRoleTitle}`,
    `Role ID: ${canonicalRoleId || 'legacy_job_title_resolution'}`,
    `Tên nghề người dùng nhập ban đầu nếu khác: ${isOriginalDifferent ? originalJobTitleFromCheckout : 'Không khác'}`,
    isOriginalDifferent
      ? 'Nếu "Tên nghề người dùng nhập ban đầu" khác với "Nghề nghiệp chính xác", hãy bỏ qua tên ban đầu và chỉ tạo lộ trình theo Nghề nghiệp chính xác/Role ID.'
      : 'Tên nghề ban đầu không khác nghề nghiệp chính xác.',
  ].join('\n');

  const airportBoundaryPrompt = isAirportGroundCheckin
    ? `ROLE BOUNDARY - BẮT BUỘC:
Người dùng là Nhân viên check-in sân bay / Passenger Service Agent / Airport Ground Service.
Công việc diễn ra tại quầy check-in/gate/baggage service, không phải trên máy bay.

BẮT BUỘC dùng các cụm:
- check-in
- boarding pass
- hộ chiếu
- visa
- hành lý ký gửi
- quầy check-in
- hành khách
- supervisor
- gate
- baggage service

CẤM tuyệt đối:
- cabin crew
- senior crew
- purser
- in-flight
- flight attendant
- checklist cabin
- announcement cabin
- route readiness`
    : '';

  const roleSiblingBoundaryPrompt = buildRoleSiblingBoundaryPrompt({
    jobTitle: canonicalRoleTitle,
    roleId: canonicalRoleId,
    roleProfile: input.roleProfile,
  });
  const roleBoundaryPrompt = [airportBoundaryPrompt, roleSiblingBoundaryPrompt].filter(Boolean).join('\n\n');

  return {
    canonicalRoleTitle,
    canonicalRoleId,
    originalJobTitleFromCheckout,
    hasRoleId,
    isOriginalDifferent,
    isAirportGroundCheckin,
    promptHeader,
    roleBoundaryPrompt,
    roleSiblingBoundaryPrompt,
  };
}

export function buildCanonicalRoadmapUserPrompt(input: CanonicalRoadmapUserPromptInput) {
  const promptWithCanonicalRole = input.context.isOriginalDifferent
    ? input.baseUserPrompt.replaceAll(input.jobTitle, input.outputJobTitle)
    : input.baseUserPrompt;

  return [
    input.context.promptHeader,
    input.context.roleBoundaryPrompt,
    input.preferredPathForCanonicalRole ? `Canonical preferred path: ${input.preferredPathForCanonicalRole}` : '',
    'SOURCE OF TRUTH: Generate only for the canonical role title and Role ID above. Ignore the original checkout job title when it differs from the canonical role profile.',
    promptWithCanonicalRole,
  ].filter(Boolean).join('\n\n');
}
