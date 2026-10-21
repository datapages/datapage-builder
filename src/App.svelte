<script lang="ts">
  import { STEPS, resetWizard, wizard, type StepId } from './lib/state.svelte';
  import ConnectStep from './steps/ConnectStep.svelte';
  import DataStep from './steps/DataStep.svelte';
  import RepoStep from './steps/RepoStep.svelte';
  import VariablesStep from './steps/VariablesStep.svelte';
  import PlotsStep from './steps/PlotsStep.svelte';
  import CustomizeStep from './steps/CustomizeStep.svelte';
  import PublishStep from './steps/PublishStep.svelte';

  const done: Record<StepId, () => boolean> = {
    connect: () => !!wizard.githubLogin && !!wizard.redivisUser,
    repo: () => !!wizard.repo.created && wizard.repo.pagesEnabled,
    data: () => wizard.data.released,
    variables: () => wizard.data.variablesReviewed,
    plots: () => wizard.plots.reviewed && !!wizard.plots.config,
    customize: () => !!wizard.customize.commitSha,
    publish: () => !!wizard.publish.siteUrl,
  };

  // a step is reachable once every step before it is done
  function reachable(index: number): boolean {
    return STEPS.slice(0, index).every((s) => done[s.id]());
  }

  function next() {
    const i = STEPS.findIndex((s) => s.id === wizard.step);
    if (i < STEPS.length - 1) wizard.step = STEPS[i + 1].id;
    window.scrollTo({ top: 0 });
  }

  function startOver() {
    if (confirm('Start over? This forgets your progress here, but anything already created on Redivis or GitHub stays.')) {
      resetWizard();
    }
  }
</script>

<div class="layout">
  <header>
    <h1>Datapage Builder</h1>
    <p class="muted">
      Turn a CSV into a <a href="https://datapages.github.io/datapage/" target="_blank" rel="noopener">datapage</a>: an
      interactive website for your data, hosted on GitHub Pages with the data on Redivis.
    </p>
  </header>

  <nav aria-label="Steps">
    <ol>
      {#each STEPS as s, i (s.id)}
        <li class:current={wizard.step === s.id} class:complete={done[s.id]()}>
          <button class="link" disabled={!reachable(i)} onclick={() => (wizard.step = s.id)}>
            <span class="num">{done[s.id]() ? '✓' : i + 1}</span>
            {s.title}
          </button>
        </li>
      {/each}
    </ol>
    <button class="link reset" onclick={startOver}>Start over</button>
  </nav>

  <main>
    {#if wizard.step === 'connect'}
      <ConnectStep onnext={next} />
    {:else if wizard.step === 'repo'}
      <RepoStep onnext={next} />
    {:else if wizard.step === 'data'}
      <DataStep onnext={next} />
    {:else if wizard.step === 'variables'}
      <VariablesStep onnext={next} />
    {:else if wizard.step === 'plots'}
      <PlotsStep onnext={next} />
    {:else if wizard.step === 'customize'}
      <CustomizeStep onnext={next} />
    {:else}
      <PublishStep />
    {/if}
  </main>
</div>

<style>
  .layout {
    max-width: 1080px;
    margin: 0 auto;
    padding: 1.5rem 16px 4rem;
    display: grid;
    grid-template-columns: 14rem minmax(0, 1fr);
    grid-template-areas: 'header header' 'nav main';
    gap: 1.5rem 2rem;
  }
  header {
    grid-area: header;
  }
  header h1 {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 800;
  }
  nav {
    grid-area: nav;
  }
  main {
    grid-area: main;
  }
  ol {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
  }
  li button {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0;
    color: var(--muted);
    text-align: left;
  }
  li.current button {
    color: var(--text);
    font-weight: 800;
  }
  .num {
    display: inline-grid;
    place-items: center;
    width: 1.7rem;
    height: 1.7rem;
    border-radius: 50%;
    border: 1px solid var(--border);
    font-size: 0.85rem;
    flex: none;
  }
  li.current .num {
    border-color: var(--accent);
    color: var(--accent);
  }
  li.complete .num {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }
  .reset {
    font-size: 0.9rem;
    color: var(--muted);
  }
  @media (max-width: 720px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: 'header' 'nav' 'main';
    }
    ol {
      display: flex;
      flex-wrap: wrap;
      gap: 0 1rem;
    }
  }
</style>
