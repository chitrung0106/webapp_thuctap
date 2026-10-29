import type { ParameterField } from "../../types/training";
import type { useTrainingSetup } from "../../hooks/useTrainingSetup";

export default function TrainingLearningSettings({ setup }: { setup: ReturnType<typeof useTrainingSetup> }) {
  const { catalog, form, setParameter } = setup;
  const mlpSelected = form.selected.includes("mlp");
  function field(modelId: string, key: string): ParameterField | undefined { return catalog.find((model) => model.id === modelId)?.fields.find((item) => item.key === key); }
  function input(modelId: string, key: string, label: string, id: string) {
    const definition = field(modelId, key);
    if (!definition) return null;
    return <input id={id} aria-label={label} type={definition.special ? "text" : "number"} step={definition.integer ? 1 : "any"} min={definition.min} max={definition.max} disabled={!form.selected.includes(modelId)} value={String(form.parameters[modelId][key])} onChange={(event) => setParameter(modelId, key, event.target.value)} />;
  }
  const trees = catalog.filter((model) => ["tree", "forest", "extra_trees"].includes(model.id) && form.selected.includes(model.id));
  const boosting = catalog.filter((model) => ["gradient_boosting", "xgboost", "lightgbm", "catboost"].includes(model.id) && form.selected.includes(model.id));
  return <section id="learning-settings" className="settings-card shared-learning-settings" aria-labelledby="shared-learning-title">
    <h4 id="shared-learning-title">Thông số học</h4>
    <p className="dataset-local-note">Các thông số hay chỉnh được gom tại đây. Mỗi model giữ giá trị riêng và chỉ nhận thông số mà nó hỗ trợ. Các mục chuyên sâu vẫn ở thẻ model bên dưới.</p>
    <section className="learning-group" aria-labelledby="neural-learning-title"><h5 id="neural-learning-title">Neural Network / MLP</h5>
      <div className="training-fields learning-neural-fields">
        <div className="training-field"><label htmlFor="shared-epochs">Epoch tối đa</label>{input("mlp", "max_iter", "Epoch tối đa", "shared-epochs")}<small>Số lượt học tối đa trên dữ liệu train.</small></div>
        <div className="training-field"><label htmlFor="shared-batch">Batch size — Số mẫu mỗi lần cập nhật</label>{input("mlp", "batch_size", "Batch size — Số mẫu mỗi lần cập nhật", "shared-batch")}<small>Mặc định 16 mẫu. Có thể nhập auto để hệ thống tự chọn giá trị nhỏ hơn giữa 200 và số mẫu thực sự dùng để học; không phải tự tìm batch size tốt nhất.</small></div>
        <div className="training-field"><label htmlFor="shared-mlp-rate">Learning rate — Tốc độ học</label>{input("mlp", "learning_rate_init", "Learning rate — Tốc độ học của MLP", "shared-mlp-rate")}<small>Mức điều chỉnh khi cập nhật trọng số; mặc định 0.001.</small></div>
      </div>
      {!mlpSelected && <p className="dataset-local-note">Chưa chọn MLP: các ô này không áp dụng. Chọn MLP trong danh sách model để thiết lập.</p>}
    </section>
    {trees.length > 0 && <section className="learning-group"><h5>Model cây — Số cây và độ sâu</h5><div className="result-table-scroll"><table className="learning-settings-table"><thead><tr><th>Model</th><th>Số cây</th><th>Độ sâu tối đa</th></tr></thead><tbody>{trees.map((model) => <tr key={model.id}><th scope="row">{model.name}</th><td>{model.id === "tree" ? "Một cây" : input(model.id, "n_estimators", `${model.name} — Số cây`, `learning-${model.id}-trees`)}</td><td>{input(model.id, "max_depth", `${model.name} — Độ sâu tối đa`, `learning-${model.id}-depth`)}</td></tr>)}</tbody></table></div><p className="dataset-local-note">Số cây là số cây trong rừng, không phải epoch. Nhập none nếu không giới hạn độ sâu.</p></section>}
    {boosting.length > 0 && <section className="learning-group"><h5>Boosting — Số vòng và tốc độ học</h5><div className="result-table-scroll"><table className="learning-settings-table"><thead><tr><th>Model</th><th>Số vòng boosting</th><th>Learning rate — Tốc độ học</th><th>Độ sâu tối đa</th></tr></thead><tbody>{boosting.map((model) => <tr key={model.id}><th scope="row">{model.name}</th><td>{input(model.id, model.id === "catboost" ? "iterations" : "n_estimators", `${model.name} — Số vòng boosting`, `learning-${model.id}-rounds`)}</td><td>{input(model.id, "learning_rate", `${model.name} — Learning rate`, `learning-${model.id}-rate`)}</td><td>{input(model.id, model.id === "catboost" ? "depth" : "max_depth", `${model.name} — Độ sâu tối đa`, `learning-${model.id}-depth`)}</td></tr>)}</tbody></table></div><p className="dataset-local-note">Mỗi vòng boosting bổ sung cây để cải thiện dự đoán; không phải một epoch. Độ sâu: LightGBM dùng -1 để không giới hạn; Gradient Boosting dùng none; XGBoost và CatBoost nhập số nguyên dương.</p></section>}
    <p className="dataset-local-note">Chỉ hiện cấu hình cây/boosting của các model đã chọn. Sửa một ô chỉ thay đổi model tương ứng và yêu cầu xác nhận lại cấu hình trước khi RUN.</p>
  </section>;
}
