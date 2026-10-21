<script lang="ts">
  import { wizard } from '../lib/state.svelte';
  import { plotConfigProblems, suggestPlotConfig } from '../lib/variables';

  let { onnext }: { onnext: () => void } = $props();

  if (!wizard.plots.config) wizard.plots.config = suggestPlotConfig(wizard.data.variables);
  const plot = wizard.plots.config!;

  const problems = $derived(plotConfigProblems(plot));
  const labelOf = (name: string) => wizard.data.variables.find((v) => v.name === name)?.label || name;

  function role(name: string): 'numerical' | 'categorical' | 'none' {
    if (plot.numerical.includes(name)) return 'numerical';
    if (plot.categorical.includes(name)) return 'categorical';
    return 'none';
  }

  function setRole(name: string, value: string) {
    plot.numerical = plot.numerical.filter((n) => n !== name);
    plot.categorical = plot.categorical.filter((n) => n !== name);
    if (value === 'numerical') plot.numerical.push(name);
    if (value === 'categorical') plot.categorical.push(name);
    // keep the defaults pointing at variables that can still be used
    const d = plot.defaults;
    if (!plot.numerical.includes(d.x)) d.x = plot.numerical.find((n) => n !== d.y) ?? '';
    if (!plot.numerical.includes(d.y)) d.y = plot.numerical.find((n) => n !== d.x) ?? '';
    if (!plot.categorical.includes(d.color)) d.color = plot.categorical[0] ?? '';
  }

  function resetSuggestions() {
    Object.assign(plot, suggestPlotConfig(wizard.data.variables));
  }

  function next() {
    wizard.plots.reviewed = true;
    onnext();
  }
</script>

<section class="stack">
  <div>
    <h2>Build your plots</h2>
    <p class="muted">
      Your datapage's homepage has a scatter plot with histograms. Visitors choose numerical variables for the axes and
      a categorical variable to color the points. The roles below are guessed from your data: numbers with many
      distinct values are numerical, and anything with 2–10 values is categorical.
    </p>
  </div>

  <div class="card stack">
    <h3>Variables</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Variable</th><th>Type</th><th>Distinct values</th><th>Use as</th></tr></thead>
        <tbody>
          {#each wizard.data.variables as v (v.name)}
            <tr>
              <td>{v.name}{#if v.label}<span class="muted var-label">{v.label}</span>{/if}</td>
              <td>{v.type}</td>
              <td>{v.numDistinct > 1000 ? '1000+' : v.numDistinct}</td>
              <td>
                <select value={role(v.name)} onchange={(e) => setRole(v.name, e.currentTarget.value)} aria-label={`Use ${v.name} as`}>
                  <option value="numerical">Numerical</option>
                  <option value="categorical">Categorical</option>
                  <option value="none">Not in plots</option>
                </select>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div><button class="link" onclick={resetSuggestions}>Reset to suggestions</button></div>
  </div>

  <div class="card stack">
    <h3>Defaults</h3>
    <p class="muted">What the plot shows when someone first opens your datapage.</p>
    <div class="grid-2">
      <label>X axis
        <select bind:value={plot.defaults.x}>{#each plot.numerical as n (n)}<option value={n}>{labelOf(n)}</option>{/each}</select>
      </label>
      <label>Y axis
        <select bind:value={plot.defaults.y}>{#each plot.numerical as n (n)}<option value={n}>{labelOf(n)}</option>{/each}</select>
      </label>
      <label>Color
        <select bind:value={plot.defaults.color}>{#each plot.categorical as n (n)}<option value={n}>{labelOf(n)}</option>{/each}</select>
      </label>
    </div>
  </div>

  {#if problems.length}
    <div class="notice warn"><ul>{#each problems as p (p)}<li>{p}</li>{/each}</ul></div>
  {/if}
  <div class="row">
    <button onclick={next} disabled={problems.length > 0}>Continue</button>
  </div>
</section>

<style>
  .var-label {
    display: block;
    font-size: 0.85rem;
    white-space: normal;
  }
</style>
