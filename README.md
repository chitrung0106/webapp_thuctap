# Output Inspector

Webapp khung để tải lên hai file input/output, tìm các dòng input còn thiếu trong output, xem thống kê và tải danh sách thiếu dạng CSV.

## Chạy backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend mặc định chạy tại `http://localhost:8000`. API gồm `GET /api/health` và `POST /api/compare`.

## Chạy frontend

Mở terminal khác tại thư mục gốc:

```bash
cd frontend
npm install
npm run dev
```

Frontend mặc định chạy tại `http://localhost:5173`. Có thể cấu hình URL backend bằng biến môi trường `VITE_API_BASE_URL`.

## Quy tắc đối chiếu hiện tại

- Nhận file UTF-8 dạng TXT hoặc CSV; mỗi dòng được xem là một bản ghi văn bản.
- Bỏ dòng trống và khoảng trắng ở đầu/cuối dòng.
- So sánh có tính số lần xuất hiện, vì vậy các dòng trùng lặp vẫn được phát hiện.
- Giới hạn mỗi file 10 MB. File được đọc trong request và không được lưu lâu dài.
- Chưa có database. Chọn epoch và export model cần được triển khai sau khi chốt định dạng model và schema dữ liệu.

## Kiểm tra backend

```bash
cd backend
python -m pytest -q
```