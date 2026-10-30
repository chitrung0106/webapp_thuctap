import type { useDataset } from "../../hooks/useDataset";
import HelpNote from "../common/HelpNote";

interface LabelPreprocessingSettingsProps { dataset: ReturnType<typeof useDataset>; }

export default function LabelPreprocessingSettings({ dataset }: LabelPreprocessingSettingsProps) {
  const { columns, roles, rows, excludedRows, labelPreprocessing, updateLabelPreprocessing, preprocessingErrors } = dataset;
  return (
    <section className="label-preprocessing" aria-labelledby="label-processing-title">
      <div className="dataset-processing-heading"><div><h3 id="label-processing-title">Cách xử lý cột label</h3></div></div>
      <div className="column-processing-grid">
        {columns.map((name, index) => {
          if (roles[index] !== "output") return null;
          const task = labelPreprocessing[index]?.task ?? "unset";
          const values = [...new Set(rows.filter((row) => !excludedRows.has(row.id)).map((row) => row.values[index]).filter((value) => value.trim()))];
          const errors = preprocessingErrors.filter((error) => error.startsWith(`Label ${name}:`) || error.startsWith("Các label trong cùng lượt"));
          return (
            <article className={`column-processing-card label-processing-card ${errors.length ? "is-incomplete" : "is-complete"}`} key={index}>
              <div className="column-processing-title"><strong>{name}</strong><span>Cột {index + 1} · Label</span></div>
              <p className="column-value-examples">Giá trị mẫu: {values.slice(0, 4).map((value) => JSON.stringify(value)).join(" · ") || "Chưa có"}</p>
              <div className="training-field">
                <label htmlFor={`label-task-${index}`}>Bạn muốn dự đoán gì từ label này?</label>
                <select id={`label-task-${index}`} value={task} onChange={(event) => updateLabelPreprocessing(index, event.target.value as "unset" | "binary" | "multiclass" | "regression")}>
                  <option value="unset">Chọn loại bài toán...</option>
                  <option value="binary">Binary classification — Phân loại hai lớp</option>
                  <option value="multiclass">Multiclass classification — Phân loại nhiều lớp</option>
                  <option value="regression">Hồi quy — một giá trị số</option>
                </select>
              </div>
              {(task === "binary" || task === "multiclass") && <div className="label-processing-explanation">
                <strong>Phần mềm tự đổi tên nhóm thành mã số</strong>
                <p>Bạn đã chọn {task === "binary" ? "phân loại hai lớp" : "phân loại nhiều lớp"}. Có {values.length} nhóm trong các dòng đang giữ lại. Ví dụ Bình thường / Có lỗi được đổi thành mã số khi train; kết quả dự đoán sẽ hiển thị lại tên ban đầu. Bạn không cần tự đổi.</p>
                <p>Mã chỉ đại diện cho lớp, không mang ý nghĩa lớn nhỏ. Cả nhãn chữ và mã nhóm viết bằng số đều được xử lý như tên lớp.</p>
                <p>Label 0, 1, 2 cũng được coi là tên nhóm; model chọn nhóm, không trả giá trị ở giữa như 1.5.</p>
              </div>}
              {task === "regression" && <div className="label-processing-explanation">
                <strong>Giữ nguyên giá trị số · Không mã hóa lớp</strong>
                <p>Ví dụ: dự đoán nhiệt độ 25.5 hoặc giá tiền 100000. Giá trị và đơn vị của label được giữ nguyên.</p>
                <p>Ô không phải số được tô màu để bạn sửa hoặc loại dòng. Không đổi các giá trị số thành mã lớp 0, 1, 2...</p>
              </div>}
              {errors.length > 0 && <ul className="column-config-notes">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
            </article>
          );
        })}
      </div>
      <HelpNote title="Label là chữ hay số thì chọn thế nào?">
        <p><strong>Label là đáp án bạn muốn model dự đoán. Hãy chọn theo ý nghĩa của đáp án:</strong></p>
        <p><strong>Phân loại — chọn một nhóm:</strong> ví dụ “Bình thường” hoặc “Có lỗi”. Bạn cũng có thể dùng số để đặt tên nhóm: 0 = Bình thường, 1 = Có lỗi, 2 = Nguy hiểm. Model sẽ chọn một trong các nhóm này, không dự đoán ra 1.5.</p>
        <p><strong>Hồi quy — dự đoán một con số:</strong> ví dụ nhiệt độ hoặc giá tiền. Nếu label có các nhiệt độ 25, 30, 35, model có thể dự đoán 28.6. Nếu chọn phân loại, 25, 30, 35 sẽ được coi là ba nhóm riêng.</p>
        <p><strong>Bạn không cần tự đổi chữ sang số.</strong> Khi train phân loại, phần mềm tự đổi tên nhóm thành mã số để model xử lý. Khi trả kết quả, phần mềm đổi mã về tên nhóm ban đầu. Việc đổi này gọi là encoding.</p>
        <p>File CSV của bạn vẫn giữ nguyên các label đã nhập. Nếu chọn nhiều cột label trong một lượt, hãy chọn cùng loại bài toán cho các cột đó.</p>
        <p><strong>Label có cả 0, 1 và “Có lỗi”:</strong> hiện được hiểu là ba nhóm riêng. Nếu 1 và “Có lỗi” cùng nghĩa, bạn cần sửa cho thống nhất trước. Web không tự biết hai tên này là một nhóm.</p>
        <p><strong>Label trống:</strong> bổ sung đáp án đúng hoặc bỏ dòng. Các chữ như “?”, “unknown” không tự được nhận là thiếu; ở chế độ phân loại chúng sẽ thành tên nhóm nếu bạn giữ lại.</p>
        <p><strong>Một nhóm có rất ít dòng:</strong> sau khi chia dữ liệu có thể không đủ mẫu hoặc nhóm đó không xuất hiện trong train. Lượt chạy có thể báo lỗi; cần bổ sung dữ liệu hoặc điều chỉnh cách chia. Giữ tỷ lệ lớp không giải quyết được mọi trường hợp quá ít mẫu.</p>
        <p>Nếu validation/test chứa nhóm label chưa từng có trong train, lượt chạy sẽ báo lỗi. Điều này khác với một giá trị input mới: model không thể học đáp án mà nó chưa từng thấy.</p>
        <p>Mỗi cột label hiện là một đáp án riêng, mỗi model được train riêng cho từng cột. Ô “A;B” không được tự hiểu là hai nhãn đồng thời. Hãy chạy riêng các label phân loại và các label hồi quy.</p>
      </HelpNote>
    </section>
  );
}