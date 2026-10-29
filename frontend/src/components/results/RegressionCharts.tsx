import { useId } from "react";
export default function RegressionCharts({ points }: { points: { actual: number; predicted: number }[] }) {
  const id = useId();
  const data = points.filter((p) => Number.isFinite(p.actual) && Number.isFinite(p.predicted));
  if (!data.length) return null;
  const low = Math.min(...data.flatMap((p) => [p.actual, p.predicted]));
  const high = Math.max(...data.flatMap((p) => [p.actual, p.predicted]));
  const scale = (n: number) => 44 + (n - low) / (high - low || 1) * 300;
  const residuals = data.map((p) => p.predicted - p.actual);
  const maxError = Math.max(...residuals.map(Math.abs), 0.000001);
  const bins = Array.from({ length: 10 }, () => 0);
  residuals.forEach((v) => bins[Math.min(9, Math.floor((v + maxError) / (2 * maxError) * 10))]++);
  return <div className="result-chart-grid"><section><h4>Giá trị thật và dự đoán · Test</h4><svg viewBox="0 0 400 390" role="img" aria-labelledby={`${id}-scatter`}><title id={`${id}-scatter`}>Dự đoán càng gần đường chéo càng tốt</title><line x1="44" y1="344" x2="344" y2="44" stroke="#93aabd" strokeDasharray="5 5" />{data.map((p, i) => <circle key={i} cx={scale(p.actual)} cy={388 - scale(p.predicted)} r="3" fill="#326e99" opacity="0.65"><title>Thật: {p.actual}; dự đoán: {p.predicted}</title></circle>)}<text x="44" y="365">{low.toPrecision(3)}</text><text x="300" y="365">{high.toPrecision(3)}</text><text x="130" y="385">Giá trị thật →</text><text x="4" y="20">Giá trị dự đoán ↑</text></svg></section><section><h4>Phân bố sai số · Test</h4><svg viewBox="0 0 400 390" role="img" aria-labelledby={`${id}-errors`}><title id={`${id}-errors`}>Số mẫu theo sai số dự đoán trừ giá trị thật</title>{bins.map((n, i) => { const h = n / Math.max(...bins, 1) * 260; return <g key={i}><rect x={44 + i * 30} y={344 - h} width="27" height={h} fill="#6da7d2" /><text x={57 + i * 30} y={335 - h} textAnchor="middle">{n}</text></g>; })}<text x="44" y="365">{(-maxError).toPrecision(3)}</text><text x="185" y="365">0</text><text x="300" y="365">{maxError.toPrecision(3)}</text><text x="95" y="385">Dự đoán − Giá trị thật →</text></svg></section><p className="dataset-local-note">Minh họa tối đa 200 mẫu test. Các chỉ số được tính trên toàn bộ tập test.</p></div>;
}
