import type { RoleProfile } from '@/lib/roleProfiles';
import {
  validateGeneratedRoadmapRoleGuard,
  type GeneratedRoadmapRoleGuardResult,
} from '@/lib/validateGeneratedRoadmapRoleGuard';

export const ROADMAP_ROLE_GUARD_SAFE_ERROR = 'Hệ thống đang kiểm tra lại lộ trình để đảm bảo đúng nghề của bạn. Vui lòng thử lại sau 1 phút.';

export interface FinalRoadmapRoleGuardInput {
  vspiId?: string;
  jobTitle: string;
  roleId?: string | null;
  roleProfile: RoleProfile | null;
  finalRoadmap: unknown;
}

export interface FinalRoadmapRoleGuardResult extends GeneratedRoadmapRoleGuardResult {
  code: 'ROADMAP_ROLE_GUARD_FAILED' | 'ROADMAP_ROLE_GUARD_PASSED';
}

export function validateFinalRoadmapBeforePersist(input: FinalRoadmapRoleGuardInput): FinalRoadmapRoleGuardResult {
  const authoritativeTitle = input.roleProfile?.title || input.jobTitle;
  const roleId = input.roleId || input.roleProfile?.key || null;
  const guard = validateGeneratedRoadmapRoleGuard({
    jobTitle: authoritativeTitle,
    roleId,
    roleProfile: input.roleProfile,
    generatedRoadmapText: input.finalRoadmap,
  });

  return {
    ...guard,
    code: guard.passed ? 'ROADMAP_ROLE_GUARD_PASSED' : 'ROADMAP_ROLE_GUARD_FAILED',
  };
}
