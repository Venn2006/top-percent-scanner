import type { RoleProfile } from '@/lib/roleProfiles';
import { getDeterministicFallbackTerms } from '@/lib/roleSiblingGuards';

interface RoadmapQualityGateInput {
  roadmap: unknown;
  jobTitle: string;
  roleId?: string | null;
  roleProfile?: RoleProfile | null;
  expectedDurationMonths?: number | null;
}

interface RoadmapQualityGateResult {
  passed: boolean;
  reasons: string[];
  metrics: {
    taskCount: number;
    uniqueTaskRatio: number;
    repeatedTaskPrefixes: number;
    repeatedFocuses: number;
    roleSpecificHits: string[];
    evidenceHits: string[];
    progressionHits: string[];
    genericHits: string[];
  };
}

interface ActionTaskLike {
  title?: unknown;
  skill?: unknown;
  output?: unknown;
  kpi?: unknown;
  doneDefinition?: unknown;
}

interface WeekLike {
  focus?: unknown;
  tasks?: unknown;
  checkpoint?: unknown;
  milestone?: unknown;
}

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110Ä‘Ä]/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}&+./%-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenText(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenText);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(flattenText);
  return [];
}

function collectActionWeeks(roadmap: unknown): WeekLike[] {
  const value = roadmap as Record<string, any> | null;
  const topWeeks = Array.isArray(value?.weeks) ? value.weeks : [];
  const milestones = Array.isArray(value?.actionPlan?.milestones) ? value.actionPlan.milestones : [];
  const actionWeeks = milestones.flatMap((milestone: any) => Array.isArray(milestone?.weeks) ? milestone.weeks : []);
  return actionWeeks.length ? actionWeeks : topWeeks;
}

function collectTaskTexts(weeks: WeekLike[]) {
  return weeks.flatMap((week) => {
    const tasks = Array.isArray(week.tasks) ? week.tasks : [];
    return tasks.map((task: unknown) => {
      if (typeof task === 'string') return task;
      const item = task as ActionTaskLike;
      return [item.title, item.skill, item.output, item.kpi, item.doneDefinition].filter(Boolean).join(' ');
    }).filter(Boolean);
  });
}

function uniqueHits(text: string, terms: string[]) {
  const normalizedText = normalize(text);
  return [...new Set(terms.filter((term) => {
    const normalizedTerm = normalize(term);
    return normalizedTerm.length >= 3 && normalizedText.includes(normalizedTerm);
  }))];
}

function getRoleQualityTerms(input: RoadmapQualityGateInput) {
  const fallbackTerms = getDeterministicFallbackTerms({
    jobTitle: input.jobTitle,
    roleId: input.roleId,
    roleProfile: input.roleProfile,
  });
  const profileTerms = [
    input.roleProfile?.title,
    input.roleProfile?.industry,
    ...(input.roleProfile?.skills || []),
    input.roleProfile?.preview?.coreSkill,
    input.roleProfile?.preview?.firstAction,
    input.roleProfile?.language?.mainSkill,
    input.roleProfile?.language?.proofAsset,
    input.roleProfile?.language?.kpiGuidance,
  ].filter((value): value is string => Boolean(value && value.trim()));
  return [...fallbackTerms.required, ...profileTerms];
}

function prefix(value: string, words = 10) {
  return normalize(value).split(' ').slice(0, words).join(' ');
}

export function validateRoadmapQualityGate(input: RoadmapQualityGateInput): RoadmapQualityGateResult {
  const roadmapText = flattenText(input.roadmap).join('\n');
  const normalizedRoadmap = normalize(roadmapText);
  const weeks = collectActionWeeks(input.roadmap);
  const taskTexts = collectTaskTexts(weeks);
  const normalizedTasks = taskTexts.map((task) => normalize(task)).filter(Boolean);
  const uniqueTasks = new Set(normalizedTasks);
  const uniqueTaskRatio = normalizedTasks.length ? uniqueTasks.size / normalizedTasks.length : 0;
  const taskPrefixes = normalizedTasks.map((task) => prefix(task)).filter((value) => value.length >= 24);
  const prefixCounts = new Map<string, number>();
  for (const item of taskPrefixes) prefixCounts.set(item, (prefixCounts.get(item) || 0) + 1);
  const repeatedTaskPrefixes = [...prefixCounts.values()].filter((count) => count >= 3).length;

  const focuses = weeks.map((week) => normalize(week.focus || week.checkpoint || week.milestone || '')).filter(Boolean);
  const focusCounts = new Map<string, number>();
  for (const focus of focuses) focusCounts.set(focus, (focusCounts.get(focus) || 0) + 1);
  const repeatedFocuses = [...focusCounts.values()].filter((count) => count >= 2).length;
  const consecutiveFocusRepeat = focuses.some((focus, index) => index > 0 && focus === focuses[index - 1]);

  const roleSpecificHits = uniqueHits(roadmapText, getRoleQualityTerms(input));
  const evidenceHits = uniqueHits(roadmapText, [
    'evidence', 'bang chung', 'log', 'file', 'anh', 'feedback', 'before', 'after', 'truoc sau',
    'kpi', 'checklist', 'case', 'portfolio', 'script', 'dashboard', 'rate card', 'sop', 'playbook',
  ]);
  const progressionHits = uniqueHits(roadmapText, [
    'baseline', 'do nen', 'truoc sau', 'feedback lan', 'case kho', 'giam loi', 'tang scope',
    'portfolio', 'review', 'deal', 'cap do', 'output mau', 'tinh huong co ap luc',
  ]);
  const genericHits = uniqueHits(roadmapText, [
    'cap nhat bang chung vong', 'vong nang cap', 'chon 1 kpi sat voi', 'portfolio chung',
    'case study chung', 'hoan thanh # output do duoc', 'tao checklist cong viec that xoay quanh',
    'dua output vao ca viec that va do truoc sau', 'dua bang chung vao ca viec that va do truoc sau',
    'ap dung vao ca viec that do loi toc do chat luong truoc sau',
  ]);

  const expectedWeeks = input.expectedDurationMonths ? Math.max(12, Math.min(9, Number(input.expectedDurationMonths)) * 4) : 12;
  const reasons: string[] = [];
  if (weeks.length < Math.min(expectedWeeks, 12)) reasons.push('too_few_weeks');
  if (normalizedTasks.length < Math.min(expectedWeeks, 12)) reasons.push('too_few_tasks');
  if (uniqueTaskRatio < 0.82) reasons.push('task_copy_ratio_too_low');
  if (repeatedTaskPrefixes >= 2) reasons.push('repeated_task_prefixes');
  if (repeatedFocuses >= 2 || consecutiveFocusRepeat) reasons.push('repeated_week_focuses');
  if (roleSpecificHits.length < Math.min(4, Math.max(2, getRoleQualityTerms(input).length >= 5 ? 4 : 2))) reasons.push('missing_role_specific_depth');
  if (evidenceHits.length < 5) reasons.push('missing_evidence_kpi_language');
  if (progressionHits.length < 4) reasons.push('missing_weekly_progression_language');
  if (genericHits.length > 0) reasons.push('generic_or_loop_copy_detected');
  if (/\b(ai|deepseek|chatgpt|claude)\b/i.test(normalizedRoadmap)) reasons.push('provider_term_leak');

  return {
    passed: reasons.length === 0,
    reasons,
    metrics: {
      taskCount: normalizedTasks.length,
      uniqueTaskRatio,
      repeatedTaskPrefixes,
      repeatedFocuses,
      roleSpecificHits,
      evidenceHits,
      progressionHits,
      genericHits,
    },
  };
}
