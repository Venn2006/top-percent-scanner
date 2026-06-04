import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import {
  extractVspiCandidatesFromPaymentContent,
  formatCompactVspiId,
  isPaymentAmountEnough,
  resolvePaymentTargetFromContent,
  summarizePaymentContentForLog,
  verifyPaymentWebhookAuth,
} from '../lib/paymentWebhookSecurity';

const route = fs.readFileSync('app/api/webhook/payment/route.ts', 'utf8');
const recovery = fs.readFileSync('lib/paymentRecovery.ts', 'utf8');

const secret = '0123456789abcdef0123456789abcdef';
const rawBody = JSON.stringify({ transferType: 'in', content: 'VSPI-2026-ABCD-EF12', amount: 29_000 });
const signature = createHmac('sha256', secret).update(rawBody).digest('hex');

function assertAuth() {
  assert.equal(
    verifyPaymentWebhookAuth({ rawBody, webhookSecret: secret, signature: `sha256=${signature}` }),
    true,
    'sha256= signature must pass',
  );
  assert.equal(
    verifyPaymentWebhookAuth({ rawBody, webhookSecret: secret, signature }),
    true,
    'raw x-sepay-signature hex must pass',
  );
  assert.equal(
    verifyPaymentWebhookAuth({ rawBody, webhookSecret: secret, authorization: `Bearer ${secret}` }),
    true,
    'Bearer authorization fallback must pass when signature is absent',
  );
  assert.equal(
    verifyPaymentWebhookAuth({ rawBody, webhookSecret: secret, authorization: `Apikey ${secret}` }),
    true,
    'Apikey authorization fallback must pass when signature is absent',
  );
  assert.equal(
    verifyPaymentWebhookAuth({ rawBody, webhookSecret: secret, signature: `sha256=${signature.slice(0, -2)}00` }),
    false,
    'invalid signature must fail',
  );
  assert.equal(
    verifyPaymentWebhookAuth({ rawBody, webhookSecret: secret }),
    false,
    'missing signature and authorization must fail',
  );
  assert.equal(
    verifyPaymentWebhookAuth({ rawBody, webhookSecret: `${secret}x`, signature }),
    false,
    'wrong secret must fail',
  );
}

function assertTargetResolution() {
  const premium = { vspi_id: 'VSPI-2026-ABCD-EF12', amount: 29_000 };
  const roadmap = { vspi_id: 'VSPI-2026-ZZZZ-9999', amount: 79_000 };

  assert.deepEqual(
    extractVspiCandidatesFromPaymentContent('Thanh toan VSPI-2026-ABCD-EF12'),
    ['VSPI-2026-ABCD-EF12'],
    'candidate extraction must handle formatted VSPI IDs',
  );
  assert.equal(formatCompactVspiId('VSPI2026ZZZZ9999'), 'VSPI-2026-ZZZZ-9999', 'compact VSPI must format canonically');

  const premiumMatch = resolvePaymentTargetFromContent({
    content: 'TOPLUONG VSPI-2026-ABCD-EF12',
    pendingPurchases: [premium],
    pendingRoadmaps: [roadmap],
  });
  assert.equal(premiumMatch.kind, 'match', 'exact 29K VSPI content must match purchase');
  if (premiumMatch.kind === 'match') {
    assert.equal(premiumMatch.target.product, 'premium');
    assert.equal(premiumMatch.target.table, 'purchases');
    assert.equal(premiumMatch.target.expectedAmount, 29_000);
  }

  const roadmapMatch = resolvePaymentTargetFromContent({
    content: 'TOPLUONG VSPI-2026-ZZZZ-9999',
    pendingPurchases: [premium],
    pendingRoadmaps: [roadmap],
  });
  assert.equal(roadmapMatch.kind, 'match', 'exact 79K VSPI content must match roadmap');
  if (roadmapMatch.kind === 'match') {
    assert.equal(roadmapMatch.target.product, 'roadmap');
    assert.equal(roadmapMatch.target.table, 'roadmaps');
    assert.equal(roadmapMatch.target.expectedAmount, 79_000);
  }

  const noCrossUnlock = resolvePaymentTargetFromContent({
    content: 'TOPLUONG VSPI-2026-ZZZZ-9999',
    pendingPurchases: [premium],
    pendingRoadmaps: [],
  });
  assert.equal(noCrossUnlock.kind, 'no_match', 'roadmap VSPI must not unlock unrelated purchase');

  const multipleCandidates = resolvePaymentTargetFromContent({
    content: 'TOPLUONG VSPI-2026-ABCD-EF12 VSPI-2026-ZZZZ-9999',
    pendingPurchases: [premium],
    pendingRoadmaps: [roadmap],
  });
  assert.equal(multipleCandidates.kind, 'ambiguous', 'multiple VSPI candidates must not unlock anything');

  const sameCandidateInBothProducts = resolvePaymentTargetFromContent({
    content: 'TOPLUONG VSPI-2026-ABCD-EF12',
    pendingPurchases: [premium],
    pendingRoadmaps: [{ vspi_id: 'VSPI-2026-ABCD-EF12', amount: 79_000 }],
  });
  assert.equal(sameCandidateInBothProducts.kind, 'ambiguous', 'same VSPI in two products must require manual review');

  const typo = resolvePaymentTargetFromContent({
    content: 'TOPLUONG VSPI-2026-ABCD',
    pendingPurchases: [premium],
    pendingRoadmaps: [roadmap],
  });
  assert.equal(typo.kind, 'no_match', 'partial/typo VSPI must not fuzzy match');

  assert.equal(isPaymentAmountEnough(29_000, 29_000), true, 'exact 29K amount must pass');
  assert.equal(isPaymentAmountEnough(28_999, 29_000), false, 'too-low 29K amount must fail');
  assert.equal(isPaymentAmountEnough(79_000, 79_000), true, 'exact 79K amount must pass');

  const summary = summarizePaymentContentForLog('TOPLUONG VSPI-2026-ABCD-EF12');
  assert.deepEqual(summary, { hasContent: true, candidates: ['VSPI-2026-ABCD-EF12'], length: 24 });
}

