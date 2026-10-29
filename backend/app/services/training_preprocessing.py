import math
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, MinMaxScaler, OneHotEncoder, OrdinalEncoder
from sklearn.model_selection import train_test_split


def input_frame(snapshot):
    columns = [f"x{index}" for index in range(len(snapshot.data.input_columns))]
    frame = pd.DataFrame(snapshot.data.inputs, columns=columns)
    for index, spec in enumerate(snapshot.input_preprocessing):
        if spec.config.kind == "number":
            frame[columns[index]] = pd.to_numeric(frame[columns[index]], errors="raise")
            if not np.isfinite(frame[columns[index]].to_numpy(dtype=float)).all():
                raise ValueError(f"Cột {spec.name} có số không hữu hạn.")
        elif spec.config.encoding == "ordinal":
            order = spec.config.category_order
            if not order or len(set(order)) != len(order) or not set(frame[columns[index]]).issubset(order):
                raise ValueError(f"Thứ tự nhóm Ordinal của {spec.name} chưa đủ hoặc bị trùng.")
    return frame


def make_preprocessor(snapshot):
    transforms = []
    for index, spec in enumerate(snapshot.input_preprocessing):
        config = spec.config
        if config.kind == "number":
            transform = StandardScaler() if config.scaling == "standard" else MinMaxScaler() if config.scaling == "minmax" else "passthrough"
        elif config.encoding == "onehot":
            transform = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
        else:
            transform = OrdinalEncoder(categories=[config.category_order], handle_unknown="use_encoded_value", unknown_value=-1)
        transforms.append((f"column_{index}", transform, [f"x{index}"]))
    return ColumnTransformer(transforms, remainder="drop", sparse_threshold=0)


def split_indices(request):
    count = len(request.dataset.data.inputs)
    validation_count = math.ceil(count * request.split.validation_percent / 100)
    test_count = math.ceil(count * request.split.test_percent / 100)
    train_count = count - validation_count - test_count
    if train_count < 2 or min(validation_count, test_count) < 1:
        raise ValueError("Dữ liệu không đủ cho tỷ lệ chia đã chọn.")
    indices = np.arange(count)
    if request.split.strategy == "ordered":
        return indices[:train_count], indices[train_count:train_count + validation_count], indices[train_count + validation_count:]
    labels = np.asarray(request.dataset.data.outputs)[:, 0] if request.split.stratify else None
    train, holdout = train_test_split(indices, train_size=train_count, random_state=request.split.seed, stratify=labels)
    holdout_labels = labels[holdout] if labels is not None else None
    validation, test = train_test_split(holdout, train_size=validation_count, test_size=test_count, random_state=request.split.seed, stratify=holdout_labels)
    return train, validation, test