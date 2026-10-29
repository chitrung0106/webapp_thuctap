"""Small NumPy runtime also shipped with portable model exports."""
import numpy as np


def tensor(meta, data, name):
    item = meta["tensors"][name]
    return np.frombuffer(data, dtype="<f2" if meta["storage"] == "float16" else "<f4", count=item["count"], offset=item["offset"] * (2 if meta["storage"] == "float16" else 4)).astype(np.float32).reshape(item["shape"])


def activation(values, name):
    if name == "relu": return np.maximum(values, 0)
    if name == "tanh": return np.tanh(values)
    if name == "logistic":
        return np.exp(-np.logaddexp(np.float32(0), -values))
    if name == "softmax":
        exponent = np.exp(values - values.max(axis=1, keepdims=True))
        return exponent / exponent.sum(axis=1, keepdims=True)
    if name == "identity": return values
    raise ValueError(f"Unsupported activation: {name}")


def predict_outputs(meta, data, rows):
    x = np.asarray(rows, dtype=np.float32)
    if x.ndim != 2 or x.shape[1] != len(meta["inputColumns"]) or not np.isfinite(x).all():
        raise ValueError("Inputs must be finite numeric rows in inputColumns order.")
    x = x * tensor(meta, data, "scale") + tensor(meta, data, "offset")
    if meta["family"] == "dense":
        for i, layer in enumerate(meta["layers"]):
            x = activation(x @ tensor(meta, data, f"weight_{i}") + tensor(meta, data, f"bias_{i}"), layer["activation"])
        output = x
    else:
        output = np.zeros((len(x), meta["outputCount"]), dtype=np.float32)
        for i, tree in enumerate(meta["trees"]):
            threshold = tensor(meta, data, f"threshold_{i}")
            values = tensor(meta, data, f"value_{i}")
            for row_index, row in enumerate(x):
                node = 0
                while tree["left"][node] >= 0:
                    node = tree["left"][node] if row[tree["feature"][node]] <= threshold[node] else tree["right"][node]
                output[row_index] += values[node]
        output /= len(meta["trees"])
    if not np.isfinite(output).all():
        raise ValueError("Converted model produced non-finite outputs.")
    return output


def predicted_indices(meta, output):
    return (output[:, 0] > .5).astype(int) if output.shape[1] == 1 else output.argmax(axis=1)


def decode_outputs(meta, output):
    if meta["task"] == "classification":
        return [meta["classes"][index] for index in predicted_indices(meta, output)]
    return output[:, 0].tolist()
