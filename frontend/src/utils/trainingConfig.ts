import { getModelCatalog } from "../config/modelCatalog.ts";
import type { DatasetSnapshot, ParameterField, ParameterValues, TrainingForm, TrainingPlan } from "../types/training";

export function isParameterActive(modelId: string, field: ParameterField, values: ParameterValues) {
  if (modelId === "mlp" && field.key === "validation_fraction") return values.early_stopping === true;
  if (modelId === "svm" && field.key === "degree") return values.kernel === "poly";
  if (modelId === "svm" && field.key === "gamma") return values.kernel !== "linear";
  return true;
}

export function parseParameter(field: ParameterField, raw: string | boolean): string | number | boolean | number[] | null {
  if (field.kind === "boolean") {
    if (typeof raw !== "boolean") throw new Error("phải là bật/tắt");
    return raw;
  }
  if (typeof raw !== "string" || !raw.trim()) throw new Error("không được để trống");
  const value = raw.trim();
  if (field.kind === "select") {
    if (!field.options?.some((option) => option.value === value)) throw new Error("lựa chọn không hợp lệ");
    return value === "none" ? null : field.key === "p" ? Number(value) : value;
  }
  if (field.kind === "layers") {
    const layers = value.split(",").map((layer) => layer.trim());
    if (!layers.length || layers.some((layer) => !/^\d+$/.test(layer) || !Number.isSafeInteger(Number(layer)) || Number(layer) < 1)) throw new Error("nhập các số nguyên dương, cách nhau bằng dấu phẩy");
    return layers.map(Number);
  }
  if (field.special && value === field.special) return value === "none" ? null : value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || (field.integer && !Number.isSafeInteger(numeric))) throw new Error(field.integer ? "phải là số nguyên" : "phải là số hữu hạn");
  if (field.min !== undefined && (field.exclusiveMin ? numeric <= field.min : numeric < field.min)) throw new Error(`phải ${field.exclusiveMin ? ">" : "≥"} ${field.min}`);
  if (field.max !== undefined && numeric > field.max) throw new Error(`phải ≤ ${field.max}`);
  return numeric;
}

function isNumeric(value: string) {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) && Number.isFinite(Number(value));
}

