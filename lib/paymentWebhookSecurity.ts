import { createHmac, timingSafeEqual } from 'node:crypto';

export type PaymentProduct = 'premium' | 'roadmap';

export interface PendingPaymentRecord {
  vspi_id: string;
  amount?: number | null;
}

export interface PaymentTarget {
  product: PaymentProduct;
  table: 'purchases' | 'roadmaps';
  vspiId: string;
  expectedAmount: number;
}

export type PaymentTargetResolution =
  | { kind: 'match'; target: PaymentTarget; candidates: string[] }
  | { kind: 'ambiguous'; candidates: string[]; message: string }
  | { kind: 'no_match'; candidates: string[]; message: string };

export const PREMIUM_MIN_AMOUNT = 29_000;
export const ROADMAP_MIN_AMOUNT = 79_000;

const VSPI_COMPACT_REGEX = /VSPI2026[A-Z0-9]{8}/g;

export function normalizePaymentCode(value: unknown): string {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatCompactVspiId(value: string): string {
  const clean = normalizePaymentCode(value);
  const match = clean.match(/^VSPI2026([A-Z0-9]{4})([A-Z0-9]{4})$/);
  return match ? `VSPI-2026-${match[1]}-${match[2]}` : String(value || '').trim().toUpperCase();
}

export function extractVspiCandidatesFromPaymentContent(content: unknown): string[] {
  const clean = normalizePaymentCode(content);
  return Array.from(new Set((clean.match(VSPI_COMPACT_REGEX) || []).map(formatCompactVspiId)));
}

export function safeTokenCompare(input: string, expected: string): boolean {
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

export function verifyPaymentWebhookAuth(input: {
  rawBody: string;
  webhookSecret: string;
  signature?: string | null;
  authorization?: string | null;
}): boolean {
  const signature = String(input.signature || '').trim();
  if (signature) {
    const expectedHex = createHmac('sha256', input.webhookSecret).update(input.rawBody).digest('hex');
    const cleanSignature = signature.replace(/^sha256=/i, '').trim().toLowerCase();
    return safeTokenCompare(cleanSignature, expectedHex);
  }

  const authHeader = String(input.authorization || '').trim();
  const receivedToken = authHeader.replace(/^(Apikey|Bearer)\s+/i, '').trim();
  return Boolean(receivedToken) && safeTokenCompare(receivedToken, input.webhookSecret);
}

export function resolvePaymentTargetFromContent(input: {
  content: unknown;
  pendingPurchases: PendingPaymentRecord[];
  pendingRoadmaps: PendingPaymentRecord[];
}): PaymentTargetResolution {
  const candidates = extractVspiCandidatesFromPaymentContent(input.content);
  if (candidates.length === 0) {
    return { kind: 'no_match', candidates, message: 'No VSPI candidate found' };
  }
  if (candidates.length > 1) {
    return { kind: 'ambiguous', candidates, message: 'Multiple VSPI candidates found' };
  }

  const candidate = candidates[0];
  const purchaseMatches = input.pendingPurchases
    .filter(row => formatCompactVspiId(String(row.vspi_id || '')) === candidate)
    .map(row => ({
      product: 'premium' as const,
      table: 'purchases' as const,
      vspiId: row.vspi_id,
      expectedAmount: Number(row.amount || PREMIUM_MIN_AMOUNT),
    }));
  const roadmapMatches = input.pendingRoadmaps
    .filter(row => formatCompactVspiId(String(row.vspi_id || '')) === candidate)
    .map(row => ({
      product: 'roadmap' as const,
      table: 'roadmaps' as const,
      vspiId: row.vspi_id,
      expectedAmount: ROADMAP_MIN_AMOUNT,
    }));
  const matches = [...purchaseMatches, ...roadmapMatches];

  if (matches.length === 1) return { kind: 'match', target: matches[0], candidates };
  if (matches.length > 1) {
    return { kind: 'ambiguous', candidates, message: 'VSPI candidate matches multiple pending products' };
  }
  return { kind: 'no_match', candidates, message: 'No pending order matched VSPI candidate' };
}

export function isPaymentAmountEnough(amount: number, expectedAmount: number): boolean {
  return Number.isFinite(amount) && amount >= expectedAmount;
}

export function summarizePaymentContentForLog(content: unknown): { hasContent: boolean; candidates: string[]; length: number } {
  const clean = normalizePaymentCode(content);
  return {
    hasContent: clean.length > 0,
    candidates: extractVspiCandidatesFromPaymentContent(clean),
    length: clean.length,
  };
}
