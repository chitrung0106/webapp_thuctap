import { useState } from "react";
import type { ModelResult } from "../../types/trainingRun";
import { formatMetric, metricLabel, binaryReportsFromMatrix } from "../../utils/trainingResults";
import LossChart from "./LossChart";
import RegressionCharts from "./RegressionCharts";
import BinaryMetrics from "./BinaryMetrics";

export default function ModelResultDetail({ result, task }: { result: ModelResult; task: "classification" | "regression" }) {
  const [tab, setTab] = useState("overview");
  const binaryReports = result.binaryMetrics ?? binaryReportsFromMatrix(result);
  const metrics = [...new Set(Object.values(result.metrics).flatMap(Object.keys))];
  const lossKey = result.lossName ?? (task === "regression" && metrics.includes("mse") ? "mse" : metrics.includes("log_loss") ? "log_loss" : null);
  const main = task === "classification" ? ["accuracy", "balanced_accuracy", "precision_macro", "recall_macro", "f1_macro"] : ["mae", "rmse", "r2"];
  return <section className="model-result-detail" aria-labelledby="model-detail-title">
    <div className="result-detail-heading"><div><p className="eyebrow">{result.targetName} · {task === "regression" ? "Regression — Hồi quy" : result.classes?.length === 2 ? "Binary classification — Phân loại hai lớp" : "Multiclass classification — Phân loại nhiều lớp"}</p><h3 id="model-detail-title">{result.modelName}</h3></div><span>{result.durationSeconds !== null ? `${result.durationSeconds.toFixed(2)} giây` : "Đang chờ hoàn tất"}</span></div>
    <p className="dataset-local-note">Thiết bị huấn luyện thực tế: <strong>{result.executionDevice === "gpu" ? "GPU · WebGPU" : "CPU"}</strong>{result.gpuName ? ` · ${result.gpuName}` : ""}{result.executionBackend ? ` · ${result.executionBackend}` : ""}.</p>
    {result.gpuFallbackReason && <p className="dataset-notice">Không chạy được GPU, đã dùng CPU: {result.gpuFallbackReason}</p>}
    {result.error && <p className="error-message" role="alert">{result.error}</p>}
    {result.progress && result.status === "running" && <p role="status">Đang chạy epoch {result.progress.current}/{result.progress.total}.</p>}
    <div className="dashboard-tabs" role="tablist" aria-label="Nội dung chi tiết model">{[["overview", "Tổng quan"], ["charts", "Biểu đồ & đánh giá"], ["config", "Cấu hình"]].map(([value, label]) => <button key={value} id={`detail-tab-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls="model-detail-panel" onClick={() => setTab(value)}>{label}</button>)}</div>
    <div id="model-detail-panel" role="tabpanel" aria-labelledby={`detail-tab-${tab}`}>
    {tab === "overview" && <>
      <h4>Kết quả cuối trên tập Test</h4>
      <div className="result-metric-cards">{main.map((key) => <article key={key}><span>{metricLabel(key)}</span><strong>{formatMetric(result.metrics.test?.[key], key)}</strong></article>)}</div>
      {binaryReports && <BinaryMetrics reports={binaryReports} />}
      <h4>Loss sau huấn luyện{lossKey ? ` · ${metricLabel(lossKey)}` : ""}</h4>
      <div className="result-metric-cards">{(["train", "validation", "test"] as const).map((split) => <article key={split}><span>{split === "train" ? "Training loss" : split === "test" ? "Test loss" : "Validation loss"}</span><strong>{lossKey ? formatMetric(result.metrics[split]?.[lossKey], lossKey) : "—"}</strong></article>)}</div>
      <p className="dataset-local-note">{lossKey ? "Loss ở đây đo trên model cuối cùng. Test chỉ đánh giá sau khi học xong; dùng validation để so sánh model. Loss thấp hơn tốt hơn." : "Model này không cung cấp xác suất để tính log loss. Vẫn có thể đánh giá bằng các chỉ số phân loại; dấu — không phải loss bằng 0."}</p>
      {metrics.length > 0 && <div className="result-table-scroll"><table className="metrics-table"><caption>Đối chiếu các tập dữ liệu</caption><thead><tr><th>Chỉ số</th><th>Train</th><th>Validation</th><th>Test</th></tr></thead><tbody>{metrics.map((key) => <tr key={key}><th scope="row">{metricLabel(key)}</th>{(["train", "validation", "test"] as const).map((split) => <td key={split}>{formatMetric(result.metrics[split]?.[key], key)}</td>)}</tr>)}</tbody></table></div>}
      <div className="result-detail-facts"><span>{result.historyKind === "epoch" ? "Epoch đã chạy" : "Vòng lặp thực tế"} <strong>{result.iterations ?? "Không áp dụng / không cung cấp"}</strong></span><span>Đặc trưng sau xử lý <strong>{result.transformedFeatureCount ?? "—"}</strong></span><span>File Joblib <strong>{result.artifactBytes ? `${(result.artifactBytes / 1024).toFixed(1)} KB` : "—"}</strong></span></div>
      <p className="dataset-local-note">Kích thước Joblib gồm pipeline và thông tin đi kèm, không phải mức RAM khi chạy hay kích thước model trên thiết bị.</p>
    </>}
    {tab === "charts" && <>
      <h4>Quá trình học · Train và Validation</h4><LossChart history={result.history} kind={result.historyKind} />
      {task === "classification" && <LossChart history={result.history} kind={result.historyKind} metric="accuracy" />}
      {task === "regression" && result.regressionPoints && <RegressionCharts points={result.regressionPoints} />}
      {result.classificationReport && <div className="result-table-scroll"><table className="metrics-table"><caption>Kết quả từng lớp · Test</caption><thead><tr><th>Lớp</th><th>Precision</th><th>Recall</th><th>F1</th><th>Số mẫu thật</th></tr></thead><tbody>{result.classificationReport.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{formatMetric(row.precision, "precision_macro")}</td><td>{formatMetric(row.recall, "recall_macro")}</td><td>{formatMetric(row["f1-score"], "f1_macro")}</td><td>{row.support}</td></tr>)}</tbody></table><p className="dataset-local-note">Precision: trong các mẫu dự đoán thuộc lớp, có bao nhiêu mẫu đúng. Recall: nhận đúng bao nhiêu mẫu thật của lớp. F1 kết hợp hai tỷ lệ; khi không tính được tỷ lệ, báo cáo dùng 0.</p></div>}
      {result.confusionMatrix && result.classes && <><h4>Ma trận nhầm lẫn · Test</h4><p className="dataset-local-note">Hàng là nhãn thật, cột là dự đoán. Đường chéo là dự đoán đúng.{result.classes.length > 12 ? " Hiển thị 12 lớp đầu." : ""}</p><div className="result-table-scroll"><table className="confusion-table"><thead><tr><th>Thật / Dự đoán</th>{result.classes.slice(0, 12).map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{result.confusionMatrix.slice(0, 12).map((row, i) => <tr key={i}><th>{result.classes![i]}</th>{row.slice(0, 12).map((n, j) => <td key={j} className={i === j ? "is-diagonal" : ""}>{n}</td>)}</tr>)}</tbody></table></div></>}
      {!!result.samples?.length && <details className="result-extra"><summary>Một số dự đoán trên test</summary><div className="result-table-scroll"><table><thead><tr><th>Nhãn thật</th><th>Dự đoán</th></tr></thead><tbody>{result.samples.map((sample, i) => <tr key={i}><td>{sample.actual}</td><td>{sample.predicted}</td></tr>)}</tbody></table></div></details>}
      {!result.classificationReport && task === "classification" && result.status === "succeeded" && <p className="dataset-local-note">Lượt chạy cũ chưa lưu báo cáo từng lớp hoặc accuracy theo epoch. Chạy lượt mới để có thêm dữ liệu.</p>}
    </>}
    {tab === "config" && <><h4>Thông số model đã dùng</h4><pre className="result-parameters">{JSON.stringify(result.parameters, null, 2)}</pre><p className="dataset-local-note">Các model trong lượt chạy dùng chung cách chia dữ liệu và cấu hình tiền xử lý đã xác nhận. Epoch chỉ áp dụng cho model học theo epoch.</p></>}
    {result.warnings.length > 0 && <details className="result-extra"><summary>Thông báo từ bộ huấn luyện ({result.warnings.length})</summary><ul className="result-warning-list">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
    </div>
  </section>;
}
