import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = {
  page: fs.readFileSync('app/admin/page.tsx', 'utf8'),
  deleteButton: fs.readFileSync('app/admin/AdminDeleteCustomerButton.tsx', 'utf8'),
  manualConfirm: fs.readFileSync('app/admin/AdminManualConfirmButton.tsx', 'utf8'),
  quickConfirm: fs.readFileSync('app/admin/AdminQuickConfirmForm.tsx', 'utf8'),
  dashboard: fs.readFileSync('lib/adminDashboard.ts', 'utf8'),
  adminRequest: fs.readFileSync('lib/adminRequest.ts', 'utf8'),
  deleteRoute: fs.readFileSync('app/api/admin/delete-customer/route.ts', 'utf8'),
  manualRoute: fs.readFileSync('app/api/admin/manual-confirm/route.ts', 'utf8'),
};

const checks = {
  authProtected: false,
  customerCards: false,
  productAndStatusBadges: false,
  maskedCustomerIdentifiers: false,
  manualConfirmGuarded: false,
  twoStepCleanup: false,
  dryRunResultDetails: false,
  noSecretLeak: false,
};

assert.match(files.page, /isAdminDashboardAuthorized\(key\)/, 'admin page must require dashboard auth');
assert.match(files.dashboard, /timingSafeTextEqual|timingSafeEqual/, 'admin request auth must use timing-safe comparison through adminDashboard');
assert.match(files.deleteRoute, /protectAdminRequest\(req, 'admin-delete-customer'/, 'cleanup route must require admin auth');
assert.match(files.manualRoute, /protectAdminRequest\(req, 'admin-manual-confirm'/, 'manual confirm route must require admin auth');
checks.authProtected = true;

assert.match(files.page, /Khách hàng cần chăm sóc/, 'admin must keep a customer-care section');
assert.match(files.page, /function CustomerRow/, 'customer-care rows must render as cards');
assert.doesNotMatch(files.page, /<table[\s\S]{0,500}Khách hàng cần chăm sóc/, 'customer-care UI must not depend on a wide table');
assert.match(files.page, /InfoPill label="Tỉnh\/thành"/, 'customer cards must show province');
assert.match(files.page, /InfoPill label="Ngày tạo"/, 'customer cards must show created date');
assert.match(files.page, /InfoPill label="VSPI ID"/, 'customer cards must show VSPI identifier');
checks.customerCards = true;

assert.match(files.page, /Roadmap 79k/, 'customer cards must show 79K product badge');
assert.match(files.page, /Report 29k/, 'customer cards must show 29K product badge');
assert.match(files.page, /paid \? 'paid' : customer\.status \|\| 'pending'/, 'customer cards must show paid/pending status');
checks.productAndStatusBadges = true;

assert.match(files.page, /function maskAdminPhone/, 'admin page must mask phone by default');
assert.match(files.page, /maskAdminPhone\(customer\.phone\)/, 'customer card must render masked phone');
assert.match(files.page, /function maskAdminAccessCode/, 'admin page must mask access code by default');
assert.match(files.page, /maskAdminAccessCode\(customer\.accessCode\)/, 'customer card must render masked access code');
assert.doesNotMatch(files.page, /<span className="font-mono text-sm font-black text-white">\{customer\.phone/, 'customer cards must not render raw phone directly');
assert.doesNotMatch(files.page, /value=\{customer\.accessCode \|\| 'Chưa có'\}/, 'customer cards must not render raw access code directly');
checks.maskedCustomerIdentifiers = true;

assert.match(files.manualConfirm, /window\.confirm\(`Mở khóa thủ công gói/, 'row manual confirm must require explicit browser confirmation');
assert.match(files.quickConfirm, /window\.confirm\(`Mở khóa thủ công cho/, 'quick manual confirm must require explicit browser confirmation');
assert.match(files.quickConfirm, /normalizeVspiId/, 'quick confirm must normalize pasted VSPI');
checks.manualConfirmGuarded = true;

assert.match(files.deleteButton, /requestCleanup\('row', true\)/, 'row cleanup must dry-run first');
assert.match(files.deleteButton, /requestCleanup\('phone', true\)/, 'phone cleanup must dry-run first');
assert.match(files.deleteButton, /requestCleanup\('vspi', true\)/, 'VSPI cleanup must dry-run first');
assert.match(files.deleteButton, /Chạy dry-run trước khi xóa/, 'destructive cleanup must be blocked without dry-run');
assert.match(files.deleteButton, /requestCleanup\(preview\.mode, false\)/, 'delete button must only use preview mode after dry-run');
checks.twoStepCleanup = true;

assert.match(files.deleteButton, /preview\.results\.map/, 'dry-run preview must show per-table results');
assert.match(files.deleteButton, /item\.table/, 'dry-run preview must include table name');
assert.match(files.deleteButton, /item\.deleted/, 'dry-run preview must include affected count');
assert.match(files.deleteRoute, /results,/, 'delete API must return per-table results');
checks.dryRunResultDetails = true;

for (const [name, source] of Object.entries(files)) {
  assert.doesNotMatch(source, /ADMIN_DASHBOARD_KEY\s*=|WEBHOOK_SECRET_KEY\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|password\s*=/i, `${name} must not hardcode secrets`);
}
checks.noSecretLeak = true;

console.log(JSON.stringify({ passed: true, checks }, null, 2));
