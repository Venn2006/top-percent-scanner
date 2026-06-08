# PRODUCT AUDIT REPORT - TOP LUONG

Ngay audit: 09/06/2026. Pham vi da kiem tra: `https://www.topluong.com`, `https://www.topluong.com/roadmap?new=1`, `/privacy`, `/terms`, `/methodology`, `/my-progress`, `robots.txt`, `sitemap.xml`. Thiet bi: desktop 1366x900 va mobile iPhone 13/390x844 qua Playwright. Bang chung luu tai `C:\Users\Venn\top-percent-scanner\output\playwright\topluong-audit`.

## 1. Executive Summary

- Tinh trang tong the: co the soft launch kin hoac ban nhe, chua nen chay ads lon. San pham da co core flow, result free co wow moment, 29k/79k co gia tri ro hon mat bang tool demo. Rui ro lon nam o do dai form/result, qua nhieu CTA, sitemap 404, va post-payment success/webhook chua xac minh duoc.
- Diem manh lon nhat: ket qua free cu the, co Top %, confidence score, VSPI ID, nguon du lieu, giai thich Top % va moc tang luong tiep theo. Day la khoanh khac co kha nang lam nguoi dung tin va tiep tuc.
- Diem yeu nguy hiem nhat: funnel qua day. Result sau scan co rat nhieu khoi, nhieu CTA 29k lap lai, them Zalo, nhom, share, roadmap, jump industry. Nguoi dung mobile de bi qua tai truoc khi hieu “mua 29k duoc gi”.
- Co nen launch chua: muc 3/4 - co the launch ban nhe, khong nen launch cong khai quy mo lon.
- 3 viec phai sua truoc tien: sua sitemap 404; rut gon result/paywall mobile thanh 1 luong doc ro; verify end-to-end payment success thuc te va recovery sau thanh toan.

## 2. Scorecard

| Hang muc | Diem /10 | Nhan xet ngan |
|---|---:|---|
| First impression | 7 | Hieu san pham nhanh, nhung hero gan nhu la form day du nen hoi nang. |
| Clarity | 7 | “Top may %” ro; gross/net/khu vuc/market salary hoi nhieu voi user lan dau. |
| Trust | 7 | Co nguon, methodology, privacy, terms, founder/Zalo; can them cach tinh ngan ngay trong flow. |
| UX flow | 6 | Core flow chay, nhung form/result/paywall dai va nhieu nhanh. |
| Mobile UX | 6 | Khong vo nghiem trong, nhung qua nhieu noi dung truoc CTA, dropdown tinh thanh rat dai. |
| UI design | 7 | Nhin nghiem tuc, premium hon nhieu MVP; palette hoi mot mau den/vang va card day dac. |
| Copywriting | 7 | Nhieu cau ban hang tot; van co doan dai, hoi “AI sales”, lap lai 29k. |
| Pricing/paywall | 7 | 29k ro gia tri; 79k ro hon nhieu. Can chia goi/scope gon hon. |
| Technical stability | 7 | Khong thay console error/4xx trong flow chinh; sitemap 404; payment success chua verify. |
| Conversion potential | 7 | Co pain va upsell tot; drop-off lon nhat o mobile form/result dai. |
| Launch readiness | 6 | Ban nhe duoc; public launch can fix tracking, sitemap, payment QA, CRO. |

## 3. Critical Issues

