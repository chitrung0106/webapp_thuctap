import HelpNote from "../common/HelpNote";
import type { DatasetSnapshot, TrainingPlan } from "../../types/training";
import type { useTrainingSetup } from "../../hooks/useTrainingSetup";
import ModelParameterCard from "./ModelParameterCard";
import TrainingCommonSettings from "./TrainingCommonSettings";
import TrainingExecutionSettings from "./TrainingExecutionSettings";

interface TrainingSetupProps {
  snapshot: DatasetSnapshot | null;
  setup: ReturnType<typeof useTrainingSetup>;
  onRun: (plan: TrainingPlan) => void;
  isStarting: boolean;
  runBlocked: boolean;
  runError: string;
  onCancelStart:()=>void;
}

export default function TrainingSetup({ snapshot, setup, onRun, onCancelStart, isStarting, runBlocked, runError }: TrainingSetupProps) {
  const { form, catalog, inspection, confirmedPlan, toggleModel, selectModels, setParameter, resetModel, confirm } = setup;
  const environmentBlocked=form.shared.environment!=='server'&&!crossOriginIsolated;
  return (
    <section className="training-overview training-setup" aria-labelledby="training-title">
      <div className="panel-heading">
        <div><p className="eyebrow">BƯỚC 02 / MULTI-MODEL TRAINING</p><h2 id="training-title">Thiết lập lượt huấn luyện</h2></div>
        <span className="training-state-badge">{!snapshot ? "CHỜ DỮ LIỆU" : confirmedPlan ? "ĐÃ XÁC NHẬN" : "CẤU HÌNH"}</span>
      </div>
      <p className="training-description">Một bộ dữ liệu, nhiều model để so sánh. Chọn các model muốn huấn luyện, rồi mở thông số riêng của từng model.</p>
      {!snapshot && <p className="dataset-notice">Hoàn tất xác nhận dữ liệu ở bước 01 để mở cấu hình huấn luyện.</p>}
      <fieldset className="training-config-fieldset" disabled={!snapshot}>
        <legend className="visually-hidden">Cấu hình nhiều model học có giám sát</legend>
        {snapshot && (
          <div className="training-dataset-strip">
            <span className="dataset-file-badge" aria-hidden="true">CSV</span>
            <div><strong>{snapshot.fileName}</strong><span>{snapshot.data.inputs.length} dòng · {snapshot.data.inputColumns.length} cột input · {snapshot.data.outputColumns.length} label</span></div>
            <span className="dataset-confirmed-badge">✓ Đã xác nhận dữ liệu</span>
          </div>
        )}
        {snapshot && <div className="training-preprocessing-summary"><strong>Tiền xử lý đã xác nhận ở bước 01</strong><div>{snapshot.inputPreprocessing.map((column) => <span key={column.columnIndex}>{column.name}: {column.config.kind === "number" ? `Số · ${column.config.scaling}` : `Phân loại · ${column.config.encoding}`}</span>)}{snapshot.labelPreprocessing.map((label) => <span key={`label-${label.columnIndex}`}>{label.name}: {label.task === "classification" ? "LabelEncoder" : "Giữ nguyên số"}</span>)}</div><p>Quay lại dữ liệu nếu cần thay đổi. Encoder và scaler chỉ được học trên tập train.</p></div>}
        <TrainingExecutionSettings setup={setup} isStarting={isStarting} />
        <TrainingCommonSettings setup={setup} targetCount={snapshot?.data.outputColumns.length ?? 0} />
        <section className="training-models" aria-labelledby="model-list-title">
          <div className="training-model-heading">
            <div><h3 id="model-list-title">Model trong lượt chạy</h3><p>{inspection.selectedModels.length} model đã chọn · {inspection.jobCount} tác vụ</p></div>
            <div className="training-model-shortcuts">
              <button type="button" className="secondary-button" onClick={() => selectModels("basic")}>Bộ cơ bản</button>
              <button type="button" className="secondary-button" onClick={() => selectModels("all")}>Chọn tất cả</button>
              <button type="button" className="secondary-button" onClick={() => selectModels("none")}>Bỏ chọn</button>
            </div>
          </div>
          <p className="dataset-local-note">Epoch, batch size, tốc độ học, số cây/vòng và độ sâu được chỉnh ở phần Thông số học phía trên, theo từng model. Các giá trị điền sẵn là cấu hình khởi đầu, không phải kết quả tối ưu.</p>
          <HelpNote title="Chọn model để train khác gì chọn model để export?">
            <p>Tick model ở đây nghĩa là đưa model đó vào lượt huấn luyện để so sánh. Chưa phải chọn model cuối cùng để dùng trên thiết bị.</p>
            <p className="help-example">Chọn 3 model và có 1 label → 3 tác vụ. Nếu có 2 label → 6 tác vụ, mỗi model học riêng từng label.</p>
            <p>Sau khi có dashboard kết quả, bạn mới chọn model nào để export. Mỗi tác vụ dùng thông số riêng; thông số chung dùng cho cả lượt chạy.</p>
          </HelpNote>
          <div className="model-config-grid">
            {catalog.map((model) => <ModelParameterCard key={model.id} model={model} unavailable={form.shared.environment!=='server'&&model.id==='catboost'} selected={form.selected.includes(model.id)} values={form.parameters[model.id]}
              onToggle={() => toggleModel(model.id)} onChange={(key, value) => setParameter(model.id, key, value)} onReset={() => resetModel(model.id)} />)}
          </div>
        </section>
        <section className="training-plan-summary" aria-labelledby="plan-summary-title">
          <h3 id="plan-summary-title">Tổng kết lượt huấn luyện</h3>
          <p><strong>{inspection.selectedModels.length}</strong> model × <strong>{snapshot?.data.outputColumns.length ?? 0}</strong> label = <strong>{inspection.jobCount}</strong> tác vụ, chạy lần lượt {form.shared.environment === "server" ? "trên máy chủ (CPU)" : form.shared.device === "gpu" ? "trên máy của bạn (MLP dùng GPU nếu khả dụng, model khác dùng CPU)" : "trên CPU của máy bạn"}.</p>
          <p className="dataset-local-note">Nếu có nhiều label, mỗi model được huấn luyện riêng cho từng label. Việc chọn model để export sẽ thực hiện sau khi có kết quả.</p>
          {snapshot && inspection.errors.length > 0 && (
            <div className="training-validation-errors" role="status">
              <strong>Cần điều chỉnh trước khi xác nhận:</strong>
              <ul>{inspection.errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          )}
          <button className="primary-button" type="button" disabled={!snapshot || environmentBlocked || inspection.errors.length > 0 || Boolean(confirmedPlan)} onClick={confirm}>
            {confirmedPlan ? "Đã xác nhận cấu hình" : "Xác nhận cấu hình huấn luyện"}
          </button>
          {confirmedPlan && <div className="training-run-launch">
            <div><strong>Sẵn sàng chạy {confirmedPlan.jobs.length} tác vụ</strong><p>Dùng bản dữ liệu đã chốt. Xem dashboard trước khi chọn model để export.</p></div>
            <button className="primary-button" type="button" disabled={isStarting || runBlocked} onClick={() => onRun(confirmedPlan)}>{isStarting ? "Đang tạo lượt train..." : "RUN · Bắt đầu huấn luyện"}<span aria-hidden="true">↗</span></button>
          </div>}
          {runBlocked && <p className="dataset-notice">Đang có lượt huấn luyện hoặc đang đọc dữ liệu mới. Chờ hoàn tất trước khi tạo lượt khác.</p>}
          {runError && <p className="error-message" role="alert">{runError}</p>}
          {isStarting&&form.shared.environment!=='server'&&<button type="button" className="secondary-button" onClick={onCancelStart}>Hủy nạp môi trường</button>}
        </section>
      </fieldset>
    </section>
  );
}
