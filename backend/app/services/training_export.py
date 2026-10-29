import csv
import hashlib
import io
import json
import platform
import re
import unicodedata
from collections import Counter
import zipfile
from importlib.metadata import version, PackageNotFoundError
from pathlib import Path

from app.schemas.training import ExportRequest, TrainingRequest
from app.services.training_runs import get_run, run_directory
from app.services.export_templates import PREDICT_SCRIPT, PORTABLE_PREDICT


def export_slug(value, fallback):
    normalized = unicodedata.normalize("NFKD", str(value).replace("đ", "d").replace("Đ", "D"))
    ascii_name = normalized.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")[:48].rstrip("-") or fallback


def export_folder_names(results):
    # Resolve against the entire run so choosing fewer models cannot rename a folder.
    bases = {result["id"]: f'{export_slug(result["modelName"], "model")}__{export_slug(result["targetName"], "cot-" + str(result["targetIndex"] + 1))}' for result in results}
    counts = Counter(bases.values())
    names, used = {}, set()
    for result in sorted(results, key=lambda item: item["id"]):
        base = bases[result["id"]]
        name = base if counts[base] == 1 else f'{base}__cot-{result["targetIndex"] + 1}'
        if name in used:
            name += "-" + hashlib.sha256(result["id"].encode()).hexdigest()[:8]
        while name in used:
            name += "-duplicate"
        names[result["id"]] = name
        used.add(name)
    return names


