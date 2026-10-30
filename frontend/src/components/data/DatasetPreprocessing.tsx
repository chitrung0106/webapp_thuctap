import LabelPreprocessingSettings from "./LabelPreprocessingSettings";
import type { useDataset } from "../../hooks/useDataset";
import InputPreprocessingHelp from "./InputPreprocessingHelp";

interface DatasetPreprocessingProps {
  dataset: ReturnType<typeof useDataset>;
}

export default function DatasetPreprocessing({ dataset }: DatasetPreprocessingProps) {
  const { columns, roles, rows, preprocessing, updatePreprocessing, excludedRows, preprocessingErrors } = dataset;
  return (
    <section className="dataset-preprocessing" aria-labelledby="column-processing-title">
      <div className="dataset-processing-heading"><div><h3 id="column-processing-title">Cách xử lý từng cột input</h3><p>Chọn Số cho các đại lượng có ý nghĩa lớn nhỏ, Phân loại cho tên hoặc mã nhóm.</p></div><span className="file-limit">CẤU HÌNH TRƯỚC KHI TRAIN</span></div>
      <div className="column-processing-grid">
        {columns.map((name, index) => {
          if (roles[index] !== "input") return null;
          const config = preprocessing[index];
          if (!config) return null;
          const examples = [...new Set(rows.filter((row) => !excludedRows.has(row.id)).map((row) => row.values[index]).filter((value) => value.trim()))].slice(0, 4);
          const errors = preprocessingErrors.filter((error) => error.startsWith(`Cột ${index + 1} (`));
          return (
            <article className={`column-processing-card ${errors.length ? "is-incomplete" : "is-complete"}`} key={index}>
              <div className="column-processing-title"><strong>{name}</strong><span>Cột {index + 1} · Input</span></div>
              <p className="column-value-examples">Giá trị mẫu: {examples.map((value) => JSON.stringify(value)).join(" · ") || "Chưa có"}</p>
              <div className="training-field">
                <label htmlFor={`column-kind-${index}`}>Loại dữ liệu</label>
                <select id={`column-kind-${index}`} value={config.kind} onChange={(event) => updatePreprocessing(index, { kind: event.target.value as "unset" | "number" | "category" })}>
                  <option value="unset">Chọn loại dữ liệu...</option><option value="number">Số — nhiệt độ, độ ẩm, giá trị đo</option><option value="category">Phân loại — tên loại, trạng thái, mã nhóm</option>
                </select>
              </div>
              {config.kind === "number" && (
                <div className="training-field">
                  <label htmlFor={`column-scaling-${index}`}>Chuẩn hóa cột này</label>
                  <select id={`column-scaling-${index}`} value={config.scaling} onChange={(event) => updatePreprocessing(index, { scaling: event.target.value as "standard" | "minmax" | "none" })}>
                    <option value="standard">StandardScaler — đổi thang đo quanh 0</option><option value="minmax">MinMaxScaler — khoảng 0–1 trên train</option><option value="none">Giữ nguyên số</option>
                  </select>
                  <small>Ô trống hoặc không phải số sẽ chặn xác nhận. Hãy sửa giá trị hoặc tick Bỏ dòng; hệ thống không tự điền hay xóa.</small>
                </div>
              )}
              {config.kind === "category" && (
                <div className="training-field">
                  <label htmlFor={`column-encoding-${index}`}>Mã hóa cột này</label>
                  <select id={`column-encoding-${index}`} value={config.encoding} onChange={(event) => updatePreprocessing(index, { encoding: event.target.value as "onehot" | "ordinal" })}>
                    <option value="onehot">One-hot — mỗi nhóm một cột</option><option value="ordinal">Ordinal — mỗi nhóm một mã số</option>
                  </select>
                  <small>Các giá trị được coi là tên nhóm, kể cả mã viết bằng số như 0, 1, 2.</small>
                  {config.encoding === "ordinal" && <>
                    <label htmlFor={`column-order-${index}`}>Thứ tự nhóm, từ nhỏ đến lớn</label>
                    <textarea id={`column-order-${index}`} rows={4} value={config.categoryOrder.join("\n")} placeholder={"Thấp\nTrung bình\nCao"}
                      onChange={(event) => updatePreprocessing(index, { categoryOrder: event.target.value.split(/\r\n|\r|\n/) })} />
                    <small>Mỗi dòng một giá trị, đúng như dữ liệu. Dòng đầu nhận mã 0, dòng tiếp theo mã 1... Phải khai báo đủ các nhóm đang giữ lại.</small>
                  </>}
                </div>
              )}
              {errors.length > 0 && <ul className="column-config-notes">{errors.map((error) => <li key={error}>{error.slice(error.indexOf(":") + 1).trim()}</li>)}</ul>}
            </article>
          );
        })}
      </div>
      <InputPreprocessingHelp />
      <LabelPreprocessingSettings dataset={dataset} />
      <p className="dataset-local-note">Đây là cấu hình xử lý, chưa biến đổi dữ liệu gốc hay CSV tải về. Khi train, encoder/scaler chỉ học từ tập train và được dùng lại cho validation, test và dữ liệu mới. Văn bản tự do cần pipeline riêng.</p>
    </section>
  );
}