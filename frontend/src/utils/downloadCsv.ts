import type { CompareResult } from "../types/compare";

function escapeCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function downloadCsv(result: CompareResult) {
  const rows = [
    ["Dòng còn thiếu", "Số lần"],
    ...result.missing_lines.map(({ line, count }) => [line, String(count)]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "missing-lines.csv";
  link.click();
  URL.revokeObjectURL(url);
}
