import type { ChangeEvent } from "react";
import { formatBytes } from "../../utils/formatBytes";

interface DataUploadPanelProps {
  inputFile: File | null;
  error: string;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export default function DataUploadPanel({ inputFile, error, onInputChange }: DataUploadPanelProps) {
  return (
    <section className="upload-panel" aria-labelledby="upload-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">BƯỚC 01</p>
          <h2 id="upload-title">Tải dữ liệu trước khi huấn luyện</h2>
        </div>
        <span className="file-limit">CSV · Không giới hạn dung lượng</span>
      </div>
      <div className="data-upload-row">
        <label className="data-upload-button">
          <span aria-hidden="true">+</span> Input data
          <input
            className="data-file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={onInputChange}
            aria-label="Input data"
            aria-describedby={error ? "upload-error" : "upload-file-info"}
            aria-invalid={Boolean(error)}
          />
        </label>
        <p id="upload-file-info" className="data-file-info" role="status">
          {inputFile ? `${inputFile.name} · ${formatBytes(inputFile.size)}` : "Chọn tệp CSV. Cấu trúc dữ liệu sẽ được kiểm tra trước khi hiển thị."}
        </p>
      </div>
      {error && <p id="upload-error" className="error-message" role="alert">{error}</p>}
    </section>
  );
}