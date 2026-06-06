import type { SupabaseClient } from '@supabase/supabase-js';

export const ROADMAP_NOT_READY_MESSAGE = 'Đang chuẩn bị lộ trình cho nghề này, vui lòng thử lại sau';

export const SENIORITY_LEVELS = [
  'Junior (0-2 năm)',
  'Mid (3-5 năm)',
  'Senior (5+ năm)',
] as const;

export type RoadmapSeniorityLevel = typeof SENIORITY_LEVELS[number];

export function normalizeRoadmapSeniorityLevel(value: unknown): RoadmapSeniorityLevel {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/junior|0\s*-\s*2|entry|fresher|moi/.test(normalized)) return 'Junior (0-2 năm)';
  if (/senior|5\+|5\s*nam|tren\s*5|lead/.test(normalized)) return 'Senior (5+ năm)';
  return 'Mid (3-5 năm)';
}

export function roadmapSeniorityFromExperience(experience: unknown): RoadmapSeniorityLevel {
  if (experience === 'junior') return 'Junior (0-2 năm)';
  if (experience === 'senior') return 'Senior (5+ năm)';
  return 'Mid (3-5 năm)';
}

export interface PregeneratedRoadmapRow<TContent = unknown> {
  roleId: string;
  jobTitle: string;
  seniorityLevel: RoadmapSeniorityLevel;
  roadmapContent: TContent;
  qualityScore: number;
  topKeywords: string[];
  status: 'APPROVED' | 'NEEDS_REVIEW';
  generatedAt: string;
}

export async function getApprovedPregeneratedRoadmap<TContent = unknown>(
  supabase: SupabaseClient,
  input: { roleId: string | null | undefined; seniorityLevel: unknown }
): Promise<PregeneratedRoadmapRow<TContent> | null> {
  const roleId = typeof input.roleId === 'string' ? input.roleId.trim() : '';
  if (!roleId) return null;

  const seniorityLevel = normalizeRoadmapSeniorityLevel(input.seniorityLevel);
  const { data, error } = await supabase
    .from('pregenerated_roadmaps')
    .select('roleId, jobTitle, seniorityLevel, roadmapContent, qualityScore, topKeywords, status, generatedAt')
    .eq('roleId', roleId)
    .eq('seniorityLevel', seniorityLevel)
    .eq('status', 'APPROVED')
    .order('generatedAt', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as PregeneratedRoadmapRow<TContent> | null) || null;
}