def encoded(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")


def requirements_for(result):
    packages = ["scikit-learn", "numpy", "scipy", "pandas", "joblib"]
    if result["modelId"] in {"xgboost", "lightgbm", "catboost"}: packages.append(result["modelId"])
    pins = {}
    for package in packages:
        installed = result.get("versions", {}).get(package)
        if not installed:
            try: installed = version(package)
            except PackageNotFoundError as error: raise ValueError(f"Không xác định được phiên bản {package} để tạo requirements.") from error
        pins[package] = installed
    return pins


def package_guide(files):
    def leaf(path, name, purpose):
        return (name, purpose, None) if path in files else None
    def present(nodes): return [node for node in nodes if node is not None]
    folders = sorted({path.split("/")[0] for path in files if "/" in path})
    roots = present([leaf(name, name, purpose) for name, purpose in [
        ("README.txt", "Hướng dẫn chung; bắt đầu đọc tại đây."),
        ("requirements.txt", "Thư viện và phiên bản để cài cho cả gói."),
        ("run-summary.json", "Kết quả train của các model đã chọn."),
        ("training-plan.json", "Thông số và cách chia dữ liệu khi train."),
        ("conversion-report.json", "Kích thước và kết quả Test sau chuyển đổi."),
        ("processed-data.csv", "CSV đã chốt khi RUN, nếu đã chọn kèm dữ liệu."),
    ]])
    if folders:
        folder = next((name for name in folders if any(path.startswith(name + "/portable/") for path in files)), folders[0])
        children = present([leaf(f"{folder}/{name}", name, purpose) for name, purpose in [
            ("README.txt", "Cách cài và chạy riêng model này."),
            ("model.joblib", "Model đã train, kèm tiền xử lý đã học."),
            ("metadata.json", "Tên model, label, thứ tự input và phiên bản."),
            ("predict.py", "Chương trình dự đoán; nhận JSON hoặc CSV."),
            ("requirements.txt", "Thư viện và phiên bản cho model này."),
            ("samples.json", "Input mẫu dạng JSON để chạy thử."),
            ("samples.csv", "Cùng input mẫu ở dạng CSV có tên cột."),
            ("expected-output.json", "Kết quả dự đoán của samples.json để đối chiếu."),
        ]])
        variants = [name for name in ("float32", "float16") if f"{folder}/portable/{name}/model.bin" in files]
        if variants:
            base = f"{folder}/portable/{variants[0]}"
            variant_files = present([leaf(f"{base}/{name}", name, purpose) for name, purpose in [
                ("README.txt", "Cách chạy biến thể trên Python/C++."),
                ("model.bin", "Tham số nhị phân; dùng cùng model.json."),
                ("model.json", "Cấu trúc và kiểu lưu tham số của biến thể."),
                ("model.h", "Khai báo hàm dự đoán C++."),
                ("model.cpp", "Code C++ đã nhúng tham số và tiền xử lý."),
                ("host_test.cpp", "Chương trình thử C++ trên máy tính."),
                ("portable_runtime.py", "Bộ đọc model.bin/model.json bằng NumPy."),
                ("predict.py", "Chương trình chạy thử biến thể bằng Python."),
                ("requirements.txt", "Phiên bản NumPy cần cài."),
                ("samples.json", "Input mẫu để chạy thử."),
                ("expected-output.json", "Kết quả mẫu của đúng biến thể này."),
            ]])
            if f"{base}/firmware/README.txt" in files:
                variant_files.append(("firmware/", "Dự án nguồn cho ESP32; đọc README bên trong trước.", [
                    ("README.txt", "Cài ESP-IDF, build và nạp lên board.", None),
                    ("main/", "", [("main.cpp", "Nhận input UART và gọi hàm dự đoán.", None)]),
                    ("...", "Các file cấu hình build đi kèm.", None),
                ]))
            variant_nodes = [(variants[0] + "/", "Biến thể minh họa.", variant_files)]
            if len(variants) > 1: variant_nodes.append((variants[1] + "/", "", [("...", "Cấu trúc tương tự, tham số và kết quả riêng.", None)]))
            children.append(("portable/", "Các biến thể C++ native đã tạo thành công.", variant_nodes))
        roots.append((folder + "/", "Minh họa một thư mục: tên model + tên label.", children))
        if len(folders) > 1: roots.append((".../", f"{len(folders)-1} thư mục model khác, cấu trúc tương tự.", None))
    lines = [f"CẤU TRÚC GÓI ZIP — ĐƯỜNG DẪN VÀ CÔNG DỤNG ({len(files)} FILE)", "Chỉ minh họa một thư mục model; không cần đọc hết các file để chạy thử."]
    def render(nodes, prefix=""):
        for i, (name, purpose, children) in enumerate(nodes):
            last = i == len(nodes)-1
            lines.append(prefix + ("`-- " if last else "|-- ") + name + (" — " + purpose if purpose else ""))
            if children: render(children, prefix + ("    " if last else "|   "))
    render(roots)
    lines.append("Biến thể/firmware chỉ có khi được chọn và tạo thành công; xem cây file trên web để biết đầy đủ.")
    return "\n".join(lines)


def example_prediction(artifact, folder):
    import pandas as pd
    rows = artifact["sample_inputs"]
    frame = pd.DataFrame(rows, columns=[f"x{i}" for i in range(len(artifact["input_columns"]))])
    for i, spec in enumerate(artifact["input_schema"]):
        frame[f"x{i}"] = pd.to_numeric(frame[f"x{i}"], errors="raise") if spec["config"]["kind"] == "number" else frame[f"x{i}"].astype(str)
    prediction = artifact["pipeline"].predict(frame)
    if artifact["label_encoder"] is not None: prediction = artifact["label_encoder"].inverse_transform(prediction.astype(int))
    return {"folder": folder, "modelName": artifact["result"].get("modelName", folder), "targetName": artifact["target_name"], "inputColumns": artifact["input_columns"], "predictions": prediction.tolist(), "sampleRow": rows[0]}


def label_mapping_guide(task, local=False):
    if task != "classification":
        return "ÁNH XẠ LABEL (RAW MAP)\nBài toán hồi quy giữ nguyên giá trị label số, không đổi thành mã lớp; label_encoder là None và classes là danh sách rỗng.\n"
    prefix = "" if local else "<thu-muc-model>/"
    return f'''ÁNH XẠ LABEL GỐC ↔ MÃ SỐ (RAW MAP)
- Xem bảng ở {prefix}metadata.json, trường "classes". Vị trí trong danh sách là mã lớp, bắt đầu từ 0.
- Ví dụ minh họa: "classes": ["Bình thường", "Có lỗi"] nghĩa là 0 → Bình thường, 1 → Có lỗi. Phải đọc classes của model bạn dùng; không mặc định 0 luôn là Bình thường hoặc 1 luôn là lớp cần phát hiện.
- Bộ mã hóa thực tế nằm trong {prefix}model.joblib, khóa "label_encoder"; label_encoder.classes_ lưu đúng thứ tự các nhãn gốc. Không có file raw_map.json hay label_mapping.json riêng.
- predict.py đi kèm tự đổi mã dự đoán về label gốc bằng inverse_transform(). Nếu dùng predict.py, không giải mã lần nữa.
- Nếu tự gọi bundle["pipeline"].predict(input), kết quả phân loại là mã lớp: dùng bundle["label_encoder"].inverse_transform(prediction.astype(int)) để lấy label gốc.
- Giữ nguyên model.joblib và metadata.json của cùng model, label và lượt train. Không tự sắp xếp classes, tự gán lại mã hoặc fit lại LabelEncoder khi sử dụng model. Label gốc viết bằng số cũng được coi là tên lớp.
- Bản C++ nếu có: portable/<bien-the>/model.json lưu classes; model.cpp nhúng danh sách labels. Dùng model_class_index(output) rồi model_class_label(index) để lấy nhãn; output số/xác suất không phải lúc nào cũng là mã lớp.
'''


def bundle_readme(run, ids, pins, with_code, include_data, example=None, local=False):
    python = platform.python_version()
    minor = '.'.join(python.split('.')[:2])
    folder = example["folder"] if example else ids[0]
    windows_prefix = "" if local else folder + "\\"
    posix_prefix = "" if local else folder + "/"
    expected = json.dumps(example["predictions"], ensure_ascii=False, allow_nan=False) if example else "Xem expected-output.json trong thư mục model."
    columns = example["inputColumns"] if example else run["inputColumns"]
    sample = json.dumps([example["sampleRow"]], ensure_ascii=False) if example else "[[input1, input2, ...]]"
    model_name = example["modelName"] if example else folder
    location = "thư mục chứa README của model này" if local else "thư mục chứa README tổng này"
    mapping_guide = label_mapping_guide(run["task"], local)
    intro = "BẮT ĐẦU TỪ ĐÂU?\n- Muốn chạy thử trên máy tính: làm theo mục 1 bên dưới.\n- Muốn chạy trên ESP32: xem mục 3 và README trong firmware/.\n- Chỉ cần thử một model; không bắt buộc chạy toàn bộ model trong gói.\n\n"
    if not with_code:
        return "BẮT ĐẦU TỪ ĐÂU?\n- Gói này chỉ chứa model Joblib, không có chương trình chạy mẫu.\n- Muốn có lệnh chạy sẵn, chọn Gói Python + code mẫu trên web.\n\n" + f'''HƯỚNG DẪN DÙNG GÓI JOBLIB
Gói này không có predict.py. Muốn có chương trình chạy thử, hãy chọn “Gói Python + code mẫu” trên web.
Model và label nằm trong metadata.json của từng thư mục.
Python tạo gói: {python}; khuyến nghị Python {minor}.
Cài thư viện bằng python -m pip install -r requirements.txt trước khi tích hợp Python.
Chỉ nạp Joblib từ nguồn tin cậy. Tham khảo README của gói có code để biết cách chuẩn bị input.

{mapping_guide}

PHIÊN BẢN THƯ VIỆN
''' + '\n'.join(f'{key}=={value}' for key,value in sorted(pins.items()))
    instructions = f'''HƯỚNG DẪN CÀI ĐẶT VÀ CHẠY MODEL

1. CHẠY THỬ NHANH TRÊN MÁY TÍNH
Model minh họa: {model_name}; label dự đoán: {example['targetName'] if example else run['outputColumns'][0]}.
Chỉ chạy một ví dụ trước. Các model khác có README riêng trong thư mục tương ứng.

Bước 1 — Chuẩn bị Python
Máy cần Python {minor}. Nếu chưa có, cài từ https://www.python.org/downloads/ hoặc công cụ quản lý Python bạn dùng.
Gói này được tạo trên Python {python}. Không cần cài lại nếu máy đã có Python {minor} phù hợp.

Bước 2 — Giải nén và mở terminal đúng chỗ
Giải nén ZIP. Mở terminal tại {location}.
Windows: mở thư mục đó trong File Explorer, gõ cmd vào thanh địa chỉ rồi Enter.
Linux/macOS: mở Terminal và cd vào thư mục đó. Đường dẫn có dấu cách cần đặt trong dấu nháy kép.

Bước 3 — Cài thư viện (chỉ cần một lần cho môi trường này)
Windows:
  py -{minor} --version
  py -{minor} -m venv .venv
  .venv\\Scripts\\python.exe -m pip install -r requirements.txt
Linux/macOS:
  python{minor} --version
  python{minor} -m venv .venv
  .venv/bin/python -m pip install -r requirements.txt
Các lệnh dùng trực tiếp Python trong .venv nên không cần kích hoạt môi trường.

Bước 4 — Chạy dữ liệu mẫu
Windows:
  .venv\\Scripts\\python.exe "{windows_prefix}predict.py" "{windows_prefix}samples.json"
Linux/macOS:
  .venv/bin/python "{posix_prefix}predict.py" "{posix_prefix}samples.json"

Kết quả dự kiến với samples.json đi kèm:
  {expected}
Mỗi phần tử là dự đoán cho một dòng input, theo đúng thứ tự các dòng. Đây là đầu ra của model, không phải cam kết đáp án luôn đúng.
Bạn có thể đối chiếu với expected-output.json trong cùng thư mục model. Số thập phân có thể khác nhẹ do môi trường tính toán.
Muốn dùng model khác: xem README trong thư mục model đó; không cần chạy tất cả lệnh hay mở các file JSON kỹ thuật.

2. DỰ ĐOÁN VỚI DỮ LIỆU CỦA BẠN
Các input theo thứ tự: {', '.join(columns)}
Không đưa cột đáp án/label vào input dự đoán. Giữ cùng đơn vị và cách biểu diễn như lúc chuẩn bị dữ liệu train.
Tạo file du-lieu-moi.json trong thư mục terminal đang mở. Ví dụ cấu trúc một dòng input lấy từ mẫu của gói:
  {sample}
Thay các giá trị bằng số đo/dữ liệu mới của bạn, giữ đúng số cột và thứ tự.
Windows:
  .venv\\Scripts\\python.exe "{windows_prefix}predict.py" "du-lieu-moi.json"
Linux/macOS:
  .venv/bin/python "{posix_prefix}predict.py" "du-lieu-moi.json"
Nếu dùng CSV, các header phải gồm đủ tên input; xem samples.csv nếu có. Thay đường dẫn JSON bằng đường dẫn CSV trong lệnh trên.
Code tìm model theo vị trí predict.py; đường dẫn file input vẫn phải đúng với thư mục terminal hoặc dùng đường dẫn tuyệt đối.
Không encoding/chuẩn hóa thêm khi gọi pipeline. Nếu bạn tự chuẩn hóa CSV trước khi upload, dữ liệu mới phải theo đúng quy ước đó.

{mapping_guide}

3. C++ VÀ ESP32 — CHỈ ĐỌC NẾU BẠN CẦN
Trong thư mục model tương thích, mở portable/float32/README.txt hoặc portable/float16/README.txt để chạy biến thể trên Python/C++.
Để dùng ESP32, đọc portable/<biến-thể>/firmware/README.txt; bắt đầu ở README, không nạp trực tiếp model.bin lên board.
Nếu không thấy các thư mục này: biến thể/firmware chưa được chọn hoặc không tạo được. Xem conversion-report.json nếu có.
Float32 lưu tham số 32-bit. Float16 lưu tham số 16-bit, nhưng giải mã và tính toán bằng Float32.
Đây là định dạng C++ native của ứng dụng, không phải ONNX/TFLite; không khẳng định tăng tốc trên ESP32.
Firmware nguồn dùng ESP-IDF v5.4.2, nhận dữ liệu số qua UART. Chưa tự đọc cảm biến, chưa build/nạp/đo trên board thật.
Kết quả biến thể được đo trên Test bằng runtime máy tính; xem conversion-report.json để đối chiếu với model gốc.

4. PHIÊN BẢN VÀ THÔNG TIN BỔ SUNG
Python môi trường tạo gói: {python}; khuyến nghị nhánh {minor}.
Phiên bản Python lúc train chưa được ghi lại. Thư viện lấy từ model đã lưu; nếu lượt cũ thiếu thông tin thì dùng môi trường export.
Các thư viện cũng được ghi trong requirements.txt để cài bằng một lệnh:
''' + '\n'.join(f'{name}=={v}' for name,v in sorted(pins.items())) + f'''

{'Có processed-data.csv: đúng bản đã chốt khi RUN, không phải chỉnh sửa về sau.' if include_data else 'Không kèm toàn bộ CSV. samples.json chỉ là vài input dùng để chạy thử.'}
Một số model, như KNN, lưu dữ liệu suy ra từ train bên trong model; bỏ CSV không loại phần đó.
Export không train lại. Chỉ nạp Joblib từ nguồn bạn tin cậy vì file có thể thực thi mã Python khi nạp.
'''
    return instructions if local else intro + instructions


def portable_readme(meta, report):
    mapping_note = ('ÁNH XẠ LABEL (RAW MAP)\nTrong thư mục này, model.json lưu classes theo thứ tự mã 0, 1, ...; model.cpp nhúng cùng danh sách labels.\nDùng model_class_index(output) rồi model_class_label(index); không coi xác suất là mã lớp và không tự đổi thứ tự nhãn. predict.py đã trả label gốc, không giải mã lần nữa.\nBộ LabelEncoder của model Python gốc nằm ở model.joblib trong thư mục model phía trên (../../model.joblib); xem thêm ../../metadata.json và ../../README.txt. Chỉ dùng các file của cùng model và lượt train.\n'
                    if meta["task"] == "classification" else 'ÁNH XẠ LABEL (RAW MAP)\nĐây là hồi quy: output là giá trị số dự đoán, không cần giải mã label hay ánh xạ lớp.\n')
    return f'''MODEL C++ NATIVE — {meta['storage'].upper()}
Model: {meta['modelName']} / Label: {meta['targetName']}
Định dạng tham số: {meta['storage']}; tính toán: Float32.
Python môi trường tạo gói: {meta['pythonVersion']}.

THƯ VIỆN PYTHON
Cài phiên bản NumPy trong requirements.txt tại thư mục này.
  python -m pip install -r requirements.txt
  python predict.py samples.json

C++ HOST (cần compiler C++17)
  g++ -std=c++17 -O2 model.cpp host_test.cpp -o model_test
  model_test input1 input2 ...
Windows dùng model_test.exe. Truyền số đúng thứ tự: {', '.join(meta['inputColumns'])}
Chương trình host in output số để đối chiếu. model_class_index/model_class_label phục hồi tên lớp.

model.bin và model.json dùng cho runtime NumPy. model.cpp đã nhúng cùng tham số, không cần đọc file khi chạy C++.
model_predict nhận số đo gốc và tự áp dụng tiền xử lý đã lưu. Không chuẩn hóa lại input.
Nếu trước khi upload bạn đã tự chuẩn hóa CSV, giá trị mới phải theo đúng quy ước đó.

{mapping_note}

KẾT QUẢ CHUYỂN ĐỔI
Test samples: {report['testSamples']}
Metrics: {json.dumps(report['metrics'], ensure_ascii=False)}
Độ lệch output tuyệt đối trung bình so với model gốc: {report['meanAbsoluteOutputDifference']}
Kết quả này chạy bằng NumPy trên máy tính, không phải chứng nhận chạy được trên board.
Workspace mảng mô hình ước tính {meta['workspaceBytesEstimate']} bytes, chưa gồm runtime/stack/heap toàn ứng dụng.
Firmware nguồn nếu có nằm ở firmware/README.txt. Build/nạp và kiểm tra bộ nhớ trên phần cứng thật trước khi sử dụng.
'''


def build_export(run_id, options):
    import joblib
    from app.services.portable_export import convert, evaluate, supported_reason
    from app.services.firmware_export import cpp_files, firmware_files
    run = get_run(run_id)
    if run["status"] in {"queued", "running", "cancelling"}: raise ValueError("Chờ lượt train kết thúc trước khi export.")
    successful = {result["id"]: result for result in run["results"] if result["status"] == "succeeded"}
    ids = list(dict.fromkeys(options.result_ids))
    folders = export_folder_names(run["results"])
    if any(result_id not in successful for result_id in ids): raise ValueError("Chỉ được export model đã huấn luyện thành công trong lượt này.")
    if options.format != "python_zip" and (options.variants or options.include_firmware): raise ValueError("Biến thể và firmware cần chọn Gói Python + code mẫu.")
    if options.include_firmware and not options.variants: raise ValueError("Chọn ít nhất một biến thể Float32 hoặc Float16 để sinh firmware nguồn.")
    directory = run_directory(run_id)
    plan = json.loads((directory / "plan.json").read_text(encoding="utf-8"))
    files, variants, models, pins = {}, [], [], {}
    examples = {}
    python = platform.python_version()
    if options.format == "joblib" and len(ids) == 1 and not options.include_data:
        content = (directory / f"{ids[0]}.joblib").read_bytes()
        filename = f"{folders[ids[0]]}.joblib"
        return {filename: content}, [], [], {}, filename, "application/octet-stream"
    validation_indices = None
    request = None
    for result_id in ids:
        result = successful[result_id]
        artifact = joblib.load(directory / f"{result_id}.joblib")
        requirements = requirements_for(result)
        for key, value in requirements.items():
            if key in pins and pins[key] != value: raise ValueError(f"Các model cần hai phiên bản {key} khác nhau; hãy export riêng.")
            pins[key] = value
        reason = supported_reason(artifact, result)
        models.append({"id": result_id, "folder": folders[result_id], "modelName": result["modelName"], "targetName": result["targetName"], "portableSupported": reason is None, "portableReason": reason})
        folder_name = folders[result_id]
        prefix = folder_name + "/"
        files[prefix + "model.joblib"] = (directory / f"{result_id}.joblib").read_bytes()
        metadata = {"runId": run_id, "exportFolder": folder_name, "modelName": result["modelName"], "targetName": result["targetName"], "task": run["task"], "inputColumns": run["inputColumns"], "inputSchema": artifact["input_schema"], "classes": result.get("classes", []), "parameters": result["parameters"], "metrics": result["metrics"], "versions": requirements, "pythonVersion": python, "pythonVersionSource": "export_environment", "trainingPythonVersion": result.get("pythonVersion"), "note": "Pipeline includes fitted preprocessing. Input order matches inputColumns. Classification labels are restored by predict.py."}
        files[prefix + "metadata.json"] = encoded(metadata)
        files[prefix + "requirements.txt"] = ('\n'.join(f'{name}=={v}' for name,v in sorted(requirements.items()))+'\n').encode()
        if options.format == "python_zip":
            example = example_prediction(artifact, folder_name)
            example["modelName"] = result["modelName"]
            examples[folder_name] = example
            files[prefix + "expected-output.json"] = encoded(example["predictions"])
            files[prefix + "predict.py"] = PREDICT_SCRIPT.encode()
            files[prefix + "samples.json"] = encoded(artifact["sample_inputs"])
            if len(set(run["inputColumns"])) == len(run["inputColumns"]):
                text = io.StringIO(newline=""); writer = csv.writer(text); writer.writerow(run["inputColumns"]); writer.writerows(artifact["sample_inputs"])
                files[prefix + "samples.csv"] = text.getvalue().encode("utf-8-sig")
            files[prefix + "README.txt"] = bundle_readme(run, [folder_name], requirements, True, False, example=example, local=True).encode()
        for storage in dict.fromkeys(options.variants):
            report = {"resultId": result_id, "exportFolder": folder_name, "modelName": result["modelName"], "targetName": result["targetName"], "storage": storage, "compute": "float32", "status": "unavailable", "reason": reason, "originalTestMetrics": result["metrics"].get("test", {})}
            if not reason:
                try:
                    meta, data = convert(artifact, result, storage)
                    if request is None:
                        from app.services.training_preprocessing import split_indices
                        request = TrainingRequest.model_validate(plan)
                        validation_indices = split_indices(request)[2]
                    rows = [request.dataset.data.inputs[int(index)] for index in validation_indices]
                    labels = [request.dataset.data.outputs[int(index)][result["targetIndex"]] for index in validation_indices]
                    assessment = evaluate(artifact, meta, data, rows, labels)
                    folder = prefix + f"portable/{storage}/"
                    contents = {"model.bin": data, "model.json": encoded(meta), "portable_runtime.py": Path(__file__).with_name("portable_runtime.py").read_text(encoding="utf-8-sig").encode(), "predict.py": PORTABLE_PREDICT, "samples.json": encoded(artifact["sample_inputs"]), "requirements.txt": f'numpy=={requirements["numpy"]}\n', "README.txt": portable_readme(meta, assessment), **cpp_files(meta, data)}
                    from app.services.portable_runtime import predict_outputs, decode_outputs
                    contents["expected-output.json"] = encoded(decode_outputs(meta, predict_outputs(meta, data, artifact["sample_inputs"])))
                    if options.include_firmware: contents.update(firmware_files(meta, options.firmware))
                    for name, value in contents.items(): files[folder + name] = value if isinstance(value, bytes) else value.encode("utf-8")
                    report.update(status="ready", reason=None, parameterBytes=len(data), totalSourceBytes=sum(len(files[folder+name]) for name in contents), workspaceBytesEstimate=meta["workspaceBytesEstimate"], firmwareIncluded=options.include_firmware, **assessment)
                except (ValueError, TypeError, OverflowError, AttributeError) as error:
                    report.update(status="failed", reason=str(error))
            variants.append(report)
    files["requirements.txt"] = ('\n'.join(f'{name}=={v}' for name,v in sorted(pins.items()))+'\n').encode()
    representative = next((key for key in sorted(examples) if any(path.startswith(key + "/portable/") for path in files)), next(iter(sorted(examples)), None))
    files["README.txt"] = bundle_readme(run, [folders[key] for key in ids], pins, options.format == "python_zip", options.include_data, example=examples.get(representative)).encode()
    files["run-summary.json"] = encoded({**run, "results": [{**successful[key], "exportFolder": folders[key]} for key in ids]})
    # Do not leak full snapshot/CSV in the configuration when includeData is off.
    files["training-plan.json"] = encoded({key: value for key,value in plan.items() if key != "dataset"})
    if variants: files["conversion-report.json"] = encoded(variants)
    if options.include_data: files["processed-data.csv"] = plan["dataset"].get("csv", "").encode("utf-8")
    inventory = package_guide(files)
    intro, body = files["README.txt"].decode("utf-8").split("\n\n", 1)
    files["README.txt"] = (intro + "\n\n" + inventory + "\n\n" + body).encode("utf-8")
    return files, variants, models, pins, f"training-{run_id[:8]}.zip", "application/zip"


def preview_priority(name):
    base = name.rsplit("/", 1)[-1].lower()
    if base.startswith("readme"):
        return 0
    if base.startswith("requirements"):
        return 1
    if base in ("metadata.json", "model.json", "training-plan.json", "cmakelists.txt") or base.startswith("sdkconfig") or base.endswith((".ini", ".toml", ".yaml", ".yml", ".cmake")):
        return 2
    if base.endswith((".py", ".c", ".cpp", ".h", ".hpp")):
        return 3
    if base in ("samples.json", "samples.csv", "expected-output.json", "processed-data.csv"):
        return 5
    if base.endswith((".joblib", ".bin")):
        return 6
    return 4


def preview_export(run_id, options):
    files, variants, models, pins, filename, media_type = build_export(run_id, options)
    budget = 512 * 1024
    # Reserve the main setup instructions, then favor docs/config/source over data.
    # Weighted shares still leave a preview for later files in large bundles.
    text_files = sorted(
        ((name, data) for name, data in files.items() if not name.endswith((".joblib", ".bin"))),
        key=lambda item: (preview_priority(item[0]), item[0].count("/"), len(item[1]), item[0]),
    )
    previews = {}
    weights = {0: 8, 1: 8, 2: 4, 3: 4, 4: 1, 5: 1}
    remaining_weight = sum(weights[preview_priority(name)] for name, _ in text_files)
    for name, data in text_files:
        weight = weights[preview_priority(name)]
        allowance = budget if name in ("README.txt", "requirements.txt") else budget * weight // remaining_weight
        allowed = min(len(data), 65536, allowance)
        previews[name] = (data[:allowed].decode("utf-8", errors="ignore"), len(data) > allowed)
        budget -= allowed
        remaining_weight -= weight
    manifest = []
    for name, data in sorted(files.items(), key=lambda item: (preview_priority(item[0]), item[0])):
        binary = name.endswith((".joblib", ".bin"))
        preview = None
        truncated = False
        if not binary:
            preview, truncated = previews[name]
        manifest.append({"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "kind": "binary" if binary else "text", "content": preview, "truncated": truncated})
    return {"fileName": filename, "mediaType": media_type, "files": manifest, "variants": variants, "models": models, "requirements": pins, "pythonVersion": platform.python_version(), "pythonVersionSource": "export_environment", "totalBytes": sum(len(data) for data in files.values()), "warnings": [f'{item["modelName"]} / {item["storage"]}: {item["reason"]}' for item in variants if item["status"] != "ready"]}


def export_run(run_id, options: ExportRequest):
    files, _, _, _, filename, media_type = build_export(run_id, options)
    if media_type == "application/octet-stream": return next(iter(files.values())), filename, media_type
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name,data in files.items():
            entry = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0)); entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry,data)
    return output.getvalue(), filename, media_type
