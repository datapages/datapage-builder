import { describe, expect, it } from 'vitest';
import { joinVariables, plotConfigProblems, suggestPlotConfig } from '../src/lib/variables';

// the penguins table's variables, with distinct counts from Redivis
const penguins = [
  { name: 'species', type: 'string', numDistinct: 3 },
  { name: 'island', type: 'string', numDistinct: 3 },
  { name: 'bill_length_mm', type: 'float', numDistinct: 164 },
  { name: 'bill_depth_mm', type: 'float', numDistinct: 80 },
  { name: 'flipper_length_mm', type: 'integer', numDistinct: 55 },
  { name: 'body_mass_g', type: 'integer', numDistinct: 94 },
  { name: 'sex', type: 'string', numDistinct: 2 },
  { name: 'year', type: 'integer', numDistinct: 3 },
];

describe('suggestPlotConfig', () => {
  it("matches the template's hand-written config for penguins", () => {
    expect(suggestPlotConfig(penguins)).toEqual({
      numerical: ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g'],
      categorical: ['species', 'island', 'sex', 'year'],
      defaults: { x: 'bill_length_mm', y: 'bill_depth_mm', color: 'species' },
    });
  });

  it('leaves out constant and high-cardinality text variables', () => {
    const config = suggestPlotConfig([
      { name: 'id', type: 'string', numDistinct: 500 },
      { name: 'site', type: 'string', numDistinct: 1 },
    ]);
    expect(config.numerical).toEqual([]);
    expect(config.categorical).toEqual([]);
  });
});

describe('plotConfigProblems', () => {
  it('requires two numerical variables and one categorical', () => {
    expect(plotConfigProblems(suggestPlotConfig(penguins))).toEqual([]);
    expect(plotConfigProblems({ numerical: ['a'], categorical: [], defaults: { x: 'a', y: 'a', color: '' } })).toHaveLength(2);
  });
});

describe('joinVariables', () => {
  it('matches by position, since Redivis may rename columns', () => {
    const joined = joinVariables(
      [
        { name: 'b_col', type: 'integer', index: 1 },
        { name: 'a_col', type: 'string', index: 0 },
      ],
      [{ numDistinct: 4 }, { numDistinct: 40 }],
    );
    expect(joined).toEqual([
      { name: 'a_col', type: 'string', label: undefined, numDistinct: 4 },
      { name: 'b_col', type: 'integer', label: undefined, numDistinct: 40 },
    ]);
  });
});
