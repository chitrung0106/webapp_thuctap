import numpy as np
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score, confusion_matrix, mean_squared_error, mean_absolute_error, r2_score, log_loss, precision_score, recall_score, classification_report


def metrics_for(estimator, x, y, task, classes=None):
    prediction = estimator.predict(x)
    if task == "classification":
        metrics = {"accuracy": float(accuracy_score(y, prediction)), "balanced_accuracy": float(balanced_accuracy_score(y, prediction)), "f1_macro": float(f1_score(y, prediction, average="macro", zero_division=0))}
        metrics["precision_macro"] = float(precision_score(y, prediction, average="macro", zero_division=0))
        metrics["recall_macro"] = float(recall_score(y, prediction, average="macro", zero_division=0))
        if hasattr(estimator, "predict_proba"):
            probability = estimator.predict_proba(x)
            metrics["log_loss"] = float(log_loss(y, probability, labels=classes))
    else:
        metrics = {"mse": float(mean_squared_error(y, prediction)), "rmse": float(np.sqrt(mean_squared_error(y, prediction))), "mae": float(mean_absolute_error(y, prediction))}
        if len(y) >= 2:
            metrics["r2"] = float(r2_score(y, prediction))
    return {key: value for key, value in metrics.items() if np.isfinite(value)}, prediction


def evaluate_model(estimator, splits, task, label_encoder):
    import warnings
    metrics, predictions = {}, {}
    classes = np.arange(len(label_encoder.classes_)) if label_encoder is not None else None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        for name, (x, y) in splits.items():
            metrics[name], predictions[name] = metrics_for(estimator, x, y, task, classes)
    y_test = splits["test"][1]
    predicted = predictions["test"]
    actual_labels = label_encoder.inverse_transform(y_test) if label_encoder is not None else y_test
    predicted_labels = label_encoder.inverse_transform(predicted.astype(int)) if label_encoder is not None else predicted
    samples = [{"actual": str(actual), "predicted": str(guess)} for actual, guess in zip(actual_labels[:20], predicted_labels[:20])]
    matrix = confusion_matrix(y_test, predicted, labels=classes).tolist() if task == "classification" else None
    return metrics, samples, matrix

def binary_metrics(matrix, classes):
    """Report both positive-class choices; None means an undefined denominator."""
    if matrix is None or len(classes) != 2 or np.shape(matrix) != (2, 2):
        return None
    def ratio(numerator, denominator):
        return float(numerator / denominator) if denominator else None
    result = []
    for positive in range(2):
        negative = 1 - positive
        tp, fn = int(matrix[positive][positive]), int(matrix[positive][negative])
        fp, tn = int(matrix[negative][positive]), int(matrix[negative][negative])
        result.append({"positiveClass": str(classes[positive]), "negativeClass": str(classes[negative]),
            "precision": ratio(tp, tp + fp), "recall": ratio(tp, tp + fn),
            "f1": ratio(2 * tp, 2 * tp + fp + fn), "specificity": ratio(tn, tn + fp),
            "falsePositiveRate": ratio(fp, fp + tn), "falseNegativeRate": ratio(fn, fn + tp),
            "tp": tp, "tn": tn, "fp": fp, "fn": fn, "support": tp + fn})
    return result
