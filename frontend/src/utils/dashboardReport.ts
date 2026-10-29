import type { ModelResult } from "../types/trainingRun";
import { binaryReportsFromMatrix, higherIsBetter } from "./trainingResults.ts";

export const binaryComparisonKeys = {
  binary_precision: "precision", binary_recall: "recall", binary_f1: "f1", binary_specificity: "specificity", binary_fpr: "falsePositiveRate", binary_fnr: "falseNegativeRate",
} as const;
export function comparisonResults(results: ModelResult[], positiveClass: string): ModelResult[] {
  if (!positiveClass) return results;
  return results.map((result) => ({ ...result, metrics: Object.fromEntries((["train", "validation", "test"] as const).map((split) => {
    const reports = result.binaryMetricsBySplit?.[split] ?? (split === "test" ? result.binaryMetrics ?? binaryReportsFromMatrix(result) : null);
    const report = reports?.find((item) => item.positiveClass === positiveClass);
    const extra = report ? Object.fromEntries(Object.entries(binaryComparisonKeys).flatMap(([metric, key]) => typeof report[key] === "number" && Number.isFinite(report[key]) ? [[metric, report[key]]] : [])) : {};
    return [split, { ...result.metrics[split], ...extra }];
  })) }));
}
export function reportStats(results: ModelResult[], metric: string) {
  const eligible = results.filter((result) => result.status === "succeeded" && Number.isFinite(result.metrics.validation?.[metric]));
  const bestScore = eligible.length ? (higherIsBetter(metric) ? Math.max : Math.min)(...eligible.map((result) => result.metrics.validation![metric])) : undefined;
  const leaders = bestScore === undefined ? [] : eligible.filter((result) => Math.abs(result.metrics.validation![metric] - bestScore) <= 1e-12 * Math.max(1, Math.abs(bestScore)));
  const timed = results.filter((result) => result.status === "succeeded" && result.durationSeconds !== null && Number.isFinite(result.durationSeconds) && result.durationSeconds >= 0);
  const minimumTime = timed.length ? Math.min(...timed.map((result) => result.durationSeconds!)) : undefined;
  const fastest = minimumTime === undefined ? [] : timed.filter((result) => result.durationSeconds === minimumTime);
  return { leaders, bestScore, fastest, minimumTime };
}
