import type { RoleProfile } from '@/lib/roleProfiles';
import { buildDeterministicRoadmapFallback } from '@/lib/buildDeterministicRoadmapFallback';
import {
  validateFinalRoadmapBeforePersist,
  type FinalRoadmapRoleGuardResult,
} from '@/lib/roadmapFinalRoleGuard';

type RepairMessage = { role: 'system' | 'user'; content: string };

export interface RepairRoadmapAfterRoleGuardFailInput {
  failedRoadmap: unknown;
  finalGuardResult: {
    reason: string;
    forbiddenHits: string[];
    missingRequiredTerms: string[];
  };
  roleProfile: RoleProfile | null;
  canonicalRoleTitle: string;
  canonicalRoleId: string | null;
  userInputs: Record<string, unknown>;
  callModel: (messages: RepairMessage[]) => Promise<unknown>;
}

export interface RepairRoadmapAfterRoleGuardFailResult {
  roadmap: unknown;
  source: 'repair' | 'fallback';
  repairGuard: FinalRoadmapRoleGuardResult | null;
  fallbackGuard: FinalRoadmapRoleGuardResult | null;
}

function stableJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function extractJsonCandidate(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) return fenced.trim();
  const firstObject = trimmed.indexOf('{');
  const lastObject = trimmed.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) return trimmed.slice(firstObject, lastObject + 1);
  const firstArray = trimmed.indexOf('[');
  const lastArray = trimmed.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) return trimmed.slice(firstArray, lastArray + 1);
  return trimmed;
}

export function parseRoadmapRepairJson(value: unknown): unknown {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  const candidate = extractJsonCandidate(value);
  if (!candidate) return value;
  try {
    return JSON.parse(candidate);
  } catch {
    return value;
  }
}

function buildRepairPrompt(input: RepairRoadmapAfterRoleGuardFailInput) {
  return `Bạn đang sửa một paid career roadmap bị fail role guard.

ROLE CHÍNH XÁC:
${input.canonicalRoleTitle}

ROLE ID:
${input.canonicalRoleId || 'legacy_job_title_resolution'}

ROLE PROFILE CHUẨN:
${stableJson(input.roleProfile)}

LỖI CẦN SỬA:
Forbidden hits: ${input.finalGuardResult.forbiddenHits.join(', ') || 'none'}
Missing required terms: ${input.finalGuardResult.missingRequiredTerms.join(', ') || 'none'}
Reason: ${input.finalGuardResult.reason}

ROADMAP BỊ FAIL:
${stableJson(input.failedRoadmap)}

USER INPUTS:
${stableJson(input.userInputs)}

YÊU CẦU:
1. Viết lại toàn bộ roadmap theo đúng ROLE CHÍNH XÁC.
2. Không dùng bất kỳ forbidden hits nào.
3. Nếu role là Nhân viên check-in sân bay:
   - bắt buộc dùng: check-in, boarding pass, hộ chiếu, visa, hành lý, quầy check-in, hành khách, supervisor, gate, baggage service
   - cấm tuyệt đối: cabin crew, senior crew, purser, in-flight, flight attendant, checklist cabin, announcement cabin, route readiness
4. Evidence phải là thứ người làm role này có thể tạo trong 7-30 ngày.
5. Giữ đúng schema/format JSON hiện tại của roadmap.
6. Không markdown.
7. Chỉ trả JSON.`;
}

export async function repairRoadmapAfterRoleGuardFail(input: RepairRoadmapAfterRoleGuardFailInput): Promise<RepairRoadmapAfterRoleGuardFailResult> {
  const messages: RepairMessage[] = [
    {
      role: 'system',
      content: 'Bạn là reviewer sửa roadmap nghề nghiệp. Chỉ trả JSON hợp lệ, không markdown, không giải thích.',
    },
    {
      role: 'user',
      content: buildRepairPrompt(input),
    },
  ];

  try {
    const repaired = parseRoadmapRepairJson(await input.callModel(messages));
    const repairGuard = validateFinalRoadmapBeforePersist({
      jobTitle: input.canonicalRoleTitle,
      roleId: input.canonicalRoleId,
      roleProfile: input.roleProfile,
      finalRoadmap: repaired,
    });

    if (repairGuard.passed) {
      return {
        roadmap: repaired,
        source: 'repair',
        repairGuard,
        fallbackGuard: null,
      };
    }

    const fallback = buildDeterministicRoadmapFallback(input);
    const fallbackGuard = validateFinalRoadmapBeforePersist({
      jobTitle: input.canonicalRoleTitle,
      roleId: input.canonicalRoleId,
      roleProfile: input.roleProfile,
      finalRoadmap: fallback,
    });

    return {
      roadmap: fallback,
      source: 'fallback',
      repairGuard,
      fallbackGuard,
    };
  } catch {
    const fallback = buildDeterministicRoadmapFallback(input);
    const fallbackGuard = validateFinalRoadmapBeforePersist({
      jobTitle: input.canonicalRoleTitle,
      roleId: input.canonicalRoleId,
      roleProfile: input.roleProfile,
      finalRoadmap: fallback,
    });

    return {
      roadmap: fallback,
      source: 'fallback',
      repairGuard: null,
      fallbackGuard,
    };
  }
}
