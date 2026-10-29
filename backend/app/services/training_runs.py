from collections import Counter
import copy
import importlib.util
import json
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from app.schemas.training import TrainingRequest

STORAGE_ROOT = Path(os.environ.get("TRAINING_STORAGE_DIR", Path(__file__).resolve().parents[2] / "storage" / "results" / "training"))
EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="training")
LOCK = threading.RLock()
RUNS = {}
CANCELLATIONS = {}


def now():
    return datetime.now(timezone.utc).isoformat()


def run_directory(run_id):
    if str(uuid.UUID(run_id)) != run_id:
        raise ValueError("Mã lượt chạy không hợp lệ.")
    return STORAGE_ROOT / run_id


def save_run(run):
    directory = run_directory(run["id"])
    directory.mkdir(parents=True, exist_ok=True)
    temporary = directory / "status.tmp"
    temporary.write_text(json.dumps(run, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    temporary.replace(directory / "status.json")


def get_run(run_id):
    with LOCK:
        if run_id not in RUNS:
            path = run_directory(run_id) / "status.json"
            if not path.exists():
                raise KeyError(run_id)
            run = json.loads(path.read_text(encoding="utf-8"))
            if run["status"] in {"queued", "running", "cancelling"}:
                run["status"] = "failed"
                run["error"] = "Backend đã khởi động lại khi lượt train chưa hoàn tất. Các model đã lưu vẫn có thể export."
                for result in run["results"]:
                    if result["status"] in {"pending", "running"}:
                        result["status"] = "cancelled"
                save_run(run)
            RUNS[run_id] = run
        return copy.deepcopy(RUNS[run_id])


def capabilities():
    required = [name for name in ("sklearn", "numpy", "pandas", "joblib") if importlib.util.find_spec(name) is None]
    return {"ready": not required, "missingDependencies": required, "optionalModels": {name: importlib.util.find_spec(name) is not None for name in ("xgboost", "lightgbm", "catboost")}, "exportFormats": ["python_zip", "joblib"]}


def create_run(request: TrainingRequest):
    if not capabilities()["ready"]:
        raise RuntimeError("Backend thiếu thư viện ML. Chạy python -m pip install -r requirements.txt trong thư mục backend.")
    run_id = str(uuid.uuid4())
    directory = run_directory(run_id)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "plan.json").write_text(request.model_dump_json(by_alias=True), encoding="utf-8")
    run = {"id": run_id, "status": "queued", "createdAt": now(), "startedAt": None, "completedAt": None, "fileName": request.dataset.file_name, "task": request.task, "metric": request.metric, "rowCount": len(request.dataset.data.inputs), "inputColumns": request.dataset.data.input_columns, "outputColumns": request.dataset.data.output_columns, "splitCounts": None, "error": None, "results": [{"id": f"model-{index}", "modelId": job.model_id, "modelName": job.model_name, "targetIndex": job.target_index, "targetName": job.target_name, "parameters": job.parameters, "status": "pending", "metrics": {}, "history": [], "historyKind": None, "durationSeconds": None, "iterations": None, "warnings": [], "error": None, "progress": None} for index, job in enumerate(request.jobs)]}
    run["targetDistributions"] = [{"targetIndex": i, "targetName": name, "classes": [{"label": label, "count": count} for label, count in sorted(Counter(row[i] for row in request.dataset.data.outputs).items())]} for i, name in enumerate(request.dataset.data.output_columns)] if request.task == "classification" else []
    with LOCK:
        RUNS[run_id] = run
        CANCELLATIONS[run_id] = threading.Event()
        save_run(run)
    EXECUTOR.submit(execute_run, run_id, request)
    return get_run(run_id)


def execute_run(run_id, request):
    from threadpoolctl import threadpool_limits
    try:
        from app.services.training_preprocessing import input_frame, split_indices
        from app.services.training_worker import run_model, TrainingCancelled
        import joblib
        frame = input_frame(request.dataset)
        indices = split_indices(request)
        with LOCK:
            run = RUNS[run_id]
            run["status"] = "running"
            run["startedAt"] = now()
            run["splitCounts"] = dict(zip(("train", "validation", "test"), map(len, indices)))
            save_run(run)
        for index, model_job in enumerate(request.jobs):
            if CANCELLATIONS[run_id].is_set():
                break
            with LOCK:
                result = RUNS[run_id]["results"][index]
                result["status"] = "running"
                save_run(RUNS[run_id])

            def progress(epoch, maximum, history):
                with LOCK:
                    result["progress"] = {"current": epoch, "total": maximum}
                    result["history"] = list(history)
                    result["historyKind"] = "epoch"
                    if epoch % 5 == 0:
                        save_run(RUNS[run_id])
            try:
                with threadpool_limits(limits=1):
                    public, artifact = run_model(request, model_job, frame, indices, progress, CANCELLATIONS[run_id].is_set)
                artifact_path = run_directory(run_id) / f"{result['id']}.joblib"
                joblib.dump(artifact, artifact_path, compress=3)
                with LOCK:
                    result.update(public)
                    result["artifactBytes"] = artifact_path.stat().st_size
                    result["status"] = "succeeded"
            except TrainingCancelled:
                with LOCK:
                    result["status"] = "cancelled"
            except Exception as error:
                with LOCK:
                    result["status"] = "failed"
                    result["error"] = str(error)
            with LOCK:
                save_run(RUNS[run_id])
        with LOCK:
            run = RUNS[run_id]
            for result in run["results"]:
                if result["status"] == "pending":
                    result["status"] = "cancelled"
            run["status"] = "cancelled" if CANCELLATIONS[run_id].is_set() else "completed"
            run["completedAt"] = now()
            save_run(run)
    except Exception as error:
        with LOCK:
            run = RUNS[run_id]
            run["status"], run["error"], run["completedAt"] = "failed", str(error), now()
            for result in run["results"]:
                if result["status"] in {"pending", "running"}:
                    result["status"] = "cancelled"
            save_run(run)


def cancel_run(run_id):
    get_run(run_id)
    with LOCK:
        run = RUNS[run_id]
        if run["status"] in {"queued", "running", "cancelling"}:
            CANCELLATIONS[run_id].set()
            run["status"] = "cancelling"
            save_run(run)
    return get_run(run_id)