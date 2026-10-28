export interface MissingLine {
  line: string;
  count: number;
}

export interface CompareResult {
  input_filename: string;
  output_filename: string;
  input_count: number;
  output_count: number;
  missing_count: number;
  missing_lines: MissingLine[];
}