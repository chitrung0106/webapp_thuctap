import type { ModelResult } from "../../types/trainingRun";
import { formatMetric, metricLabel } from "../../utils/trainingResults";

export default function ModelComparisonChart({ results, metric }: { results: ModelResult[]; metric: string }) {
  const completed = results.filter((result) => result.status === "succeeded");
  const values = completed.flatMap((result) => [result.metrics.validation?.[metric], result.metrics.test?.[metric]]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return <p className="result-empty">Chưa có số liệu để vẽ theo tiêu chí này. Giá trị không được cung cấp không được coi là 0.</p>;
  const minimum = Math.min(0, ...values), maximum = Math.max(...values, 0.000001);
  const position = (value: number) => (value - minimum) / (maximum - minimum) * 100;
  const zero = position(0);
  return <div className="model-comparison-chart" aria-label={`Biểu đồ ${metricLabel(metric)} trên Validation và Test`}>
    <div className="chart-legend"><span><i className="chart-train" />Validation</span><span><i className="chart-validation" />Test</span></div>
    <div className="comparison-scale"><span>{formatMetric(minimum, metric)}</span><span>{formatMetric(maximum, metric)}</span></div>
    {completed.map((result) => <div className="comparison-bar-row" key={result.id}><strong>{result.modelName}</strong><div>{(["validation", "test"] as const).map((split) => {
      const value = result.metrics[split]?.[metric];
      const available = typeof value === "number" && Number.isFinite(value);
      return <div className={`comparison-bar-line is-${split}`} key={split}><div className="comparison-bar-track" aria-hidden="true"><span className="comparison-zero" style={{ left: `${zero}%` }} />{available && <span className="comparison-bar" style={{ left: `${Math.min(zero, position(value))}%`, width: `${Math.abs(position(value) - zero)}%` }} />}</div><span className="comparison-bar-value"><span className="visually-hidden">{split}: </span>{formatMetric(value, metric)}</span></div>;
    })}</div></div>)}
  </div>;
}
