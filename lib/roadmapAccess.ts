export function cleanRoadmapAccessCode(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 32);
}

export type RoadmapIntent = 'new_graduate' | 'stuck_3_years' | 'career_switch';

export const ROADMAP_INTENT_CONTEXT: Record<RoadmapIntent, { label: string; prompt: string }> = {
  new_graduate: {
    label: 'Mới tốt nghiệp',
    prompt: 'Chưa rõ nghề phù hợp, cần chọn hướng đầu tiên',
  },
  stuck_3_years: {
    label: '3+ năm dậm chân',
    prompt: 'Đang dậm chân, cần chọn đúng nghề hiện tại trước khi benchmark',
  },
  career_switch: {
    label: 'Muốn đổi hướng',
    prompt: 'Bạn muốn chuyển sang hướng nào?',
  },
};

export function normalizeRoadmapIntentText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectRoadmapIntentPhrase(value: unknown): RoadmapIntent | null {
  const text = normalizeRoadmapIntentText(value);
  if (!text) return null;
  if (/\b(muon doi huong|doi huong|chuyen huong|doi nganh|career switch|pivot)\b/.test(text)) {
    return 'career_switch';
  }
  if (/\b(3\+? nam dam chan|tren 3 nam.*dam chan|ba nam dam chan|luong dam chan|dam chan tai cho)\b/.test(text)) {
    return 'stuck_3_years';
  }
  if (/\b(moi tot nghiep|moi ra truong|sinh vien moi tot nghiep|chua ro dinh huong|chua biet lam nghe gi|tim huong di)\b/.test(text)) {
    return 'new_graduate';
  }
  return null;
}

export function isRoadmapIntentPhrase(value: unknown): boolean {
  return Boolean(detectRoadmapIntentPhrase(value));
}

export function getLegacyRoadmapAccessCode(vspiId: unknown): string {
  if (typeof vspiId !== 'string') return '';
  const clean = cleanRoadmapAccessCode(vspiId);
  return clean.slice(-4);
}

export function getRoadmapAccessCode(vspiId: unknown): string {
  void vspiId;
  return '';
}

export function legacyRoadmapAccessCodeMatches(vspiId: unknown, accessCode: unknown): boolean {
  const expected = getLegacyRoadmapAccessCode(vspiId);
  const provided = cleanRoadmapAccessCode(accessCode);
  if (!expected || !provided) return false;
  return provided === expected || provided === cleanRoadmapAccessCode(String(vspiId || ''));
}
