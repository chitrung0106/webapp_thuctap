import TrainingReportOverview from "./TrainingReportOverview";
import { comparisonResults, reportStats, binaryComparisonKeys } from "../../utils/dashboardReport";
import { useState } from "react";
import type { useTrainingRun } from "../../hooks/useTrainingRun";
import { isRunActive } from "../../types/trainingRun";
import { formatMetric, higherIsBetter, rankedResults, metricLabel } from "../../utils/trainingResults";
import ModelResultDialog from "./ModelResultDialog";
import ModelExportPanel from "./ModelExportPanel";
import PredictionPanel from './PredictionPanel';
import {downloadReport} from '../../utils/downloadReport';

const labels: Record<string, string> = { queued: "Đang chờ", running: "Đang train", cancelling: "Đang dừng", completed: "Đã hoàn tất", cancelled: "Đã dừng", failed: "Có lỗi", pending: "Đang chờ", succeeded: "Thành công" };

export default function TrainingDashboard({ controller, onBack }: { controller: ReturnType<typeof useTrainingRun>; onBack: () => void }) {
  const { run, error, isCancelling, cancel, forgetRun } = controller;
  const [tab, setTab] = useState<"results" | "export" | "predict">("results");
  const [comparisonMetric, setComparisonMetric] = useState<string | null>(null);
  const [positiveClass, setPositiveClass] = useState("");
  const [target, setTarget] = useState(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  if (!run) return <section className="upload-panel"><h2>Đang mở lượt huấn luyện...</h2>{error ? <><p className="error-message" role="alert">{error}</p><button className="secondary-button" type="button" onClick={() => { forgetRun(); onBack(); }}>Quay lại cấu hình</button></> : <p role="status">Đang tải trạng thái huấn luyện.</p>}</section>;
  const busy = isRunActive(run.status);
  const succeeded = run.results.filter((result) => result.status === "succeeded");
  const failed = run.results.filter((result) => result.status === "failed");
  const finished = run.results.filter((result) => ["succeeded", "failed", "cancelled"].includes(result.status)).length;
  const rawResults = run.results.filter((result) => result.targetIndex === target);
  const knownClasses = run.targetDistributions?.find((item) => item.targetIndex === target)?.classes.map((item) => item.label) ?? rawResults.find((result) => result.classes?.length)?.classes ?? [];
  const binary = run.task === "classification" && knownClasses.length === 2;
  const positive = binary && knownClasses.includes(positiveClass) ? positiveClass : "";
  const filtered = comparisonResults(rawResults, positive);
  const availableMetrics = run.task === "classification" ? ["accuracy", "balanced_accuracy", "f1_macro", "precision_macro", "recall_macro"] : ["rmse", "mae", "r2"];
  if (positive) availableMetrics.push(...Object.keys(binaryComparisonKeys));
  const metric = comparisonMetric && availableMetrics.includes(comparisonMetric) ? comparisonMetric : run.metric;
  const ranked = rankedResults(filtered, metric);
  const ordered = [...ranked, ...filtered.filter((result) => result.status !== "succeeded")];
  const leadingIds = new Set(reportStats(filtered, metric).leaders.map((result) => result.id));
  const focused = rawResults.find((result) => result.id === focusedId) ?? null;
  const running = run.results.find((result) => result.status === "running");
  function toggle(id: string) { setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  return (
    <div className="training-dashboard">
      <section className="dashboard-hero">
        <div><p className="eyebrow">TRAINING RUN / {run.id.slice(0, 8)}</p><h2>{busy ? "Đang huấn luyện các model" : "Kết quả huấn luyện"}</h2><p>{run.fileName} · {run.rowCount} dòng · {run.task === "classification" ? "Phân loại" : "Hồi quy"}</p></div>
        <div className="dashboard-run-actions"><span className={`result-status status-${run.status}`}>{labels[run.status]}</span>{busy ? <button type="button" className="secondary-button" disabled={isCancelling || run.status === "cancelling"} onClick={() => void cancel()}>{isCancelling || run.status === "cancelling" ? "Đã yêu cầu dừng" : "Dừng lượt chạy"}</button> : <button className="secondary-button" type="button" onClick={onBack}>← Quay lại chỉnh dữ liệu</button>}</div>
      </section>
      {error && <p className="error-message" role="alert">{error}</p>}
      {run.error && <p className="error-message" role="alert">{run.error}</p>}
      <section className="run-progress" aria-label="Tiến độ huấn luyện">
        <div><strong>{finished} / {run.results.length} tác vụ hoàn tất</strong><span>{running ? `${running.modelName} · ${running.targetName}${running.progress ? ` · Epoch ${running.progress.current}/${running.progress.total}` : ""}` : busy ? "Đang chuẩn bị tác vụ..." : "Lượt chạy đã kết thúc"}</span></div>
        <progress max={run.results.length} value={finished} />
        {busy && <p>Chạy lần lượt trên thiết bị đã chọn. Khi dừng, MLP có thể dừng giữa các epoch; model khác hoàn tất thao tác fit hiện tại trước khi dừng hàng đợi.</p>}
      </section>
      <div className="dashboard-stats"><article><span>Thành công</span><strong>{succeeded.length}</strong></article><article><span>Thất bại</span><strong>{failed.length}</strong></article><article><span>Dòng train / validation / test</span><strong className="dashboard-split-count">{run.splitCounts ? `${run.splitCounts.train} / ${run.splitCounts.validation} / ${run.splitCounts.test}` : "—"}</strong></article></div>
      {!busy&&<div className="wizard-toolbar"><button className="secondary-button" type="button" onClick={()=>downloadReport(run,'csv')}>Tải bảng so sánh CSV</button><button className="secondary-button" type="button" onClick={()=>downloadReport(run,'txt')}>Tải báo cáo TXT</button></div>}
      {busy&&run.id.endsWith('-browser')&&<button className="secondary-button" type="button" onClick={()=>{if(window.confirm('Dừng hẳn sẽ kết thúc worker và mất toàn bộ model chưa tải của phiên này, kể cả model đã train xong. Dữ liệu chỉnh sửa vẫn giữ trên trang. Tiếp tục?'))void controller.forceStop();}}>Dừng hẳn worker</button>}
      <div className="dashboard-tabs" role="tablist" aria-label="Kết quả và export"><button id="results-tab" role="tab" type="button" aria-selected={tab === "results"} aria-controls="results-panel" onClick={() => setTab("results")}>Dashboard kết quả</button><button id="export-tab" role="tab" type="button" aria-selected={tab === "export"} aria-controls="export-panel" disabled={busy || !succeeded.length} onClick={() => setTab("export")}>Chọn &amp; export model ({selectedIds.size})</button><button type="button" role="tab" id="predict-tab" aria-controls="predict-panel" aria-selected={tab==='predict'} disabled={busy||!succeeded.length} onClick={()=>setTab('predict')}>Thử dự đoán</button></div>
      {tab === "results" ? <div id="results-panel" role="tabpanel" aria-labelledby="results-tab">
        <div className="result-comparison-heading"><div><h3>Báo cáo sơ bộ</h3><p>Xếp hạng theo <strong>{metricLabel(metric)}</strong> trên validation ({higherIsBetter(metric) ? "cao hơn tốt hơn" : "thấp hơn tốt hơn"}). Test dùng để đánh giá cuối.</p></div><label>Tiêu chí so sánh <select aria-label="Tiêu chí so sánh kết quả" value={metric} onChange={(event) => setComparisonMetric(event.target.value)}>{availableMetrics.map((key) => <option key={key} value={key}>{metricLabel(key)}</option>)}</select></label><label>Label <select value={target} onChange={(event) => { setTarget(Number(event.target.value)); setPositiveClass(""); setFocusedId(null); }}>{run.outputColumns.map((name, index) => <option key={index} value={index}>{name}</option>)}</select></label></div>
        {binary && <div className="report-positive-selector"><label>Lớp cần phát hiện (Positive class)<select aria-label="Lớp cần phát hiện trên dashboard" value={positive} onChange={(event) => setPositiveClass(event.target.value)}><option value="">Chọn lớp để so sánh chỉ số Binary...</option>{knownClasses.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><p className="dataset-local-note">Chọn một lớp để có thêm Precision, Recall, F1, Specificity và tỷ lệ báo nhầm/bỏ sót trong danh sách tiêu chí. Các chỉ số macro vẫn tính chung giữa các lớp. Lượt chạy cũ chưa lưu Binary trên Validation sẽ không được xếp hạng theo những tiêu chí này.</p></div>}
        <TrainingReportOverview key={target} run={run} results={filtered} metric={metric} target={target} positiveClass={positive} />
        <h3 className="report-detail-table-title">Bảng so sánh &amp; xem chi tiết</h3>
        <div className="result-table-scroll"><table className="results-comparison"><thead><tr><th>Export</th><th>Model</th><th>Trạng thái</th><th>Validation · {metricLabel(metric)}</th><th>Test · {metricLabel(metric)}</th><th>Thời gian train</th><th>Epoch / vòng học</th><th>Chi tiết</th></tr></thead><tbody>{ordered.map((result) => <tr key={result.id} className={result.id === focused?.id ? "is-focused" : ""}><td><input type="checkbox" aria-label={`Chọn export ${result.modelName}, label ${result.targetName}`} disabled={busy || result.status !== "succeeded"} checked={selectedIds.has(result.id)} onChange={() => toggle(result.id)} /></td><th scope="row">{result.modelName}{result.executionDevice && <small className="best-model-tag">{result.executionDevice === "gpu" ? "GPU · WebGPU" : "CPU"}</small>}{leadingIds.has(result.id) && <small className="best-model-tag">Dẫn đầu trên validation</small>}</th><td><span className={`result-status status-${result.status}`}>{labels[result.status]}</span></td><td>{formatMetric(result.metrics.validation?.[metric], metric)}</td><td>{formatMetric(result.metrics.test?.[metric], metric)}</td><td>{result.durationSeconds !== null ? `${result.durationSeconds.toFixed(2)}s` : "—"}</td><td>{result.modelId === "mlp" ? `${result.iterations ?? result.progress?.current ?? "—"} / ${result.parameters.max_iter ?? "—"} epoch` : result.historyKind === "boosting" ? `${result.iterations ?? "—"} vòng boosting` : "Không áp dụng / không cung cấp"}</td><td><button className="training-text-button" type="button" onClick={() => setFocusedId(result.id)}>Xem</button></td></tr>)}</tbody></table></div>
        <ModelResultDialog result={focused} task={run.task} onClose={() => setFocusedId(null)} />
        {!busy && succeeded.length > 0 && <div className="dashboard-export-cta"><p>Đã xem kết quả? Chọn model phù hợp để tải về.</p><button className="primary-button" type="button" onClick={() => setTab("export")}>Tiếp tục chọn export →</button></div>}
      </div> : tab==="predict"?<div id="predict-panel" role="tabpanel" aria-labelledby="predict-tab"><PredictionPanel run={run} inputConfig={controller.predictionConfig}/></div>:<div id="export-panel" role="tabpanel" aria-labelledby="export-tab"><ModelExportPanel run={run} selectedIds={selectedIds} onToggle={toggle} onSelectAll={() => setSelectedIds(new Set(succeeded.map((result) => result.id)))} /></div>}
    </div>
  );
}
