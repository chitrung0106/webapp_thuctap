import { useState } from "react";
import type { ModelResult } from "../../types/trainingRun";

export default function BinaryMetrics({ reports }: { reports: NonNullable<ModelResult["binaryMetrics"]> }) {
  const [positive, setPositive] = useState("");
  const report = reports.find((item) => item.positiveClass === positive);
  const percent = (value: number | null) => value === null ? "Không xác định" : `${(value * 100).toFixed(2)}%`;
  return <section className="binary-metrics" aria-label="Chỉ số phân loại hai lớp">
    <h4>Binary classification — Phân loại hai lớp · Test</h4>
    <label>Lớp cần phát hiện (Positive class)<select aria-label="Lớp cần phát hiện" value={positive} onChange={(event) => setPositive(event.target.value)}><option value="">Chọn lớp cần phát hiện...</option>{reports.map((item) => <option key={item.positiveClass} value={item.positiveClass}>{item.positiveClass}</option>)}</select></label>
    <p className="dataset-local-note">Ví dụ: chọn “Có lỗi” nếu mục tiêu là phát hiện lỗi. Lựa chọn này chỉ đổi góc nhìn đánh giá, không train lại hoặc thay đổi ngưỡng dự đoán.</p>
    {report ? <>
      <p>Lớp cần phát hiện: <strong>{report.positiveClass}</strong> · Lớp còn lại: <strong>{report.negativeClass}</strong></p>
      <div className="result-metric-cards">{[
        ["Precision — Độ chính xác khi báo phát hiện", report.precision],
        ["Recall — Tỷ lệ phát hiện đúng", report.recall],
        ["F1 — Kết hợp Precision và Recall", report.f1],
        ["Specificity — Tỷ lệ nhận đúng lớp còn lại", report.specificity],
        ["False positive rate — Tỷ lệ báo nhầm", report.falsePositiveRate],
        ["False negative rate — Tỷ lệ bỏ sót", report.falseNegativeRate],
      ].map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{percent(value as number | null)}</strong></article>)}</div>
      <div className="result-table-scroll"><table className="metrics-table"><caption>Số mẫu thực tế trên Test</caption><thead><tr><th>TP — Phát hiện đúng</th><th>TN — Nhận đúng lớp còn lại</th><th>FP — Báo nhầm</th><th>FN — Bỏ sót</th></tr></thead><tbody><tr><td>{report.tp}</td><td>{report.tn}</td><td>{report.fp}</td><td>{report.fn}</td></tr></tbody></table></div>
      <p className="dataset-local-note">Precision = TP / (TP + FP); Recall = TP / (TP + FN); Specificity = TN / (TN + FP). Tỷ lệ báo nhầm tính trong lớp còn lại, tỷ lệ bỏ sót tính trong lớp cần phát hiện. Khi mẫu số bằng 0, chỉ số hiển thị “Không xác định”, không gán thành 0%.</p>
    </> : <p className="dataset-local-note">Chọn một lớp để xem tỷ lệ báo nhầm, bỏ sót và các chỉ số riêng cho lớp đó. Các chỉ số macro phía trên vẫn là trung bình giữa các lớp.</p>}
  </section>;
}
