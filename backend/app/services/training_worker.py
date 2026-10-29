import copy
import time
import warnings
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import log_loss, mean_squared_error, accuracy_score, classification_report, confusion_matrix
from app.services.model_factory import create_estimator
from app.services.training_preprocessing import make_preprocessor
from app.services.training_metrics import evaluate_model, binary_metrics


class TrainingCancelled(Exception):
    pass


def run_model(request, job, frame, indices, on_progress, cancelled):
    started = time.perf_counter()
    train_idx, validation_idx, test_idx = indices
    raw_y = np.asarray(request.dataset.data.outputs)[:, job.target_index]
    encoder = None
    if request.task == "classification":
        encoder = LabelEncoder().fit(raw_y[train_idx])
        if len(encoder.classes_) < 2:
            raise ValueError("Tập train cần ít nhất 2 lớp. Thử phân tầng hoặc tăng dữ liệu.")
        try:
            y_train, y_validation, y_test = (encoder.transform(raw_y[index]) for index in indices)
        except ValueError as error:
            raise ValueError("Validation/test có lớp chưa xuất hiện trong train. Kiểm tra cách chia dữ liệu.") from error
    else:
        try:
            numeric_y = raw_y.astype(float)
        except ValueError as error:
            raise ValueError("Label hồi quy phải là số.") from error
        if not np.isfinite(numeric_y).all():
            raise ValueError("Label hồi quy chứa số không hữu hạn.")
        y_train, y_validation, y_test = (numeric_y[index] for index in indices)
    preprocessor = make_preprocessor(request.dataset)
    x_train = preprocessor.fit_transform(frame.iloc[train_idx])
    x_validation = preprocessor.transform(frame.iloc[validation_idx])
    x_test = preprocessor.transform(frame.iloc[test_idx])
    estimator = create_estimator(job.model_id, request.task, job.parameters, request.split.seed)
    history = []
    classes = np.arange(len(encoder.classes_)) if encoder is not None else None
    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("always")
        if job.model_id == "mlp":
            early_stopping = bool(estimator.early_stopping)
            estimator.set_params(early_stopping=False)
            fit_x, fit_y = x_train, y_train
            monitor_x, monitor_y = x_validation, y_validation
            if early_stopping:
                fit_x, monitor_x, fit_y, monitor_y = train_test_split(x_train, y_train, test_size=estimator.validation_fraction, random_state=request.split.seed, stratify=y_train if encoder is not None else None)
            best_loss, patience, best_model = float("inf"), 0, None
            for epoch in range(int(estimator.max_iter)):
                if cancelled():
                    raise TrainingCancelled()
                if epoch == 0 and encoder is not None:
                    estimator.partial_fit(fit_x, fit_y, classes=classes)
                else:
                    estimator.partial_fit(fit_x, fit_y)
                validation_loss = float(log_loss(y_validation, estimator.predict_proba(x_validation), labels=classes)) if encoder is not None else float(mean_squared_error(y_validation, estimator.predict(x_validation)))
                training_loss = float(log_loss(fit_y, estimator.predict_proba(fit_x), labels=classes)) if encoder is not None else float(mean_squared_error(fit_y, estimator.predict(fit_x)))
                if not np.isfinite(training_loss) or not np.isfinite(validation_loss):
                    raise ValueError("Loss không hữu hạn. Kiểm tra dữ liệu và learning rate.")
                point = {"step": epoch + 1, "trainLoss": training_loss, "validationLoss": validation_loss}
                if encoder is not None:
                    point.update(trainAccuracy=float(accuracy_score(fit_y, estimator.predict(fit_x))), validationAccuracy=float(accuracy_score(y_validation, estimator.predict(x_validation))))
                history.append(point)
                on_progress(epoch + 1, int(estimator.max_iter), history)
                if early_stopping:
                    monitored_loss = float(log_loss(monitor_y, estimator.predict_proba(monitor_x), labels=classes)) if encoder is not None else float(mean_squared_error(monitor_y, estimator.predict(monitor_x)))
                    if monitored_loss < best_loss - estimator.tol:
                        best_loss, patience, best_model = monitored_loss, 0, copy.deepcopy(estimator)
                    else:
                        patience += 1
                    if patience >= estimator.n_iter_no_change:
                        break
            if early_stopping and best_model is not None:
                estimator = best_model
        else:
            estimator.fit(x_train, y_train)
        if job.model_id == "gradient_boosting":
            if encoder is not None:
                staged = zip(estimator.staged_predict_proba(x_train), estimator.staged_predict_proba(x_validation))
                for step, (train_prediction, val_prediction) in enumerate(staged, 1):
                    history.append({"step": step, "trainLoss": float(log_loss(y_train, train_prediction, labels=classes)), "validationLoss": float(log_loss(y_validation, val_prediction, labels=classes)), "trainAccuracy": float(accuracy_score(y_train, np.argmax(train_prediction, axis=1))), "validationAccuracy": float(accuracy_score(y_validation, np.argmax(val_prediction, axis=1)))})
            else:
                for step, (train_prediction, val_prediction) in enumerate(zip(estimator.staged_predict(x_train), estimator.staged_predict(x_validation)), 1):
                    history.append({"step": step, "trainLoss": float(mean_squared_error(y_train, train_prediction)), "validationLoss": float(mean_squared_error(y_validation, val_prediction))})
    splits = {"train": (x_train, y_train), "validation": (x_validation, y_validation), "test": (x_test, y_test)}
    metrics, samples, matrix = evaluate_model(estimator, splits, request.task, encoder)
    report = None
    regression_points = None
    if encoder is not None:
        report = classification_report(y_test, estimator.predict(x_test), labels=classes, target_names=encoder.classes_.tolist(), output_dict=True, zero_division=0)
        report = [{"label": str(label), **report[str(label)]} for label in encoder.classes_]
    else:
        predicted = estimator.predict(x_test)
        regression_points = [{"actual": float(y_test[i]), "predicted": float(predicted[i])} for i in np.linspace(0, len(y_test) - 1, min(200, len(y_test)), dtype=int)]
    pipeline = Pipeline([("preprocessing", preprocessor), ("model", estimator)])
    from importlib.metadata import version, PackageNotFoundError
    versions = {}
    for package in ("scikit-learn", "numpy", "scipy", "pandas", "joblib", job.model_id):
        try: versions[package] = version(package)
        except PackageNotFoundError: pass
    binary_by_split = None
    if encoder is not None and len(encoder.classes_) == 2:
        binary_by_split = {name: binary_metrics(confusion_matrix(y, estimator.predict(x), labels=classes).tolist(), encoder.classes_.tolist()) for name, (x, y) in splits.items()}
    public = {
        "versions": versions,
        "problemType": "binary" if encoder is not None and len(encoder.classes_) == 2 else "multiclass" if encoder is not None else "regression",
        "binaryMetricsBySplit": binary_by_split,
        "binaryMetrics": binary_metrics(matrix, encoder.classes_.tolist()) if encoder is not None else None,
        "classificationReport": report, "regressionPoints": regression_points,
        "lossName": "log_loss" if encoder is not None and hasattr(estimator, "predict_proba") else "mse" if encoder is None else None,
        "durationSeconds": round(time.perf_counter() - started, 3),
        "metrics": metrics, "history": history,
        "historyKind": "epoch" if job.model_id == "mlp" else "boosting" if history else None,
        "iterations": len(history) if history else int(np.max(estimator.n_iter_)) if getattr(estimator, "n_iter_", None) is not None else None,
        "classes": encoder.classes_.tolist() if encoder is not None else [],
        "confusionMatrix": matrix, "samples": samples,
        "warnings": list(dict.fromkeys(str(item.message) for item in recorded))[:8],
        "transformedFeatureCount": int(x_train.shape[1]),
    }
    artifact = {"pipeline": pipeline, "label_encoder": encoder, "input_schema": [spec.model_dump(by_alias=True) for spec in request.dataset.input_preprocessing], "input_columns": request.dataset.data.input_columns, "target_name": job.target_name, "task": request.task, "result": public, "sample_inputs": [request.dataset.data.inputs[int(index)] for index in test_idx[:3]]}
    return public, artifact