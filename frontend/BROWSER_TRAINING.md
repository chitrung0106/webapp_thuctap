# Huấn luyện bằng máy người dùng và GPU tùy chọn

## Cách sử dụng

1. Bước 1 giữ nguyên: chọn CSV, sửa/loại dòng, chọn input/label và tiền xử lý.
2. Bước 2 → **Tài nguyên huấn luyện → Máy của bạn** là mặc định. CPU/RAM của thiết bị truy cập thực hiện train; CSV không gửi tới backend.
3. Checkbox **Sử dụng GPU cho model có hỗ trợ** mặc định **tắt**. Hiện MLP hỗ trợ GPU qua WebGPU; các model khác vẫn CPU.
4. Xác nhận rồi RUN. Đổi nơi train hoặc checkbox GPU sẽ hủy xác nhận cũ, cần xác nhận lại.
5. Dashboard/popup ghi thiết bị thực tế. Nếu GPU không khả dụng hoặc gặp lỗi, MLP chạy lại bằng CPU và ghi rõ lý do.
6. Tải ZIP như trước. MLP GPU được đóng thành pipeline dự đoán scikit-learn từ đúng trọng số đã học; không train lại khi export. Code Python tải về không cần GPU hoặc TensorFlow.js.

**Máy chủ** sử dụng backend theo `VITE_API_BASE_URL` (mặc định `http://localhost:8000`), hiện chạy CPU. CatBoost chưa được runtime browser hỗ trợ: chọn Máy chủ và cài thư viện backend tương ứng.

## Chạy local bằng CMD

```bat
cd /d F:\thuc_tap\frontend
npm install
npm run dev
```

Mở URL Vite in ra, thường là http://localhost:5173; cổng bận có thể chuyển sang cổng tiếp theo. Không cần backend khi chọn Máy của bạn. Node.js 24 đã được kiểm thử.

Kiểm tra bản build:

```bat
npm run build
npm run preview
```

Trong môi trường công cụ hạn chế bộ nạp cấu hình mặc định, có thể thêm `-- --configLoader runner` vào các lệnh Vite trên.

## Các file chính

- `src/services/trainingApi.ts`: chọn browser/server từ cấu hình đã xác nhận.
- `src/services/browserTraining.ts`: quản lý worker, tiến độ, hủy và ZIP.
- `src/services/serverTrainingApi.ts`: giữ API backend hiện có.
- `src/workers/training.worker.js`: chạy Python ngoài luồng giao diện; chỉ import bộ train GPU khi cần.
- `src/workers/gpuTraining.js`: TensorFlow.js/WebGPU, dense MLP, Adam/SGD, activation, early stopping và hủy.
- `public/browser-python/browser_engine.py`: điều phối phiên tạm và export.
- `public/browser-python/browser_gpu.py`: fit tiền xử lý trên train, nhận trọng số GPU, tính metrics và đóng pipeline.
- `scripts/sync-browser-python.mjs`: chạy trước dev/build; chỉ sao chép các file mã nguồn được liệt kê từ `backend/app`. Không sao chép config, secrets, dữ liệu hay storage backend. `public/browser-python/app` và manifest được sinh tự động, không commit riêng.

MLP CPU/GPU dùng cùng chỉ số dòng chia tập và cấu hình tiền xử lý. Bộ huấn luyện và phép tính số khác nhau, không đảm bảo cùng trọng số/kết quả dù cùng seed. Test chỉ đánh giá cuối, không dùng học/chọn điểm dừng. `metadata.json`, `run-summary.json` ghi device/backend thực tế; `training-plan.json` lưu lựa chọn nơi train và thiết bị.

## Phiên bản

Pyodide 314.0.7; Python 3.14.2; scikit-learn 1.8.0; NumPy 2.4.6; SciPy 1.18.0; pandas 3.0.2; joblib 1.5.3; XGBoost 2.1.4; LightGBM 4.6.0. GPU dùng TensorFlow.js và backend WebGPU 4.22.0.

Runtime browser khác môi trường backend. Dùng đúng requirements trong ZIP của lượt train khi chạy code tải về. KNN browser dùng brute-force từ lúc fit để tránh cấu trúc KDTree WASM32 không đọc được trên Windows64.

## Giới hạn và hosting

