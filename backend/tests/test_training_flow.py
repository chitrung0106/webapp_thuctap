import io
import json
import subprocess
import sys
import time
import zipfile
from pathlib import Path

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.training import TrainingRequest
from app.services import training_runs


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(training_runs, "STORAGE_ROOT", tmp_path / "runs")
    with TestClient(app) as test_client:
        yield test_client


def plan(task="classification", models=None):
    models = models or ["tree"]
    inputs = [[str(index), "pump" if index % 2 else "fan"] for index in range(100)]
    outputs = [["normal" if index % 2 else "error"] if task == "classification" else [str(index * 0.5)] for index in range(100)]
    return {
        "dataset": {
            "fileName": "test.csv", "csv": "x,device,label\n1,pump,normal",
            "data": {"inputColumns": ["x", "device"], "outputColumns": ["label"], "inputs": inputs, "outputs": outputs},
            "inputPreprocessing": [{"columnIndex": 0, "name": "x", "config": {"kind": "number", "scaling": "standard"}}, {"columnIndex": 1, "name": "device", "config": {"kind": "category", "encoding": "onehot"}}],
            "labelPreprocessing": [{"columnIndex": 2, "name": "label", "task": task, "encoding": "label_encoder" if task == "classification" else "none", "restoreOriginalLabel": task == "classification"}],
        },
        "task": task, "split": {"trainPercent": 70, "validationPercent": 15, "testPercent": 15, "seed": 42, "strategy": "random", "stratify": task == "classification"},
        "metric": "accuracy" if task == "classification" else "rmse",
        "jobs": [{"modelId": model, "modelName": model, "targetIndex": 0, "targetName": "label", "parameters": {"max_iter": 3, "hidden_layer_sizes": [8], "batch_size": "auto"} if model == "mlp" else {"n_estimators": 5} if model in {"forest", "extra_trees", "gradient_boosting"} else {"n_neighbors": 3} if model == "knn" else {}} for model in models],
    }


def wait_run(client, run_id):
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        response = client.get(f"/api/training/runs/{run_id}")
        assert response.status_code == 200
        run = response.json()
        if run["status"] in {"completed", "failed", "cancelled"}:
            return run
        time.sleep(0.05)
    raise AssertionError("Training did not finish in time")


@pytest.mark.parametrize("task,models", [
    ("classification", ["linear", "tree", "forest", "extra_trees", "gradient_boosting", "knn", "svm", "naive_bayes", "mlp"]),
    ("regression", ["linear", "tree", "forest", "extra_trees", "gradient_boosting", "knn", "svm", "mlp"]),
])
def test_basic_batch_trains_and_returns_real_metrics(client, task, models):
    response = client.post("/api/training/runs", json=plan(task, models))
    assert response.status_code == 202, response.text
    run = wait_run(client, response.json()["id"])
    assert run["status"] == "completed", run
    assert run["splitCounts"] == {"train": 70, "validation": 15, "test": 15}
    assert all(result["status"] == "succeeded" for result in run["results"]), run["results"]
    metric = "accuracy" if task == "classification" else "rmse"
    assert all(metric in result["metrics"]["test"] for result in run["results"])
    neural = next(result for result in run["results"] if result["modelId"] == "mlp")
    assert len(neural["history"]) == 3
    assert all("validationLoss" in point for point in neural["history"])
    tree = next(result for result in run["results"] if result["modelId"] == "tree")
    assert tree["history"] == []


def test_exported_bundle_runs_predictions_and_optional_dataset(client, tmp_path):
    started = client.post("/api/training/runs", json=plan()).json()
    run = wait_run(client, started["id"])
    exported = client.post(f"/api/training/runs/{run['id']}/export", json={"resultIds": ["model-0"], "format": "python_zip", "includeData": True})
    assert exported.status_code == 200, exported.text
    archive = zipfile.ZipFile(io.BytesIO(exported.content))
    assert "processed-data.csv" in archive.namelist()
    assert "tree__label/predict.py" in archive.namelist()
    archive.extractall(tmp_path / "bundle")
    directory = tmp_path / "bundle" / "tree__label"
    prediction = subprocess.run([sys.executable, str(directory / "predict.py"), str(directory / "samples.json")], check=True, capture_output=True, text=True, encoding="utf-8")
    assert set(json.loads(prediction.stdout)) <= {"normal", "error"}
    without_data = client.post(f"/api/training/runs/{run['id']}/export", json={"resultIds": ["model-0"], "format": "python_zip"})
    assert "processed-data.csv" not in zipfile.ZipFile(io.BytesIO(without_data.content)).namelist()
    invalid = client.post(f"/api/training/runs/{run['id']}/export", json={"resultIds": ["not-a-model"]})
    assert invalid.status_code == 400
    training_runs.RUNS.pop(run["id"])
    assert client.get(f"/api/training/runs/{run['id']}").json()["results"][0]["status"] == "succeeded"