| Priority | Issue | Why it matters | Evidence | Recommended fix |
|---|---|---|---|---|
| P0 | `robots.txt` tro toi sitemap nhung `https://www.topluong.com/sitemap.xml` tra 404 | Lam SEO launch yeu, Google/Zalo/Facebook crawler mat tin hieu cau truc | `robots.txt` 200, `sitemap.xml` 404 | Tao `app/sitemap.ts` hoac public `sitemap.xml`; include home, roadmap, methodology, privacy, terms, report/share neu can index. |
| P1 | Chua xac minh duoc payment success/webhook thuc te | Neu user tra tien ma khong mo khoa ngay, mat tien + mat trust | Da mo QR 29k/79k; chua co giao dich ngan hang thuc de verify webhook | Chay canary voi giao dich 1 don that, log `payment_success`, recovery, support path. |
| P1 | Result/paywall qua dai, nhieu CTA lap lai | Mobile user den tu Facebook/Zalo de thoat truoc khi mua | Sau scan co Top 60%, warning, 29k card, La Ban, HR script, alert, preview, pricing, thang Top, band, share, group | Result free nen gom 3 khoi: Ket qua, Khoang cach, Mo khoa 29k. An phan con lai sau accordion. |
| P1 | Form trang chu hoi nhieu khai niem truoc khi co ket qua | Giam start/submit rate, dac biet user 30 giay | Field nghe, luong, gross/net/tong, tinh, market salary, kinh nghiem, terms | Default an “market salary” sau advanced; tinh thanh nen searchable; copy giai thich ngan hon. |
| P1 | CTA invalid van trong cam giac co the bam | User nhap sai luong thay nut mau vang, bam khong tien | Salary `abc`, `0`, `999999999` show loi, khong tao result; CTA van hien mau vang trong DOM snapshot | Khi invalid, disable ro rang hon va scroll/focus ve field loi; doi CTA text “Nhap luong hop le de xem ket qua”. |
| P2 | Metadata source co mojibake trong code | Neu build/render route nao do bi sai encoding se anh huong SEO/share | `app/layout.tsx` co chu Viet bi mojibake trong source, live render van hien dung | Sua source metadata ve UTF-8 dung, verify OG debugger. |
| P2 | Roadmap 79k form nang | Gia tri ro nhung nhieu field va van ban truoc thanh toan | `/roadmap?new=1` gom name, phone, role current, role target, future, salary current, salary target, duration, consent | Cho 3 template dien san + “toi muon tang luong trong nghe hien tai” default. |

## 4. Persona-based Findings

| Persona | Thay gi dau tien | Hieu trong 5 giay? | Muon tiep tuc | Nghi ngo / bo cuoc | Kha nang tra tien |
|---|---|---|---|---|---|
| NV van phong 8-12M | Headline Top may %, form nhap nghe/luong | Co | To mo minh co bi thap khong | Tinh thanh va gross/net co the lam ngan | Vua, neu free result noi ro “thap hon median bao nhieu”. |
| 3-5 nam 15-25M | Thay benchmark va moc Top | Co | Result co moc Top 40/50 va cau HR | Qua nhieu upsell lap lai | Cao cho 29k neu CTA noi “so neo HR + cau noi”. |
| Moi ra truong | Hieu so sanh luong, nhung form hoi “gross/net” co the la | Tuong doi | Roadmap 79k co template moi tot nghiep | Khong biet luong gross/net, target salary | Vua/thap; can “ban chua co luong? xem muc deal dau tien”. |
| Thu nhap cao 40-80M | Tim nguon/methodology | Co neu thay sources | Confidence score, methodology | Se nghi neu Top % nghe khong hop ly hoac source chung chung | Vua; can sample report cao cap va disclaimer. |
| Nguoi hoai nghi | Thay nguon, privacy, terms | Co | Founder/Zalo, khong ban data | Bank account ca nhan, khong refund sau unlock, AI claim | Thap/vua; can guarantee loi ky thuat va sample ro. |
| Mobile FB/Zalo | Thay headline + form dai | Co, nhung 30s hoi cang | Nut vang ro, result co Top | Scroll qua tinh thanh/result dai | Vua neu landing rut gon va CTA sticky. |

## 5. Funnel Audit

