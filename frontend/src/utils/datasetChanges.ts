import type { DataRow } from "../types/dataset";

export function summarizeChanges(originalRows: DataRow[], currentRows: DataRow[]) {
  const originals = new Map(originalRows.map((row) => [row.id, row]));
  const changedCells = new Set<string>();
  const changedRows = new Set<number>();
  for (const row of currentRows) {
    const original = originals.get(row.id);
    row.values.forEach((value, index) => {
      if (original && value !== original.values[index]) {
        changedCells.add(`${row.id}:${index}`);
        changedRows.add(row.id);
      }
    });
  }
  return { changedCells, changedRows, cellCount: changedCells.size, rowCount: changedRows.size };
}