<script lang="ts">
  import { isPlaceholder } from '../lib/datapage';
  import { wizard } from '../lib/state.svelte';
  import ExistingData from './ExistingData.svelte';
  import UploadData from './UploadData.svelte';

  let { onnext }: { onnext: () => void } = $props();

  // the table an existing datapage uses, unless it's still the template's example
  const current = $derived(
    wizard.repo.current?.redivis && !isPlaceholder(wizard.repo.current) ? wizard.repo.current.redivis : null,
  );

  function chooseAgain() {
    wizard.data.released = false;
    wizard.data.variablesReviewed = false;
  }
</script>

<section class="stack">
  <div>
    <h2>Choose your data</h2>
    <p class="muted">
      Your datapage reads a public table on Redivis, where visitors can also browse, query, and download it. Upload a
      CSV to make a new dataset, or use a table you already have on Redivis.
    </p>
  </div>

  {#if current && !wizard.data.released}
    <div class="notice info">
      Your datapage uses the table <strong>{current.table}</strong> in <strong>{current.user}.{current.dataset}</strong>
      now. It's chosen below: use it to keep it, or pick different data.
    </div>
  {/if}

  {#if wizard.data.released}
    <div class="card stack">
      <p>
        Your datapage will use the table <strong>{wizard.data.table}</strong> in
        <strong>{wizard.data.owner}.{wizard.data.dataset}</strong>{wizard.data.rows != null
          ? `, with ${wizard.data.rows.toLocaleString()} rows`
          : ''}.
      </p>
      <div class="row">
        {#if wizard.data.datasetUrl}
          <a href={wizard.data.datasetUrl} target="_blank" rel="noopener">View it on Redivis</a>
        {/if}
        {#if !wizard.customize.commitSha}
          <button class="link" onclick={chooseAgain}>Choose different data</button>
        {/if}
      </div>
    </div>
    <button onclick={onnext}>Continue</button>
  {:else}
    <div class="source-toggle" role="radiogroup" aria-label="Data source">
      <label class="checkbox">
        <input type="radio" name="source" value="upload" bind:group={wizard.data.source} />
        <span><strong>Upload a CSV</strong><span class="hint">Creates a new public dataset on Redivis</span></span>
      </label>
      <label class="checkbox">
        <input type="radio" name="source" value="existing" bind:group={wizard.data.source} />
        <span><strong>Use an existing Redivis table</strong><span class="hint">From a released, public dataset</span></span>
      </label>
    </div>

    {#if wizard.data.source === 'upload'}
      <UploadData />
    {:else}
      <ExistingData />
    {/if}
  {/if}
</section>

