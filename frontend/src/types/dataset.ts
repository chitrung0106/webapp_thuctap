export type ColumnRole = "unused" | "input" | "output";

export interface DataRow {
  id: number;
  sourceLine: number;
  values: string[];
}

export interface CsvDocument {
  rows: DataRow[];
  columnCount: number;
  delimiter: string;
  paddedRows: number;
}

export interface TrainingData {
  inputColumns: string[];
  outputColumns: string[];
  inputs: string[][];
  outputs: string[][];
}

export interface ColumnPreprocessing {
  kind: "unset" | "number" | "category";
  scaling: "standard" | "minmax" | "none";
  encoding: "onehot" | "ordinal";
  categoryOrder: string[];
}

export interface LabelPreprocessing {
  task: "unset" | "binary" | "multiclass" | "regression";
}
