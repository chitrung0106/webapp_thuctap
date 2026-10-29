import hashlib
import io
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

import numpy as np
import pytest
from test_training_flow import plan, wait_run, client
from app.services import training_runs
from app.services.portable_runtime import predict_outputs
from app.services.export_templates import PREDICT_SCRIPT


@pytest.mark.parametrize("text,columns,expected", [
    ("temperature\r\n25\r\n26\r\n", ["temperature"], [["25"], ["26"]]),
    ('state\n"warm, humid"\n"sensor\nfault"\n', ["state"], [["warm, humid"], ["sensor\nfault"]]),
    ("temperature;humidity\n25;60\n26;61\n", ["temperature", "humidity"], [["25", "60"], ["26", "61"]]),
])
def test_exported_csv_reader_accepts_single_input_and_quoted_values(tmp_path, text, columns, expected):
    namespace = {"__name__": "exported_predict_test"}
    exec(compile(PREDICT_SCRIPT, "predict.py", "exec"), namespace)
    source = tmp_path / "samples.csv"
    source.write_text(text, encoding="utf-8")
    assert namespace["read_rows"](source, columns) == expected


def numeric_plan(task="classification", model="mlp"):
    request = plan(task, [model])
    request["dataset"]["data"]["inputs"] = [[str(i), str(i % 7)] for i in range(100)]
    request["dataset"]["inputPreprocessing"][1]["config"] = {"kind": "number", "scaling": "none"}
    return request


def completed(client, request):
    response = client.post("/api/training/runs", json=request)
    assert response.status_code == 202, response.text
    run = wait_run(client, response.json()["id"])
    assert run["results"][0]["status"] == "succeeded", run
    return run


def test_preview_matches_archive_and_does_not_change_trained_artifacts(client, tmp_path):
    run = completed(client, numeric_plan())
    directory = training_runs.run_directory(run["id"])
    original = {name: (directory / name).read_bytes() for name in ("model-0.joblib", "status.json", "plan.json")}
    options = {"resultIds": ["model-0"], "format": "python_zip", "variants": ["float32", "float16"], "includeFirmware": True, "firmware": {"board": "esp32", "intervalMs": 1000}}
    response = client.post(f"/api/training/runs/{run['id']}/export/preview", json=options)
    assert response.status_code == 200, response.text
    preview = response.json()
    assert len(preview["variants"]) == 2
    assert all(item["status"] == "ready" for item in preview["variants"]), preview["variants"]
    assert preview["variants"][1]["parameterBytes"] * 2 == preview["variants"][0]["parameterBytes"]
    exported = client.post(f"/api/training/runs/{run['id']}/export", json=options)
    assert exported.status_code == 200, exported.text
    archive = zipfile.ZipFile(io.BytesIO(exported.content))
    assert set(archive.namelist()) == {entry["path"] for entry in preview["files"]}
    for entry in preview["files"]:
        content = archive.read(entry["path"])
        assert len(content) == entry["bytes"]
        assert hashlib.sha256(content).hexdigest() == entry["sha256"]
        if entry["kind"] == "text" and not entry["truncated"]:
            assert content.decode("utf-8") == entry["content"]
    assert sys.version.split()[0] in archive.read("README.txt").decode()
    assert "numpy==" in archive.read("requirements.txt").decode()
    assert "processed-data.csv" not in archive.namelist()
    assert "dataset" not in json.loads(archive.read("training-plan.json"))
    for name, before in original.items(): assert (directory / name).read_bytes() == before
    archive.extractall(tmp_path)
    for suffix in ("json", "csv"):
        predicted = subprocess.run([sys.executable, str(tmp_path / "mlp__label/predict.py"), str(tmp_path / f"mlp__label/samples.{suffix}")], capture_output=True, check=True, text=True, encoding="utf-8")
        assert json.loads(predicted.stdout) == json.loads((tmp_path / "mlp__label/expected-output.json").read_text())
    folder = tmp_path / "mlp__label/portable/float16"
    predicted = subprocess.run([sys.executable, str(folder / "predict.py"), str(folder / "samples.json")], capture_output=True, check=True, text=True, encoding="utf-8")
    assert json.loads(predicted.stdout) == json.loads((folder / "expected-output.json").read_text())
    assert "ESP-IDF v5.4.2" in (folder / "firmware/README.txt").read_text(encoding="utf-8")


