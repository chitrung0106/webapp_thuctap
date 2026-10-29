import DatasetPreprocessing from "./DatasetPreprocessing";
import HelpNote from "../common/HelpNote";
import { useState } from "react";
import type { useDataset } from "../../hooks/useDataset";
import { formatBytes } from "../../utils/formatBytes";
import DatasetConfirmation from "./DatasetConfirmation";
import DatasetChanges from "./DatasetChanges";
import DatasetTable from "./DatasetTable";
import CsvReadProgress from './CsvReadProgress';

interface DatasetEditorProps {
  dataset: ReturnType<typeof useDataset>;
  onContinue: () => void;
}

const PAGE_SIZE = 50;

export default function DatasetEditor({ dataset, onContinue }: DatasetEditorProps) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [activeRowId, setActiveRowId] = useState<number | null>(null);
  const {
    inputFile, document, error, isReading, updateFile, hasHeader, setHasHeader,
    columns, rows, roles, updateRole, excludedRows, toggleExcluded, updateCell,
    includedCount, missingCount, trainingData, validation, preprocessingErrors,
    columnsConfirmed, setColumnsConfirmed, confirmedSnapshot, confirmDataset,
    changes, hasDataChanges, restoreData, downloadProcessedCsv,
  } = dataset;
  if (!inputFile || !document) return null;
  const filteredRows = rows.filter((row) => {
    if (filter === "all" || row.id === activeRowId) return true;
    if (filter === "excluded") return excludedRows.has(row.id);
    if (excludedRows.has(row.id)) return false;
    const issues = validation.rowIssues.get(row.id) ?? [];
    if (filter === "label") return issues.some((issue, index) => roles[index] === "output" && Boolean(issue));
    if (filter === "input") return issues.some((issue, index) => roles[index] === "input" && Boolean(issue));
    return issues.some(Boolean);
  });
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const inputCount = roles.filter((role) => role === "input").length;
  const outputCount = roles.filter((role) => role === "output").length;
  const delimiterName = document.delimiter === "\t" ? "tab" : document.delimiter === ";" ? "chấm phẩy" : "phẩy";

  return (
    <section className="upload-panel dataset-editor" aria-labelledby="dataset-title" aria-busy={isReading}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">BƯỚC 01 / DATA PREPARATION</p>
          <h2 id="dataset-title">Chuẩn bị dữ liệu</h2>
        </div>
        <label className="secondary-button data-change-file">
          Đổi tệp
          <input className="data-file-input" type="file" accept=".csv,text/csv" onChange={updateFile}
            aria-label="Đổi tệp CSV" />
        </label>
      </div>
      <p className="data-file-info">{inputFile.name} · {formatBytes(inputFile.size)} · Dấu phân cách: {delimiterName}</p>
      {error && <p className="error-message" role="alert">{error} Dữ liệu trước đó vẫn được giữ lại.</p>}
      {isReading && <CsvReadProgress percent={dataset.readProgress} onCancel={dataset.cancelRead}/>}

      <fieldset className="dataset-controls" disabled={isReading}>
        <legend className="visually-hidden">Thiết lập và chỉnh sửa dữ liệu</legend>
        <div className="dataset-options">
          <label className="dataset-header-toggle">
            <input type="checkbox" checked={hasHeader} onChange={(event) => { setHasHeader(event.target.checked); setPage(1); }} />
            Dòng đầu là tên cột
          </label>
          <span className="file-limit">{inputCount} cột input · {outputCount} cột output</span>
        </div>
        <HelpNote title="Input, label và Không dùng là gì?">
          <p>Input là thông tin model được nhìn thấy. Label là đáp án bạn muốn model học để dự đoán.</p>
          <p className="help-example">Ví dụ dự đoán thiết bị có lỗi không: nhiệt độ và độ ẩm là input; trạng thái bình thường/lỗi là label.</p>
          <p>Không dùng nghĩa là bỏ cột khỏi dữ liệu đưa vào model. Tick Bỏ dòng thì bỏ cả dòng khỏi train. Cột Không dùng vẫn có trong CSV đã xử lý khi tải về.</p>
        </HelpNote>
        <p className="dataset-help">Chọn Input hoặc Output ở đầu mỗi cột. Bấm vào ô để sửa. Tick “Bỏ dòng” để loại dòng khỏi dữ liệu huấn luyện.</p>
        <p className="dataset-local-note">Chọn cách xử lý cho từng cột input bên dưới. Dữ liệu gốc được giữ nguyên; phép biến đổi sẽ thực hiện khi train.</p>
        {document.paddedRows > 0 && <p className="dataset-notice">Có {document.paddedRows} dòng thiếu ô ở cuối; các ô đó được hiển thị trống để bạn kiểm tra.</p>}
        <div className="dataset-stats" role="status" aria-live="polite">
          <span><strong>{rows.length}</strong> dòng dữ liệu</span>
          <span><strong>{includedCount}</strong> dòng giữ lại</span>
          <span><strong>{rows.length - includedCount}</strong> dòng đã bỏ</span>
          <span className={missingCount > 0 ? "dataset-warning" : ""}><strong>{missingCount}</strong> dòng giữ lại thiếu label</span>
        </div>
        <p className="dataset-validation-counts" role="status">Dòng giữ lại: {validation.invalidLabelCount} label sai định dạng · {validation.missingInputCount} thiếu input · {validation.invalidInputCount} input không đúng cấu hình · {validation.invalidIncludedCount} dòng lỗi tổng cộng.</p>

        <div className="dataset-filter">
          <label htmlFor="dataset-filter">Hiển thị dòng</label>
          <select id="dataset-filter" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); setActiveRowId(null); }}>
            <option value="all">Tất cả</option>
            <option value="label">Chỉ dòng label thiếu / sai định dạng</option>
            <option value="input">Chỉ dòng input thiếu / sai cấu hình</option>
            <option value="errors">Tất cả dòng lỗi</option>
            <option value="excluded">Dòng đã loại</option>
          </select>
          <span>{filteredRows.length} / {rows.length} dòng khớp</span>
        </div>
        {filteredRows.length ? (
          <DatasetTable rows={pageRows} columns={columns} roles={roles} excludedRows={excludedRows} changedCells={changes.changedCells} rowIssues={validation.rowIssues}
            onRoleChange={updateRole} onCellChange={updateCell} onToggleExcluded={toggleExcluded}
            onActiveRowChange={setActiveRowId} />
        ) : <p className="dataset-notice">Không có dòng dữ liệu khớp bộ lọc.</p>}
        <div className="dataset-pagination">
          <span>{filteredRows.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredRows.length)}` : "0"} / {filteredRows.length} dòng đang lọc</span>
          <div>
            <button className="secondary-button" type="button" disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}>Trước</button>
            <span>Trang {currentPage}/{pageCount}</span>
            <button className="secondary-button" type="button" disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}>Sau</button>
          </div>
        </div>
        <DatasetChanges
          editedCells={changes.cellCount}
          editedRows={changes.rowCount}
          hasDataChanges={hasDataChanges}
          canDownload={hasDataChanges && includedCount > 0}
          onRestore={restoreData}
          onDownloadCsv={downloadProcessedCsv}
        />
        <DatasetPreprocessing dataset={dataset} />
        <DatasetConfirmation
          preprocessingSummary={columns.flatMap((name, index) => {
            if (roles[index] !== "input") return [];
            const config = dataset.preprocessing[index];
            return [`${name}: ${config?.kind === "number" ? `Số · ${config.scaling}` : config?.kind === "category" ? `Phân loại · ${config.encoding}` : "Chưa chọn"}`];
          })}
          labelProcessingSummary={columns.flatMap((name, index) => roles[index] === "output" ? [`${name}: ${dataset.labelPreprocessing[index]?.task === "binary" ? "Binary — Phân loại hai lớp" : dataset.labelPreprocessing[index]?.task === "multiclass" ? "Multiclass — Phân loại nhiều lớp" : dataset.labelPreprocessing[index]?.task === "regression" ? "Hồi quy · Giữ nguyên số" : "Chưa chọn"}`] : [])}
          inputColumns={columns.flatMap((name, index) => roles[index] === "input" ? [`#${index + 1} ${name}`] : [])}
          outputColumns={columns.flatMap((name, index) => roles[index] === "output" ? [`#${index + 1} ${name}`] : [])}
          includedCount={includedCount}
          excludedCount={rows.length - includedCount}
          invalidCount={validation.invalidIncludedCount}
          canConfirm={trainingData !== null && !isReading}
          columnsConfirmed={columnsConfirmed}
          isConfirmed={confirmedSnapshot !== null}
          onColumnsConfirmed={setColumnsConfirmed}
          onConfirm={() => { if (confirmedSnapshot || confirmDataset()) onContinue(); }}
        />
      </fieldset>
      <p className={trainingData ? "dataset-ready" : "dataset-notice"} role="status">
        {trainingData
          ? `Dữ liệu đã sẵn sàng: ${trainingData.inputs.length} dòng, ${inputCount} cột input và ${outputCount} cột output.`
          : !inputCount || !outputCount
            ? "Chọn ít nhất một cột input và một cột output; mỗi cột chỉ có một vai trò."
            : preprocessingErrors.length ? "Hoàn tất cấu hình tiền xử lý cho input và label trước khi xác nhận."
            : !includedCount ? "Cần giữ lại ít nhất một dòng để huấn luyện."
              : "Còn input hoặc label lỗi. Hãy sửa các ô tô màu hoặc tick bỏ dòng trước khi xác nhận."}
      </p>
      <p className="dataset-local-note">Chỉnh sửa được giữ trong phiên này trên trình duyệt, chưa thay đổi tệp gốc.</p>
    </section>
  );
}
