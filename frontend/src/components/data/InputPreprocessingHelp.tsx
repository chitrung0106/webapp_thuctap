import type { ReactNode } from "react";

function Guide({ title, children }: { title: string; children: ReactNode }) {
  return <details className="help-note"><summary><span className="help-note-icon" aria-hidden="true">?</span> {title}</summary><div className="help-note-content">{children}</div></details>;
}

export default function InputPreprocessingHelp() {
  return (
    <div aria-label="Hướng dẫn xử lý dữ liệu đầu vào">
      <Guide title="Nếu dữ liệu đã được xử lý trước">
        <ul>
          <li><strong>DỮ LIỆU SỐ:</strong> nếu đã chuẩn hóa và muốn dùng nguyên các giá trị hiện có, chọn <strong>Số → Giữ nguyên số</strong> để không chuẩn hóa lần nữa.</li>
          <li><strong>DỮ LIỆU CHỮ:</strong> nếu chỉ làm sạch tên nhóm nhưng vẫn còn chữ như “Bình thường”, “Có lỗi”, chọn <strong>Phân loại → One-hot</strong> khi các nhóm không có thứ tự, hoặc <strong>Ordinal</strong> khi có thứ tự rõ ràng. Nếu đã mã hóa thành các cột số và muốn giữ đúng cách mã hóa đó, chọn <strong>Số → Giữ nguyên số</strong> cho các cột kết quả; không mã hóa lại.</li>
        </ul>
        <p>Chỉ giữ nguyên mã số khi bạn biết cách mã hóa trước đó phù hợp với model. Hãy lưu lại bộ chuẩn hóa hoặc bảng mã để dùng đúng khi model dự đoán. Các bộ biến đổi học từ dữ liệu cần được học trên tập train; xử lý trên cả bộ trước khi chia có thể làm kết quả đánh giá quá lạc quan.</p>
      </Guide>
      <Guide title="Chọn Số hay Phân loại?">
        <p><strong>Số:</strong> nhiệt độ 25.5, độ ẩm 60, dòng điện 1.2 — đây là các giá trị đo có ý nghĩa lớn nhỏ.</p>
        <p><strong>Phân loại:</strong> chế độ Tắt / Chậm / Nhanh. Dù viết thành mã 0 / 1 / 2, chúng vẫn có thể là các nhóm.</p>
        <p>Mã số thứ tự dòng hoặc mã thiết bị chỉ dùng để theo dõi thường có thể chọn “Không dùng”.</p>
      </Guide>
      <Guide title="Ô trống hoặc cảm biến báo lỗi thì làm sao?">
        <p>Nếu cột nhiệt độ có 25, 30 và “không đo được”, hãy giữ loại <strong>Số</strong>, sửa bằng số đo đúng nếu biết hoặc tick <strong>Bỏ dòng</strong>. Còn ô chữ hoặc ô trống trong dòng giữ lại thì chưa thể xác nhận dữ liệu.</p>
        <p>Các mã như -999 vẫn là số nên web không tự biết đó là lỗi. Hãy kiểm tra quy ước của cảm biến. Số 0 cũng có thể là số đo thật, không nên tự bỏ.</p>
        <p>Nhập số như 25.5, không kèm °C hoặc %. Dùng cùng đơn vị cho cả cột và khi model dự đoán. Web không tự điền dữ liệu thiếu hay sửa số đo bất thường.</p>
      </Guide>
      <Guide title="Chuẩn hóa và mã hóa: chọn thế nào?">
        <p><strong>Cột Số:</strong> StandardScaler đổi thang đo quanh 0; MinMaxScaler đưa giá trị train về khoảng 0–1; Giữ nguyên số không đổi giá trị. Chuẩn hóa không sửa lỗi cảm biến.</p>
        <p><strong>Cột Phân loại:</strong> One-hot tạo một cột cho mỗi nhóm, hợp với các nhóm không có thứ tự. Ordinal gán Thấp → 0, Vừa → 1, Cao → 2; bạn cần khai báo thứ tự nhóm.</p>
        <p>Đây là cấu hình cho lúc train, không thay đổi CSV tải về. Khi sử dụng model để dự đoán, cần dùng lại đúng cách biến đổi và thứ tự input đã dùng khi train.</p>
      </Guide>
    </div>
  );
}