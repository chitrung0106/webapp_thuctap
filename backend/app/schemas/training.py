from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class InputConfig(ApiModel):
    kind: Literal["number", "category"]
    scaling: Literal["standard", "minmax", "none"] = "standard"
    encoding: Literal["onehot", "ordinal"] = "onehot"
    category_order: list[str] = Field(default_factory=list, alias="categoryOrder")


class InputSpec(ApiModel):
    column_index: int = Field(ge=0, alias="columnIndex")
    name: str
    config: InputConfig


class LabelSpec(ApiModel):
    problem_type: Literal["binary", "multiclass", "regression"] | None = Field(default=None, alias="problemType")
    column_index: int = Field(ge=0, alias="columnIndex")
    name: str
    task: Literal["classification", "regression"]
    encoding: Literal["label_encoder", "none"]
    restore_original_label: bool = Field(default=False, alias="restoreOriginalLabel")


class DataMatrix(ApiModel):
    input_columns: list[str] = Field(min_length=1, alias="inputColumns")
    output_columns: list[str] = Field(min_length=1, alias="outputColumns")
    inputs: list[list[str]] = Field(min_length=4)
    outputs: list[list[str]]

    @model_validator(mode="after")
    def rectangular(self):
        if len(self.inputs) != len(self.outputs):
            raise ValueError("Số dòng input và label không khớp.")
        if any(len(row) != len(self.input_columns) for row in self.inputs):
            raise ValueError("Số cột input không khớp.")
        if any(len(row) != len(self.output_columns) for row in self.outputs):
            raise ValueError("Số cột label không khớp.")
        if any(not cell.strip() for row in self.inputs + self.outputs for cell in row):
            raise ValueError("Dữ liệu train không được chứa ô trống.")
        return self


class DatasetSnapshot(ApiModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")
    file_name: str = Field(alias="fileName")
    csv: str = ""
    data: DataMatrix
    input_preprocessing: list[InputSpec] = Field(alias="inputPreprocessing")
    label_preprocessing: list[LabelSpec] = Field(alias="labelPreprocessing")

    @model_validator(mode="after")
    def matching_schema(self):
        if len(self.input_preprocessing) != len(self.data.input_columns):
            raise ValueError("Thiếu cấu hình tiền xử lý input.")
        if len(self.label_preprocessing) != len(self.data.output_columns):
            raise ValueError("Thiếu cấu hình label.")
        if [spec.name for spec in self.input_preprocessing] != self.data.input_columns:
            raise ValueError("Thứ tự cấu hình input không khớp dữ liệu.")
        if [spec.name for spec in self.label_preprocessing] != self.data.output_columns:
            raise ValueError("Thứ tự cấu hình label không khớp dữ liệu.")
        return self


class SplitConfig(ApiModel):
    train_percent: float = Field(gt=0, lt=100, alias="trainPercent")
    validation_percent: float = Field(gt=0, lt=100, alias="validationPercent")
    test_percent: float = Field(gt=0, lt=100, alias="testPercent")
    seed: int = Field(ge=0, le=4294967295)
    strategy: Literal["random", "ordered"]
    stratify: bool = False

    @model_validator(mode="after")
    def sums_to_100(self):
        if abs(self.train_percent + self.validation_percent + self.test_percent - 100) > 1e-5:
            raise ValueError("Tỷ lệ chia phải có tổng 100%.")
        return self


MODEL_IDS = {"linear", "tree", "forest", "extra_trees", "gradient_boosting", "knn", "svm", "naive_bayes", "mlp", "xgboost", "lightgbm", "catboost"}


class ModelJob(ApiModel):
    model_id: str = Field(alias="modelId")
    model_name: str = Field(alias="modelName")
    target_index: int = Field(ge=0, alias="targetIndex")
    target_name: str = Field(alias="targetName")
    parameters: dict[str, Any] = Field(default_factory=dict)


class ExecutionConfig(ApiModel):
    environment: Literal["browser", "server"] = "server"
    device: Literal["cpu", "gpu"] = "cpu"
    concurrent_jobs: Literal[1] = Field(default=1, alias="concurrentJobs")
    target_strategy: Literal["separate"] = Field(default="separate", alias="targetStrategy")


class TrainingRequest(ApiModel):
    execution: ExecutionConfig = Field(default_factory=ExecutionConfig)
    dataset: DatasetSnapshot
    task: Literal["classification", "regression"]
    split: SplitConfig
    metric: str
    jobs: list[ModelJob] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_jobs(self):
        metrics = {"accuracy", "balanced_accuracy", "f1_macro"} if self.task == "classification" else {"rmse", "mae", "r2"}
        if self.metric not in metrics:
            raise ValueError("Metric không phù hợp bài toán.")
        if any(label.task != self.task for label in self.dataset.label_preprocessing):
            raise ValueError("Loại bài toán không khớp label.")
        for index, label in enumerate(self.dataset.label_preprocessing):
            if label.problem_type is None:  # Legacy saved requests remain readable.
                continue
            if (label.problem_type == "regression") != (label.task == "regression"):
                raise ValueError("Dạng bài toán đã chọn không khớp label.")
            count = len({row[index] for row in self.dataset.data.outputs})
            if label.problem_type == "binary" and count != 2:
                raise ValueError("Đã chọn Binary: label phải có đúng 2 lớp.")
            if label.problem_type == "multiclass" and count < 3:
                raise ValueError("Đã chọn Multiclass: label phải có ít nhất 3 lớp.")
        expected_encoding = "label_encoder" if self.task == "classification" else "none"
        if any(label.encoding != expected_encoding for label in self.dataset.label_preprocessing):
            raise ValueError("Encoding label không phù hợp loại bài toán.")
        seen = set()
        for job in self.jobs:
            if job.model_id not in MODEL_IDS or (self.task == "regression" and job.model_id == "naive_bayes"):
                raise ValueError("Model không hợp lệ cho bài toán.")
            if job.target_index >= len(self.dataset.data.output_columns) or job.target_name != self.dataset.data.output_columns[job.target_index]:
                raise ValueError("Label của tác vụ không khớp dữ liệu.")
            key = (job.model_id, job.target_index)
            if key in seen:
                raise ValueError("Tác vụ bị trùng model và label.")
            seen.add(key)
        if self.split.stratify and (self.task != "classification" or len(self.dataset.data.output_columns) != 1 or self.split.strategy != "random"):
            raise ValueError("Phân tầng chỉ hỗ trợ phân loại một label và chia ngẫu nhiên.")
        return self


class FirmwareExportConfig(ApiModel):
    board: Literal["esp32", "esp32s3"] = "esp32"
    interval_ms: int = Field(default=1000, ge=20, le=60000, alias="intervalMs")



class ExportRequest(ApiModel):
    result_ids: list[str] = Field(min_length=1, alias="resultIds")
    format: Literal["python_zip", "joblib"] = "python_zip"
    include_data: bool = Field(default=False, alias="includeData")
    variants: list[Literal["float32", "float16"]] = Field(default_factory=list)
    include_firmware: bool = Field(default=False, alias="includeFirmware")
    firmware: FirmwareExportConfig = Field(default_factory=FirmwareExportConfig)
