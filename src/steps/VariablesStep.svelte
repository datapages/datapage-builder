<script lang="ts">
  import { onMount } from 'svelte';
  import { errorMessage, redivis } from '../lib/clients';
  import { wizard } from '../lib/state.svelte';
  import { variableUpdates } from '../lib/variables';

  let { onnext }: { onnext: () => void } = $props();

  // Redivis's limits
  const MAX_LABEL = 256;
  const MAX_DESCRIPTION = 5000;

  let drafts = $state(
    wizard.data.variables.map((v) => ({ name: v.name, type: v.type, label: v.label ?? '', description: v.description ?? '' })),
  );
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');

  const updates = $derived(variableUpdates(wizard.data.variables, drafts));

  // fill the fields with what's on Redivis now, which may have changed since
  // the data was chosen (e.g. edited on Redivis, or saved here earlier)
  onMount(async () => {
    try {
      const current = await redivis().listVariables(wizard.data.owner, wizard.data.dataset, wizard.data.table, 'current');
      for (const v of wizard.data.variables) {
        const fresh = current.find((c) => c.name === v.name);
        if (fresh) Object.assign(v, { label: fresh.label, description: fresh.description });
      }
      drafts = wizard.data.variables.map((v) => ({ name: v.name, type: v.type, label: v.label ?? '', description: v.description ?? '' }));
    } catch (e) {
      error = `Couldn't load the current labels and descriptions from Redivis: ${errorMessage(e)}`;
    } finally {
      loading = false;
    }
  });

  async function save() {
    saving = true;
    error = '';
    try {
      if (updates.length) {
        await redivis().updateVariables(wizard.data.owner, wizard.data.dataset, wizard.data.table, updates);
        for (const { name, ...fields } of updates) {
          const v = wizard.data.variables.find((v) => v.name === name);
          if (v) Object.assign(v, fields);
        }
      }
      wizard.data.variablesReviewed = true;
      onnext();
    } catch (e) {
      error = `Couldn't save to Redivis: ${errorMessage(e)}`;
    } finally {
      saving = false;
    }
  }

  function skip() {
    wizard.data.variablesReviewed = true;
    onnext();
  }
</script>

<section class="stack">
  <div>
    <h2>Describe your variables</h2>
    <p class="muted">
      Labels and descriptions are saved to your table on Redivis, where they document the data for anyone who finds
      it. Your datapage shows labels in its plot menus. Everything here is optional, and you can edit it on Redivis
      later.
    </p>
  </div>

  {#if loading}<p class="muted">Loading the current labels and descriptions…</p>{/if}
  <div class="card" class:loading>
    <div class="var-grid head" aria-hidden="true">
      <span>Variable</span><span>Label</span><span>Description</span>
    </div>
    {#each drafts as d (d.name)}
      <div class="var-grid">
        <div class="var-name">
          <code>{d.name}</code>
          <span class="muted">{d.type}</span>
        </div>
        <input type="text" bind:value={d.label} maxlength={MAX_LABEL} placeholder="Short, readable name" aria-label={`Label for ${d.name}`} disabled={loading} />
        <textarea bind:value={d.description} maxlength={MAX_DESCRIPTION} rows="1" placeholder="What it measures, units, how it was collected…" aria-label={`Description of ${d.name}`} disabled={loading}></textarea>
      </div>
    {/each}
  </div>

  {#if error}<div class="notice error">{error}</div>{/if}
  <div class="row">
    <button onclick={save} disabled={saving || loading}>
      {saving ? 'Saving…' : updates.length ? `Save ${updates.length} ${updates.length === 1 ? 'variable' : 'variables'} and continue` : 'Continue'}
    </button>
    {#if updates.length}
      <button class="link" onclick={skip} disabled={saving}>Skip without saving</button>
    {/if}
  </div>
</section>

<style>
  .card.loading {
    opacity: 0.6;
  }
  .var-grid {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) minmax(10rem, 1.5fr) minmax(12rem, 2.5fr);
    gap: 0.5rem 0.75rem;
    align-items: start;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
  }
  .var-grid:last-child {
    border-bottom: none;
  }
  .var-grid.head {
    font-weight: 700;
    padding-top: 0;
  }
  .var-grid input,
  .var-grid textarea {
    margin-top: 0;
  }
  /* one line tall, like the label input; people can drag it taller */
  .var-grid textarea {
    min-height: 0;
    height: auto;
    display: block;
  }
  .var-name {
    display: flex;
    flex-direction: column;
    padding-top: 0.4rem;
    overflow-wrap: anywhere;
  }
  .var-name .muted {
    font-size: 0.85rem;
  }
  @media (max-width: 720px) {
    .var-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .var-grid.head {
      display: none;
    }
  }
</style>
