import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = {
  roadmapPage: fs.readFileSync('app/roadmap/page.tsx', 'utf8'),
  myProgressPage: fs.readFileSync('app/my-progress/page.tsx', 'utf8'),
  scanner: fs.readFileSync('app/components/TopPercentScanner.tsx', 'utf8'),
  roadmapRoute: fs.readFileSync('app/api/roadmap/generate/route.ts', 'utf8'),
  fallback: fs.readFileSync('lib/buildDeterministicRoadmapFallback.ts', 'utf8'),
};

const visibleCopy = [
  files.roadmapPage,
  files.myProgressPage,
  files.scanner,
  files.roadmapRoute,
  files.fallback,
].join('\n');

const checks = {
  oldDirectionLabelsRemoved: false,
  noOverpromisePhrases: false,
  targetSalaryCaveat: false,
  customRoleWarning: false,
  myProgressPrivacy: false,
  pendingPaymentNextStep: false,
  report29ValueCopy: false,
  noMojibake: false,
};

for (const label of [
  'Ở lại & tăng lương',
  'Đổi sang role trả cao hơn',
  'Lên quản lý/lead',
  'Đi sâu chuyên môn',
]) {
  assert.doesNotMatch(files.roadmapPage, new RegExp(label.replace(/[+]/g, '\\+')), `old roadmap direction label must not remain: ${label}`);
}
for (const label of [
  'Tăng scope trong vai trò hiện tại',
  'Chuyển sang cơ hội scope/lương tốt hơn',
  'Mở rộng sang lead/quản lý',
  'Đào sâu chuyên môn hiếm',
]) {
  assert.match(files.roadmapPage, new RegExp(label.replace(/[+]/g, '\\+')), `new roadmap direction label missing: ${label}`);
}
checks.oldDirectionLabelsRemoved = true;

for (const phrase of [
  'đảm bảo tăng lương',
  'chắc chắn tăng lương',
  'cam kết tăng lương',
  'tăng lương tự động',
  'lời hứa tăng lương',
]) {
  assert.doesNotMatch(visibleCopy, new RegExp(phrase, 'i'), `launch copy must avoid overpromise phrase: ${phrase}`);
}
assert.match(visibleCopy, /không phải lời hứa về kết quả lương|không phải kết quả lương tự xảy ra/, 'copy must include a clear no-guarantee caveat');
checks.noOverpromisePhrases = true;

assert.match(files.roadmapPage, /Đây là mục tiêu để AI lập kế hoạch, không phải lời hứa về kết quả lương/, 'target salary helper must clarify planning target, not a guarantee');
assert.match(files.roadmapPage, /Mức này hơi tham vọng cho thời gian đã chọn/, 'stretch target salary warning must remain visible');
checks.targetSalaryCaveat = true;

assert.match(files.roadmapPage, /Nghề này chưa có benchmark chuẩn trong hệ thống/, 'custom role warning must explain limited benchmark precision');
checks.customRoleWarning = true;

assert.match(files.myProgressPage, /Nhập SĐT để tìm báo cáo và lộ trình của bạn/, 'my-progress must explain phone lookup');
assert.match(files.myProgressPage, /cần mã truy cập đã nhận sau khi thanh toán/, 'my-progress must explain full access code requirement');
assert.match(files.myProgressPage, /Mã truy cập chỉ hiện dạng rút gọn|Mã truy cập được ẩn một phần/, 'my-progress must explain masking/privacy');
assert.match(files.myProgressPage, /maskClientAccessCode\(roadmapHit\.accessCode\)/, 'found roadmap card must render masked access code');
checks.myProgressPrivacy = true;

assert.match(files.scanner, /Đơn đang chờ xác nhận/, 'pending payment copy must say the order is waiting for confirmation');
assert.match(files.scanner, /nội dung chuyển khoản có mã VSPI/, 'pending payment copy must tell user to check VSPI transfer content');
assert.match(files.scanner, /Không chuyển khoản lại/, 'pending payment copy must prevent duplicate transfers');
checks.pendingPaymentNextStep = true;

assert.match(files.scanner, /Xem bạn đang ở đâu so với thị trường/, '29K value copy must explain market position');
assert.match(files.scanner, /Mốc Top 50 \/ Top 30 \/ Top 20 nếu dữ liệu đủ tin cậy/, '29K value copy must mention percentile milestones with data caveat');
assert.match(files.scanner, /Gợi ý câu nói chuyện lương/, '29K value copy must describe salary conversation guidance');
checks.report29ValueCopy = true;

const launchSnippets = [
  'Tăng scope trong vai trò hiện tại',
  'Chuyển sang cơ hội scope/lương tốt hơn',
  'Mở rộng sang lead/quản lý',
  'Đào sâu chuyên môn hiếm',
  'Nhập SĐT để tìm báo cáo và lộ trình của bạn',
  'Mã truy cập chỉ hiện dạng rút gọn',
  'Đơn đang chờ xác nhận',
  'Xem bạn đang ở đâu so với thị trường',
  'Đây là mục tiêu để AI lập kế hoạch, không phải lời hứa về kết quả lương',
];
for (const snippet of launchSnippets) {
  for (const marker of ['Ã', 'Â', 'Ä', 'Æ', 'á»', 'áº', 'â€', '�']) {
    assert.doesNotMatch(snippet, new RegExp(marker), `launch snippet must not contain mojibake marker ${marker}: ${snippet}`);
  }
}
checks.noMojibake = true;

console.log(JSON.stringify({ passed: true, checks }, null, 2));
