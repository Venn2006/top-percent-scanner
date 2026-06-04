import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = {
  analytics: fs.readFileSync('lib/analytics.ts', 'utf8'),
  scanner: fs.readFileSync('app/components/TopPercentScanner.tsx', 'utf8'),
  roadmapPage: fs.readFileSync('app/roadmap/page.tsx', 'utf8'),
  webhook: fs.readFileSync('app/api/webhook/payment/route.ts', 'utf8'),
  webhookSecurity: fs.readFileSync('lib/paymentWebhookSecurity.ts', 'utf8'),
  adminDelete: fs.readFileSync('app/api/admin/delete-customer/route.ts', 'utf8'),
  adminManualConfirm: fs.readFileSync('app/api/admin/manual-confirm/route.ts', 'utf8'),
  roadmapGenerate: fs.readFileSync('app/api/roadmap/generate/route.ts', 'utf8'),
  roadmapProgress: fs.readFileSync('app/api/roadmap/progress/route.ts', 'utf8'),
  history: fs.readFileSync('app/api/history/route.ts', 'utf8'),
  privacyDelete: fs.readFileSync('app/api/privacy/delete-request/route.ts', 'utf8'),
};

const allServerLogs = [
  files.webhook,
  files.adminDelete,
  files.adminManualConfirm,
  files.roadmapGenerate,
  files.roadmapProgress,
  files.history,
  files.privacyDelete,
].join('\n');

const checks = {
  analyticsShell: false,
  buyerJourneyEvents: false,
  paymentWebhookEvents: false,
  restoreAndProgressLogs: false,
  adminAndPrivacyLogs: false,
  noSecretLogging: false,
  noFullPhoneLogging: false,
};

assert.match(files.analytics, /export function trackEvent/, 'analytics must expose generic trackEvent');
assert.match(files.analytics, /export function trackFunnelEvent/, 'analytics must expose funnel tracking');
assert.match(files.analytics, /@vercel\/analytics/, 'analytics must include Vercel Analytics');
assert.match(files.analytics, /posthog-js/, 'analytics must support PostHog when configured');
assert.match(files.analytics, /person_profiles:\s*'identified_only'/, 'PostHog must avoid anonymous person profiles by default');
checks.analyticsShell = true;

for (const eventName of [
  'scan_started',
  'scan_completed',
  'paywall_seen',
  'checkout_qr_displayed',
  'checkout_started',
  'checkout_order_created',
  'initiate_checkout',
]) {
  assert.match(files.scanner, new RegExp(eventName), `29K/free buyer journey event missing: ${eventName}`);
}
assert.match(files.roadmapPage, /trackFunnelEvent\('initiate_checkout'/, '79K checkout attempt must be tracked');
assert.match(files.roadmapPage, /trackFunnelEvent\('purchase_success'/, '79K paid recovery success must be tracked');
checks.buyerJourneyEvents = true;

assert.match(files.webhook, /recordPaymentEvent/, 'webhook must persist payment event outcomes');
for (const status of ['matched', 'ignored', 'amount_too_low', 'no_match', 'error', 'unauthorized']) {
  assert.match(files.webhook, new RegExp(`status: '${status}'|status: event\.status`), `webhook must account for ${status} events`);
}
assert.match(files.webhook, /Duplicate payment_ref ignored/, 'webhook must log idempotent duplicate handling');
assert.match(files.webhookSecurity, /summarizePaymentContentForLog/, 'webhook logs must summarize payment content instead of dumping raw body');
assert.match(files.webhookSecurity, /hasContent[\s\S]*candidates[\s\S]*length/, 'payment content summary must be structured');
checks.paymentWebhookEvents = true;

assert.match(files.roadmapGenerate, /\[roadmap\/restore\]/, 'roadmap restore must have structured restore logs');
assert.match(files.roadmapGenerate, /\[roadmap\/generate\]/, 'roadmap generation must have structured failure logs');
assert.match(files.roadmapProgress, /\[roadmap\/progress\]/, 'progress persistence route must log failures');
checks.restoreAndProgressLogs = true;

assert.match(files.adminDelete, /\[admin\/delete-customer\]/, 'admin cleanup must log scoped cleanup action');
assert.match(files.adminDelete, /maskPhone\(phone\)/, 'admin cleanup logs must mask phone');
assert.match(files.adminManualConfirm, /\[admin\/manual-confirm\]/, 'manual confirm must log failures/rate-limit');
assert.match(files.privacyDelete, /\[privacy\/delete-request\]/, 'privacy delete requests must log failures');
checks.adminAndPrivacyLogs = true;

for (const [name, source] of Object.entries(files)) {
  assert.doesNotMatch(source, /console\.(log|info|warn|error)\([^\n]*process\.env\.(WEBHOOK_SECRET_KEY|ADMIN_DASHBOARD_KEY|SUPABASE_SERVICE_ROLE_KEY)/i, `${name} must not log secret env values`);
  assert.doesNotMatch(source, /console\.(log|info|warn|error)\([^\n]*req\.headers\.get\(['"](authorization|x-webhook-signature|x-sepay-signature)['"]\)/i, `${name} must not log auth headers`);
  assert.doesNotMatch(source, /process\.env\.(WEBHOOK_SECRET_KEY|ADMIN_DASHBOARD_KEY|SUPABASE_SERVICE_ROLE_KEY)[\s\S]{0,120}console\./i, `${name} must not print secret env values`);
}
checks.noSecretLogging = true;

const consoleLines = allServerLogs.split(/\r?\n/).filter(line => /console\.(log|info|warn|error)/.test(line));
for (const line of consoleLines) {
  if (/phone/i.test(line)) {
    assert.match(line, /maskPhone\(/, `server log mentioning phone must mask it: ${line.trim()}`);
  }
}
assert.match(files.adminDelete, /phone: maskPhone\(phone\)/, 'admin cleanup log must explicitly mask phone');
checks.noFullPhoneLogging = true;

console.log(JSON.stringify({ passed: true, checks }, null, 2));
