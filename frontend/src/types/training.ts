import type { createTrainingSnapshot } from "../utils/csv";

export type DatasetSnapshot = ReturnType<typeof createTrainingSnapshot>;
export type TaskType = "classification" | "regression";
export type ParameterValues = Record<string, string | boolean>;
export interface ParameterField {
  key: string;
  label: string;
  kind: "number" | "select" | "boolean" | "layers";
  defaultValue: string | boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  exclusiveMin?: boolean;
  special?: string;
  options?: { value: string; label: string }[];
  help?: string;
}
export interface ModelDefinition {
  id: string;
  name: string;
  description: string;
  extended?: boolean;
  fields: ParameterField[];
}
export interface SharedTrainingConfig {
  environment?: "browser" | "server";
  device?: "cpu" | "gpu";
  task: TaskType;
  trainPercent: string;
  validationPercent: string;
  testPercent: string;
  seed: string;
  split: "random" | "ordered";
  stratify: boolean;
  metric: string;
}
export interface TrainingForm {
  shared: SharedTrainingConfig;
  selected: string[];
  parameters: Record<string, ParameterValues>;
}
export interface TrainingPlan {
  createdAt: string;
  dataset: DatasetSnapshot;
  task: TaskType;
  split: { trainPercent: number; validationPercent: number; testPercent: number; seed: number; strategy: "random" | "ordered"; stratify: boolean };
  preprocessing: { columns: DatasetSnapshot["inputPreprocessing"]; targets: DatasetSnapshot["labelPreprocessing"]; fitOn: "train_only" };
  metric: string;
  execution: { environment?: "browser" | "server"; device: "cpu" | "gpu"; concurrentJobs: 1; targetStrategy: "separate" };
  jobs: { modelId: string; modelName: string; targetIndex: number; targetName: string; parameters: Record<string, string | number | boolean | number[] | null> }[];
}
