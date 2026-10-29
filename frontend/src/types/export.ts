export type ExportFormat = "python_zip" | "joblib";
export type ExportVariant = "float32" | "float16";
export interface ExportOptions {
  resultIds: string[];
  format: ExportFormat;
  includeData: boolean;
  variants: ExportVariant[];
  includeFirmware: boolean;
  firmware: { board: "esp32" | "esp32s3"; intervalMs: number };
}
export interface ExportFile {
  path: string;
  bytes: number;
  sha256: string;
  kind: "text" | "binary";
  content: string | null;
  truncated: boolean;
}
export interface ExportVariantReport {
  resultId: string;
  modelName: string;
  targetName: string;
  storage: ExportVariant;
  compute: "float32";
  status: "ready" | "unavailable" | "failed";
  reason: string | null;
  parameterBytes?: number;
  totalSourceBytes?: number;
  workspaceBytesEstimate?: number;
  firmwareIncluded?: boolean;
  testSamples?: number;
  metrics?: Record<string, number>;
  originalTestMetrics: Record<string, number>;
  labelAgreement?: number | null;
  meanAbsoluteOutputDifference?: number;
}
export interface ExportPreview {
  fileName: string;
  mediaType: string;
  files: ExportFile[];
  variants: ExportVariantReport[];
  models: { id: string; modelName: string; targetName: string; portableSupported: boolean; portableReason: string | null }[];
  requirements: Record<string, string>;
  pythonVersion: string;
  pythonVersionSource: string;
  totalBytes: number;
  warnings: string[];
}
