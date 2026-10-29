import type { ModelDefinition, ParameterField, TaskType, TrainingForm } from "../types/training";

const number = (key: string, label: string, value: string, min: number, integer = false, extra: Partial<ParameterField> = {}): ParameterField =>
  ({ key, label, kind: "number", defaultValue: value, min, integer, ...extra });
const select = (key: string, label: string, values: string[], value = values[0]): ParameterField =>
  ({ key, label, kind: "select", defaultValue: value, options: values.map((item) => ({ value: item, label: item === "none" ? "Không" : item })) });
const bool = (key: string, label: string, value: boolean): ParameterField => ({ key, label, kind: "boolean", defaultValue: value });
const depth = number("max_depth", "Độ sâu tối đa", "8", 1, true, { special: "none", help: "Nhập none nếu không giới hạn độ sâu." });
const trees = number("n_estimators", "Số cây", "100", 1, true);
const rate = number("learning_rate", "Learning rate", "0.1", 0, false, { exclusiveMin: true, max: 1 });
const leaf = number("min_samples_leaf", "Mẫu tối thiểu / lá", "1", 1, true);
const split = number("min_samples_split", "Mẫu tối thiểu để tách", "2", 2, true);

export function getModelCatalog(task: TaskType): ModelDefinition[] {
  const classification = task === "classification";
  return [
    { id: "linear", name: classification ? "Logistic Regression" : "Ridge Regression", description: "Model tuyến tính làm mốc so sánh.", fields: classification
      ? [number("C", "C — nghịch đảo regularization", "1", 0, false, { exclusiveMin: true }), number("max_iter", "Số vòng lặp tối đa", "1000", 1, true), select("solver", "Solver", ["lbfgs", "saga"]), select("class_weight", "Trọng số lớp", ["none", "balanced"]), bool("fit_intercept", "Dùng hệ số chặn", true)]
      : [number("alpha", "Regularization alpha", "1", 0), bool("fit_intercept", "Dùng hệ số chặn", true)] },
    { id: "tree", name: "Decision Tree", description: "Một cây quyết định, có thể giới hạn độ phức tạp.", fields: [depth, split, leaf, select("criterion", "Tiêu chí tách", classification ? ["gini", "entropy", "log_loss"] : ["squared_error", "friedman_mse", "absolute_error"])] },
    { id: "forest", name: "Random Forest", description: "Tổ hợp nhiều cây để cải thiện khả năng tổng quát.", fields: [trees, depth, split, leaf, select("max_features", "Đặc trưng xét mỗi lần tách", ["sqrt", "log2"]), bool("bootstrap", "Lấy mẫu bootstrap", true)] },
    { id: "extra_trees", name: "Extra Trees", description: "Tổ hợp cây với bước tách ngẫu nhiên.", fields: [trees, depth, split, leaf, select("max_features", "Đặc trưng xét mỗi lần tách", ["sqrt", "log2"]), bool("bootstrap", "Lấy mẫu bootstrap", false)] },
    { id: "gradient_boosting", name: "Gradient Boosting", description: "Các cây học nối tiếp để sửa lỗi cho nhau.", fields: [trees, rate, { ...depth, defaultValue: "3" }, leaf, number("subsample", "Tỷ lệ lấy mẫu", "1", 0, false, { exclusiveMin: true, max: 1 })] },
    { id: "knn", name: "K-Nearest Neighbors", description: "Dự đoán từ các mẫu gần nhất; không dùng epoch.", fields: [number("n_neighbors", "Số láng giềng K", "5", 1, true), select("weights", "Trọng số", ["uniform", "distance"]), select("p", "Khoảng cách", ["2", "1"])] },
    { id: "svm", name: classification ? "SVM / SVC" : "SVM / SVR", description: "Support Vector Machine với kernel tùy chọn.", fields: [number("C", "C — regularization", "1", 0, false, { exclusiveMin: true }), select("kernel", "Kernel", ["rbf", "linear", "poly", "sigmoid"]), select("gamma", "Gamma", ["scale", "auto"]), number("degree", "Bậc kernel poly", "3", 1, true), ...(classification ? [] : [number("epsilon", "Biên epsilon", "0.1", 0)])] },
    ...(classification ? [{ id: "naive_bayes", name: "Gaussian Naive Bayes", description: "Baseline xác suất cho bài toán phân loại.", fields: [number("var_smoothing", "Độ làm trơn phương sai", "1e-9", 0)] }] : []),
    { id: "mlp", name: "Neural Network / MLP", description: "Mạng fully connected; có epoch, batch size và optimizer.", fields: [
      { key: "hidden_layer_sizes", label: "Neuron các tầng ẩn", kind: "layers", defaultValue: "64,32", help: "Ví dụ 64,32 là hai tầng ẩn." },
      number("max_iter", "Epoch tối đa (max_iter)", "200", 1, true),
      number("batch_size", "Batch size", "16", 1, true, { special: "auto", help: "auto = min(200, số mẫu train)." }),
      select("activation", "Activation", ["relu", "tanh", "logistic", "identity"]), select("solver", "Optimizer", ["adam", "sgd"]),
      number("learning_rate_init", "Learning rate ban đầu", "0.001", 0, false, { exclusiveMin: true }), number("alpha", "L2 regularization", "0.0001", 0),
      bool("early_stopping", "Early stopping nội bộ", false), number("validation_fraction", "Tỷ lệ validation nội bộ", "0.1", 0, false, { exclusiveMin: true, max: 0.5, help: "Chỉ dùng khi bật early stopping; lấy từ phần train, tách biệt validation chung." }),
      number("n_iter_no_change", "Patience — số epoch không cải thiện", "10", 1, true),
    ] },
    { id: "xgboost", name: "XGBoost", extended: true, description: "Boosting mở rộng với regularization và lấy mẫu đặc trưng.", fields: [trees, rate, { ...depth, special: undefined, defaultValue: "6" }, number("subsample", "Tỷ lệ mẫu", "1", 0, false, { exclusiveMin: true, max: 1 }), number("colsample_bytree", "Tỷ lệ đặc trưng / cây", "1", 0, false, { exclusiveMin: true, max: 1 }), number("reg_lambda", "L2 lambda", "1", 0), number("min_child_weight", "Min child weight", "1", 0)] },
    { id: "lightgbm", name: "LightGBM", extended: true, description: "Gradient boosting với tham số số lá.", fields: [trees, rate, number("num_leaves", "Số lá tối đa", "31", 2, true), number("max_depth", "Độ sâu (-1 = không giới hạn)", "-1", -1, true), number("min_child_samples", "Mẫu tối thiểu / lá", "20", 1, true), number("colsample_bytree", "Tỷ lệ đặc trưng / cây", "1", 0, false, { exclusiveMin: true, max: 1 }), number("reg_lambda", "L2 lambda", "0", 0)] },
    { id: "catboost", name: "CatBoost", extended: true, description: "Boosting với số vòng lặp và độ sâu cây riêng.", fields: [number("iterations", "Số vòng boosting", "200", 1, true), rate, number("depth", "Độ sâu cây", "6", 1, true, { max: 16 }), number("l2_leaf_reg", "L2 leaf regularization", "3", 0)] },
  ];
}

export function createTrainingForm(task: TaskType = "classification"): TrainingForm {
  const catalog = getModelCatalog(task);
  return {
    shared: { task, trainPercent: "70", validationPercent: "15", testPercent: "15", seed: "42", split: "random", stratify: true, metric: task === "classification" ? "accuracy" : "rmse" },
    selected: catalog.filter((model) => !model.extended).map((model) => model.id),
    parameters: Object.fromEntries(catalog.map((model) => [model.id, Object.fromEntries(model.fields.map((field) => [field.key, field.defaultValue]))])),
  };
}