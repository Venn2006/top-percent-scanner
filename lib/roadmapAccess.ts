export function cleanRoadmapAccessCode(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 32);
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