def test_scaler_fits_train_only_and_predictions_preserve_label_names(client):
    payload = plan()
    payload["split"].update(strategy="ordered", stratify=False)
    payload["dataset"]["data"]["inputs"][-1][0] = "1000000"
    run = wait_run(client, client.post("/api/training/runs", json=payload).json()["id"])
    bundle = joblib.load(training_runs.run_directory(run["id"]) / "model-0.joblib")
    scaler = bundle["pipeline"].named_steps["preprocessing"].named_transformers_["column_0"]
    assert scaler.mean_[0] == pytest.approx(np.mean(np.arange(70)))
    assert bundle["label_encoder"].classes_.tolist() == ["error", "normal"]


def test_invalid_requests_rejected_and_model_failure_isolated(client):
    invalid = plan()
    invalid["split"]["trainPercent"] = 90
    assert client.post("/api/training/runs", json=invalid).status_code == 422
    invalid = plan()
    invalid["dataset"]["data"]["inputs"][0][0] = ""
    assert client.post("/api/training/runs", json=invalid).status_code == 422
    payload = plan(models=["tree", "knn"])
    payload["jobs"][0]["parameters"] = {"not_a_parameter": 1}
    run = wait_run(client, client.post("/api/training/runs", json=payload).json()["id"])
    assert [result["status"] for result in run["results"]] == ["failed", "succeeded"]
    assert client.get("/api/training/runs/not-a-uuid").status_code == 404


def test_queued_run_can_be_cancelled(client, monkeypatch):
    class PausedExecutor:
        def submit(self, *args):
            pass
    monkeypatch.setattr(training_runs, "EXECUTOR", PausedExecutor())
    payload = plan()
    started = client.post("/api/training/runs", json=payload).json()
    assert client.post(f"/api/training/runs/{started['id']}/cancel").status_code == 200
    training_runs.execute_run(started["id"], TrainingRequest.model_validate(payload))
    run = client.get(f"/api/training/runs/{started['id']}").json()
    assert run["status"] == "cancelled"
    assert all(result["status"] == "cancelled" for result in run["results"])
@pytest.mark.parametrize("task", ["classification", "regression"])
def test_optional_boosting_models_when_installed(client, task):
    for package in ("xgboost", "lightgbm", "catboost"):
        pytest.importorskip(package)
    payload = plan(task, ["xgboost", "lightgbm", "catboost"])
    payload["jobs"][0]["parameters"] = {"n_estimators": 5, "max_depth": 3}
    payload["jobs"][1]["parameters"] = {"n_estimators": 5, "min_child_samples": 2}
    payload["jobs"][2]["parameters"] = {"iterations": 5, "depth": 3}
    run = wait_run(client, client.post("/api/training/runs", json=payload).json()["id"])
    assert run["status"] == "completed"
    assert all(result["status"] == "succeeded" for result in run["results"]), run["results"]

def test_dashboard_metrics_history_and_loss(client):
    from sklearn.metrics import accuracy_score, mean_squared_error
    from app.services.training_preprocessing import input_frame, split_indices
    for task in ("classification", "regression"):
        request = plan(task, ["mlp", "tree"])
        response = client.post("/api/training/runs", json=request)
        assert response.status_code == 202, response.text
        run = wait_run(client, response.json()["id"])
        assert all(r["status"] == "succeeded" for r in run["results"]), run
        snapshot = TrainingRequest.model_validate(request)
        indices = split_indices(snapshot)
        frame = input_frame(snapshot.dataset)
        for result in run["results"]:
            assert result["artifactBytes"] > 0
            artifact = joblib.load(training_runs.run_directory(run["id"]) / f"{result['id']}.joblib")
            for name, idx in zip(("train", "validation", "test"), indices):
                prediction = artifact["pipeline"].predict(frame.iloc[idx])
                raw = np.asarray(snapshot.dataset.data.outputs)[:, 0][idx]
                if task == "classification":
                    actual = artifact["label_encoder"].transform(raw)
                    assert result["metrics"][name]["accuracy"] == pytest.approx(accuracy_score(actual, prediction))
                    assert "precision_macro" in result["metrics"][name]
                else:
                    assert result["metrics"][name]["mse"] == pytest.approx(mean_squared_error(raw.astype(float), prediction))
            if task == "classification":
                assert sum(row["support"] for row in result["classificationReport"]) == len(indices[2])
                if result["modelId"] == "mlp":
                    assert all(0 <= p["trainAccuracy"] <= 1 and 0 <= p["validationAccuracy"] <= 1 for p in result["history"])
                    assert all("testLoss" not in p for p in result["history"])
            else:
                assert result["lossName"] == "mse"
                assert len(result["regressionPoints"]) == len(indices[2])

