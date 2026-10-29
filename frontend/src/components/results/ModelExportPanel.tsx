import { useEffect, useState } from "react";
import type { TrainingRun } from "../../types/trainingRun";
import type { ExportFormat, ExportOptions, ExportPreview, ExportVariant } from "../../types/export";
import { isRunActive } from "../../types/trainingRun";
import { exportTrainingModels, previewTrainingModels } from "../../services/trainingApi";
import { formatBytes } from "../../utils/formatBytes";
import { formatMetric, metricLabel } from "../../utils/trainingResults";
import ExportFilePreview from "./ExportFilePreview";

interface ModelExportPanelProps { run: TrainingRun; selectedIds: Set<string>; onToggle: (id: string) => void; onSelectAll: () => void; }

export default function ModelExportPanel({ run, selectedIds, onToggle, onSelectAll }: ModelExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>("python_zip");
  const [includeData, setIncludeData] = useState(false);
  const [variants, setVariants] = useState<ExportVariant[]>([]);
  const [includeFirmware, setIncludeFirmware] = useState(false);
  const [board, setBoard] = useState<"esp32" | "esp32s3">("esp32");
  const [interval, setInterval] = useState("1000");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data: ExportPreview } | null>(null);
  const successful = run.results.filter((result) => result.status === "succeeded");
  const ids = successful.filter((result) => selectedIds.has(result.id)).map((result) => result.id);
  const busy = isRunActive(run.status);
  const intervalValid = !includeFirmware || interval.trim() !== "" && Number.isInteger(Number(interval)) && Number(interval) >= 20 && Number(interval) <= 60000;
  const options: ExportOptions = { resultIds: ids, format, includeData, variants: format === "python_zip" ? variants : [], includeFirmware: format === "python_zip" && includeFirmware, firmware: { board, intervalMs: includeFirmware ? Number(interval) : 1000 } };
  const requestKey = JSON.stringify({ runId: run.id, options });
  const preview = loaded?.key === requestKey ? loaded.data : null;
  useEffect(() => {
    setPreviewError(""); setLoaded(null); setError("");
    if (busy || !ids.length || !intervalValid) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try { const data = await previewTrainingModels(run.id, JSON.parse(requestKey).options as ExportOptions, controller.signal); if (!controller.signal.aborted) setLoaded({ key: requestKey, data }); }
      catch (failure) { if (!controller.signal.aborted) setPreviewError(failure instanceof Error ? failure.message : "Không tạo được bản xem trước."); }
    }, 350);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [requestKey, busy, intervalValid, previewAttempt]);
  function toggleVariant(variant: ExportVariant) {
    const next = variants.includes(variant) ? variants.filter((value) => value !== variant) : [...variants, variant]; setVariants(next); if (!next.length) setIncludeFirmware(false);
  }
  async function download() {
    if (busy || !ids.length || isExporting || !preview || !intervalValid) return;
    setError(""); setIsExporting(true);
    try { await exportTrainingModels(run.id, ids, format, includeData, { variants: options.variants, includeFirmware: options.includeFirmware, firmware: options.firmware }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Không tải được gói export."); }
    finally { setIsExporting(false); }
  }
  return <section className="export-panel export-workspace" aria-labelledby="model-export-title">
    <div className="panel-heading"><div><p className="eyebrow">MODEL EXPORT / SOURCE PACKAGE</p><h2 id="model-export-title">Xuất model &amp; mã nguồn sử dụng</h2></div><span className="training-state-badge">{ids.length} ĐÃ CHỌN</span></div>
    <p className="training-description">Chọn model → chọn gói và biến thể → xem trước file → tải về. Export sử dụng model đã train, không chạy train lại.</p>
    {busy && <p className="dataset-notice">Chờ lượt huấn luyện kết thúc trước khi export.</p>}
    {!successful.length && !busy && <p className="result-empty">Chưa có model thành công để export.</p>}
    <fieldset className="training-config-fieldset" disabled={busy || isExporting || !successful.length}>
      <section className="export-stage"><div className="export-model-heading"><h3>01 · Model muốn sử dụng</h3><button className="secondary-button" type="button" onClick={onSelectAll}>Chọn tất cả thành công</button></div><div className="export-model-list">{successful.map((result) => <label key={result.id}><input type="checkbox" checked={selectedIds.has(result.id)} onChange={() => onToggle(result.id)} /><span><strong>{result.modelName}</strong><small>Label: {result.targetName}</small></span></label>)}</div></section>
      <section className="export-stage"><h3>02 · Gói tải về</h3><div className="export-format-grid"><label className={`export-format-card ${format === "python_zip" ? "is-active" : ""}`}><input type="radio" name="export-format" checked={format === "python_zip"} onChange={() => setFormat("python_zip")} /><span><strong>Gói Python + code mẫu</strong><small>ZIP gồm model, tiền xử lý đã học, predict.py, samples, README.txt và requirements.txt ghi phiên bản.</small></span></label><label className={`export-format-card ${format === "joblib" ? "is-active" : ""}`}><input type="radio" name="export-format" checked={format === "joblib"} onChange={() => { setFormat("joblib"); setVariants([]); setIncludeFirmware(false); }} /><span><strong>Chỉ model Joblib</strong><small>Một model: file .joblib trực tiếp, không có code/README. Nhiều model hoặc kèm CSV: ZIP cùng metadata và requirements.</small></span></label></div><label className="training-toggle export-data-toggle"><input type="checkbox" checked={includeData} onChange={(event) => setIncludeData(event.target.checked)} />Kèm CSV đã dùng cho lượt train này</label></section>
      {format === "python_zip" && <section className="export-stage"><h3>03 · Biến thể C++ native</h3><p className="dataset-local-note">Áp dụng cho model tuyến tính, Decision Tree, Random Forest, Extra Trees và MLP có input số. Các model/input chưa hỗ trợ vẫn có gói Python. Đây không phải file ONNX/TFLite.</p><div className="export-variant-choices">{(["float32", "float16"] as const).map((variant) => <label key={variant}><input type="checkbox" checked={variants.includes(variant)} onChange={() => toggleVariant(variant)} /><span><strong>{variant === "float32" ? "Float32" : "Float16"}</strong><small>{variant === "float32" ? "Tham số 32-bit · Tính toán Float32" : "Tham số 16-bit · Giải mã và tính toán Float32"}</small></span></label>)}</div><p className="dataset-local-note">Chuyển đổi xong sẽ đo lại trên Test, hiển thị kích thước và sai lệch so với model gốc. Không giả định bản nhỏ hơn luôn tốt hơn.</p>
        <label className="training-toggle export-data-toggle"><input type="checkbox" checked={includeFirmware} onChange={(event) => { setIncludeFirmware(event.target.checked); if (event.target.checked && !variants.length) setVariants(["float32"]); }} />Kèm dự án firmware nguồn cho ESP32</label>
        {includeFirmware && <div className="export-firmware-settings"><div className="training-field"><label htmlFor="export-board">Board / chip đích</label><select id="export-board" value={board} onChange={(event) => setBoard(event.target.value as typeof board)}><option value="esp32">ESP32 — DevKit / DevKitC</option><option value="esp32s3">ESP32-S3</option></select></div><div className="training-field"><label htmlFor="export-interval">Thời gian nghỉ sau dự đoán (ms)</label><input id="export-interval" type="number" min="20" max="60000" step="1" value={interval} onChange={(event) => setInterval(event.target.value)} /></div><p>ESP-IDF <strong>v5.4.2</strong> · UART <strong>115200</strong> baud · Nhận một dòng CSV số qua UART, đúng thứ tự input. Dự án chưa build/nạp/đo trên board; đọc README.txt và thay phần nhận UART bằng driver cảm biến khi tích hợp.</p><p>Thứ tự input: {run.inputColumns.join(" → ")}</p>{!intervalValid && <p className="error-message">Nhập số nguyên từ 20 đến 60000 ms.</p>}</div>}
      </section>}
    </fieldset>
    {ids.length > 0 && intervalValid && !preview && !previewError && !busy && <p className="data-reading" role="status">Đang tạo cây file và kiểm tra các biến thể đã chọn...</p>}
    {previewError && <div><p className="error-message" role="alert">{previewError}</p><button className="secondary-button" type="button" onClick={() => setPreviewAttempt((value) => value + 1)}>Thử lại bản xem trước</button></div>}
    {!ids.length && <p className="result-empty">Chọn ít nhất một model để xem trước gói tải về.</p>}
    {preview && <>
      <div className="export-environment"><strong>Python tạo gói: {preview.pythonVersion}</strong><span>Phiên bản thư viện có trong README.txt và requirements.txt. Các lượt train hiện tại chưa ghi phiên bản Python gốc.</span></div>
      {preview.variants.length > 0 && <section className="export-stage"><h3>Kết quả biến thể · {metricLabel(run.metric)} trên Test</h3><div className="result-table-scroll"><table className="export-variants-table"><thead><tr><th>Model / Label</th><th>Biến thể</th><th>Tham số model.bin</th><th>Toàn bộ source</th><th>Test gốc → biến thể</th><th>Đồng ý nhãn với gốc</th><th>Trạng thái</th></tr></thead><tbody>{preview.variants.map((item) => <tr key={`${item.resultId}-${item.storage}`}><th scope="row">{item.modelName}<small>{item.targetName}</small></th><td>{item.storage === "float16" ? "Float16" : "Float32"}<small>Tính Float32</small></td><td>{item.parameterBytes === undefined ? "—" : formatBytes(item.parameterBytes)}</td><td>{item.totalSourceBytes === undefined ? "—" : formatBytes(item.totalSourceBytes)}</td><td>{formatMetric(item.originalTestMetrics[run.metric], run.metric)} → {formatMetric(item.metrics?.[run.metric], run.metric)}</td><td>{item.labelAgreement == null ? "Không áp dụng" : `${(item.labelAgreement * 100).toFixed(2)}%`}</td><td><span className={`result-status ${item.status === "ready" ? "status-succeeded" : "status-failed"}`}>{item.status === "ready" ? "Đã kiểm tra trên Test" : "Không tạo được"}</span>{item.reason && <small>{item.reason}</small>}{item.firmwareIncluded && <small>Kèm firmware nguồn, chưa build</small>}</td></tr>)}</tbody></table></div><p className="dataset-local-note">Đo bằng runtime NumPy trên toàn bộ Test, chưa đo trên ESP32. model.bin chỉ chứa tham số số thực, không gồm cấu trúc cây/source; “Toàn bộ source” là trước nén, không phải flash hoặc RAM khi chạy. Chi tiết nằm trong conversion-report.json.</p></section>}
      {preview.warnings.length > 0 && <div className="export-conversion-warnings" role="status"><strong>Có biến thể không tạo được — không có file giả thay thế.</strong><p>Gói vẫn tải được các model Python và những biến thể thành công. Xem từng lý do ở bảng trên và conversion-report.json.</p></div>}
      <ExportFilePreview preview={preview} />
      <div className="export-download-bar"><div><strong>{preview.fileName}</strong><p>{preview.files.length} file · {formatBytes(preview.totalBytes)} trước nén · Mã nguồn và thư viện đúng bản xem trước</p></div><button type="button" className="primary-button" disabled={busy || isExporting || !preview || !intervalValid} onClick={() => void download()}>{isExporting ? "Đang đóng gói..." : `Tải ${ids.length} model đã chọn`} <span aria-hidden="true">↓</span></button></div>
    </>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}
