import json
import platform
from pathlib import Path
import numpy as np
from app.services.portable_runtime import predict_outputs, predicted_indices

SUPPORTED = {"linear", "tree", "forest", "extra_trees", "mlp"}


def supported_reason(artifact, result):
    if result["modelId"] not in SUPPORTED:
        return "Chưa có bộ chuyển đổi C++ cho thuật toán này; vẫn xuất được gói Python/Joblib."
    if any(spec["config"]["kind"] != "number" for spec in artifact["input_schema"]):
        return "Bản C++ hiện hỗ trợ input số. Input phân loại vẫn dùng gói Python; không tự thay cấu hình dữ liệu."
    return None


def convert(artifact, result, storage):
    reason = supported_reason(artifact, result)
    if reason: raise ValueError(reason)
    estimator = artifact["pipeline"].named_steps["model"]
    preprocessor = artifact["pipeline"].named_steps["preprocessing"]
    count = len(artifact["input_columns"])
    scale, offset = np.ones(count), np.zeros(count)
    for i, (_, transform, _) in enumerate(preprocessor.transformers_):
        if isinstance(transform, str) or transform.__class__.__name__ == "FunctionTransformer": continue
        if transform.__class__.__name__ == "StandardScaler":
            scale[i] = 1 / float(transform.scale_[0]) if transform.with_std else 1
            offset[i] = -float(transform.mean_[0]) * scale[i] if transform.with_mean else 0
        elif transform.__class__.__name__ == "MinMaxScaler":
            scale[i], offset[i] = float(transform.scale_[0]), float(transform.min_[0])
        else: raise ValueError("Bộ tiền xử lý này chưa có bộ chuyển đổi C++.")
    meta = {"schema": "portable_numeric_v1", "storage": storage, "compute": "float32", "task": artifact["task"], "modelName": result["modelName"], "targetName": artifact["target_name"], "inputColumns": artifact["input_columns"], "classes": result.get("classes", []), "tensors": {}, "layers": [], "trees": []}
    blocks = []
    size = 0
    def add(name, values):
        nonlocal size
        values = np.asarray(values)
        with np.errstate(over="ignore", invalid="ignore"):
            encoded = values.astype("<f2" if storage == "float16" else "<f4")
        if not np.isfinite(encoded).all(): raise ValueError(f"{storage}: tham số {name} vượt miền biểu diễn; hãy dùng Float32 hoặc kiểm tra dữ liệu.")
        meta["tensors"][name] = {"offset": size, "count": int(encoded.size), "shape": list(values.shape)}
        size += int(encoded.size)
        blocks.append(encoded.tobytes())
    add("scale", scale); add("offset", offset)
    if result["modelId"] in {"linear", "mlp"}:
        meta["family"] = "dense"
        if result["modelId"] == "mlp":
            weights, biases = estimator.coefs_, estimator.intercepts_
            activations = [estimator.activation] * (len(weights) - 1) + [estimator.out_activation_]
        else:
            coefficient = np.asarray(estimator.coef_)
            weights = [coefficient.reshape(1, -1).T if coefficient.ndim == 1 else coefficient.T]
            biases = [np.atleast_1d(estimator.intercept_)]
            activations = ["identity" if artifact["task"] == "regression" else "logistic" if weights[0].shape[1] == 1 else "softmax"]
        for i, (weight, bias, name) in enumerate(zip(weights, biases, activations)):
            add(f"weight_{i}", weight); add(f"bias_{i}", bias)
            meta["layers"].append({"inputs": int(weight.shape[0]), "outputs": int(weight.shape[1]), "activation": name})
        meta["outputCount"] = int(weights[-1].shape[1])
        meta["workspaceFloats"] = 2 * max([count] + [layer["outputs"] for layer in meta["layers"]])
    else:
        meta["family"] = "trees"
        trees = [estimator] if result["modelId"] == "tree" else estimator.estimators_
        meta["outputCount"] = len(meta["classes"]) if artifact["task"] == "classification" else 1
        for i, item in enumerate(trees):
            tree = item.tree_
            values = tree.value[:, 0, :].copy()
            if artifact["task"] == "classification": values /= np.maximum(values.sum(axis=1, keepdims=True), 1e-30)
            add(f"threshold_{i}", tree.threshold)
            add(f"value_{i}", values)
            meta["trees"].append({"left": tree.children_left.tolist(), "right": tree.children_right.tolist(), "feature": tree.feature.tolist()})
        meta["workspaceFloats"] = 2 * max(count, meta["outputCount"])
    meta["workspaceBytesEstimate"] = meta["workspaceFloats"] * 4
    meta["pythonVersion"] = platform.python_version()
    return meta, b"".join(blocks)


def evaluate(artifact, meta, data, rows, labels):
    import pandas as pd
    from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, mean_squared_error, mean_absolute_error, r2_score
    from sklearn.pipeline import Pipeline
    # Use exactly the held-out rows saved in the original run plan; never fit again.
    output = predict_outputs(meta, data, rows)
    frame = pd.DataFrame(rows, columns=[f"x{i}" for i in range(len(meta["inputColumns"]))]).apply(pd.to_numeric)
    reference = artifact["pipeline"].predict(frame)
    if meta["task"] == "classification":
        predicted = predicted_indices(meta, output)
        actual = artifact["label_encoder"].transform(labels)
        metrics = {"accuracy": float(accuracy_score(actual, predicted)), "balanced_accuracy": float(balanced_accuracy_score(actual, predicted)), "f1_macro": float(f1_score(actual, predicted, average="macro", zero_division=0))}
        agreement = float(np.mean(predicted == reference))
        original_outputs = artifact["pipeline"].predict_proba(frame)
        if output.shape[1] == 1: output = np.column_stack([1 - output[:, 0], output[:, 0]])
    else:
        predicted = output[:, 0]; actual = np.asarray(labels, dtype=float)
        metrics = {"rmse": float(np.sqrt(mean_squared_error(actual, predicted))), "mae": float(mean_absolute_error(actual, predicted))}
        if len(actual) > 1: metrics["r2"] = float(r2_score(actual, predicted))
        agreement = None; original_outputs = reference.reshape(-1, 1)
    return {"testSamples": len(rows), "metrics": {key: value for key, value in metrics.items() if np.isfinite(value)}, "labelAgreement": agreement, "meanAbsoluteOutputDifference": float(np.mean(np.abs(output - original_outputs))), "validation": "Đã chạy suy luận bằng runtime NumPy trên toàn bộ tập test; chưa đo trên ESP32."}
