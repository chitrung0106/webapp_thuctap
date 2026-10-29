import { useId } from "react";
import type { LossPoint } from "../../types/trainingRun";

interface LossChartProps { history: LossPoint[]; kind: "epoch" | "boosting" | null; metric?: "loss" | "accuracy"; }
export default function LossChart({ history, kind, metric = "loss" }: LossChartProps) {
  const titleId = useId();
  const isAccuracy = metric === "accuracy";
  const data = isAccuracy ? history.filter((p) => Number.isFinite(p.trainAccuracy) && Number.isFinite(p.validationAccuracy)).map((p) => ({ ...p, trainLoss: p.trainAccuracy!, validationLoss: p.validationAccuracy! })) : history;
  const points = data.filter((point) => Number.isFinite(point.trainLoss) && Number.isFinite(point.validationLoss));
  if (!points.length && isAccuracy) return null;
  if (!points.length) return <p className="result-empty">Model này không cung cấp lịch sử loss theo epoch/vòng lặp. Các chỉ số đánh giá vẫn hiển thị bên dưới.</p>;
  const width = 680, height = 240, left = 58, right = 20, top = 18, bottom = 34;
  const maximum = isAccuracy ? 1 : Math.max(...points.flatMap((point) => [point.trainLoss, point.validationLoss]), 0.000001);
  const x = (index: number) => left + index / Math.max(1, points.length - 1) * (width - left - right);
  const y = (value: number) => height - bottom - value / maximum * (height - top - bottom);
  const line = (key: "trainLoss" | "validationLoss") => points.map((point, index) => `${x(index)},${y(point[key])}`).join(" ");
  return (
    <div className="loss-chart">
      <div className="chart-legend"><span><i className="chart-train" />{isAccuracy ? "Train accuracy" : "Training loss"}</span><span><i className="chart-validation" />{isAccuracy ? "Validation accuracy" : "Validation loss"}</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{isAccuracy ? "Accuracy" : "Loss"} thực tế qua {points.length} {kind === "epoch" ? "epoch" : "vòng boosting"}</title>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => <g key={ratio}><line x1={left} x2={width - right} y1={y(maximum * ratio)} y2={y(maximum * ratio)} stroke="#dce6ef" /><text x={left - 8} y={y(maximum * ratio) + 4} textAnchor="end">{isAccuracy ? `${Math.round(ratio * 100)}%` : (maximum * ratio).toPrecision(3)}</text></g>)}
        <polyline points={line("trainLoss")} fill="none" stroke="#326e99" strokeWidth="2.5" />
        <polyline points={line("validationLoss")} fill="none" stroke="#bd7b32" strokeWidth="2.5" strokeDasharray="6 4" />
        <text x={left} y={height - 10}>1</text><text x={width - right} y={height - 10} textAnchor="end">{points[points.length - 1].step} {kind === "epoch" ? "epoch" : "vòng"}</text>
      </svg>
      {!isAccuracy && <p className="dataset-local-note">Test chỉ được đánh giá sau khi fit xong, không dùng để điều chỉnh theo từng epoch. Phân loại hiển thị log loss; hồi quy hiển thị MSE.</p>}
    </div>
  );
}