<script lang="ts">
  import { onMount } from 'svelte';
  import { errorMessage, redivis } from '../lib/clients';
  import { referenceName, type Dataset, type DatasetSummary, type Table } from '../lib/redivis';
  import { wizard } from '../lib/state.svelte';
  import { fitPlotConfig, joinVariables } from '../lib/variables';

  // statistics requests run in parallel, a few at a time
  const CONCURRENCY = 6;

  let owner = $state(wizard.data.owner || wizard.redivisUser || '');
  let isOrganization = $state(false);
  let datasets = $state<DatasetSummary[] | null>(null);
  let datasetName = $state('');
  let dataset = $state<Dataset | null>(null);
  let tables = $state<Table[]>([]);
  let tableName = $state('');
  let loading = $state('');
  let error = $state('');
  let progress = $state<{ done: number; total: number } | null>(null);

  const problems = $derived(
    !dataset
      ? []
      : [
          !dataset.currentVersion && "This dataset hasn't been released yet. Release a version on Redivis first.",
          dataset.publicAccessLevel !== 'data' &&
            `Your datapage reads the data without signing in, so the dataset's public access level must be "Data" (it's "${dataset.publicAccessLevel ?? 'none'}"). Change it in the dataset's settings on Redivis, then check again.`,
        ].filter(Boolean) as string[],
  );
  // tableName and datasetName hold reference names, which the API and the template use
  const table = $derived(tables.find((t) => referenceName(t.uri) === tableName) ?? null);

  const ref = (d: DatasetSummary) => referenceName(d.qualifiedReference);

  onMount(() => {
    if (owner) loadDatasets();
  });

  async function loadDatasets() {
    loading = 'datasets';
    error = '';
    datasets = null;
    dataset = null;
    tables = [];
    try {
      const res = await redivis().listDatasets(owner.trim());
      datasets = [...res.datasets].sort((a, b) => a.name.localeCompare(b.name));
      isOrganization = res.isOrganization;
      if (wizard.data.source === 'existing' && wizard.data.owner === owner && datasets.some((d) => ref(d) === wizard.data.dataset)) {
        datasetName = wizard.data.dataset;
        await loadDataset();
      }
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = '';
    }
  }

  async function loadDataset() {
    if (!datasetName) return;
    loading = 'tables';
    error = '';
    tables = [];
    tableName = '';
    try {
      const api = redivis();
      dataset = await api.getDataset(owner.trim(), datasetName);
      tables = dataset?.currentVersion ? await api.listTables(owner.trim(), datasetName) : [];
      if (tables.length === 1) tableName = referenceName(tables[0].uri);
      else if (tables.some((t) => referenceName(t.uri) === wizard.data.table)) tableName = wizard.data.table;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = '';
    }
  }

  async function useTable() {
    if (!dataset || !table) return;
    loading = 'variables';
    error = '';
    try {
      const api = redivis();
      const o = owner.trim();
      const t = referenceName(table.uri);
      const vars = await api.listVariables(o, datasetName, t, 'current');
      progress = { done: 0, total: vars.length };
      const counts: number[] = new Array(vars.length).fill(0);
      let next = 0;
      async function worker() {
        while (next < vars.length) {
          const i = next++;
          counts[i] = (await api.numDistinct(o, datasetName, t, vars[i].name).catch(() => null)) ?? 0;
          progress!.done++;
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, vars.length) }, worker));

      const variables = joinVariables(vars, counts.map((numDistinct) => ({ numDistinct })));
      Object.assign(wizard.data, {
        source: 'existing',
        owner: o,
        isOrganization,
        dataset: datasetName,
        table: t,
        datasetUrl: dataset.url ?? null,
        rows: table.numRows,
        fileName: null,
        columns: [],
        createdDataset: null,
        variables,
        variablesReviewed: false,
        released: true,
      });
      // keep an existing datapage's plots if it's the same table; otherwise
      // suggest plot variables for the new one
      const current = wizard.repo.current;
      const same =
        current?.redivis &&
        [current.redivis.user, current.redivis.dataset, current.redivis.table].join('.').toLowerCase() ===
          [o, datasetName, t].join('.').toLowerCase();
      wizard.plots.config = same && current.plot ? fitPlotConfig(current.plot, variables) : null;
      wizard.plots.reviewed = false;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = '';
      progress = null;
    }
  }
</script>

<div class="card stack">
  <div class="row owner-row">
    <label>
      Redivis owner
      <span class="hint">Your username, or an organization you belong to</span>
      <input type="text" bind:value={owner} disabled={!!loading} onkeydown={(e) => e.key === 'Enter' && loadDatasets()} />
    </label>
    <button class="secondary" onclick={loadDatasets} disabled={!owner.trim() || !!loading}>
      {loading === 'datasets' ? 'Loading…' : 'Show datasets'}
    </button>
  </div>

  {#if datasets}
    {#if datasets.length === 0}
      <p class="muted">{owner} has no datasets you can see.</p>
    {:else}
      <label>
        Dataset
        <select bind:value={datasetName} onchange={loadDataset} disabled={!!loading}>
          <option value="" disabled>Choose a dataset</option>
          {#each datasets as d (d.qualifiedReference)}
            <option value={ref(d)}>{d.name}{d.publicAccessLevel !== 'data' ? ' (not public)' : ''}</option>
          {/each}
        </select>
      </label>
    {/if}
  {/if}

  {#if loading === 'tables'}<p class="muted">Loading tables…</p>{/if}

  {#if dataset}
    {#if problems.length}
      <div class="notice warn stack">
        <ul>{#each problems as p (p)}<li>{p}</li>{/each}</ul>
        <div class="row">
          {#if dataset.url}<a href={dataset.url} target="_blank" rel="noopener">Open the dataset on Redivis</a>{/if}
          <button class="secondary" onclick={loadDataset} disabled={!!loading}>Check again</button>
        </div>
      </div>
    {/if}
    {#if tables.length}
      <label>
        Table
        <select bind:value={tableName} disabled={!!loading}>
          <option value="" disabled>Choose a table</option>
          {#each tables as t (t.uri)}
            <option value={referenceName(t.uri)}>{t.name}{t.numRows != null ? ` (${t.numRows.toLocaleString()} rows)` : ''}</option>
          {/each}
        </select>
      </label>
    {:else if dataset.currentVersion}
      <p class="muted">This dataset has no tables.</p>
    {/if}
  {/if}

  {#if progress}
    <p class="muted">Reading variables ({progress.done}/{progress.total})…</p>
    <progress value={progress.done} max={progress.total}></progress>
  {/if}
  {#if error}<div class="notice error">{error}</div>{/if}

  {#if dataset && tables.length}
    <div class="row">
      <button onclick={useTable} disabled={!table || problems.length > 0 || !!loading}>
        {loading === 'variables' ? 'Reading variables…' : 'Use this table'}
      </button>
    </div>
  {/if}
</div>

<style>
  .owner-row {
    align-items: flex-end;
  }
  .owner-row label {
    flex: 1 1 16rem;
  }
</style>
