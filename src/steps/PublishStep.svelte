<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { errorMessage, github } from '../lib/clients';
  import type { WorkflowRun } from '../lib/github';
  import { wizard } from '../lib/state.svelte';

  const POLL_MS = 10_000;

  let run = $state<WorkflowRun | null>(null);
  let error = $state('');
  let startedAt = Date.now();
  let elapsed = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;

  const ref = { owner: wizard.repo.owner, repo: wizard.repo.name };
  const repoUrl = `https://github.com/${ref.owner}/${ref.repo}`;

  onMount(() => {
    ticker = setInterval(() => (elapsed = Math.round((Date.now() - startedAt) / 1000)), 1000);
    if (!wizard.publish.siteUrl) poll();
  });

  onDestroy(() => {
    clearTimeout(timer);
    clearInterval(ticker);
  });

  async function poll() {
    try {
      const gh = github();
      run = await gh.findRun(ref, wizard.customize.commitSha!);
      if (run?.status === 'completed') {
        if (run.conclusion === 'success') {
          const url = (await gh.pagesUrl(ref)) ?? `https://${ref.owner.toLowerCase()}.github.io/${ref.repo}/`;
          await gh.setHomepage(ref, url);
          wizard.publish.siteUrl = url;
        }
        clearInterval(ticker);
        return;
      }
      error = '';
    } catch (e) {
      error = errorMessage(e);
    }
    timer = setTimeout(poll, POLL_MS);
  }

  async function rerun() {
    if (!run) return;
    try {
      await github().octokit.rest.actions.reRunWorkflowFailedJobs({ ...ref, run_id: run.id });
      run = { ...run, status: 'queued', conclusion: null };
      startedAt = Date.now();
      clearInterval(ticker);
      ticker = setInterval(() => (elapsed = Math.round((Date.now() - startedAt) / 1000)), 1000);
      timer = setTimeout(poll, POLL_MS);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  function formatElapsed(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
</script>

<section class="stack">
  <div>
    <h2>Publish</h2>
    <p class="muted">GitHub Actions is building your datapage: installing R packages, loading your data, and rendering the site.</p>
  </div>

  {#if wizard.publish.siteUrl}
    <div class="card stack">
      <p><strong>Your datapage is live! 🎉</strong></p>
      <p><a class="button" href={wizard.publish.siteUrl} target="_blank" rel="noopener">Open {wizard.publish.siteUrl}</a></p>
      <p class="muted">It can take a minute after publishing before the new version shows up.</p>
    </div>

    <div class="card stack">
      <h3>Next steps</h3>
      <p>
        Everything about your datapage lives in <a href={repoUrl} target="_blank" rel="noopener">{ref.owner}/{ref.repo}</a>,
        and every change you push there rebuilds the site. Its
        <a href={`${repoUrl}#readme`} target="_blank" rel="noopener">README</a> lists which file controls what. A few
        things you might do next:
      </p>
      <ul>
        <li>
          <strong>Update the data:</strong>
          {wizard.data.kind === 'workflow' ? 'rerun the workflow' : 'release a new version of the dataset'} on Redivis,
          then rebuild the site by
          running the "Render and Publish" workflow from the repo's
          <a href={`${repoUrl}/actions`} target="_blank" rel="noopener">Actions tab</a>.
        </li>
        <li>
          <strong>Document the {wizard.data.kind} on Redivis</strong>{#if wizard.data.datasetUrl}{' '}(<a href={wizard.data.datasetUrl} target="_blank" rel="noopener">open it</a>){/if}:
          add a description{wizard.data.kind === 'workflow' ? ' and methodology' : ', methodology, and citation'}. Variable labels and descriptions can be edited there too.
        </li>
        <li>
          <strong>Change the plots:</strong> edit <code>_config.yml</code> to choose which variables can be plotted
          and the defaults.
        </li>
        <li>
          <strong>Change the pages or images:</strong> edit <code>index.qmd</code> and <code>about.qmd</code>.
          {#if wizard.customize.images.highlight || wizard.customize.images.icon}
            To swap an image, replace the file in <code>images/</code>.
          {:else}
            To add a highlight image or icon, put it in <code>images/</code> and reference it from those files (or
            <code>_quarto.yml</code> for the navbar logo).
          {/if}
        </li>
        <li>
          <strong>Work on it locally:</strong> clone the repo, run <code>renv::restore()</code> in R, then
          <code>quarto preview</code>.
        </li>
      </ul>
    </div>
  {:else}
    <div class="card stack">
      {#if !run}
        <p>Waiting for the build to start… <span class="muted">{formatElapsed(elapsed)}</span></p>
      {:else if run.status !== 'completed'}
        <p>Building ({run.status?.replace('_', ' ')})… <span class="muted">{formatElapsed(elapsed)}</span></p>
        <p class="muted">The first build usually takes 5–15 minutes. You can leave this page open, or come back later.</p>
        <p><a href={run.htmlUrl} target="_blank" rel="noopener">Watch the build on GitHub</a></p>
      {:else}
        <div class="notice error stack">
          <p>The build failed ({run.conclusion}).</p>
          <p>
            <a href={run.htmlUrl} target="_blank" rel="noopener">See what went wrong in the build log</a>. If it looks
            like a temporary problem, try again.
          </p>
          <div class="row"><button onclick={rerun}>Try the build again</button></div>
        </div>
      {/if}
      {#if error}<div class="notice error">{error}</div>{/if}
    </div>
  {/if}
</section>
