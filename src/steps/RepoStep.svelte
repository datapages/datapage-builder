<script lang="ts">
  import { onMount } from 'svelte';
  import { errorMessage, github } from '../lib/clients';
  import { wizard } from '../lib/state.svelte';

  let { onnext }: { onnext: () => void } = $props();

  const REPO_NAME = /^[A-Za-z0-9._-]+$/;

  let owners = $state<string[]>([]);
  let running = $state(false);
  let error = $state('');
  let progress = $state<string[]>([]);

  onMount(async () => {
    try {
      owners = await github().owners();
      if (!owners.includes(wizard.repo.owner)) wizard.repo.owner = owners[0];
    } catch (e) {
      error = errorMessage(e);
    }
  });

  const ref = $derived({ owner: wizard.repo.owner, repo: wizard.repo.name });
  const fullName = $derived(`${wizard.repo.owner}/${wizard.repo.name}`);
  const nameOk = $derived(REPO_NAME.test(wizard.repo.name) && !/^\.+$/.test(wizard.repo.name));
  const isDone = $derived(wizard.repo.created === fullName && wizard.repo.pagesEnabled);

  async function create() {
    running = true;
    error = '';
    progress = [];
    try {
      const gh = github();
      if (wizard.repo.created !== fullName) {
        if (await gh.getRepo(ref)) throw new Error(`${fullName} already exists on GitHub. Choose a different name.`);
        progress.push('Creating the repo from the datapage template');
        // the description is set to the datapage's title when it's customized
        await gh.createFromTemplate(ref, '');
        wizard.repo.created = fullName;
      }
      progress.push('Waiting for the template files to be copied');
      await gh.waitForContents(ref);
      progress.push('Turning on GitHub Pages');
      await gh.enablePages(ref);
      wizard.repo.pagesEnabled = true;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      running = false;
    }
  }
</script>

<section class="stack">
  <div>
    <h2>Create your repo</h2>
    <p class="muted">
      Your datapage's code lives in a public GitHub repo made from the
      <a href="https://github.com/datapages/datapage" target="_blank" rel="noopener">datapage template</a>. Whenever
      the repo changes, GitHub Actions rebuilds the site and publishes it on GitHub Pages.
    </p>
  </div>

  {#if isDone}
    <div class="card">
      <p>
        <a href={`https://github.com/${fullName}`} target="_blank" rel="noopener"><strong>{fullName}</strong></a> is ready.
      </p>
    </div>
    <button onclick={onnext}>Continue</button>
  {:else}
    <div class="card stack">
      <div class="grid-2">
        <label>
          Owner
          <span class="hint">Your account or one of your organizations</span>
          <select bind:value={wizard.repo.owner} disabled={running || !!wizard.repo.created || owners.length === 0}>
            {#each owners as o (o)}<option value={o}>{o}</option>{/each}
          </select>
        </label>
        <label>
          Repo name
          <span class="hint">Your site will be at {wizard.repo.owner || 'owner'}.github.io/{wizard.repo.name || 'name'}</span>
          <input type="text" bind:value={wizard.repo.name} placeholder="my-datapage" disabled={running || !!wizard.repo.created} />
        </label>
      </div>
      {#if wizard.repo.name && !nameOk}
        <div class="notice warn">Repo names can only use letters, numbers, hyphens, underscores, and periods.</div>
      {/if}
      <div class="row">
        <button onclick={create} disabled={running || !nameOk || !wizard.repo.owner}>
          {running ? 'Working…' : wizard.repo.created ? 'Finish setting up the repo' : 'Create repo'}
        </button>
      </div>
      {#if progress.length}
        <ul class="progress-list">
          {#each progress as p, i (p)}
            <li class={i < progress.length - 1 || (!running && !error) ? 'done' : error ? 'failed' : 'active'}>{p}</li>
          {/each}
        </ul>
      {/if}
      {#if error}<div class="notice error">{error}</div>{/if}
    </div>
  {/if}
</section>
