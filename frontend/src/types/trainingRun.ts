export type RunStatus = "queued" | "running" | "cancelling" | "completed" | "cancelled" | "failed";
export type ResultStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
export interface LossPoint { step: number; trainLoss: number; validationLoss: number; trainAccuracy?: number; validationAccuracy?: number; }
export interface ModelResult {
  executionDevice?: "cpu" | "gpu";
  executionBackend?: string;
  gpuName?: string;
  gpuFallbackReason?: string;
  id: string;
  modelId: string;
  modelName: string;
  targetIndex: number;
  targetName: string;
  parameters: Record<string, unknown>;
  status: ResultStatus;
  metrics: Partial<Record<"train" | "validation" | "test", Record<string, number>>>;
  history: LossPoint[];
  historyKind: "epoch" | "boosting" | null;
  durationSeconds: number | null;
  iterations: number | null;
  warnings: string[];
  error: string | null;
  progress: { current: number; total: number } | null;
  classes?: string[];
  confusionMatrix?: number[][] | null;
  samples?: { actual: string; predicted: string }[];
  transformedFeatureCount?: number;
  problemType?: "binary" | "multiclass" | "regression";
  binaryMetrics?: { positiveClass: string; negativeClass: string; precision: number | null; recall: number | null; f1: number | null; specificity: number | null; falsePositiveRate: number | null; falseNegativeRate: number | null; tp: number; tn: number; fp: number; fn: number; support: number }[] | null;
  binaryMetricsBySplit?: Partial<Record<"train" | "validation" | "test", NonNullable<ModelResult["binaryMetrics"]>>> | null;
  lossName?: string | null;
  artifactBytes?: number;
  classificationReport?: { label: string; precision: number; recall: number; "f1-score": number; support: number }[] | null;
  regressionPoints?: { actual: number; predicted: number }[] | null;
}
export interface TrainingRun {
  id: string;
  status: RunStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  fileName: string;
  task: "classification" | "regression";
  metric: string;
  rowCount: number;
  inputColumns: string[];
  outputColumns: string[];
  targetDistributions?: { targetIndex: number; targetName: string; classes: { label: string; count: number }[] }[];
  splitCounts: { train: number; validation: number; test: number } | null;
  error: string | null;
  results: ModelResult[];
}
export const isRunActive = (status: RunStatus) => ["queued", "running", "cancelling"].includes(status);
