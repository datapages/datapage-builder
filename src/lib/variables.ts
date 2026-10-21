// Mirrors the fallback heuristic in the template's _plot-prep.qmd, so the
// wizard's suggestions match what the datapage would pick on its own.
export const DISTINCT_CUTOFF = 10;
const NUMERICAL_TYPES = ['integer', 'float', 'date', 'datetime', 'time'];

export interface VariableInfo {
  name: string;
  /** Redivis variable type */
  type: string;
  label?: string | null;
  description?: string | null;
  numDistinct: number;
}

export interface PlotConfig {
  numerical: string[];
  categorical: string[];
  defaults: { x: string; y: string; color: string };
}

export function suggestPlotConfig(vars: VariableInfo[]): PlotConfig {
  // unlike the template's fallback, any type with few distinct values counts
  // as categorical, so e.g. a year column with 3 values can color the plot
  const categorical = vars
    .filter((v) => v.numDistinct > 1 && v.numDistinct <= DISTINCT_CUTOFF)
    .map((v) => v.name);
  const numerical = vars
    .filter((v) => NUMERICAL_TYPES.includes(v.type) && v.numDistinct > DISTINCT_CUTOFF)
    .map((v) => v.name);
  return {
    numerical,
    categorical,
    defaults: { x: numerical[0] ?? '', y: numerical[1] ?? numerical[0] ?? '', color: categorical[0] ?? '' },
  };
}

/**
 * An existing datapage's plot config, limited to the variables the table has
 * now. Defaults that no longer fit are left blank for the user to pick.
 */
export function fitPlotConfig(config: PlotConfig, vars: { name: string }[]): PlotConfig {
  const names = new Set(vars.map((v) => v.name));
  const numerical = config.numerical.filter((n) => names.has(n));
  const categorical = config.categorical.filter((n) => names.has(n));
  const { x, y, color } = config.defaults;
  return {
    numerical,
    categorical,
    defaults: {
      x: numerical.includes(x) ? x : '',
      y: numerical.includes(y) ? y : '',
      color: categorical.includes(color) ? color : '',
    },
  };
}

/** Problems that would break the template's plots. */
export function plotConfigProblems(config: PlotConfig): string[] {
  const problems: string[] = [];
  if (config.numerical.length < 2) problems.push('Pick at least two numerical variables for the scatter plot axes.');
  if (config.categorical.length < 1) problems.push('Pick at least one categorical variable for the plot colors.');
  const { x, y, color } = config.defaults;
  if (x && !config.numerical.includes(x)) problems.push('The default x variable must be one of the numerical variables.');
  if (y && !config.numerical.includes(y)) problems.push('The default y variable must be one of the numerical variables.');
  if (color && !config.categorical.includes(color)) problems.push('The default color variable must be one of the categorical variables.');
  return problems;
}

/**
 * The metadata changes to send to Redivis: only fields that changed, so a blank
 * field that was already blank isn't sent. A field that's cleared is sent as an
 * empty string, since the batch endpoint rejects null.
 */
export function variableUpdates(
  current: { name: string; label?: string | null; description?: string | null }[],
  drafts: { name: string; label: string; description: string }[],
): { name: string; label?: string; description?: string }[] {
  const updates = [];
  for (const draft of drafts) {
    const v = current.find((c) => c.name === draft.name);
    if (!v) continue;
    const update: { name: string; label?: string; description?: string } = { name: draft.name };
    for (const field of ['label', 'description'] as const) {
      const value = draft[field].trim();
      if (value !== (v[field] ?? '')) update[field] = value;
    }
    if (Object.keys(update).length > 1) updates.push(update);
  }
  return updates;
}

/**
 * Joins Redivis variables (authoritative names and types) with distinct counts
 * from the local CSV, matching by column position since Redivis may rename columns.
 */
export function joinVariables(
  redivisVars: { name: string; type: string; label?: string | null; description?: string | null; index?: number }[],
  csvColumns: { numDistinct: number }[],
): VariableInfo[] {
  return [...redivisVars]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((v, i) => ({
      name: v.name,
      type: v.type,
      label: v.label,
      description: v.description,
      numDistinct: csvColumns[i]?.numDistinct ?? 0,
    }));
}
