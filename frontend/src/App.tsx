import { useState, type ChangeEvent, type FormEvent } from "react";
import { compareFiles } from "./services/compareApi";
import type { CompareResult } from "./types/compare";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function escapeCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function downloadCsv(result: CompareResult) {
  const rows = [
    ["Dòng còn thiếu", "Số lần"],
    ...result.missing_lines.map(({ line, count }) => [line, String(count)]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "missing-lines.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [outputFile, setOutputFile] = useState<File | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function updateFile(
    event: ChangeEvent<HTMLInputElement>,
    setFile: (file: File | null) => void,
  ) {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inputFile || !outputFile) return;

    setIsLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await compareFiles(inputFile, outputFile));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Đã xảy ra lỗi không xác định.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Output Inspector, trang chủ">
          <span className="wordmark-mark" aria-hidden="true">OI</span>
          <span>OUTPUT INSPECTOR</span>
        </a>
        <span className="status"><span className="status-dot" /> WORKSPACE</span>
      </header>

      <section className="intro" id="top">
        <p className="eyebrow">FILE ANALYSIS / 01</p>
        <h1>Đối chiếu <span>output.</span></h1>
        <p className="intro-copy">
          So sánh danh sách đầu vào và đầu ra để tìm những dòng chưa xuất hiện.
        </p>
      </section>

      <form className="upload-panel" onSubmit={handleSubmit}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">BƯỚC 01</p>
            <h2>Chọn tệp cần kiểm tra</h2>
          </div>
          <span className="file-limit">TXT · CSV · tối đa 10 MB / tệp</span>
        </div>

        <div className="file-grid">
          <FilePicker
            id="input-file"
            label="Tệp input"
            description="Danh sách dữ liệu đầu vào"
            file={inputFile}
            onChange={(event) => updateFile(event, setInputFile)}
          />
          <FilePicker
            id="output-file"
            label="Tệp output"
            description="Kết quả cần đối chiếu"
            file={outputFile}
            onChange={(event) => updateFile(event, setOutputFile)}
          />
        </div>

        <div className="form-footer">
          <p className="privacy-note">Tệp được xử lý tạm thời trong phiên này.</p>
          <button className="primary-button" type="submit" disabled={!inputFile || !outputFile || isLoading}>
            {isLoading ? "Đang đối chiếu..." : "Bắt đầu đối chiếu"}
            {!isLoading && <span aria-hidden="true">↗</span>}
          </button>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
      </form>

      {result && <Results result={result} />}

      <section className="export-section" aria-labelledby="export-title">
        <div className="section-index">02</div>
        <div>
          <p className="eyebrow">MODEL EXPORT</p>
          <h2 id="export-title">Epoch &amp; thông tin model</h2>
          <p className="export-copy">
            Phần chọn epoch và xuất model sẽ được nối vào đây khi xác định định dạng model đầu vào.
          </p>
        </div>
        <span className="coming-soon">CHƯA CẤU HÌNH</span>
      </section>

      <footer className="footer">
        <span>OUTPUT INSPECTOR</span>
        <span>LOCAL FILE WORKFLOW</span>
      </footer>
    </main>
  );
}

interface FilePickerProps {
  id: string;
  label: string;
  description: string;
  file: File | null;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function FilePicker({ id, label, description, file, onChange }: FilePickerProps) {
  return (
    <div className={`file-picker${file ? " has-file" : ""}`}>
      <div className="file-picker-top">
        <span className="file-icon" aria-hidden="true">{file ? "✓" : "+"}</span>
        <span className="eyebrow">{label}</span>
      </div>
      <label className="file-picker-label" htmlFor={id}>
        {file ? file.name : "Chọn tệp từ thiết bị"}
      </label>
      <p className="file-description">
        {file ? `${formatBytes(file.size)} · ${description}` : description}
      </p>
      <input
        id={id}
        type="file"
        accept=".txt,.csv,text/plain,text/csv"
        onChange={onChange}
      />
    </div>
  );
}

function Results({ result }: { result: CompareResult }) {
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

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "alert" }) {
  return (
    <div className={`stat${tone === "alert" ? " stat-alert" : ""}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString("vi-VN")}</strong>
    </div>
  );
}

export default App;