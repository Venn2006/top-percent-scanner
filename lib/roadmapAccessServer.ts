import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  cleanRoadmapAccessCode,
  legacyRoadmapAccessCodeMatches,
} from './roadmapAccess';

const ACCESS_CODE_LENGTH = 12;

function getAccessSecret() {
  return (
    process.env.ROADMAP_ACCESS_SECRET ||
    process.env.WEBHOOK_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'dev-roadmap-access-secret'
  );
}

export function issueRoadmapAccessCode(vspiId: unknown): string {
  const cleanId = cleanRoadmapAccessCode(vspiId);
  if (!cleanId) return '';

  return createHmac('sha256', getAccessSecret())
    .update(cleanId)
    .digest('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, ACCESS_CODE_LENGTH);
}

export function roadmapAccessCodeMatches(vspiId: unknown, accessCode: unknown): boolean {
  const provided = cleanRoadmapAccessCode(accessCode);
  const expected = issueRoadmapAccessCode(vspiId);
  if (!provided) return false;
  if (expected && timingSafeTextEqual(provided, expected)) return true;

  if (process.env.ALLOW_LEGACY_ROADMAP_CODES !== 'true') return false;
  return legacyRoadmapAccessCodeMatches(vspiId, provided);
}

function timingSafeTextEqual(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);

  if (inputBuffer.length !== expectedBuffer.length) {
    const paddedInput = Buffer.alloc(expectedBuffer.length);
    inputBuffer.copy(paddedInput, 0, 0, Math.min(inputBuffer.length, expectedBuffer.length));
    timingSafeEqual(paddedInput, expectedBuffer);
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}