- Current funnel: Home -> nhap nghe/luong/context -> dong y terms -> free result -> nhieu CTA 29k -> QR/manual bank transfer -> user nhap SĐT/consent -> verify payment -> report unlock. Parallel: Roadmap 79k -> long intake -> QR -> verify -> AI roadmap.
- Drop-off risk lon nhat: truoc submit tren mobile do form dai; sau result do qua nhieu noi dung/CTA; tai payment do chuyen khoan thu cong + tai khoan ca nhan.
- Improved funnel: Home ngan -> 3 input bat buoc (nghe, luong, kinh nghiem) -> result free 1 man hinh -> paywall 29k 1 card -> payment QR + phone + consent -> success/recovery. Advanced fields de sau result hoac trong “ket qua chinh xac hon”.
- Tracking events can co: `view_home`, `start_form`, `select_role`, `salary_input_valid`, `submit_form`, `view_result`, `view_paywall_29k`, `click_payment_29k`, `payment_pending_29k`, `payment_success_29k`, `payment_failed_29k`, `share_result`, `view_roadmap`, `submit_roadmap_intake`, `click_payment_79k`, `payment_success_79k`.

## 6. Page-by-page / Screen-by-screen Audit

### Home / Scanner

- Muc tieu: lay thong tin va tao free result.
- Dang lam tot: headline ro; nguon du lieu hien ngay; role search co goi y; validation salary co; gross/net co giai thich; privacy/terms co link.
- Van de: qua nhieu field luc dau; danh sach tinh thanh select rat dai; “luong do thi truong nao quyet dinh” la concept kho voi user pho thong; CTA disabled khong noi field nao con thieu.
- Cach sua: mobile-first gom `Nghề`, `Lương/tháng`, `Kinh nghiệm`; tinh/khu vuc auto default + “Sua de chinh xac hon”; neu CTA disabled show checklist field con thieu.

### Result Free

- Muc tieu: tao wow moment va upsell.
- Dang lam tot: Top 60%, “cao hon 40%”, confidence 78/100, VSPI ID, sources, mốc Top 40 21.5M, khoang cach 3.5M.
- Van de: result free bien thanh landing dai; co nhieu CTA 29k khac nhau, de mat focus.
- Cach sua: phan free nen show: Top %, confidence, mốc tiep theo, 1 insight ca nhan, 1 CTA 29k. Cac bang Top/band/La Ban de accordion.

### 29k Paywall / Payment

- Muc tieu: ban bao cao luong.
- Dang lam tot: gia 29k ro, anchor 59k, noi dung CK co VSPI ID, co privacy consent, co loi khi chua dong y xu ly du lieu.
- Van de: QR/payment nam giua trang dai; bank account ca nhan can trust bo sung; chua xac minh payment success thuc.
- Cach sua: payment modal/doc lap voi 4 dong: so tien, QR, noi dung CK, sau khi chuyen lam gi. Them “neu 2 phut chua mo khoa, bam ho tro Zalo”.

### Roadmap 79k

- Muc tieu: ban lo trinh AI.
- Dang lam tot: value prop tot, noi ro khong phai tu van 1-1, co mốc thuc te: target 25M can 18-25 thang, 6 thang chi la 19M.
- Van de: form dai, role target co the gay lung tung, text nhieu truoc khi thanh toan.
- Cach sua: template “Moi tot nghiep”, “3+ nam dam chan”, “Muon doi huong” nen auto-fill 70% form; CTA sticky sau khi hop le.

### Privacy / Terms / Methodology / My Progress

- Dang lam tot: co founder/Zalo, khong ban data, xoa du lieu 7 ngay, disclaimer, source tiers, access code cho roadmap.
- Van de: sitemap 404; privacy can them email ho tro neu co; terms “khong hoan tien” hoi cung, nen viet lai theo huong “hoan tien neu loi ky thuat/khong nhan duoc”.

## 7. UX/UI Recommendations

- Layout: Tach form thanh compact scanner + advanced drawer. Ket qua free can co hierarchy: verdict, gap, action.
- Component: chuan hoa button states disabled/error/loading; pricing card chi 1 primary CTA; payment modal rieng.
- Mobile: sticky CTA, searchable province, hide source dropdown sau 1 dong, collapse long methodology/source lists.
- Typography: giam uppercase va font mono o noi dung dai; dung heading ngan hon trong card.
- Color: den/vang tao premium nhung dang mot mau; them neutral surface sang hon cho trust/legal/payment, xanh la nhe cho verified/success.
- Visual hierarchy: moi man hinh chi 1 viec chinh. Sau result, neu ban 29k thi dung 1 CTA chinh, 1 secondary “xem them mien phi”.

