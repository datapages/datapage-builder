import Papa from 'papaparse';

// The datapage embeds the whole table in its HTML and draws one SVG element
// per row, so big tables make slow pages. Tune these as we learn more.
export const SIZE_THRESHOLDS = [
  { level: 'strong', rows: 250_000, bytes: 50 * 1024 ** 2 },
  { level: 'soft', rows: 50_000, bytes: 10 * 1024 ** 2 },
] as const;

// only need to tell "few" from "many" distinct values, so stop counting here
const DISTINCT_CAP = 1000;
const MAX_ERRORS = 5;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export interface ColumnSummary {
  name: string;
  /** distinct non-empty values, capped at DISTINCT_CAP + 1 */
  numDistinct: number;
  /** every non-empty value parses as a number */
  numeric: boolean;
}

export interface SizeWarning {
  level: 'soft' | 'strong';
  message: string;
}

export interface CsvAnalysis {
  rows: number;
  bytes: number;
  columns: ColumnSummary[];
  errors: string[];
  sizeWarning: SizeWarning | null;
}

export function analyzeCsv(input: File | string): Promise<CsvAnalysis> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input).length : input.size;
  let header: string[] | null = null;
  let distinct: Set<string>[] = [];
  let numeric: boolean[] = [];
  let rows = 0;
  const errors: string[] = [];

  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(input as File, {
      skipEmptyLines: 'greedy',
      step: ({ data }) => {
        if (!header) {
          header = data.map((h) => h.trim());
          distinct = header.map(() => new Set());
          numeric = header.map(() => true);
          return;
        }
        rows++;
        if (data.length !== header.length && errors.length < MAX_ERRORS) {
          errors.push(`Row ${rows} has ${data.length} fields but the header has ${header.length}.`);
        }
        for (let i = 0; i < header.length; i++) {
          const value = (data[i] ?? '').trim();
          if (value === '' || value.toUpperCase() === 'NA') continue;
          if (distinct[i].size <= DISTINCT_CAP) distinct[i].add(value);
          if (numeric[i] && !NUMBER.test(value)) numeric[i] = false;
        }
      },
      complete: () => {
        const names = header ?? [];
        if (!header) errors.unshift('The file is empty.');
        else if (rows === 0) errors.unshift('The file has a header row but no data.');
        names.forEach((name, i) => {
          if (!name) errors.unshift(`Column ${i + 1} has no name in the header row.`);
        });
        const duplicates = [...new Set(names.filter((n, i) => n && names.indexOf(n) !== i))];
        if (duplicates.length) errors.unshift(`Duplicate column names: ${duplicates.join(', ')}.`);

        resolve({
          rows,
          bytes,
          columns: names.map((name, i) => ({ name, numDistinct: distinct[i]?.size ?? 0, numeric: numeric[i] ?? false })),
          errors,
          sizeWarning: sizeWarning(rows, bytes),
        });
      },
      error: (err) => reject(err),
    });
  });
}

export function sizeWarning(rows: number, bytes: number): SizeWarning | null {
  for (const t of SIZE_THRESHOLDS) {
    if (rows > t.rows || bytes > t.bytes) {
      const size = `${rows.toLocaleString()} rows, ${formatBytes(bytes)}`;
      return t.level === 'strong'
        ? { level: 'strong', message: `This table is very large (${size}). Your datapage will embed all of it, so it may be very slow to load or fail to load in some browsers.` }
        : { level: 'soft', message: `This table is fairly large (${size}). Your datapage embeds all of it, so pages may load slowly.` };
    }
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
