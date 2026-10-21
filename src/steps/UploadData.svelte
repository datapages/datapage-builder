<script lang="ts">
  import { errorMessage, redivis } from '../lib/clients';
  import { analyzeCsv, formatBytes, type CsvAnalysis } from '../lib/csv';
  import { session, wizard } from '../lib/state.svelte';
  import { joinVariables } from '../lib/variables';

  type Status = 'pending' | 'active' | 'done' | 'failed';
  const TASKS = [
    { id: 'dataset', label: 'Create the dataset' },
    { id: 'table', label: 'Create the table' },
    { id: 'upload', label: 'Upload the file' },
    { id: 'import', label: 'Import it in Redivis' },
    { id: 'release', label: 'Release the dataset' },
    { id: 'variables', label: 'Read the variables' },
  ] as const;
  type TaskId = (typeof TASKS)[number]['id'];

  const NAME = /^[A-Za-z0-9_]+$/;

  let analysis = $state<CsvAnalysis | null>(null);
  let analyzing = $state(false);
  let acknowledged = $state(wizard.data.released);
  let running = $state(false);
  let error = $state('');
  let uploadFraction = $state<number | null>(null);
  let statuses = $state<Record<TaskId, Status>>(Object.fromEntries(TASKS.map((t) => [t.id, 'pending'])) as Record<TaskId, Status>);
  let current: TaskId | null = null;

  if (!wizard.data.owner && wizard.redivisUser) wizard.data.owner = wizard.redivisUser;

  const needsFile = $derived(!wizard.data.released && !session.file);
  const nameProblems = $derived(
    [
      !NAME.test(wizard.data.dataset) && 'The dataset name can only use letters, numbers, and underscores.',
      !NAME.test(wizard.data.table) && 'The table name can only use letters, numbers, and underscores.',
      !wizard.data.owner.trim() && 'Enter the Redivis account that will own the dataset.',
    ].filter(Boolean) as string[],
  );
  const canUpload = $derived(
    !running && !!session.file && !!analysis && analysis.errors.length === 0 && nameProblems.length === 0 && acknowledged,
  );

  function slug(fileName: string): string {
    const base = fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return base.slice(0, 60) || 'data';
  }

  async function pickFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    session.file = file;
    analysis = null;
    error = '';
    analyzing = true;
    try {
      analysis = await analyzeCsv(file);
      wizard.data.fileName = file.name;
      wizard.data.rows = analysis.rows;
      wizard.data.columns = analysis.columns.map(({ name, numDistinct }) => ({ name, numDistinct }));
      if (!wizard.data.createdDataset) {
        wizard.data.dataset = slug(file.name);
        wizard.data.table = slug(file.name);
      }
    } catch (e) {
      error = `Couldn't read the file: ${errorMessage(e)}`;
    } finally {
      analyzing = false;
    }
  }

  function start(id: TaskId) {
    current = id;
    statuses[id] = 'active';
  }

  function finish() {
    if (current) statuses[current] = 'done';
    current = null;
  }

  async function upload() {
    running = true;
    error = '';
    statuses = Object.fromEntries(TASKS.map((t) => [t.id, 'pending'])) as Record<TaskId, Status>;
    const { owner, dataset, table, isOrganization } = wizard.data;
    const ref = `${owner}.${dataset}`;
    // Redivis doesn't let browsers delete anything, so a failed import has to be cleaned up by hand
    const cleanupHint = () =>
      `Fix the file, then delete the table "${table}" in Redivis${wizard.data.datasetUrl ? ` (${wizard.data.datasetUrl})` : ''} and try again.`;

    try {
      const api = redivis();

      start('dataset');
      let ds = await api.getDataset(owner, dataset);
      if (ds && wizard.data.createdDataset !== ref) {
        throw new Error(`A dataset named "${dataset}" already exists for ${owner} on Redivis. Choose a different name.`);
      }
      ds ??= await api.createDataset(owner, dataset, { isOrganization });
      wizard.data.createdDataset = ref;
      wizard.data.datasetUrl = ds.url ?? null;
      finish();

      // skip ahead if an earlier attempt already released the table
      const releasedTable = ds.currentVersion && !ds.nextVersion ? await api.getTable(owner, dataset, table, 'current') : null;
      if (releasedTable) {
        for (const id of ['table', 'upload', 'import', 'release'] as const) statuses[id] = 'done';
      } else {
        await api.ensureNextVersion(owner, dataset);

        start('table');
        const t = (await api.getTable(owner, dataset, table)) ?? (await api.createTable(owner, dataset, table));
        finish();

        start('upload');
        const uploads = await api.listUploads(t.uri);
        let up =
          uploads.find((u) => u.status === 'completed') ??
          uploads.find((u) => ['created', 'queued', 'running'].includes(u.status));
        if (!up) {
          if (uploads.some((u) => u.status === 'failed')) throw new Error(`An earlier upload of this table failed. ${cleanupHint()}`);
          if (!session.file) throw new Error('Choose your CSV file again (the page was reloaded, so it was forgotten).');
          up = await api.uploadCsv(t.uri, session.file, (f) => (uploadFraction = f));
        }
        finish();

        start('import');
        up = await api.waitForUpload(up.uri);
        if (up.status === 'failed') throw new Error(`Redivis couldn't import the file: ${up.errorMessage ?? 'unknown error'}. ${cleanupHint()}`);
        finish();

        start('release');
        await api.release(owner, dataset);
        finish();
      }

      start('variables');
      const vars = await api.listVariables(owner, dataset, table, 'current');
      wizard.data.variables = joinVariables(vars, wizard.data.columns);
      wizard.data.source = 'upload';
      wizard.plots.config = null;
      wizard.plots.reviewed = false;
      wizard.data.variablesReviewed = false;
      wizard.data.released = true;
      finish();
    } catch (e) {
      if (current) statuses[current] = 'failed';
      current = null;
      error = errorMessage(e);
    } finally {
      running = false;
      uploadFraction = null;
    }
  }