@pytest.mark.parametrize("task", ["classification", "regression"])
@pytest.mark.parametrize("model", ["linear", "tree", "forest", "extra_trees", "mlp"])
def test_portable_float_variants_and_generated_cpp(client, tmp_path, task, model):
    run = completed(client, numeric_plan(task, model))
    options = {"resultIds": ["model-0"], "variants": ["float32", "float16"], "includeFirmware": True}
    preview = client.post(f"/api/training/runs/{run['id']}/export/preview", json=options).json()
    assert all(item["status"] == "ready" for item in preview["variants"]), preview
    assert all(item["testSamples"] == 15 for item in preview["variants"])
    archive = zipfile.ZipFile(io.BytesIO(client.post(f"/api/training/runs/{run['id']}/export", json=options).content))
    archive.extractall(tmp_path)
    compiler_python = Path(__file__).resolve().parents[1] / "storage/results/.export-tools/Scripts/python.exe"
    if not compiler_python.exists(): pytest.skip("Optional host C++ verification compiler not installed")
    environment = {**os.environ, "ZIG_GLOBAL_CACHE_DIR": str(Path(__file__).resolve().parents[1] / "storage/results/.zig-cache")}
    folder_name = preview["models"][0]["folder"]
    for variant in ("float32", "float16"):
        folder = tmp_path / f"{folder_name}/portable/{variant}"
        meta = json.loads((folder / "model.json").read_text())
        data = (folder / "model.bin").read_bytes()
        rows = json.loads((folder / "samples.json").read_text())
        expected = predict_outputs(meta, data, rows)
        binary = folder / "host_test.exe"
        built = subprocess.run([str(compiler_python), "-m", "ziglang", "c++", "-std=c++17", "-O2", "model.cpp", "host_test.cpp", "-o", str(binary)], cwd=folder, capture_output=True, text=True, env=environment, timeout=180)
        assert built.returncode == 0, built.stderr
        for row, output in zip(rows, expected):
            actual = subprocess.run([str(binary), *row], capture_output=True, check=True, text=True, timeout=10)
            values = np.asarray([float(value) for value in actual.stdout.split()])
            np.testing.assert_allclose(values, output, atol=5e-5, rtol=5e-4)


def test_unsupported_variants_are_explicit_and_raw_options_validate(client):
    run = completed(client, plan(models=["svm"]))
    options = {"resultIds": ["model-0"], "variants": ["float32"], "includeFirmware": True}
    response = client.post(f"/api/training/runs/{run['id']}/export/preview", json=options)
    assert response.status_code == 200
    preview = response.json()
    assert preview["variants"][0]["status"] == "unavailable"
    assert preview["warnings"]
    assert not any("portable/" in entry["path"] for entry in preview["files"])
    assert any(entry["path"] == "svm__label/predict.py" for entry in preview["files"])
    options["format"] = "joblib"
    assert client.post(f"/api/training/runs/{run['id']}/export/preview", json=options).status_code == 400
    assert client.post(f"/api/training/runs/{run['id']}/export/preview", json={"resultIds": ["../plan"]}).status_code == 400
    assert client.post(f"/api/training/runs/{run['id']}/export/preview", json={"resultIds": ["model-0"], "includeFirmware": True}).status_code == 400

@pytest.mark.parametrize("model", ["linear", "mlp"])
def test_multiclass_minmax_variants_restore_original_names(client, tmp_path, model):
    run_request = numeric_plan("classification", model)
    names = ["red", "blue", "green"]
    run_request["dataset"]["data"]["outputs"] = [[names[i % 3]] for i in range(100)]
    run_request["dataset"]["inputPreprocessing"][0]["config"] = {"kind": "number", "scaling": "minmax"}
    run = completed(client, run_request)
    options = {"resultIds": ["model-0"], "variants": ["float32", "float16"]}
    preview = client.post(f"/api/training/runs/{run['id']}/export/preview", json=options).json()
    assert all(item["status"] == "ready" for item in preview["variants"]), preview
    archive = zipfile.ZipFile(io.BytesIO(client.post(f"/api/training/runs/{run['id']}/export", json=options).content))
    archive.extractall(tmp_path)
    folder_name = preview["models"][0]["folder"]
    for variant in ("float32", "float16"):
        folder = tmp_path / f"{folder_name}/portable/{variant}"
        metadata = json.loads((folder / "model.json").read_text())
        assert sorted(metadata["classes"]) == sorted(names)
        output = subprocess.run([sys.executable, str(folder / "predict.py"), str(folder / "samples.json")], check=True, capture_output=True, text=True)
        assert set(json.loads(output.stdout)) <= set(names)


