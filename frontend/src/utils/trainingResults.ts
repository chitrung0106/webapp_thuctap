import type { ModelResult } from "../types/trainingRun";

export const higherIsBetter = (metric: string) => ["accuracy", "balanced_accuracy", "f1_macro", "precision_macro", "recall_macro", "binary_precision", "binary_recall", "binary_f1", "binary_specificity", "r2"].includes(metric);
export function rankedResults(results: ModelResult[], metric: string) {
  return results.filter((result) => result.status === "succeeded").sort((a, b) => {
    const left = a.metrics.validation?.[metric];
    const right = b.metrics.validation?.[metric];
    if (left === undefined) return right === undefined ? 0 : 1;
    if (right === undefined) return -1;
    return higherIsBetter(metric) ? right - left : left - right;
  });
}
export function formatMetric(value: number | undefined, metric: string) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (["accuracy", "balanced_accuracy", "f1_macro", "precision_macro", "recall_macro", "binary_precision", "binary_recall", "binary_f1", "binary_specificity", "binary_fpr", "binary_fnr"].includes(metric)) return `${(value * 100).toFixed(2)}%`;
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 5 });
}
export const metricLabels: Record<string, string> = {
 binary_precision: "Precision — Lớp cần phát hiện", binary_recall: "Recall — Lớp cần phát hiện", binary_f1: "F1 — Lớp cần phát hiện", binary_specificity: "Specificity — Nhận đúng lớp còn lại", binary_fpr: "False positive rate — Tỷ lệ báo nhầm", binary_fnr: "False negative rate — Tỷ lệ bỏ sót",
 accuracy: "Accuracy — Độ chính xác", balanced_accuracy: "Balanced accuracy — Độ chính xác cân bằng", f1_macro: "F1 macro — F1 trung bình các lớp", precision_macro: "Precision macro — Độ chính xác dự đoán theo lớp", recall_macro: "Recall macro — Tỷ lệ nhận đúng theo lớp", log_loss: "Log loss — Sai số xác suất", mse: "MSE — Sai số bình phương trung bình", rmse: "RMSE — Căn bậc hai sai số bình phương trung bình", mae: "MAE — Sai số tuyệt đối trung bình", r2: "R² — Hệ số xác định",
};
export const metricLabel = (key: string) => metricLabels[key] ?? key;

// Older runs already store the exact confusion matrix: derive binary metrics without retraining.
export function binaryReportsFromMatrix(result: Pick<ModelResult, "classes" | "confusionMatrix">): NonNullable<ModelResult["binaryMetrics"]> | null {
  const matrix = result.confusionMatrix;
  if (result.classes?.length !== 2 || matrix?.length !== 2 || matrix.some((row) => row.length !== 2 || row.some((n) => !Number.isFinite(n) || n < 0))) return null;
  const ratio = (a: number, b: number) => b ? a / b : null;
  return result.classes.map((label, positive) => {
    const negative = 1 - positive;
    const tp = matrix[positive][positive], tn = matrix[negative][negative], fp = matrix[negative][positive], fn = matrix[positive][negative];
    return { positiveClass: label, negativeClass: result.classes![negative], precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: ratio(2 * tp, 2 * tp + fp + fn), specificity: ratio(tn, tn + fp), falsePositiveRate: ratio(fp, fp + tn), falseNegativeRate: ratio(fn, fn + tp), tp, tn, fp, fn, support: tp + fn };
  });
}
