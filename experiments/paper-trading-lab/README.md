# Paper Trading Lab V1

Prototype độc lập cho thử thách **$100 → $1,000** theo chế độ mô phỏng.

## Chạy

Tải thư mục này rồi mở `index.html` bằng Chrome/Edge. Không cần cài package và không cần API key.

## Có gì trong V1

- Tài khoản paper bắt đầu ở $100, mục tiêu hiển thị $1,000.
- Dữ liệu giá mô phỏng có seed cố định để kết quả lặp lại và kiểm tra được.
- Tín hiệu EMA 12/26; chỉ LONG khi độ lệch đủ lớn hơn chi phí giả định.
- Risk-based sizing: tối đa khoảng 1% equity cho mỗi lệnh.
- Stop-loss 1.2%, take-profit 2.4%.
- Phí 0.10% mỗi chiều và slippage 0.05% mỗi chiều.
- Daily loss limit 3% và kill switch ở drawdown 10%.
- Equity curve, vị thế hiện tại, win rate, max drawdown và nhật ký lệnh.

## Giới hạn cần hiểu

Đây là **paper simulation**, không phải bằng chứng chiến lược có lợi nhuận. Mốc 10x không được đảm bảo. Chưa nối API đặt lệnh và không có trường nhập secret.

## Gate trước khi nối tiền thật

1. Thay simulation bằng dữ liệu public realtime nhưng vẫn paper.
2. Chạy nhiều market regime và tối thiểu hàng nghìn signal.
3. Tách train/test, tính expectancy, profit factor và drawdown.
4. Chỉ cân nhắc tiny-live nếu kết quả sau phí còn dương và ổn định.
