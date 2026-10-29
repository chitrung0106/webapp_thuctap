import { useState } from "react";
import type { ModelResult, TrainingRun } from "../../types/trainingRun";
import { formatMetric, metricLabel } from "../../utils/trainingResults";
import { reportStats } from "../../utils/dashboardReport";
import LossChart from "./LossChart";
import ModelComparisonChart from "./ModelComparisonChart";

export default function TrainingReportOverview({ run, results, metric, target, positiveClass }: { run: TrainingRun; results: ModelResult[]; metric: string; target: number; positiveClass: string }) {
  const [lossId, setLossId] = useState<string | null>(null);
  const { leaders, bestScore, fastest, minimumTime } = reportStats(results, metric);
  const lossResult = results.find((result) => result.id === lossId) ?? results.find((result) => result.modelId === "mlp" && result.history.length) ?? results.find((result) => result.history.length) ?? leaders[0] ?? results[0];
  const distribution = run.targetDistributions?.find((item) => item.targetIndex === target)?.classes;
  const testSource = results.find((result) => result.status === "succeeded" && (result.classificationReport || result.confusionMatrix));
  const testDistribution = testSource?.classificationReport?.map((row) => ({ label: row.label, count: row.support })) ?? testSource?.classes?.map((label, index) => ({ label, count: testSource.confusionMatrix?.[index]?.reduce((sum, n) => sum + n, 0) ?? 0 }));
  const classes = distribution ?? testDistribution;
  const tests = leaders.map((result) => result.metrics.test?.[metric]).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const testSummary = !tests.length ? "—" : Math.min(...tests) === Math.max(...tests) ? formatMetric(tests[0], metric) : `${formatMetric(Math.min(...tests), metric)} – ${formatMetric(Math.max(...tests), metric)}`;
  const lossKey = lossResult?.lossName ?? (run.task === "regression" ? "mse" : Object.values(lossResult?.metrics ?? {}).some((values) => "log_loss" in values) ? "log_loss" : null);
  const busy = ["queued", "running", "cancelling"].includes(run.status);
  return <div className="training-report-overview">
    <section className="report-section" aria-labelledby="report-summary-title"><p className="eyebrow">BÁO CÁO SƠ BỘ / {run.outputColumns[target]}</p><h3 id="report-summary-title">Tổng quan kết quả{busy ? " · Đang cập nhật" : ""}</h3><p className="dataset-local-note">{run.fileName} · {run.rowCount} dòng giữ lại · {run.inputColumns.length} cột input · Label: {run.outputColumns[target]}{positiveClass ? ` · Lớp cần phát hiện: ${positiveClass}` : ""}</p>
      {run.task === "classification" && <details className="report-distribution"><summary>Phân bố mẫu theo lớp · {distribution ? "Toàn bộ dữ liệu giữ lại" : "Tập Test"}</summary>{classes?.length ? <div className="report-class-list">{classes.map((item) => <span key={item.label}>{item.label}: <strong>{item.count}</strong> mẫu</span>)}</div> : <p className="dataset-local-note">Lượt chạy này chưa có thông tin phân bố lớp.</p>}</details>}
      <div className="report-highlight-grid">
        <article><span>Dẫn đầu trên Validation</span><strong>{formatMetric(bestScore, metric)}</strong><small>{leaders.length > 1 ? `${leaders.length} model đồng hạng` : leaders[0]?.modelName ?? "Chưa có kết quả"}</small></article>
        <article><span>Test của {leaders.length > 1 ? "nhóm dẫn đầu" : "model dẫn đầu"}</span><strong>{testSummary}</strong><small>{tests.length}/{leaders.length} model dẫn đầu có giá trị Test</small></article>
        <article><span>Train nhanh nhất · label đang xem</span><strong>{minimumTime === undefined ? "—" : `${minimumTime.toFixed(3)} giây`}</strong><small>{fastest.map((result) => result.modelName).join(" · ") || "Chưa có kết quả"}</small></article>
        <article><span>Model dẫn đầu / đồng hạng</span><strong>{leaders.length}</strong>{leaders.length > 0 && <details><summary>Xem danh sách</summary><ul>{leaders.map((result) => <li key={result.id}>{result.modelName} · Test: {formatMetric(result.metrics.test?.[metric], metric)}</li>)}</ul></details>}</article>
      </div><p className="dataset-local-note">Tiêu chí: {metricLabel(metric)}. Chỉ xếp hạng các model thành công có điểm Validation. Đồng hạng được tính theo giá trị gốc, không theo số đã làm tròn. Test không dùng để xếp hạng.</p>
    </section>
    <section className="report-section" aria-labelledby="report-comparison-title"><h3 id="report-comparison-title">Biểu đồ so sánh · {metricLabel(metric)}</h3><p className="dataset-local-note">Label: {run.outputColumns[target]}{positiveClass ? ` · Lớp cần phát hiện: ${positiveClass}` : ""}. Hai thanh dùng chung thang đo.</p><ModelComparisonChart results={results} metric={metric} /></section>
    <section className="report-section report-loss" aria-labelledby="report-loss-title"><div className="result-comparison-heading"><div><h3 id="report-loss-title">Loss theo model</h3><p>Chọn model để xem loss; không gộp các model thành cùng một đường.</p></div><label>Model xem loss<select aria-label="Model xem loss" value={lossResult?.id ?? ""} disabled={!results.length} onChange={(event) => setLossId(event.target.value)}>{results.map((result) => <option key={result.id} value={result.id}>{result.modelName} · {result.targetName}</option>)}</select></label></div>
      {lossResult ? <><h4>Biểu đồ loss — {lossResult.modelName} · Label: {lossResult.targetName}</h4><p className="dataset-local-note">Loại loss: {lossKey ? metricLabel(lossKey) : "Không cung cấp"}. {lossResult.historyKind === "epoch" ? "Trục ngang: epoch." : lossResult.historyKind === "boosting" ? "Trục ngang: vòng boosting." : "Không có lịch sử theo epoch/vòng học."}</p>
        <div className="result-metric-cards">{(["train", "validation", "test"] as const).map((split) => <article key={split}><span>{split === "train" ? "Training loss" : split === "test" ? "Test loss" : "Validation loss"}</span><strong>{lossKey ? formatMetric(lossResult.metrics[split]?.[lossKey], lossKey) : "—"}</strong></article>)}</div>
        <p className="dataset-local-note">Các giá trị trên đo trên model cuối cùng sau huấn luyện. {lossResult.status !== "succeeded" ? "Model chưa hoàn tất thành công nên có thể chưa có giá trị cuối." : ""} Test loss chỉ là giá trị cuối, không phải đường theo epoch. Dấu — nghĩa là chưa có hoặc model không cung cấp; không phải 0.</p>
        {lossResult.history.length ? <LossChart history={lossResult.history} kind={lossResult.historyKind} /> : <p className="result-empty">Model {lossResult.modelName} không cung cấp biểu đồ loss{lossResult.status === "pending" || lossResult.status === "running" ? " tại thời điểm này" : ""}. Các giá trị loss cuối vẫn hiển thị nếu có.</p>}
      </> : <p className="result-empty">Chưa có model cho label đang xem.</p>}
    </section>
  </div>;
}
