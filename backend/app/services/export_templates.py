PREDICT_SCRIPT = r'''"""python predict.py samples.json OR python predict.py samples.csv"""
import argparse
import csv
import io
import json
import sys
from pathlib import Path
import joblib
import numpy as np
import pandas as pd


def read_rows(path, columns):
    if path.suffix.lower() == ".csv":
        if len(set(columns)) != len(columns):
            raise ValueError("Duplicate input column names: use JSON rows instead of CSV.")
        text = path.read_text(encoding="utf-8-sig")
        try:
            dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t")
        except csv.Error:
            # A valid single-column CSV has no separator to detect.
            # Standard CSV parsing still preserves quoted commas/newlines.
            dialect = csv.excel
        reader = csv.DictReader(io.StringIO(text), dialect=dialect)
        if not set(columns).issubset(reader.fieldnames or []):
            raise ValueError("CSV headers must include every inputColumns name in metadata.json")
        return [[row[name] for name in columns] for row in reader]
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main():
    parser = argparse.ArgumentParser(description="Predict with the saved pipeline; no retraining.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, help="Optional JSON output file")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")
    base = Path(__file__).resolve().parent
    # Joblib contains Python objects: only load a package you trust.
    bundle = joblib.load(base / "model.joblib")
    rows = read_rows(args.input, bundle["input_columns"])
    if not isinstance(rows, list) or not rows or any(not isinstance(row, list) or len(row) != len(bundle["input_columns"]) for row in rows):
        raise ValueError("Input rows must match inputColumns order in metadata.json")
    frame = pd.DataFrame(rows, columns=[f"x{i}" for i in range(len(bundle["input_columns"]))])
    for index, spec in enumerate(bundle["input_schema"]):
        if spec["config"]["kind"] == "number":
            frame[f"x{index}"] = pd.to_numeric(frame[f"x{index}"], errors="raise")
            if not np.isfinite(frame[f"x{index}"].to_numpy(dtype=float)).all(): raise ValueError("Numeric input must be finite.")
        else:
            frame[f"x{index}"] = frame[f"x{index}"].astype(str)
    prediction = bundle["pipeline"].predict(frame)
    if bundle["label_encoder"] is not None:
        prediction = bundle["label_encoder"].inverse_transform(prediction.astype(int))
    text = json.dumps(prediction.tolist(), ensure_ascii=False, allow_nan=False)
    if args.output: args.output.write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__": main()
'''

PORTABLE_PREDICT = r'''"""python predict.py samples.json"""
import argparse
import json
import sys
from pathlib import Path
from portable_runtime import predict_outputs, decode_outputs


def main():
    parser = argparse.ArgumentParser(description="Predict using the portable numeric model.")
    parser.add_argument("input", type=Path)
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")
    base = Path(__file__).resolve().parent
    metadata = json.loads((base / "model.json").read_text(encoding="utf-8"))
    data = (base / "model.bin").read_bytes()
    rows = json.loads(args.input.read_text(encoding="utf-8-sig"))
    print(json.dumps(decode_outputs(metadata, predict_outputs(metadata, data, rows)), ensure_ascii=False, allow_nan=False))


if __name__ == "__main__": main()
'''