def test_binary_metrics_respect_selected_positive_class():
    from app.services.training_metrics import binary_metrics
    # Rows actual [normal, fault], columns predicted [normal, fault].
    report = binary_metrics([[8, 2], [3, 7]], ["normal", "fault"])
    fault = report[1]
    assert (fault["tp"], fault["tn"], fault["fp"], fault["fn"]) == (7, 8, 2, 3)
    assert fault["precision"] == pytest.approx(7 / 9)
    assert fault["recall"] == pytest.approx(.7)
    assert fault["specificity"] == pytest.approx(.8)
    assert fault["falsePositiveRate"] == pytest.approx(.2)
    assert fault["falseNegativeRate"] == pytest.approx(.3)
    assert report[0]["recall"] == pytest.approx(.8)
    assert report[0]["falsePositiveRate"] == pytest.approx(.3)


def test_binary_metrics_undefined_and_multiclass():
    from app.services.training_metrics import binary_metrics
    report = binary_metrics([[10, 0], [0, 0]], ["normal", "fault"])
    assert report[1]["precision"] is None
    assert report[1]["recall"] is None
    assert report[1]["specificity"] == 1
    assert binary_metrics([[1, 0, 0], [0, 1, 0], [0, 0, 1]], ["a", "b", "c"]) is None


def test_binary_dashboard_api_and_multiclass_detection(client):
    binary = plan(models=["tree"])
    response = client.post("/api/training/runs", json=binary)
    run = wait_run(client, response.json()["id"])
    result = run["results"][0]
    assert result["problemType"] == "binary"
    assert len(result["binaryMetrics"]) == 2
    assert sum(result["binaryMetrics"][0][key] for key in ("tp", "tn", "fp", "fn")) == run["splitCounts"]["test"]
    multi = plan(models=["tree"])
    multi["dataset"]["data"]["outputs"] = [[str(i % 3)] for i in range(100)]
    response = client.post("/api/training/runs", json=multi)
    result = wait_run(client, response.json()["id"])["results"][0]
    assert result["status"] == "succeeded"
    assert result["problemType"] == "multiclass"
    assert result["binaryMetrics"] is None

def test_manual_problem_type_is_validated_and_preserved(client):
    request = plan(models=["tree"])
    label = request["dataset"]["labelPreprocessing"][0]
    label["problemType"] = "multiclass"
    assert client.post("/api/training/runs", json=request).status_code == 422
    label["problemType"] = "binary"
    validated = TrainingRequest.model_validate(request)
    assert validated.dataset.label_preprocessing[0].problem_type == "binary"
    request["dataset"]["data"]["outputs"] = [[str(i % 3)] for i in range(100)]
    assert client.post("/api/training/runs", json=request).status_code == 422
    label["problemType"] = "multiclass"
    assert TrainingRequest.model_validate(request).dataset.label_preprocessing[0].problem_type == "multiclass"
    label["problemType"] = "regression"
    assert client.post("/api/training/runs", json=request).status_code == 422

def test_report_overview_distribution_and_binary_by_split(client):
    from sklearn.metrics import confusion_matrix
    from app.services.training_preprocessing import input_frame, split_indices
    from app.services.training_metrics import binary_metrics
    request = plan(models=["tree"])
    created = client.post("/api/training/runs", json=request)
    assert created.status_code == 202
    run = wait_run(client, created.json()["id"])
    assert run["targetDistributions"] == [{"targetIndex": 0, "targetName": "label", "classes": [{"label": "error", "count": 50}, {"label": "normal", "count": 50}]}]
    result = run["results"][0]
    snapshot = TrainingRequest.model_validate(request)
    frame = input_frame(snapshot.dataset)
    artifact = joblib.load(training_runs.run_directory(run["id"]) / "model-0.joblib")
    encoder = artifact["label_encoder"]
    for split, idx in zip(("train", "validation", "test"), split_indices(snapshot)):
        actual = encoder.transform(np.asarray(snapshot.dataset.data.outputs)[:, 0][idx])
        predicted = artifact["pipeline"].predict(frame.iloc[idx])
        expected = binary_metrics(confusion_matrix(actual, predicted, labels=[0, 1]).tolist(), encoder.classes_.tolist())
        assert result["binaryMetricsBySplit"][split] == expected
    assert result["binaryMetricsBySplit"]["test"] == result["binaryMetrics"]
