import TrainingLearningSettings from "./TrainingLearningSettings";
import HelpNote from "../common/HelpNote";
import type { useTrainingSetup } from "../../hooks/useTrainingSetup";

interface TrainingCommonSettingsProps {
  setup: ReturnType<typeof useTrainingSetup>;
  targetCount: number;
}

export default function TrainingCommonSettings({ setup, targetCount }: TrainingCommonSettingsProps) {
  const { form: { shared }, setShared, setTask, inspection } = setup;
  const taskLocked = Boolean(setup.requiredTask);
  const selectedProblem = shared.task === "regression" ? "regression" : setup.problemTypes.length && setup.problemTypes.every((p) => p.kind === "binary") ? "binary" : setup.problemTypes.length && setup.problemTypes.every((p) => p.kind === "multiclass") ? "multiclass" : "mixed";
  const stratifyAvailable = shared.task === "classification" && shared.split === "random" && targetCount === 1;
  const splits = [
    { key: "trainPercent", name: "Train", purpose: "Dùng để học", count: inspection.counts.train, className: "split-train" },
    { key: "validationPercent", name: "Validation", purpose: "So sánh và điều chỉnh", count: inspection.counts.validation, className: "split-validation" },
    { key: "testPercent", name: "Test", purpose: "Đánh giá cuối cùng", count: inspection.counts.test, className: "split-test" },
  ] as const;
  const total = splits.reduce((sum, split) => sum + Number(shared[split.key]), 0);
  const splitValid = Math.abs(total - 100) < 0.00001 && splits.every((split) => shared[split.key].trim() && Number(shared[split.key]) > 0 && Number(shared[split.key]) < 100);
  const metrics = shared.task === "classification"
    ? [{ value: "accuracy", label: "Accuracy — Độ chính xác", help: "Tỷ lệ dự đoán đúng trên tổng số mẫu." }, { value: "balanced_accuracy", label: "Balanced accuracy — Độ chính xác cân bằng", help: "Phù hợp khi số dòng dữ liệu trong mỗi lớp không đều nhau." }, { value: "f1_macro", label: "F1 macro — Điểm F1 trung bình các lớp", help: "Cân bằng việc tìm đủ mẫu của từng lớp và hạn chế báo nhầm, coi các lớp quan trọng như nhau." }]
    : [{ value: "rmse", label: "RMSE — Căn bậc hai của sai số bình phương trung bình", help: "Ưu tiên model ít sai số lớn. Giá trị càng thấp càng tốt." }, { value: "mae", label: "MAE — Sai số tuyệt đối trung bình", help: "Sai lệch tuyệt đối trung bình. Giá trị càng thấp càng tốt." }, { value: "r2", label: "R² — Hệ số xác định", help: "Đánh giá khả năng giải thích biến thiên của dữ liệu." }];
  function applySplit(train: string, validation: string, test: string) {
    setShared("trainPercent", train); setShared("validationPercent", validation); setShared("testPercent", test);
  }

  return (
    <section className="training-common common-settings" aria-labelledby="shared-config-title">
      <div className="settings-section-heading">
        <div><h3 id="shared-config-title">Thông số chung</h3><p>Thiết lập tại đây; mỗi model chỉ sử dụng các thông số phù hợp với cách học của nó.</p></div>
        <span className="settings-section-caption">01 / CẤU HÌNH DỮ LIỆU</span>
      </div>
      <div className="training-quick-guide">
        <strong>Chưa biết bắt đầu từ đâu?</strong>
        <p>Chọn loại bài toán → kiểm tra tỷ lệ chia dữ liệu → chọn các model muốn thử. Bạn có thể giữ thông số điền sẵn để chạy thử, rồi điều chỉnh theo kết quả validation.</p>
        <span>Các thông số điền sẵn là điểm bắt đầu, không phải cấu hình tốt nhất cho mọi dữ liệu.</span>
      </div>
      <div className="settings-card settings-task-card">
        <div className="settings-card-heading"><span className="settings-card-index">01</span><div><h4>Bạn muốn dự đoán điều gì?</h4><p>{taskLocked ? "Giữ nguyên dạng bài toán bạn đã chọn và xác nhận ở bước 01." : "Chọn bài toán phù hợp với cột label."}</p></div></div>
        <div className="task-choice-grid" role="radiogroup" aria-label="Loại bài toán">
          {([
            { value: "binary", title: "Binary classification — Phân loại hai lớp", mark: "A / B", description: "Label có đúng 2 nhóm.", example: "Ví dụ: bình thường / lỗi" },
            { value: "multiclass", title: "Multiclass classification — Phân loại nhiều lớp", mark: "A / B / C", description: "Label có từ 3 nhóm trở lên.", example: "Ví dụ: thấp / vừa / cao" },
            { value: "regression", title: "Regression — Hồi quy", mark: "1.25", description: "Dự đoán một giá trị số.", example: "Ví dụ: nhiệt độ, giá tiền" },
          ] as const).map((task) => (
            <label key={task.value} className={`task-choice ${selectedProblem === task.value ? "is-active" : ""}`}>
              <input type="radio" name="training-task" value={task.value} disabled={taskLocked} checked={selectedProblem === task.value} onChange={() => setTask(task.value === "regression" ? "regression" : "classification")} />
              <span className="task-choice-mark" aria-hidden="true">{task.mark}</span>
              <span className="task-choice-copy"><strong>{task.title}</strong><span>{task.description}</span><small>{task.example}</small></span>
            </label>
          ))}
        </div>
        {setup.problemTypes.length > 0 && <div className="training-quick-guide"><strong>Loại bài toán bạn đã chọn ở bước 1</strong>{setup.problemTypes.map((problem, index) => <p key={index}>{problem.name}: {problem.kind === "regression" ? "Regression — Hồi quy" : problem.kind === "binary" ? "Binary classification — Phân loại hai lớp" : "Multiclass classification — Phân loại nhiều lớp"}{problem.kind !== "regression" && ` · ${problem.count} lớp`}</p>)}<span>Giữ nguyên lựa chọn đã xác nhận ở bước 1. Muốn đổi loại bài toán, hãy quay lại dữ liệu; hệ thống không tự đổi theo số lớp.</span></div>}
        <div className="task-metric-row">
          <div><label htmlFor="training-metric">Tiêu chí so sánh model</label><p>{metrics.find((metric) => metric.value === shared.metric)?.help}</p></div>
          <select id="training-metric" value={shared.metric} onChange={(event) => setShared("metric", event.target.value)}>
            {metrics.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
          </select>
        </div>
        <HelpNote title={shared.task === "classification" ? "Đọc chỉ số phân loại thế nào?" : "Đọc chỉ số hồi quy thế nào?"}>
          {shared.task === "classification" ? <>
          <p><strong>Accuracy — Độ chính xác:</strong> dự đoán đúng 90 trên 100 dòng thì đạt 90%.</p>
          <p><strong>Balanced accuracy — Độ chính xác cân bằng:</strong> tính tỷ lệ nhận đúng riêng từng lớp rồi lấy trung bình. Cân nhắc dùng khi số dòng dữ liệu trong mỗi lớp không đều nhau, chẳng hạn 90 dòng bình thường và 10 dòng lỗi.</p>
          <p><strong>F1 macro — Điểm F1 trung bình các lớp:</strong> kết hợp việc tìm đủ mẫu và hạn chế báo nhầm của từng lớp, rồi lấy trung bình. Mỗi lớp có vai trò như nhau dù nhiều hay ít dòng. Cả ba tiêu chí phân loại này càng cao càng tốt.</p>
          </> : <>
          <p><strong>MAE — Sai số tuyệt đối trung bình:</strong> ví dụ MAE = 2 khi dự đoán nhiệt độ nghĩa là sai lệch tuyệt đối trung bình khoảng 2 độ. Càng thấp càng tốt.</p>
          <p><strong>RMSE — Căn bậc hai của sai số bình phương trung bình:</strong> nhạy hơn với những lần dự đoán sai lệch lớn. Cùng đơn vị với label, càng thấp càng tốt.</p>
          <p><strong>R² — Hệ số xác định:</strong> 1 là khớp hoàn hảo; 0 tương đương dự đoán giá trị trung bình của tập đánh giá. Có thể âm nếu dự đoán kém hơn mốc đó; càng cao càng tốt.</p>
          </>}
        </HelpNote>
        <p className="settings-footnote">{taskLocked ? "Quay lại dữ liệu để đổi ý nghĩa của label. Loại bài toán và danh sách model sẽ được cập nhật theo lựa chọn đó." : "Đổi loại bài toán sẽ đặt lại danh sách model và thông số riêng."}</p>
      </div>

      <TrainingLearningSettings setup={setup} />

      <div className="settings-split-only">
        <section className="settings-card settings-split-card" aria-labelledby="split-title">
          <div className="settings-card-heading"><span className="settings-card-index">02</span><div><h4 id="split-title">Chia dữ liệu</h4><p>Phân bổ dữ liệu cho từng giai đoạn.</p></div></div>
          <HelpNote title="Train, validation và test khác nhau ra sao?">
            <p>Hãy coi train là tài liệu để học, validation là bài kiểm tra thử để chọn model và điều chỉnh thông số, còn test là bài thi cuối cùng.</p>
            <p className="help-example">Có 100 dòng, chọn 70 / 15 / 15: dùng 70 dòng để học, 15 dòng để so sánh và 15 dòng đánh giá cuối. Không dùng kết quả test để liên tục sửa thông số.</p>
          </HelpNote>
          <div className="split-preset-row"><span>Điền nhanh</span>
            <button type="button" onClick={() => applySplit("70", "15", "15")} aria-pressed={shared.trainPercent === "70" && shared.validationPercent === "15" && shared.testPercent === "15"}>70 / 15 / 15</button>
            <button type="button" onClick={() => applySplit("80", "10", "10")} aria-pressed={shared.trainPercent === "80" && shared.validationPercent === "10" && shared.testPercent === "10"}>80 / 10 / 10</button>
          </div>
          <div className="split-visual-bar" aria-hidden="true">
            {splits.map((split) => <span key={split.key} className={split.className} style={{ flexGrow: Math.max(0, Number(shared[split.key]) || 0) }} />)}
          </div>
          <div className="split-input-grid">
            {splits.map((split) => (
              <div className={`split-input-item ${split.className}`} key={split.key}>
                <label htmlFor={`training-${split.key}`}><span className="split-color-dot" />{split.name}</label>
                <div className="split-percent-input"><input id={`training-${split.key}`} type="number" min="0" max="100" step="any" value={shared[split.key]} aria-invalid={!splitValid} aria-describedby="split-total" onChange={(event) => setShared(split.key, event.target.value)} /><span>%</span></div>
                <span className="split-row-count"><strong>{splitValid && Number.isFinite(split.count) && split.count >= 0 ? split.count : "—"}</strong> dòng</span>
                <small>{split.purpose}</small>
              </div>
            ))}
          </div>
          <p id="split-total" className={`split-total ${splitValid ? "is-valid" : "is-invalid"}`} role="status">
            {splitValid ? "Tổng 100% · Tỷ lệ hợp lệ" : `Tổng ${Number.isFinite(total) ? total : "—"}% · Cần đủ 100%, mỗi tập lớn hơn 0%`}
          </p>
          <div className="training-field split-strategy-field">
            <label htmlFor="training-split">Cách chia</label>
            <select id="training-split" value={shared.split} onChange={(event) => setShared("split", event.target.value as "random" | "ordered")}>
              <option value="random">Xáo trộn ngẫu nhiên</option><option value="ordered">Giữ thứ tự dòng</option>
            </select>
          </div>
          <HelpNote title="Nên xáo trộn hay giữ thứ tự dòng?">
            <p>Xáo trộn phù hợp khi các mẫu độc lập và thứ tự dòng không mang ý nghĩa. Giữ thứ tự dùng phần đầu để train, tiếp theo validation, cuối cùng test.</p>
            <p className="help-example">Nếu dự đoán tương lai từ dữ liệu cảm biến theo thời gian, cần cân nhắc giữ thứ tự và cách chia theo thời gian để tránh học từ tương lai.</p>
          </HelpNote>
          <p className="settings-footnote">Các model dùng chung tập dữ liệu để so sánh. Số dòng được làm tròn theo tỷ lệ.</p>
        </section>


      </div>

      <details className="settings-advanced">
        <summary><span><strong>Thiết lập nâng cao</strong><small>Random seed và phân tầng theo label</small></span><span className="advanced-summary-hint" aria-hidden="true">Mở tùy chỉnh +</span></summary>
        <div className="settings-advanced-content">
          <div className="training-field"><label htmlFor="training-seed">Random seed</label><input id="training-seed" type="number" min="0" max="4294967295" step="1" value={shared.seed} onChange={(event) => setShared("seed", event.target.value)} /><small>Giữ cùng seed để tái lập cách chia ngẫu nhiên.</small></div>
          <div><label className="training-toggle"><input type="checkbox" checked={stratifyAvailable && shared.stratify} disabled={!stratifyAvailable} onChange={(event) => setShared("stratify", event.target.checked)} />Giữ tỷ lệ lớp khi chia dữ liệu</label><p className="settings-footnote">{stratifyAvailable ? "Phân tầng giúp các lớp có tỷ lệ tương tự giữa train, validation và test." : "Chỉ dùng cho phân loại với một label và chia ngẫu nhiên."}</p></div>
        </div>
        <div className="advanced-help-notes">
          <HelpNote title="Random seed 42 nghĩa là gì?">
            <p>Tưởng tượng có <strong>100 tờ dữ liệu</strong>, bạn bốc ngẫu nhiên <strong>70 tờ cho model học</strong>, còn lại để kiểm tra. Mỗi lần bốc có thể ra những tờ khác nhau, nên kết quả cũng có thể thay đổi.</p>
            <p><strong>Random seed giống như lưu lại cách bốc thăm.</strong> Ví dụ minh họa:</p>
            <ul>
              <li>Seed <strong>42</strong> → chọn các dòng 3, 8, 12… để train.</li>
              <li>Seed <strong>43</strong> → có thể chọn các dòng 1, 5, 9…</li>
              <li>Dùng lại <strong>42</strong>, với cùng dữ liệu và cấu hình → chọn lại đúng các dòng như lần đầu.</li>
            </ul>
            <p>Nhờ vậy, khi thử model A và model B, cả hai được <strong>học cùng dữ liệu, kiểm tra cùng dữ liệu</strong>, giúp so sánh công bằng hơn.</p>
            <p><strong>Số 42 không có ý nghĩa đặc biệt.</strong> Bạn có thể dùng 7, 100 hoặc 2026; số lớn hơn không làm model tốt hơn. Bạn thường chỉ cần giữ mặc định <strong>42</strong> để các lần thử dễ so sánh với nhau.</p>
          </HelpNote>
          <HelpNote title="Giữ tỷ lệ lớp giúp gì?">
            <p>Ví dụ có 80 dòng bình thường và 20 dòng lỗi. Phân tầng cố giữ tỷ lệ gần 80/20 trong cả train, validation và test để các tập không bị thiếu mẫu của một lớp.</p>
            <p>Không phải sao chép hoặc tự bổ sung dữ liệu. Mỗi lớp cần đủ mẫu; hệ thống sẽ báo nếu chưa chia được theo cấu hình.</p>
          </HelpNote>
        </div>
      </details>
    </section>
  );
}