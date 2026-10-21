<script lang="ts">
  import { onMount } from 'svelte';
  import { errorMessage, github } from '../lib/clients';
  import { CUSTOMIZED_FILES } from '../lib/customize';
  import { datapageProblems, readDatapage } from '../lib/datapage';
  import { startFromDatapage, wizard } from '../lib/state.svelte';

  let { onnext }: { onnext: () => void } = $props();

  const REPO_NAME = /^[A-Za-z0-9._-]+$/;

  let owners = $state<string[]>([]);
  let repos = $state<string[] | null>(null);
  let running = $state(false);
  let error = $state('');
  let problems = $state<string[]>([]);
  let progress = $state<string[]>([]);

  onMount(async () => {
    try {
      owners = await github().owners();
      if (!owners.includes(wizard.repo.owner)) wizard.repo.owner = owners[0];
      if (wizard.repo.source === 'existing' && !wizard.repo.created) await loadRepos();
    } catch (e) {
      error = errorMessage(e);
    }
  });

  const ref = $derived({ owner: wizard.repo.owner, repo: wizard.repo.name });
  const fullName = $derived(`${wizard.repo.owner}/${wizard.repo.name}`);
  const nameOk = $derived(REPO_NAME.test(wizard.repo.name) && !/^\.+$/.test(wizard.repo.name));
  const isDone = $derived(wizard.repo.created === fullName && wizard.repo.pagesEnabled);
  const existing = $derived(wizard.repo.source === 'existing');

  async function loadRepos() {
    repos = null;
    problems = [];
    error = '';
    try {
      // owners[0] is the signed-in user
      repos = await github().listRepos(wizard.repo.owner, wizard.repo.owner === owners[0]);
      if (!repos.includes(wizard.repo.name)) wizard.repo.name = '';
    } catch (e) {
      error = errorMessage(e);
    }
  }

  function chooseSource(source: 'new' | 'existing') {
    wizard.repo.source = source;
    wizard.repo.name = '';
    problems = [];
    error = '';
    progress = [];
    if (source === 'existing' && owners.length) loadRepos();
  }

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
        wizard.repo.current = null;
      }
      progress.push('Waiting for the template files to be copied');
      await gh.waitForContents(ref);
      await turnOnPages();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      running = false;
    }
  }

  async function useExisting() {
    running = true;
    error = '';
    problems = [];
    progress = [];
    try {
      const gh = github();
      progress.push(`Checking that ${fullName} is a datapage`);
      const repo = await gh.getRepo(ref);
      if (!repo) throw new Error(`Couldn't find ${fullName} on GitHub.`);
      const files = Object.fromEntries(await Promise.all(CUSTOMIZED_FILES.map(async (path) => [path, await gh.readFile(ref, path)])));
      problems = datapageProblems(repo, files);
      if (problems.length) {
        progress = [];
        return;
      }
      startFromDatapage(readDatapage(files, repo.html_url));
      wizard.repo.created = fullName;
      await turnOnPages();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      running = false;
    }
  }

  async function turnOnPages() {
    progress.push('Turning on GitHub Pages');
    try {
      await github().enablePages(ref);
    } catch (e: any) {
      if (e.status !== 403) throw e;
      throw new Error(
        `Turning on GitHub Pages needs admin access to ${fullName}. Ask an admin to set Settings → Pages → Source to "GitHub Actions", then try again.`,
      );
    }
    wizard.repo.pagesEnabled = true;
  }

  function chooseAgain() {
    wizard.repo.created = null;
    wizard.repo.pagesEnabled = false;
    wizard.repo.current = null;
    progress = [];
    if (owners.length) loadRepos();
  }
</script>

<section class="stack">
  <div>
    <h2>Set up your repo</h2>
    <p class="muted">
      Your datapage's code lives in a public GitHub repo made from the
      <a href="https://github.com/datapages/datapage" target="_blank" rel="noopener">datapage template</a>. Whenever
      the repo changes, GitHub Actions rebuilds the site and publishes it on GitHub Pages. Make a new one, or choose
      one you already have to change its data, plots, or pages.
    </p>
  </div>

  {#if isDone}
    <div class="card stack">
      <p>
        <a href={`https://github.com/${fullName}`} target="_blank" rel="noopener"><strong>{fullName}</strong></a> is ready.
        {#if existing}
          The next steps start from its current settings.
        {/if}
      </p>
      {#if existing && !wizard.customize.commitSha}
        <div><button class="link" onclick={chooseAgain}>Choose a different repo</button></div>
      {/if}
    </div>
    <button onclick={onnext}>Continue</button>
  {:else}
    {#if !wizard.repo.created}
      <div class="source-toggle" role="radiogroup" aria-label="Repo">
        <label class="checkbox">
          <input type="radio" name="repo-source" checked={!existing} onchange={() => chooseSource('new')} disabled={running} />
          <span><strong>Create a new repo</strong><span class="hint">Makes a new datapage from the template</span></span>
        </label>
        <label class="checkbox">
          <input type="radio" name="repo-source" checked={existing} onchange={() => chooseSource('existing')} disabled={running} />
          <span><strong>Use an existing datapage</strong><span class="hint">A repo made from the template, to edit it</span></span>
        </label>
      </div>
    {/if}

    <div class="card stack">
      <div class="grid-2">
        <label>
          Owner
          <span class="hint">Your account or one of your organizations</span>
          <select
            bind:value={wizard.repo.owner}
            onchange={() => existing && loadRepos()}
            disabled={running || !!wizard.repo.created || owners.length === 0}
          >
            {#each owners as o (o)}<option value={o}>{o}</option>{/each}
          </select>
        </label>
        {#if existing}
          <label>
            Repo
            <span class="hint">Repos you can push to</span>
            <select bind:value={wizard.repo.name} onchange={() => (problems = [])} disabled={running || !repos}>
              <option value="" disabled>{repos ? (repos.length ? 'Choose a repo' : 'No repos') : 'Loading…'}</option>
              {#each repos ?? [] as r (r)}<option value={r}>{r}</option>{/each}
            </select>
          </label>
        {:else}
          <label>
            Repo name
            <span class="hint">Your site will be at {wizard.repo.owner || 'owner'}.github.io/{wizard.repo.name || 'name'}</span>
            <input type="text" bind:value={wizard.repo.name} placeholder="my-datapage" disabled={running || !!wizard.repo.created} />
          </label>
        {/if}
      </div>
      {#if !existing && wizard.repo.name && !nameOk}
        <div class="notice warn">Repo names can only use letters, numbers, hyphens, underscores, and periods.</div>
      {/if}
      {#if problems.length}
        <div class="notice warn">
          This repo can't be used as a datapage:
          <ul>{#each problems as p (p)}<li>{p}</li>{/each}</ul>
        </div>
      {/if}
      <div class="row">
        {#if existing}
          <button onclick={useExisting} disabled={running || !wizard.repo.name || !wizard.repo.owner}>
            {running ? 'Checking…' : wizard.repo.created ? 'Finish setting up the repo' : 'Use this repo'}
          </button>
        {:else}
          <button onclick={create} disabled={running || !nameOk || !wizard.repo.owner}>
            {running ? 'Working…' : wizard.repo.created ? 'Finish setting up the repo' : 'Create repo'}
          </button>
        {/if}
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