def test_float16_overflow_is_reported_without_fake_files(client):
    run_request = numeric_plan("regression", "linear")
    run_request["dataset"]["data"]["outputs"] = [[str(1000000 + i * .5)] for i in range(100)]
    run = completed(client, run_request)
    preview = client.post(f"/api/training/runs/{run['id']}/export/preview", json={"resultIds": ["model-0"], "variants": ["float32", "float16"]}).json()
    by_storage = {item["storage"]: item for item in preview["variants"]}
    assert by_storage["float32"]["status"] == "ready"
    assert by_storage["float16"]["status"] == "failed"
    assert "vượt miền" in by_storage["float16"]["reason"]
    assert not any("portable/float16/" in entry["path"] for entry in preview["files"])


def test_export_names_are_readable_safe_unique_and_stable():
    from app.services.training_export import export_folder_names
    results = [
        {"id": "model-0", "modelName": "Decision Tree", "targetName": "Cột 3", "targetIndex": 0},
        {"id": "model-1", "modelName": "Neural Network / MLP", "targetName": "Trạng thái động cơ", "targetIndex": 0},
        {"id": "model-2", "modelName": "Decision Tree", "targetName": "Cột 3", "targetIndex": 1},
        {"id": "model-3", "modelName": "../Random Forest", "targetName": "../../label\\unsafe", "targetIndex": 0},
    ]
    names = export_folder_names(results)
    assert names["model-1"] == "neural-network-mlp__trang-thai-dong-co"
    assert names["model-0"] == "decision-tree__cot-3__cot-1"
    assert len(set(names.values())) == len(results)
    assert all("/" not in name and "\\" not in name and ".." not in name for name in names.values())
    assert names == export_folder_names(list(reversed(results)))


def test_named_paths_readme_and_raw_filename_match_preview(client, tmp_path):
    request = numeric_plan(model="tree")
    request["jobs"][0]["modelName"] = "Decision Tree"
    request["jobs"][0]["targetName"] = "Trạng thái"
    request["dataset"]["data"]["outputColumns"] = ["Trạng thái"]
    request["dataset"]["labelPreprocessing"][0]["name"] = "Trạng thái"
    run = completed(client, request)
    options = {"resultIds": ["model-0"]}
    preview = client.post(f"/api/training/runs/{run['id']}/export/preview", json=options).json()
    assert preview["models"][0]["folder"] == "decision-tree__trang-thai"
    files = {entry["path"]: entry for entry in preview["files"]}
    assert "decision-tree__trang-thai/predict.py" in files
    assert "decision-tree__trang-thai\\predict.py" in files["README.txt"]["content"]
    assert "decision-tree__trang-thai/" not in files["decision-tree__trang-thai/README.txt"]["content"]
    downloaded = client.post(f"/api/training/runs/{run['id']}/export", json={"resultIds": ["model-0"], "format": "joblib"})
    assert 'filename="decision-tree__trang-thai.joblib"' in downloaded.headers["content-disposition"]

@pytest.mark.parametrize("include_extras", [False, True])
def test_root_readme_starts_with_paths_and_purposes(client, include_extras):
    run = completed(client, numeric_plan(model="tree"))
    options = {"resultIds": ["model-0"], "includeData": include_extras, "variants": ["float32", "float16"] if include_extras else [], "includeFirmware": include_extras}
    archive = zipfile.ZipFile(io.BytesIO(client.post(f"/api/training/runs/{run['id']}/export", json=options).content))
    readme = archive.read("README.txt").decode("utf-8")
    intro, content = readme.split("\n\n", 1)
    inventory, instructions = content.split("\n\n", 1)
    assert intro.startswith("BẮT ĐẦU TỪ ĐÂU?")
    assert inventory.startswith(f"CẤU TRÚC GÓI ZIP — ĐƯỜNG DẪN VÀ CÔNG DỤNG ({len(archive.namelist())} FILE)")
    assert "tree__label/" in inventory
    assert "expected-output.json" in inventory
    assert "predict.py — Chương trình dự đoán" in inventory
    assert "model.joblib — Model đã train" in inventory
    assert instructions.startswith("HƯỚNG DẪN CÀI ĐẶT VÀ CHẠY MODEL")
    assert ("processed-data.csv" in inventory) == include_extras
    assert ("firmware/" in inventory) == include_extras
    preview = client.post(f"/api/training/runs/{run['id']}/export/preview", json=options).json()
    assert next(file["content"] for file in preview["files"] if file["path"] == "README.txt") == readme


