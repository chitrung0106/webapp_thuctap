import type { CompareResult } from "../types/compare";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function compareFiles(
  inputFile: File,
  outputFile: File,
): Promise<CompareResult> {
  const formData = new FormData();
  formData.append("input_file", inputFile);
  formData.append("output_file", outputFile);

  const response = await fetch(`${API_BASE_URL}/api/compare`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;
    throw new Error(body?.detail ?? "Không thể đối chiếu file. Vui lòng thử lại.");
  }

  return (await response.json()) as CompareResult;
}