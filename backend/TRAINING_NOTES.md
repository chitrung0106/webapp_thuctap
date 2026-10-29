# Bản chạy thử: train nhiều model, dashboard và export

## Khởi chạy ngày kiểm tra

Dừng backend cũ, rồi chạy `START_LOCAL.cmd` trong thư mục backend. Script dùng `.venv` của dự án, cài requirements đã chốt phiên bản và mở API tại localhost:8000. Chạy `START_LOCAL.cmd --all-models` nếu muốn cài cả 12 nhóm model.

Frontend: mở terminal khác, `cd /d F:\thuc_tap\frontend`, rồi `npm.cmd run dev`.

Các phiên bản được kiểm tra trên Python 3.12; backend gồm FastAPI, scikit-learn, NumPy, SciPy, pandas và joblib. `requirements-optional.txt` bổ sung XGBoost / LightGBM / CatBoost. Nếu chưa cài, chọn các model này sẽ báo lỗi cho riêng model đó; lượt chạy vẫn tiếp tục.

## Flow

1. Chọn CSV. Có thể thử `examples/sensor_classification.csv` hoặc `sensor_regression.csv`.
2. Tick Dòng đầu là tên cột, chọn input/label. Sửa dữ liệu thiếu hoặc bỏ dòng.
3. Cấu hình tiền xử lý riêng từng input, xác định label là phân loại hay hồi quy, xác nhận.
4. Chọn model và thông số; xác nhận cấu hình rồi RUN.
5. Dashboard hiển thị tiến độ, metric, thời gian, lịch sử loss khi model có cung cấp, ma trận nhầm lẫn và dự đoán mẫu.
6. So sánh theo validation; test chỉ đánh giá sau fit. Chọn các model thành công, sang Export.
7. Tải ZIP Python + code mẫu hoặc Joblib. Tùy chọn kèm CSV đúng bản đã dùng khi RUN.

## Backend

- GET `/api/training/capabilities`
- POST `/api/training/runs`
- GET `/api/training/runs/{id}`
- POST `/api/training/runs/{id}/cancel`
- POST `/api/training/runs/{id}/export`

Hàng đợi trong một process, chạy lần lượt trên CPU. Model/scaler/encoder và metadata được lưu tại `backend/storage/results/training/` (không đưa vào Git). Frontend nhớ id lượt gần nhất trên trình duyệt và có thể mở lại sau refresh. Model đã hoàn tất vẫn có thể tải sau khi backend restart; lượt đang chạy bị gián đoạn sẽ được báo lỗi, không giả lập resume.

MLP có loss từng epoch và hỗ trợ dừng giữa epoch. Model khác kết thúc fit hiện tại trước khi dừng hàng đợi. Gradient Boosting có đường loss theo bước; model không có lịch sử loss sẽ hiển thị đúng là không cung cấp.

Tiền xử lý và LabelEncoder chỉ fit trên train; gói export giữ pipeline, thứ tự input, phiên bản thư viện và bảng nhãn. Không nạp file Joblib không tin cậy.

## Phạm vi bản khung và phần tiếp theo

- Chưa có bộ chuyển đổi ONNX, TFLite, ESP32/C++; giao diện ghi rõ chưa tích hợp. Không tạo file giả bằng cách đổi đuôi.
- Chưa có tài khoản, phân quyền, queue nhiều máy hoặc triển khai production.
- Lịch sử chỉ có lượt gần nhất trong UI; file của các lượt cũ vẫn nằm ở backend.
- Dữ liệu lớn vẫn đọc vào RAM; không áp hạn mức upload tự đặt nhưng cần tối ưu streaming/job storage trước khi public hosting.
- Hiện hỗ trợ dữ liệu bảng, phân loại hoặc hồi quy. Mỗi model train riêng cho từng label; không trộn hai loại bài toán trong một lượt.
- Không tự tối ưu hyperparameter; các giá trị mặc định là điểm bắt đầu.

## Đã kiểm tra trong lần triển khai này

- 11 kiểm tra backend: toàn bộ model cơ bản và ba thư viện mở rộng cho cả phân loại/hồi quy; export chạy lại được dự đoán; encoder/scaler chỉ fit trên train; dừng hàng đợi; mở lại kết quả trên đĩa.
- 42 kiểm tra frontend về CSV, dữ liệu, tiền xử lý, cấu hình và xếp hạng kết quả.
- TypeScript và build production.
- Kiểm tra bằng trình duyệt: upload CSV, cấu hình cột, xác nhận, train Decision Tree + MLP, biểu đồ loss, tải ZIP kèm CSV, phục hồi sau reload, giao diện mobile không tràn ngang.

## Lệnh kiểm tra

Backend: `python -m pytest tests -q` trong backend.
Frontend: `node --test src/utils/__tests__/*.test.mjs`, rồi `npm.cmd run build` trong frontend.

Nếu Vite bị chặn ghi `.vite-temp` bởi quyền Windows của Codex, kiểm tra build bằng `node node_modules/vite/bin/vite.js build --configLoader runner`.