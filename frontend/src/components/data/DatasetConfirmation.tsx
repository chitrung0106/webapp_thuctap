interface DatasetConfirmationProps {
  preprocessingSummary: string[];
  labelProcessingSummary: string[];
  inputColumns: string[];
  outputColumns: string[];
  includedCount: number;
  excludedCount: number;
  invalidCount: number;
  canConfirm: boolean;
  columnsConfirmed: boolean;
  isConfirmed: boolean;
  onColumnsConfirmed: (value: boolean) => void;
  onConfirm: () => void;
}

export default function DatasetConfirmation({
  preprocessingSummary, labelProcessingSummary, inputColumns, outputColumns, includedCount, excludedCount, invalidCount,
  canConfirm, columnsConfirmed, isConfirmed, onColumnsConfirmed, onConfirm,
}: DatasetConfirmationProps) {
  return (
    <section className="dataset-confirmation" aria-labelledby="confirmation-title">
      <p className="eyebrow">KIỂM TRA TRƯỚC KHI HUẤN LUYỆN / CÓ GIÁM SÁT</p>
      <h3 id="confirmation-title">Xác nhận dữ liệu và cột đã chọn</h3>
      <dl className="dataset-confirmation-summary">
        <div className={!inputColumns.length ? "is-pending" : ""}><dt>Input</dt><dd>{inputColumns.join(" · ") || "Chưa chọn"}</dd></div>
        <div className={!outputColumns.length ? "is-pending" : ""}><dt>Label (output)</dt><dd>{outputColumns.join(" · ") || "Chưa chọn"}</dd></div>
        <div><dt>Tiền xử lý input</dt><dd>{preprocessingSummary.length ? preprocessingSummary.map((item, index) => <span key={index} className={item.includes("Chưa chọn") ? "is-pending" : ""}>{index > 0 && "; "}{item}</span>) : <span className="is-pending">Chưa chọn input</span>}</dd></div>
        <div><dt>Xử lý label</dt><dd>{labelProcessingSummary.length ? labelProcessingSummary.map((item, index) => <span key={index} className={item.includes("Chưa chọn") ? "is-pending" : ""}>{index > 0 && "; "}{item}</span>) : <span className="is-pending">Chưa chọn label</span>}</dd></div>
        <div><dt>Dòng giữ lại / loại bỏ</dt><dd>{includedCount} / {excludedCount}</dd></div>
        <div className={invalidCount > 0 ? "has-errors" : ""}><dt>Dòng giữ lại còn lỗi</dt><dd>{invalidCount}</dd></div>
      </dl>
      <label className="dataset-header-toggle">
        <input type="checkbox" checked={columnsConfirmed} onChange={(event) => onColumnsConfirmed(event.target.checked)} />
        Tôi đã kiểm tra và chọn đúng cột input, label và dòng dữ liệu.
      </label>
      <div className="dataset-confirmation-actions">
        <button className="primary-button" type="button" disabled={!canConfirm || !columnsConfirmed} onClick={onConfirm}>
          {isConfirmed ? "Tiếp tục bước 02 →" : "Xác nhận dữ liệu & tiếp tục →"}
        </button>
        <p className={isConfirmed ? "dataset-ready" : "dataset-local-note"} role="status">
          {isConfirmed
            ? "Đã xác nhận. Bạn có thể tiếp tục thiết lập huấn luyện."
            : canConfirm ? "Xác nhận trước khi chuyển sang thiết lập huấn luyện."
              : "Chọn đủ input/label, giữ lại ít nhất một dòng và sửa hoặc loại các dòng lỗi."}
        </p>
      </div>
      <p className="dataset-local-note">Thay đổi dữ liệu, dòng bị loại, tiêu đề hoặc cấu hình cột hoặc tiền xử lý sẽ yêu cầu xác nhận lại.</p>
    </section>
  );
}