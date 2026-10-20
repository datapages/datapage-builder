import { describe, expect, it } from 'vitest';
import { analyzeCsv, sizeWarning } from '../src/lib/csv';

describe('analyzeCsv', () => {
  it('counts rows and distinct values, ignoring empty and NA values', async () => {
    const a = await analyzeCsv('species,mass,sex\nAdelie,3750,male\nAdelie,3800,female\nGentoo,,NA\n');
    expect(a.errors).toEqual([]);
    expect(a.rows).toBe(3);
    expect(a.columns).toEqual([
      { name: 'species', numDistinct: 2, numeric: false },
      { name: 'mass', numDistinct: 2, numeric: true },
      { name: 'sex', numDistinct: 2, numeric: false },
    ]);
  });

  it('handles quoted fields with commas and newlines', async () => {
    const a = await analyzeCsv('name,note\n"Smith, J","line one\nline two"\n');
    expect(a.errors).toEqual([]);
    expect(a.rows).toBe(1);
  });

  it('reports structural problems', async () => {
    expect((await analyzeCsv('')).errors).toContain('The file is empty.');
    expect((await analyzeCsv('a,b\n')).errors).toContain('The file has a header row but no data.');
    expect((await analyzeCsv('a,a\n1,2\n')).errors).toContain('Duplicate column names: a.');
    expect((await analyzeCsv('a,\n1,2\n')).errors).toContain('Column 2 has no name in the header row.');
    expect((await analyzeCsv('a,b\n1,2,3\n')).errors).toContain('Row 1 has 3 fields but the header has 2.');
  });
});

describe('sizeWarning', () => {
  it('escalates with size', () => {
    expect(sizeWarning(1000, 50_000)).toBeNull();
    expect(sizeWarning(60_000, 1000)?.level).toBe('soft');
    expect(sizeWarning(10, 20 * 1024 ** 2)?.level).toBe('soft');
    expect(sizeWarning(300_000, 1000)?.level).toBe('strong');
  });
});