## 8. Copywriting Rewrite

- Headline 1: “Bạn đang được trả lương cao hay thấp hơn thị trường?”
- Headline 2: “Kiểm tra lương của bạn đang ở Top bao nhiêu % tại Việt Nam”
- Headline 3: “Nhập nghề và lương, xem ngay vị trí của bạn trên thị trường”
- Subheadline 1: “So sánh theo nghề, kinh nghiệm và khu vực. Có nguồn dữ liệu, có độ tin cậy, có mốc lương tiếp theo.”
- Subheadline 2: “Miễn phí trong 30 giây. Nếu muốn deal lương, mở báo cáo 29k để xem số neo và câu nên nói với HR.”
- Subheadline 3: “Kết quả chỉ là tham khảo có dữ liệu, không phải cam kết lương. Mục tiêu là giúp bạn bớt đoán mò khi nói chuyện lương.”
- CTA home: “Xem tôi đang ở Top mấy %”; “Kiểm tra lương miễn phí”; “So sánh lương ngay”.
- Paywall: “Mở báo cáo 29k nếu bạn muốn biết: nên neo mức nào, nói gì với HR, và cần bằng chứng gì để mức đó nghe có cơ sở.”
- Pricing: “29k - Báo cáo deal lương: benchmark cùng profile, mốc offer nên neo, câu justify, salary card để lưu/chụp.”
- Trust block: “Top Lương không bán dữ liệu lương cá nhân. SĐT chỉ dùng để xác nhận thanh toán, gửi báo cáo và hỗ trợ sau mua.”
- Free result: “Bạn đang ở Top 60% trong nhóm Chuyên viên Digital Marketing, TP.HCM, 3-5 năm. Mốc kế tiếp gần nhất là Top 50%: khoảng 19M/tháng.”
- Upsell: “Muốn biết nên nói con số nào với HR? Mở báo cáo 29k để xem mốc neo và câu trả lời đã cá nhân hóa.”
- Payment reassurance: “Chuyển khoản đúng nội dung. Nếu sau 2 phút chưa mở khóa, nhắn Zalo 0915.662.876 kèm mã VSPI để được xử lý.”
- Share message: “Tôi vừa kiểm tra lương đang ở Top __% theo nghề/khu vực. Thử xem bạn đang ở đâu: topluong.com”.
- 10 hook social: “Bạn có đang bị trả thấp mà không biết?”; “Cùng 18M, khác ngành là Top khác hẳn”; “HR hỏi kỳ vọng lương, bạn nên nói số nào?”; “Top 80% không có nghĩa là cao”; “Lương 15M ở TP.HCM đang là cao hay thấp?”; “Đừng deal lương bằng cảm giác”; “Một mức neo sai có thể mất cả chục triệu/năm”; “Sinh viên mới ra trường nên deal bao nhiêu?”; “3-5 năm kinh nghiệm mà lương đứng yên, vấn đề nằm ở đâu?”; “Kiểm tra lương miễn phí trong 30 giây”.

## 9. Technical QA Bugs

