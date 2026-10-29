import type { ExportOptions, ExportPreview } from "../types/export";
import type { TrainingPlan } from "../types/training";
import type { TrainingRun } from "../types/trainingRun";
import { downloadFile } from "../utils/downloadFile";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
import { TrainingApiError } from './trainingErrors';
async function checked(response: Response) {
  if (response.ok) return response;
  const body = await response.json().catch(() => null) as { detail?: string | { msg?: string; loc?: (string | number)[] }[] } | null;
  const message = typeof body?.detail === "string" ? body.detail : Array.isArray(body?.detail)
    ? body.detail.slice(0, 3).map((error) => `${error.loc?.slice(1).join(".")}: ${error.msg}`).join("; ")
    : `Yêu cầu không thành công (${response.status}).`;
  throw new TrainingApiError(message, response.status);
}
async function jsonRequest(path: string, options?: RequestInit): Promise<TrainingRun> {
  try {
    const response = await checked(await fetch(`${API_BASE_URL}/api/training${path}`, options));
    return await response.json() as TrainingRun;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Không kết nối được backend. Kiểm tra server tại cổng 8000 và thử lại.");
    throw error;
  }
}
export const startTraining = (plan: TrainingPlan) => jsonRequest("/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(plan) });
export const getTrainingRun = (id: string, signal?: AbortSignal) => jsonRequest(`/runs/${encodeURIComponent(id)}`, { signal });
export const cancelTraining = (id: string) => jsonRequest(`/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
export async function exportTrainingModels(id: string, resultIds: string[], format: "python_zip" | "joblib", includeData: boolean, extra?: Pick<ExportOptions, "variants" | "includeFirmware" | "firmware">) {
  const response = await checked(await fetch(`${API_BASE_URL}/api/training/runs/${encodeURIComponent(id)}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resultIds, format, includeData, ...extra }) }));
  const fileName = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] ?? "models.zip";
  downloadFile(await response.blob(), fileName);
}
export async function previewTrainingModels(id: string, options: ExportOptions, signal?: AbortSignal): Promise<ExportPreview> {
  const response = await checked(await fetch(`${API_BASE_URL}/api/training/runs/${encodeURIComponent(id)}/export/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options), signal }));
  return response.json() as Promise<ExportPreview>;
}