def test_root_guide_explains_one_model_and_abbreviates_other_folders():
    from app.services.training_export import package_guide
    files = {name: b"" for name in ["README.txt", "requirements.txt", "decision-tree__label/model.joblib", "decision-tree__label/predict.py", "random-forest__label/model.joblib", "random-forest__label/predict.py"]}
    guide = package_guide(files)
    assert "\n" in guide
    assert "\\n" not in guide
    assert "decision-tree__label/" in guide
    assert "model.joblib — Model đã train" in guide
    assert "random-forest__label/model.joblib" not in guide
    assert ".../ — 1 thư mục model khác" in guide
    assert "requirements.txt — Thư viện và phiên bản" in guide


def test_readme_has_one_quickstart_example_and_real_expected_output(client):
    run = completed(client, plan(models=["tree", "forest"]))
    options = {"resultIds": ["model-0", "model-1"]}
    response = client.post(f"/api/training/runs/{run['id']}/export", json=options)
    assert response.status_code == 200, response.text
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    readme = archive.read("README.txt").decode("utf-8")
    assert readme.startswith("BẮT ĐẦU TỪ ĐÂU?")
    assert 'forest__label\\samples.json"' in readme
    assert 'tree__label\\samples.json"' not in readme
    expected = json.loads(archive.read("forest__label/expected-output.json"))
    assert json.dumps(expected, ensure_ascii=False) in readme
    assert "Mỗi phần tử là dự đoán cho một dòng input" in readme
    assert "Bước 1 — Chuẩn bị Python" in readme
    assert "Bước 2 — Giải nén" in readme
    assert "file input vẫn phải đúng" in readme
    assert ".../ — 1 thư mục model khác" in readme


def test_preview_budget_keeps_small_requirements_and_shares_large_sources(monkeypatch):
    from app.services import training_export
    files = {f"aaa/model-{index}.cpp": b"x" * 100000 for index in range(12)}
    files.update({"requirements.txt": b"numpy==2.5.4\nscikit-learn==1.9.1\n", "README.txt": b"Install requirements.txt before running predict.py.\n", "model.joblib": b"binary" * 100000})
    monkeypatch.setattr(training_export, "build_export", lambda *_: (files, [], [], {}, "test.zip", "application/zip"))
    result = training_export.preview_export("test", None)
    manifest = {entry["path"]: entry for entry in result["files"]}
    assert manifest["requirements.txt"]["content"] == files["requirements.txt"].decode()
    assert manifest["requirements.txt"]["truncated"] is False
    assert manifest["README.txt"]["content"] == files["README.txt"].decode()
    text = [entry for entry in result["files"] if entry["kind"] == "text"]
    assert all(entry["content"] for entry in text)
    assert sum(len(entry["content"].encode()) for entry in text) <= 512 * 1024
    assert all(len(entry["content"].encode()) <= 65536 for entry in text)
    assert manifest["model.joblib"]["content"] is None
    for entry in result["files"]:
        assert entry["sha256"] == hashlib.sha256(files[entry["path"]]).hexdigest()
        assert entry["bytes"] == len(files[entry["path"]])


def test_preview_prioritizes_readme_config_and_code_over_bulk_data(monkeypatch):
    from app.services import training_export
    files = {f"model/samples-{i}.csv": b"d" * 100000 for i in range(12)}
    files.update({"README.txt": b"r" * 20000, "requirements.txt": b"numpy==2.5.4\n", "model/metadata.json": b"c" * 50000, "model/predict.py": b"p" * 50000, "model/model.joblib": b"binary"})
    monkeypatch.setattr(training_export, "build_export", lambda *_: (files, [], [], {}, "test.zip", "application/zip"))
    manifest = training_export.preview_export("test", None)["files"]
    by_path = {entry["path"]: entry for entry in manifest}
    assert [entry["path"] for entry in manifest[:4]] == ["README.txt", "requirements.txt", "model/metadata.json", "model/predict.py"]
    assert by_path["README.txt"]["content"] == files["README.txt"].decode()
    assert by_path["requirements.txt"]["truncated"] is False
    assert len(by_path["model/predict.py"]["content"]) > len(by_path["model/samples-0.csv"]["content"])
    assert manifest[-1]["kind"] == "binary"
    assert sum(len(entry["content"].encode()) for entry in manifest if entry["content"]) <= 512 * 1024