| ID | Bug | Vi tri | Cach tai hien | Severity | Expected | Actual | Cach sua |
|---|---|---|---|---|---|---|---|
| QA-01 | Sitemap 404 | `/sitemap.xml` | Mo `https://www.topluong.com/sitemap.xml` | P0 | 200 XML sitemap | 404 | Them sitemap route/static file. |
| QA-02 | Payment success chua xac minh | 29k/79k payment | Mo QR, khong co giao dich that de test webhook | P1 | Co bang chung unlock sau payment | Chua xac minh duoc | Chay canary payment, log webhook, recovery. |
| QA-03 | Result loading co the keo dai/khong ro | Main scan | Trong mot lan capture sau submit thay loading “Dang tinh...” sau 5s, sau do moi result | P2 | Loading co ETA/error retry | Loading co % nhung chua co timeout message | Them timeout 20s + retry/contact. |
| QA-04 | CTA invalid visually active | Main form | Nhap `abc`, `0`, `999999999` | P2 | CTA disabled ro va field error focus | Loi co hien, nut van trong nhu bam duoc | Disable style manh hon + CTA text theo loi. |
| QA-05 | Province select qua dai mobile | Main form | Mo mobile, scroll form | P2 | Searchable combobox/auto default | Select 60+ tinh lam man hinh rat dai | Dung combobox search + popular first. |
| QA-06 | Source metadata mojibake | `app/layout.tsx` | Doc source | P2 | UTF-8 dung | Chu Viet trong source bi mojibake, live hien dung | Sua file encoding/noi dung metadata. |
| QA-07 | Role suggestion click can miss-select | Main form | Click vung text/category “Marketing” thay vi LI cu the | P2 | Chi click item cu the moi close/select | Broad click co the dong/khong select trong automation | Tang hit area item, role=option, selected state ro. |
| QA-08 | 29k paywall co qua nhieu CTA | Result | Sau scan thanh cong | P2 | 1 CTA chinh nhat quan | Nhieu CTA text khac nhau | Chuan hoa copy/position. |

## 10. SEO / Social Sharing Audit

- SEO issue: title/meta/OG co tren live; `robots.txt` co; `sitemap.xml` 404; chua thay blog/content indexable; source metadata co mojibake.
- Title de xuat: “Top Lương - Kiểm tra lương của bạn đang ở Top bao nhiêu % tại Việt Nam”.
- Meta description de xuat: “Nhập nghề, lương và kinh nghiệm để ước tính vị trí thu nhập của bạn theo thị trường Việt Nam. Có nguồn dữ liệu, confidence score và mốc lương nên hướng tới.”
- OG title: “Lương bạn đang ở Top mấy %?”
- OG description: “Kiểm tra miễn phí trong 30 giây theo nghề, khu vực và kinh nghiệm. Xem mốc lương kế tiếp và báo cáo deal lương 29k.”
- OG image idea: anh/result card that voi Top %, confidence, “cao hon __% nguoi cung profile”, khong chi gradient.
- 10 keyword: top lương, so sánh lương, kiểm tra lương, benchmark lương, lương ngành nghề, lương marketing, lương IT Việt Nam, deal lương, mức lương mong muốn, lương theo kinh nghiệm.
- 5 bai blog dau tien: “Cách trả lời khi HR hỏi mức lương mong muốn”; “Top % lương nghĩa là gì?”; “Lương 15 triệu ở TP.HCM là cao hay thấp?”; “Sinh viên mới ra trường nên deal lương bao nhiêu?”; “Khi nào nên nhảy việc để tăng lương?”.

## 11. Analytics Plan

Da co Vercel Analytics va PostHog pageview trong source. Da co helper `trackEvent`; chua xac minh day du event funnel tren live. Can plan:

| Event | Trigger | Properties | Why it matters |
|---|---|---|---|
| `view_home` | Home load | source, utm, device | Do traffic quality. |
| `start_form` | Focus role/salary | first_field, device | Do intent. |
| `select_role` | Chon nghe | role_id, role_label, custom | Biet role nao convert. |
| `salary_input_valid` | Salary pass validation | salary_bucket, income_type | Do friction/segment. |
| `submit_form` | Click scan | role, salary_bucket, city, experience | Funnel conversion. |
| `view_result` | Result rendered | percentile, confidence, role, city | Segment result -> pay. |
| `view_paywall` | 29k card visible | package, percentile, gap_to_target | Paywall exposure. |
| `click_payment` | QR/payment click | package, price, vspi_id | Purchase intent. |
| `payment_pending` | Order created | package, bank_code, amount | Diagnose drop. |
| `payment_success` | Unlock confirmed | package, time_to_unlock | Revenue truth. |
| `share_result` | Share click | channel, percentile | Viral loop. |
| `submit_roadmap_intake` | 79k form submit | current_role, target_role, duration, salary_gap | Roadmap demand. |