- Model/dữ liệu nằm trong RAM. Đóng/reload trang sẽ mất model chưa tải. RUN lượt mới thay thế model tạm của lượt cũ; tải model cũ trước khi RUN tiếp. Chưa có lịch sử/tài khoản.
- Cần mạng tải runtime lần đầu. CPU có thể train/export offline sau khi nạp xong. GPU cần tải thêm chunk TensorFlow.js vào lần đầu được chọn.
- Ngưỡng 128 MiB chỉ ước tính ma trận trung gian, không phải giới hạn file CSV hoặc phép đo tổng RAM; không đảm bảo tránh mọi trường hợp hết bộ nhớ.
- GPU có thể chậm hơn CPU với dữ liệu/mạng nhỏ. Không tự bật GPU và không cam kết nhanh hơn.
- Cần trình duyệt WebGPU và GPU/driver tương thích. Đã thử Chrome Windows với NVIDIA Lovelace; chưa xác nhận Safari/Firefox hoặc điện thoại thật.
- Cần HTTPS (localhost dùng được khi phát triển), COOP `same-origin`, COEP `require-corp`. Vite dev/preview có header; `public/_headers` và `vercel.json` cung cấp cấu hình cho hosting tương ứng. Hosting khác cần cấu hình tương đương.
- Runtime nạp từ jsDelivr. Nếu cấu hình CSP riêng, cho phép module/WASM/tệp runtime cần thiết từ nguồn này.
- Float16/Float32 là các biến thể portable hiện có, không phải mọi model đều chuyển thành TensorFlow Lite. Chưa thử firmware trên ESP32 thật.
- Sửa source khi đang train ở chế độ dev có thể khiến HMR reload và mất phiên. Thư viện GPU đã khai báo prebundle để lần bật GPU đầu không tự gây reload do phát hiện dependency.

## Kiểm thử frontend

```bat
node --test src/utils/__tests__/*.test.mjs
```

Báo cáo GPU, flow, screenshots và kiểm tra code tải về lưu trong workspace chat: `outputs/GPU_INTEGRATION_QA_2026-10-29`.

## Các chức năng bổ sung sau rà soát flow

- CSV đọc từng khối 512 KiB trong worker, có tiến độ byte và hủy; không tạo một chuỗi văn bản chứa toàn bộ file trước khi parse. Hủy/đọc lỗi giữ dataset cũ.
- Có cảnh báo reload/đóng trang khi còn dữ liệu sửa chưa tải hoặc model browser chưa tải. RUN lượt mới hỏi trước khi thay model tạm. Sau khi bắt đầu tải đủ model, cảnh báo model được gỡ; trình duyệt không cung cấp bằng chứng người dùng đã lưu file xuống đĩa thành công.
- Có nút Dừng hẳn worker cho browser. Thao tác này mất toàn bộ model tạm trong worker, kể cả model đã hoàn thành; dữ liệu đã chỉnh trên giao diện vẫn giữ. Backend chỉ dùng dừng hợp tác như trước.
- CatBoost bị vô hiệu hóa khi chọn browser; Chọn tất cả chỉ chọn 11 model browser hỗ trợ. GPU được kiểm tra khi người dùng bật tùy chọn, vẫn có CPU fallback nếu bộ train GPU gặp lỗi.
- Hiển thị tiến độ nạp từng thư viện, có hủy nạp và RUN lại. XGBoost/LightGBM chỉ tải khi được chọn.
- Tab Thử dự đoán: nhập một dòng hoặc chọn CSV mới có header input; ghép theo tên cột, dùng pipeline đã học, không fit lại. Có tải CSV kết quả. Model không cung cấp xác suất sẽ hiển thị dấu —.
- Có tải bảng so sánh CSV và báo cáo TXT gồm tất cả model/label và các tập train/validation/test. Không thay đổi các định dạng model export.

### CSV rất lớn

Streaming giải quyết cách đọc và độ phản hồi lúc phân tích, không biến toàn bộ pipeline thành out-of-core. Dataset đã phân tích, bản sửa, snapshot và ma trận train vẫn dùng RAM. Giữ lựa chọn không giới hạn dung lượng file, nhưng không cam kết train được CSV lớn tùy ý.

Nếu cần hỗ trợ tập vượt RAM, phải thiết kế lưu tạm IndexedDB/OPFS và đọc theo trang; đây mới là phần lưu/chỉnh dữ liệu. Huấn luyện ngoài RAM cần thuật toán có incremental/partial_fit hoặc máy chạy có đủ RAM. Tree/Forest/SVM hiện tại không tự trở thành train theo batch. Chưa tự đổi thuật toán, lấy mẫu, bỏ dòng hoặc tự điền dữ liệu để né giới hạn.
