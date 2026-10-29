interface DatasetChangesProps {
  editedCells: number;
  editedRows: number;
  hasDataChanges: boolean;
  canDownload: boolean;
  onRestore: () => void;
  onDownloadCsv: () => void;
}

export default function DatasetChanges({
  editedCells, editedRows, hasDataChanges, canDownload,
  onRestore, onDownloadCsv,
}: DatasetChangesProps) {
  return (
    <section className="dataset-changes" aria-labelledby="changes-title">
      <div className="dataset-changes-heading">
        <h3 id="changes-title">Thay đổi so với dữ liệu gốc</h3>
        <p role="status" aria-live="polite">
          <strong>{editedCells}</strong> ô đã sửa · <strong>{editedRows}</strong> dòng có chỉnh sửa
        </p>
      </div>
      <p className="dataset-help">Sửa lại đúng giá trị gốc sẽ không còn tính là thay đổi. Ô đã sửa có viền xanh; ô thiếu output vẫn được đánh dấu đỏ.</p>
      <div className="dataset-actions">
        <button className="primary-button" type="button" disabled={!canDownload} onClick={onDownloadCsv}>
          Tải CSV đã xử lý <span aria-hidden="true">↓</span>
        </button>
        <button className="secondary-button" type="button" disabled={!hasDataChanges} onClick={onRestore}
          title="Khôi phục giá trị gốc và giữ lại tất cả dòng; không đổi lựa chọn input/output và tiêu đề">
          Khôi phục dữ liệu
        </button>
      </div>
      <p className="dataset-local-note">CSV tải về giữ thứ tự cột và tiêu đề nếu có, dùng các giá trị đã sửa và bỏ dòng đã tick.</p>
      <p className="dataset-local-note">Khôi phục dữ liệu sẽ hoàn tác toàn bộ ô đã sửa và bỏ tick loại dòng, giữ nguyên lựa chọn cột.</p>
    </section>
  );
}