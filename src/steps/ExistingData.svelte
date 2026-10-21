<script lang="ts">
  import { onMount } from 'svelte';
  import { errorMessage, redivis } from '../lib/clients';
  import { referenceName, tablePageUrl, tableRef, type Dataset, type Table, type Workflow } from '../lib/redivis';
  import { wizard } from '../lib/state.svelte';
  import { fitPlotConfig, joinVariables } from '../lib/variables';

  // statistics requests run in parallel, a few at a time
  const CONCURRENCY = 6;

  type Kind = 'dataset' | 'workflow';
  /** a dataset or workflow in the owner's list */
  interface Container {
    name: string;
    qualifiedReference: string;
    isPublic: boolean;
  }

  let kind = $state<Kind>(wizard.data.source === 'existing' ? wizard.data.kind : 'dataset');
  let owner = $state(wizard.data.owner || wizard.redivisUser || '');
  let isOrganization = $state(false);
  let containers = $state<Container[] | null>(null);
  let containerName = $state('');
  let dataset = $state<Dataset | null>(null);
  let workflow = $state<Workflow | null>(null);
  let tables = $state<Table[]>([]);
  let tableName = $state('');
  let loading = $state('');
  let error = $state('');
  let progress = $state<{ done: number; total: number } | null>(null);

  const noun = $derived(kind === 'dataset' ? 'dataset' : 'workflow');
  const chosen = $derived(kind === 'dataset' ? dataset : workflow);
  const problems = $derived.by(() => {
    if (dataset) {
      return [
        !dataset.currentVersion && "This dataset hasn't been released yet. Release a version on Redivis first.",
        dataset.publicAccessLevel !== 'data' &&
          `Your datapage reads the data without signing in, so the dataset's public access level must be "Data" (it's "${dataset.publicAccessLevel ?? 'none'}"). Change it in the dataset's settings on Redivis, then check again.`,
      ].filter(Boolean) as string[];
    }
    if (workflow && workflow.publicAccessLevel !== 'view') {
      return [
        "Your datapage reads the data without signing in, so anyone must be able to view the workflow. Make it public in the workflow's sharing settings on Redivis, then check again.",
      ];
    }
    return [];
  });
  // names hold reference names, which the API and the template use
  const table = $derived(tables.find((t) => referenceName(t.uri) === tableName) ?? null);

  onMount(() => {
    if (owner) loadContainers();
  });

  function chooseKind(k: Kind) {
    kind = k;
    if (owner.trim()) loadContainers();
  }

  async function loadContainers() {
    loading = 'containers';
    error = '';
    containers = null;
    containerName = '';
    dataset = null;
    workflow = null;
    tables = [];
    try {
      const api = redivis();
      const o = owner.trim();
      if (kind === 'dataset') {
        const res = await api.listDatasets(o);
        isOrganization = res.isOrganization;
        containers = res.datasets.map((d) => ({ name: d.name, qualifiedReference: d.qualifiedReference, isPublic: d.publicAccessLevel === 'data' }));
      } else {
        const res = await api.listWorkflows(o);
        containers = res.map((w) => ({ name: w.name, qualifiedReference: w.qualifiedReference, isPublic: w.publicAccessLevel === 'view' }));
      }
      containers.sort((a, b) => a.name.localeCompare(b.name));
      const saved = wizard.data;
      if (saved.source === 'existing' && saved.kind === kind && saved.owner === owner && containers.some((c) => ref(c) === saved.dataset)) {
        containerName = saved.dataset;
        await loadContainer();
      }
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = '';
    }
  }

  const ref = (c: Container) => referenceName(c.qualifiedReference);

  async function loadContainer() {
    if (!containerName) return;
    loading = 'tables';
    error = '';
    tables = [];
    tableName = '';
    try {
      const api = redivis();
      const o = owner.trim();
      if (kind === 'dataset') {
        dataset = await api.getDataset(o, containerName);
        tables = dataset?.currentVersion ? await api.listTables(o, containerName) : [];
      } else {
        workflow = await api.getWorkflow(o, containerName);
        tables = workflow ? await api.listWorkflowTables(o, containerName) : [];
      }
      if (tables.length === 1) tableName = referenceName(tables[0].uri);
      else if (tables.some((t) => referenceName(t.uri) === wizard.data.table)) tableName = wizard.data.table;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = '';
    }
  }

  async function useTable() {
    if (!chosen || !table) return;
    loading = 'variables';
    error = '';
    try {
      const api = redivis();
      const o = owner.trim();
      const t = referenceName(table.uri);
      const version = kind === 'dataset' ? 'current' : null;
      // a public workflow only shows data its viewers can access, so check
      // that the build, which doesn't sign in, can read the rows
      if (kind === 'workflow' && !(await api.isPubliclyReadable(tableRef(o, containerName, t, null)))) {
        throw new Error(
          "This table's data can't be read without signing in, which your datapage needs. Check that the datasets the workflow uses have public data access.",
        );
      }
      const vars = await api.listVariables(o, containerName, t, version);
      progress = { done: 0, total: vars.length };
      const counts: number[] = new Array(vars.length).fill(0);
      let next = 0;
      async function worker() {
        while (next < vars.length) {
          const i = next++;
          counts[i] = (await api.numDistinct(o, containerName, t, vars[i].name, version).catch(() => null)) ?? 0;
          progress!.done++;
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, vars.length) }, worker));

      const variables = joinVariables(vars, counts.map((numDistinct) => ({ numDistinct })));
      Object.assign(wizard.data, {
        source: 'existing',
        owner: o,
        isOrganization,
        kind,
        dataset: containerName,
        table: t,
        datasetUrl: chosen.url ?? null,
        tableUrl: tablePageUrl(table),
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
      const current = wizard.repo.current?.redivis;
      const same =
        current &&
        [current.user, current.dataset ? 'dataset' : 'workflow', current.dataset ?? current.workflow, current.table].join('.').toLowerCase() ===
          [o, kind, containerName, t].join('.').toLowerCase();
      wizard.plots.config = same && wizard.repo.current?.plot ? fitPlotConfig(wizard.repo.current.plot, variables) : null;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = '';
      progress = null;
    }
  }