function assertStaticContracts() {
  assert.match(route, /verifyPaymentWebhookAuth/, 'route must use shared webhook auth helper');
  assert.match(route, /WEBHOOK_MAX_BODY_BYTES/, 'route must cap raw webhook body size');
  assert.match(route, /hasMatchedPaymentRef/, 'route must keep payment_ref idempotency guard');
  assert.match(route, /Duplicate payment_ref ignored/, 'route must ignore duplicate matched payment_ref');
  assert.match(route, /resolvePaymentTargetFromContent/, 'route must use unambiguous target resolver');
  assert.match(route, /Ambiguous VSPI content; no unlock/, 'ambiguous VSPI content must return no-unlock response');
  assert.match(route, /target\.table === 'purchases'/, 'purchase unlock must be table-gated');
  assert.match(route, /from\('roadmaps'\)[\s\S]*payment_ref/, 'roadmap unlock must preserve payment_ref update path');
  assert.doesNotMatch(route, /safeContent\.includes\(strip/, 'route must not use broad includes(strip(vspi_id)) matching');
  assert.doesNotMatch(route, /NO MATCH for content:/, 'route must not log raw normalized transfer content on no-match');
  assert.doesNotMatch(route, /for \(const p of pendingPurchases\)[\s\S]*Matched ROADMAP/, 'route must not unlock by table-order loops');

  assert.match(recovery, /extractVspiCandidatesFromPaymentContent/, 'no_match recovery must extract explicit VSPI candidates');
  assert.match(recovery, /candidates\.length === 1/, 'no_match recovery must require exactly one VSPI candidate');
  assert.doesNotMatch(recovery, /content\.includes\(safeVspiId\)/, 'no_match recovery must not use broad content.includes(vspiId)');
}

assertAuth();
assertTargetResolution();
assertStaticContracts();

console.log(JSON.stringify({
  passed: true,
  checks: {
    auth: 'signature, sepay signature, bearer/apikey fallback, invalid/missing rejected',
    targetResolution: 'single exact VSPI only; multiple candidates and cross-product matches rejected',
    amountChecks: '29K/79K minimums enforced by helper',
    duplicatePaymentRef: 'route keeps matched payment_ref idempotency guard',
    recovery: 'no_match recovery requires one exact VSPI candidate',
    privacy: 'no raw no-match transfer content logging pattern found',
  },
}, null, 2));