export function inspectTrainingConfig(snapshot: DatasetSnapshot | null, form: TrainingForm) {
  const errors: string[] = [];
  if(form.shared.environment!=='server'&&form.selected.includes('catboost'))errors.push('CatBoost cần chọn Máy chủ; bỏ chọn model này để train trong trình duyệt.');
  const shared = form.shared;
  if (!snapshot) errors.push("Hoàn tất và xác nhận dữ liệu ở bước 01 trước.");
  const ratios = [shared.trainPercent, shared.validationPercent, shared.testPercent].map(Number);
  if ([shared.trainPercent, shared.validationPercent, shared.testPercent].some((value) => !value.trim()) || ratios.some((value) => !Number.isFinite(value) || value <= 0 || value >= 100) || Math.abs(ratios.reduce((sum, value) => sum + value, 0) - 100) > 0.00001) {
    errors.push("Train / validation / test phải lớn hơn 0 và có tổng 100%.");
  }
  const size = snapshot?.data.inputs.length ?? 0;
  const counts = { train: size - Math.ceil(size * ratios[1] / 100) - Math.ceil(size * ratios[2] / 100), validation: Math.ceil(size * ratios[1] / 100), test: Math.ceil(size * ratios[2] / 100) };
  if (snapshot && (counts.train < 2 || counts.validation < 1 || counts.test < 1)) errors.push("Dữ liệu quá ít cho tỷ lệ đã chọn: cần ít nhất 2 dòng train, 1 validation và 1 test.");
  if (!shared.seed.trim() || !Number.isInteger(Number(shared.seed)) || Number(shared.seed) < 0 || Number(shared.seed) > 4294967295) errors.push("Random seed phải là số nguyên từ 0 đến 4294967295.");
  const validMetrics = shared.task === "classification" ? ["accuracy", "balanced_accuracy", "f1_macro"] : ["rmse", "mae", "r2"];
  if (!validMetrics.includes(shared.metric)) errors.push("Metric không phù hợp với loại bài toán.");
  const catalog = getModelCatalog(shared.task);
  if (!form.selected.length) errors.push("Chọn ít nhất một model để huấn luyện.");
  if (new Set(form.selected).size !== form.selected.length || form.selected.some((id) => !catalog.some((model) => model.id === id))) errors.push("Danh sách model không hợp lệ với bài toán đã chọn.");
  const selectedModels = catalog.filter((model) => form.selected.includes(model.id));
  const targets = snapshot?.data.outputColumns ?? [];
  if (snapshot && snapshot.labelPreprocessing.length !== targets.length) errors.push("Hoàn tất cấu hình label ở bước 01.");
  if (snapshot?.labelPreprocessing.some((label) => label.task !== shared.task)) errors.push("Loại bài toán phải khớp với cấu hình label đã xác nhận ở bước 01.");
  if (snapshot) targets.forEach((target, index) => {
    const values = snapshot.data.outputs.map((row) => row[index]);
    if (shared.task === "regression") {
      if (values.some((value) => !isNumeric(value))) errors.push(`Label “${target}” phải là số cho bài toán hồi quy.`);
      if (shared.metric === "r2" && counts.test < 2) errors.push("R² cần ít nhất 2 mẫu test.");
    } else {
      const frequency = new Map<string, number>();
      values.forEach((value) => frequency.set(value, (frequency.get(value) ?? 0) + 1));
      if (frequency.size < 2) errors.push(`Label “${target}” cần ít nhất 2 lớp để phân loại.`);
      if (shared.stratify && shared.split === "random" && targets.length === 1 && ([...frequency.values()].some((count) => count < 3) || Math.min(counts.train, counts.validation, counts.test) < frequency.size)) errors.push(`Không đủ mẫu để phân tầng label “${target}” vào cả 3 tập. Tăng dữ liệu hoặc bỏ phân tầng.`);
    }
  });
  for (const model of selectedModels) {
    const values = form.parameters[model.id] ?? {};
    for (const field of model.fields) {
      if (!isParameterActive(model.id, field, values)) continue;
      try { parseParameter(field, values[field.key]); }
      catch (error) { errors.push(`${model.name} — ${field.label}: ${error instanceof Error ? error.message : "không hợp lệ"}.`); }
    }
    if (snapshot && model.id === "knn" && Number(values.n_neighbors) > counts.train) errors.push("KNN: K không được lớn hơn số mẫu train.");
    if (snapshot && model.id === "mlp") {
      if (values.batch_size !== "auto" && Number(values.batch_size) > counts.train) errors.push("MLP: batch size không được lớn hơn số mẫu train.");
      if (values.early_stopping === true) {
        const internalValidation = Math.ceil(counts.train * Number(values.validation_fraction));
        const internalTrain = counts.train - internalValidation;
        const largestClassCount = shared.task === "classification" ? Math.max(...targets.map((_, index) => new Set(snapshot.data.outputs.map((row) => row[index])).size)) : 1;
        if (internalValidation < largestClassCount || internalTrain < Math.max(2, largestClassCount)) errors.push("MLP: phần train quá nhỏ cho early stopping nội bộ. Tắt early stopping hoặc bổ sung dữ liệu.");
      }
    }
    if (model.id === "lightgbm" && Number(values.max_depth) === 0) errors.push("LightGBM: độ sâu phải là -1 hoặc số nguyên dương.");
  }
  if (snapshot && snapshot.inputPreprocessing.length !== snapshot.data.inputColumns.length) errors.push("Xác nhận cấu hình tiền xử lý cho từng cột input ở bước 01.");
  return { errors: [...new Set(errors)], counts, selectedModels, jobCount: selectedModels.length * targets.length };
}

export function buildTrainingPlan(snapshot: DatasetSnapshot, form: TrainingForm): TrainingPlan {
  const inspected = inspectTrainingConfig(snapshot, form);
  if (inspected.errors.length) throw new Error(inspected.errors.join("\n"));
  const shared = form.shared;
  return {
    createdAt: new Date().toISOString(), dataset: structuredClone(snapshot), task: shared.task,
    split: { trainPercent: Number(shared.trainPercent), validationPercent: Number(shared.validationPercent), testPercent: Number(shared.testPercent), seed: Number(shared.seed), strategy: shared.split, stratify: shared.task === "classification" && shared.split === "random" && snapshot.data.outputColumns.length === 1 && shared.stratify },
    preprocessing: { columns: structuredClone(snapshot.inputPreprocessing), targets: structuredClone(snapshot.labelPreprocessing), fitOn: "train_only" },
    metric: shared.metric,
    execution: { environment: shared.environment ?? "browser", device: shared.environment !== "server" && shared.device === "gpu" ? "gpu" : "cpu", concurrentJobs: 1, targetStrategy: "separate" },
    jobs: inspected.selectedModels.flatMap((model) => snapshot.data.outputColumns.map((targetName, targetIndex) => ({
      modelId: model.id, modelName: model.name, targetIndex, targetName,
      parameters: Object.fromEntries(model.fields.filter((field) => isParameterActive(model.id, field, form.parameters[model.id])).map((field) => [field.key, parseParameter(field, form.parameters[model.id][field.key])])),
    }))),
  };
}