</script>

<div class="card stack">
  <div class="kind-toggle" role="radiogroup" aria-label="Table from">
    <label class="checkbox">
      <input type="radio" name="kind" checked={kind === 'dataset'} onchange={() => chooseKind('dataset')} disabled={!!loading} />
      <span>A dataset table</span>
    </label>
    <label class="checkbox">
      <input type="radio" name="kind" checked={kind === 'workflow'} onchange={() => chooseKind('workflow')} disabled={!!loading} />
      <span>A workflow output table</span>
    </label>
  </div>

  <div class="row owner-row">
    <label>
      Redivis owner
      <span class="hint">Your username, or an organization you belong to</span>
      <input type="text" bind:value={owner} disabled={!!loading} onkeydown={(e) => e.key === 'Enter' && loadContainers()} />
    </label>
    <button class="secondary" onclick={loadContainers} disabled={!owner.trim() || !!loading}>
      {loading === 'containers' ? 'Loading…' : `Show ${noun}s`}
    </button>
  </div>

  {#if containers}
    {#if containers.length === 0}
      <p class="muted">{owner} has no {noun}s you can see.</p>
    {:else}
      <label>
        {kind === 'dataset' ? 'Dataset' : 'Workflow'}
        <select bind:value={containerName} onchange={loadContainer} disabled={!!loading}>
          <option value="" disabled>Choose a {noun}</option>
          {#each containers as c (c.qualifiedReference)}
            <option value={ref(c)}>{c.name}{c.isPublic ? '' : ' (not public)'}</option>
          {/each}
        </select>
      </label>
    {/if}
  {/if}

  {#if loading === 'tables'}<p class="muted">Loading tables…</p>{/if}

  {#if chosen}
    {#if problems.length}
      <div class="notice warn stack">
        <ul>{#each problems as p (p)}<li>{p}</li>{/each}</ul>
        <div class="row">
          {#if chosen.url}<a href={chosen.url} target="_blank" rel="noopener">Open the {noun} on Redivis</a>{/if}
          <button class="secondary" onclick={loadContainer} disabled={!!loading}>Check again</button>
        </div>
      </div>
    {/if}
    {#if tables.length}
      <label>
        Table
        {#if kind === 'workflow'}<span class="hint">The workflow's output tables</span>{/if}
        <select bind:value={tableName} disabled={!!loading}>
          <option value="" disabled>Choose a table</option>
          {#each tables as t (t.uri)}
            <option value={referenceName(t.uri)}>{t.name}{t.numRows != null ? ` (${t.numRows.toLocaleString()} rows)` : ''}</option>
          {/each}
        </select>
      </label>
    {:else if kind === 'workflow' || dataset?.currentVersion}
      <p class="muted">This {noun} has no tables{kind === 'workflow' ? ' yet. Run its transforms on Redivis first' : ''}.</p>
    {/if}
  {/if}

  {#if progress}
    <p class="muted">Reading variables ({progress.done}/{progress.total})…</p>
    <progress value={progress.done} max={progress.total}></progress>
  {/if}
  {#if error}<div class="notice error">{error}</div>{/if}

  {#if chosen && tables.length}
    <div class="row">
      <button onclick={useTable} disabled={!table || problems.length > 0 || !!loading}>
        {loading === 'variables' ? 'Reading variables…' : 'Use this table'}
      </button>
    </div>
  {/if}
</div>

<style>
  .kind-toggle {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
  }
  .owner-row {
    align-items: flex-end;
  }
  .owner-row label {
    flex: 1 1 16rem;
  }
</style>
