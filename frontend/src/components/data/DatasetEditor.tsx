import DatasetPreprocessing from "./DatasetPreprocessing";
import type { useDataset } from "../../hooks/useDataset";
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
  const {page,setPage,filter,setFilter,totalRows,filteredCount}=dataset;
  const {
    inputFile, document, error, isReading, updateFile, hasHeader, setHasHeader,
    columns, rows, roles, updateRole, excludedRows, toggleExcluded, updateCell,
    includedCount, canConfirmData, validation, preprocessingErrors,
    columnsConfirmed, setColumnsConfirmed, confirmedSnapshot, confirmDataset,
    changes, hasDataChanges, restoreData, downloadProcessedCsv,
  } = dataset;
  if (!inputFile || !document) return null;
  const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows;
  const inputCount = roles.filter((role) => role === "input").length;
  const outputCount = roles.filter((role) => role === "output").length;

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
      {error && <p className="error-message" role="alert">{error}</p>}
      {isReading && <CsvReadProgress percent={dataset.readProgress} onCancel={dataset.cancelRead}/>}

      <fieldset className="dataset-controls" disabled={isReading || dataset.isWorking}>
        <legend className="visually-hidden">Thiết lập và chỉnh sửa dữ liệu</legend>
        <div className="dataset-options">
          <label className="dataset-header-toggle">
            <input type="checkbox" checked={hasHeader} onChange={(event) => { setHasHeader(event.target.checked); setPage(1); }} />
            Dòng đầu là tên cột
          </label>
          <span className="file-limit">{inputCount} cột input · {outputCount} cột label</span>
        </div>
        {document.paddedRows > 0 && <p className="dataset-notice">Có {document.paddedRows} dòng thiếu ô ở cuối; các ô đó được hiển thị trống để bạn kiểm tra.</p>}
        <div className="dataset-stats" role="status" aria-live="polite">
          <span><strong>{totalRows}</strong> dòng dữ liệu</span>
          <span><strong>{includedCount}</strong> dòng giữ lại</span>
          <span><strong>{dataset.excludedCount}</strong> dòng đã bỏ</span>
        </div>
        <div className="dataset-validation-counts" role="status" aria-live="polite">
          <strong className={validation.invalidIncludedCount > 0 ? "has-errors" : ""}>{validation.invalidIncludedCount} dòng lỗi tổng cộng</strong>
          {validation.missingOutputCount > 0 && <span>{validation.missingOutputCount} dòng thiếu label</span>}
          {validation.invalidLabelCount > 0 && <span>{validation.invalidLabelCount} dòng label sai định dạng</span>}
          {validation.missingInputCount > 0 && <span>{validation.missingInputCount} dòng thiếu input</span>}
          {validation.invalidInputCount > 0 && <span>{validation.invalidInputCount} dòng input không đúng cấu hình</span>}
        </div>

        <div className="dataset-filter">
          <label htmlFor="dataset-filter">Hiển thị dòng</label>
          <select id="dataset-filter" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>
            <option value="all">Tất cả</option>
            <option value="label">Chỉ dòng label thiếu / sai định dạng</option>
            <option value="input">Chỉ dòng input thiếu / sai cấu hình</option>
            <option value="errors">Tất cả dòng lỗi</option>
            <option value="excluded">Dòng đã loại</option>
          </select>
          <span>{filteredCount} / {totalRows} dòng khớp</span>
        </div>
        {(dataset.isValidating || dataset.isPageLoading) && <p role="status" className="dataset-local-note">{dataset.isValidating ? "Đang kiểm tra dữ liệu trên ổ đĩa…" : "Đang tải trang…"}</p>}
        {filteredCount ? (
          <DatasetTable rows={pageRows} columns={columns} roles={roles} excludedRows={excludedRows} changedCells={changes.changedCells} rowIssues={validation.rowIssues}
            onRoleChange={updateRole} onCellChange={updateCell} onToggleExcluded={toggleExcluded}
            onActiveRowChange={() => {}} />
        ) : <p className="dataset-notice">Không có dòng dữ liệu khớp bộ lọc.</p>}
        <div className="dataset-pagination">
          <span>{filteredCount ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredCount)}` : "0"} / {filteredCount} dòng đang lọc</span>
          <div>
            <button className="secondary-button" type="button" disabled={currentPage === 1 || dataset.isPageLoading || dataset.isValidating}
              onClick={() => setPage(currentPage - 1)}>Trước</button>
            <span>Trang {currentPage}/{pageCount}</span>
            <button className="secondary-button" type="button" disabled={currentPage === pageCount || dataset.isPageLoading || dataset.isValidating}
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
          excludedCount={dataset.excludedCount}
          invalidCount={validation.invalidIncludedCount}
          canConfirm={canConfirmData && !isReading && !dataset.isWorking}
          columnsConfirmed={columnsConfirmed}
          isConfirmed={confirmedSnapshot !== null}
          onColumnsConfirmed={setColumnsConfirmed}
          onConfirm={() => { if (confirmedSnapshot) onContinue(); else void confirmDataset().then(ok => { if (ok) onContinue(); }); }}
        />
      </fieldset>
      <p className={canConfirmData ? "dataset-ready" : "dataset-notice"} role="status">
        {canConfirmData
          ? `Dữ liệu đã sẵn sàng: ${includedCount} dòng, ${inputCount} cột input và ${outputCount} cột output.`
          : !inputCount || !outputCount
            ? "Chọn ít nhất một cột input và một cột output; mỗi cột chỉ có một vai trò."
            : preprocessingErrors.length ? "Hoàn tất cấu hình tiền xử lý cho input và label trước khi xác nhận."
            : !includedCount ? "Cần giữ lại ít nhất một dòng để huấn luyện."
              : "Còn input hoặc label lỗi. Hãy sửa các ô tô màu hoặc tick bỏ dòng trước khi xác nhận."}
      </p>
      <p className="dataset-local-note">Dữ liệu và chỉnh sửa được lưu trên ổ đĩa trong kho trình duyệt; chưa thay đổi tệp gốc. Xóa dữ liệu trang web sẽ xóa kho này. Hãy tải CSV để giữ bản riêng.</p>
    </section>
  );
}