</script>

<div class="stack">
  <div class="card stack">
    <label>
      CSV file
      <span class="hint">One table with a header row.</span>
      <input type="file" accept=".csv,text/csv" onchange={pickFile} disabled={running} />
    </label>
    {#if needsFile && wizard.data.fileName}
      <p class="muted">Choose <strong>{wizard.data.fileName}</strong> again to continue (the page was reloaded).</p>
    {/if}
    {#if analyzing}<p class="muted">Checking the file…</p>{/if}

    {#if analysis}
      <p>
        {analysis.rows.toLocaleString()} rows, {analysis.columns.length} columns, {formatBytes(analysis.bytes)}
      </p>
      {#if analysis.errors.length}
        <div class="notice error">
          This file needs fixing before it can be uploaded:
          <ul>
            {#each analysis.errors as e (e)}<li>{e}</li>{/each}
          </ul>
        </div>
      {/if}
      {#if analysis.sizeWarning}
        <div class="notice warn">{analysis.sizeWarning.message}</div>
      {/if}
    {/if}
  </div>

  {#if analysis && analysis.errors.length === 0}
    <div class="card stack">
      <div class="grid-2">
        <label>
          Redivis owner
          <span class="hint">Your username or organization</span>
          <input type="text" bind:value={wizard.data.owner} disabled={running || !!wizard.data.createdDataset} />
        </label>
        <label>
          Dataset name
          <span class="hint">Letters, numbers, and underscores</span>
          <input type="text" bind:value={wizard.data.dataset} disabled={running || !!wizard.data.createdDataset} />
        </label>
        <label>
          Table name
          <span class="hint">Letters, numbers, and underscores</span>
          <input type="text" bind:value={wizard.data.table} disabled={running || !!wizard.data.createdDataset} />
        </label>
      </div>
      {#if wizard.data.owner && wizard.data.owner !== wizard.redivisUser}
        <label class="checkbox">
          <input type="checkbox" bind:checked={wizard.data.isOrganization} disabled={running || !!wizard.data.createdDataset} />
          <span><strong>{wizard.data.owner}</strong> is an organization</span>
        </label>
      {/if}
      <label class="checkbox">
        <input type="checkbox" bind:checked={acknowledged} disabled={running} />
        <span>
          I understand this dataset will be <strong>public</strong>: anyone can view and download all of its data,
          on Redivis and on the datapage.
        </span>
      </label>
      {#if nameProblems.length}
        <div class="notice warn">
          <ul>
            {#each nameProblems as p (p)}<li>{p}</li>{/each}
          </ul>
        </div>
      {/if}
      <div class="row">
        <button onclick={upload} disabled={!canUpload}>{running ? 'Uploading…' : 'Upload to Redivis'}</button>
      </div>
    </div>
  {/if}

  {#if running || error || Object.values(statuses).some((s) => s !== 'pending')}
    <div class="card stack">
      <ul class="progress-list">
        {#each TASKS as t (t.id)}
          <li class={statuses[t.id]}>{t.label}</li>
        {/each}
      </ul>
      {#if uploadFraction !== null}
        <progress value={uploadFraction} max="1"></progress>
      {/if}
      {#if error}<div class="notice error">{error}</div>{/if}
    </div>
  {/if}
</div>
