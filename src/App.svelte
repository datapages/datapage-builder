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

  const THEME_KEY = 'datapage-builder:theme';
  // what the CSS picked, from the saved choice or the system setting
  let theme = $state(getComputedStyle(document.documentElement).colorScheme === 'dark' ? 'dark' : 'light');

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore, the choice just won't be remembered
    }
  }

  function startOver() {
    if (confirm('Start over? This forgets your progress here, but anything already created on Redivis or GitHub stays.')) {
      resetWizard();
    }
  }
</script>

<div class="layout">
  <header>
    <img class="logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width="88" height="88" />
    <div>
      <h1>Datapage Builder</h1>
      <p class="muted">
        Create a <a href="https://datapages.github.io/datapage/" target="_blank" rel="noopener">datapage</a>: an
        interactive website for your data, hosted on GitHub Pages with the data on Redivis.
      </p>
    </div>
    <div class="theme-toggle">
      <i class="bi bi-sun" aria-hidden="true"></i>
      <button class="switch" role="switch" aria-checked={theme === 'dark'} aria-label="Dark mode" onclick={toggleTheme}>
        <span class="knob"></span>
      </button>
      <i class="bi bi-moon-stars" aria-hidden="true"></i>
    </div>
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
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  header p {
    margin-bottom: 0;
  }
  .logo {
    flex: none;
  }
  .theme-toggle {
    flex: none;
    align-self: flex-start;
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
    font-size: 0.95rem;
  }
  .switch {
    position: relative;
    width: 2.6rem;
    height: 1.5rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--border);
  }
  .switch[aria-checked='true'] {
    background: var(--accent);
    border-color: var(--accent);
  }
  .knob {
    position: absolute;
    top: 50%;
    left: 0.15rem;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    transform: translateY(-50%);
    transition: left 0.15s ease;
  }
  .switch[aria-checked='true'] .knob {
    left: calc(100% - 1.25rem);
  }
  @media (prefers-reduced-motion: reduce) {
    .knob {
      transition: none;
    }
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
    .logo {
      width: 64px;
      height: 64px;
    }
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
