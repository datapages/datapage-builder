<script lang="ts">
  import { wizard } from '../lib/state.svelte';
  import ExistingData from './ExistingData.svelte';
  import UploadData from './UploadData.svelte';

  let { onnext }: { onnext: () => void } = $props();

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

<style>
  .source-toggle {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
  }
  .source-toggle label {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
    background: var(--surface);
    cursor: pointer;
  }
  .source-toggle label:has(input:checked) {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
</style>