## 12. Monetization Recommendation

- Nen ban 2 goi: 29k la goi chinh dau funnel; 79k la upsell sau khi user da thay gap/roadmap need.
- Gia hop ly: 29k tot cho impulse purchase; 79k hop ly neu preview ro checklist tung tuan.
- Goi moi/goi chinh: 29k la moi, 79k la AOV booster. Khong nen day 79k qua som tren home, chi de nav phu.
- Lam 29k dang tien: show sample 3 dong truoc/sau: “so neo HR”, “cau noi”, “bang chung can chuan bi”.
- Refund/guarantee: nen co “hoan tien neu loi ky thuat/khong nhan duoc bao cao trong 24h”; khong nen noi “khong hoan tien” qua noi bat trong sales moment.
- Payment VN: QR bank transfer tot cho MVP; de scale nen them Momo/ZaloPay/VietQR webhook on-chain bank confirmation; luon co Zalo support.

## 13. 7-Day Fix Plan Before Launch

- Day 1: Sua sitemap, metadata UTF-8, OG verify. Ket qua: crawler/share dung.
- Day 2: Rut gon mobile home form: 3 field chinh + advanced collapse. Ket qua: tang start->submit.
- Day 3: Rut gon free result/paywall, 1 CTA 29k chinh. Ket qua: giam qua tai, tang click payment.
- Day 4: Chay payment canary 29k va 79k that, test webhook, recovery, support. Ket qua: khong ban loi.
- Day 5: Gan funnel events PostHog/Vercel, dashboard theo device/source/package. Ket qua: launch co so do.
- Day 6: Polish privacy/payment trust: guarantee loi ky thuat, Zalo support, copy bank transfer. Ket qua: tang trust tai checkout.
- Day 7: Mobile QA full, edge cases, FB/Zalo in-app browser, OG debugger. Ket qua: san sang ads nho.

## 14. Launch Checklist

- Product: free result dung cho 10 role pho bien; 29k sample ro; 79k preview ro; loading/error/retry co.
- UX: mobile home ngan; result co 1 CTA; province searchable; disabled state ro.
- Payment: VietQR dung amount/content; webhook success; duplicate payment; pending recovery; support Zalo.
- Trust: methodology ngan trong flow; privacy/terms; founder/contact; data deletion; no-sell-data.
- Analytics: event funnel, UTM, source FB/Zalo, package revenue, payment attribution.
- Legal: disclaimer tham khao; AI limitation; refund loi ky thuat; data retention/delete.
- Content: SEO title/meta, sitemap, 5 bai blog, OG image.
- Customer support: template tra loi “da chuyen chua mo khoa”, “nhap sai noi dung CK”, “xoa du lieu”.

## 15. Final Verdict

- Launch duoc chua: co the ban nhe/soft launch kin. Chua nen public launch lon.
- Neu launch ngay: rui ro lon la user mobile bi qua tai, payment unlock that chua duoc chung minh, SEO bi thieu sitemap, va tracking khong du de biet tien roi o dau.
- Neu chi co 48 gio: sua sitemap; verify payment 29k/79k that; rut gon result/paywall thanh 1 CTA chinh; them timeout/retry/support cho payment.
- Neu co 7 ngay: lam day du plan ben tren, dac biet mobile CRO va funnel tracking.
- Cach bien san pham thanh thu nguoi Viet san sang tra tien: ban su yen tam khi deal lương, khong ban “AI report”. Noi thang: “29k de biet nen noi so nao voi HR va can bang chung gi”; “79k de bien muc tieu thanh checklist tung tuan”. Giam buzzword, tang sample that, tang trust payment, va giu free result gon nhung du dau de nguoi dung muon mo khoa.

