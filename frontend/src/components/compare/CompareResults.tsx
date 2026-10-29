import type { CompareResult } from "../../types/compare";
import { downloadCsv } from "../../utils/downloadCsv";
import Stat from "../common/Stat";

export default function CompareResults({ result }: { result: CompareResult }) {
  return (
    <section className="results-section" aria-live="polite">
      <div className="results-heading">
        <div>
          <p className="eyebrow">BƯỚC 02 / KẾT QUẢ</p>
          <h2>Tổng quan đối chiếu</h2>
        </div>
        <button className="secondary-button" onClick={() => downloadCsv(result)} type="button">
          <span aria-hidden="true">↓</span> Tải CSV
        </button>
      </div>

      <div className="stats-grid">
        <Stat label="Dòng input" value={result.input_count} tone="neutral" />
        <Stat label="Dòng output" value={result.output_count} tone="neutral" />
        <Stat label="Dòng còn thiếu" value={result.missing_count} tone="alert" />
      </div>

      <div className="missing-panel">
        <div className="missing-heading">
          <div>
            <h3>Các dòng chưa có trong output</h3>
            <p>{result.input_filename} <span aria-hidden="true">→</span> {result.output_filename}</p>
          </div>
          <span className="row-count">{result.missing_lines.length} mục</span>
        </div>
        {result.missing_lines.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>DÒNG INPUT</th><th>SỐ LẦN THIẾU</th></tr></thead>
              <tbody>
                {result.missing_lines.map(({ line, count }, index) => (
                  <tr key={`${line}-${index}`}>
                    <td><code>{line}</code></td>
                    <td><span className="count-badge">{count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-result">Không tìm thấy dòng nào bị thiếu.</p>
        )}
      </div>
    </section>
  );
}
