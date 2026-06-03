import fs from 'node:fs';
import assert from 'node:assert/strict';

const files = {
  route: fs.readFileSync('app/api/admin/delete-customer/route.ts', 'utf8'),
  page: fs.readFileSync('app/admin/page.tsx', 'utf8'),
  button: fs.readFileSync('app/admin/AdminDeleteCustomerButton.tsx', 'utf8'),
  dashboard: fs.readFileSync('lib/adminDashboard.ts', 'utf8'),
  adminRequest: fs.readFileSync('lib/adminRequest.ts', 'utf8'),
};

function assertSourceContracts() {
  assert.match(files.route, /protectAdminRequest\(req, 'admin-delete-customer'/, 'delete route must require admin auth');
  assert.match(files.adminRequest, /enforceOrigin\(req\)/, 'admin requests must enforce origin for mutations');
  assert.match(files.route, /Missing or invalid delete mode/, 'route must reject missing mode');
  assert.match(files.route, /Missing row id or table/, 'row mode must reject missing row identifier');
  assert.match(files.route, /Missing phone/, 'phone mode must reject missing phone');
  assert.match(files.route, /Missing vspiId/, 'vspi mode must reject missing vspiId');
  assert.match(files.route, /Missing accessCode/, 'accessCode mode must reject missing access code');
  assert.match(files.route, /dryRun/, 'route must support dry-run');
  assert.match(files.route, /safeCount/, 'dry-run must count without deleting');
  assert.match(files.route, /maskPhone/, 'route must mask phone in logs/response');
  assert.doesNotMatch(files.route, /service_role|SUPABASE_SERVICE_ROLE|ADMIN_DASHBOARD_KEY\s*=|password\s*=/i, 'route must not hardcode secrets');
}

function assertDeleteModesAndTables() {
  for (const mode of ['row', 'phone', 'vspi', 'accessCode']) {
    assert.match(files.route, new RegExp(`mode === '${mode}'|value === '${mode}'`), `route must support ${mode} mode`);
  }
  for (const table of ['purchases', 'roadmaps', 'payment_events', 'scan_history', 'data_deletion_requests', 'zalo_subscribers']) {
    assert.match(files.route, new RegExp(table), `route must clean or account for ${table}`);
  }
  assert.match(files.route, /issueRoadmapAccessCode/, 'accessCode cleanup must resolve roadmap access code safely');
}

function assertUiActions() {
  for (const label of ['Xóa dòng', 'Xóa theo SĐT', 'Xóa theo VSPI']) {
    assert.match(files.button, new RegExp(label), `admin delete button must include ${label}`);
  }
  assert.match(files.button, /Bạn chắc chắn muốn xóa dòng test này\?/, 'row delete confirm text missing');
  assert.match(files.button, /Bạn chắc chắn muốn xóa tất cả dữ liệu test theo SĐT này\?/, 'phone delete confirm text missing');
  assert.match(files.button, /Bạn chắc chắn muốn xóa toàn bộ dữ liệu liên quan VSPI này\?/, 'vspi delete confirm text missing');
  assert.match(files.button, /Đã xóa dữ liệu test\./, 'success message missing');
  assert.match(files.button, /Không xóa được dữ liệu\. Vui lòng thử lại hoặc kiểm tra quyền admin\./, 'failure message missing');
  assert.match(files.page, /rowId=\{customer\.sourceId\}/, 'admin page must pass row id');
  assert.match(files.page, /sourceTable=\{customer\.sourceTable\}/, 'admin page must pass source table');
}

function assertDashboardRowIdentity() {
  assert.match(files.dashboard, /sourceTable: 'purchases'/, 'purchase rows need sourceTable');
  assert.match(files.dashboard, /sourceTable: 'roadmaps'/, 'roadmap rows need sourceTable');
  assert.match(files.dashboard, /sourceTable: 'scan_history'/, 'scan lead rows need sourceTable');
  assert.match(files.dashboard, /sourceTable: 'zalo_subscribers'/, 'zalo lead rows need sourceTable');
  assert.match(files.dashboard, /sourceId: row\.id \|\| null/, 'customer rows need sourceId');
  assert.match(files.dashboard, /select\('id, vspi_id/, 'purchase/roadmap selects must include id');
  assert.match(files.dashboard, /select\('id, phone, job_title/, 'scan selects must include id');
}

assertSourceContracts();
assertDeleteModesAndTables();
assertUiActions();
assertDashboardRowIdentity();

console.log(JSON.stringify({
  passed: true,
  checks: {
    auth: 'protectAdminRequest + origin guard present',
    modes: ['row', 'phone', 'vspi', 'accessCode'],
    dryRun: true,
    uiLabels: ['Xóa dòng', 'Xóa theo SĐT', 'Xóa theo VSPI'],
    destructiveProductionCall: false,
  },
}, null, 2));
