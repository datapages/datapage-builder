<script lang="ts">
  import { onMount } from 'svelte';
  import { clearGitHubToken, getGitHubToken, signInWithGitHub } from '../lib/auth/github';
  import { clearRedivisToken, getRedivisToken, signInWithRedivis } from '../lib/auth/redivis';
  import { errorMessage } from '../lib/clients';
  import { GitHub } from '../lib/github';
  import { Redivis } from '../lib/redivis';
  import { wizard } from '../lib/state.svelte';

  let { onnext }: { onnext: () => void } = $props();

  let githubBusy = $state(false);
  let redivisBusy = $state(false);
  let githubError = $state('');
  let redivisError = $state('');

  // tokens live in sessionStorage, so a new tab or expired token means signing in again
  onMount(async () => {
    const gh = getGitHubToken();
    if (!gh) wizard.githubLogin = null;
    else new GitHub(gh).viewer().then((login) => (wizard.githubLogin = login)).catch(() => (wizard.githubLogin = null));
    const rv = getRedivisToken();
    if (!rv) wizard.redivisUser = null;
    else new Redivis(rv).me().then((u) => (wizard.redivisUser = u.name)).catch(() => (wizard.redivisUser = null));
  });

  async function connectGitHub() {
    githubBusy = true;
    githubError = '';
    try {
      wizard.githubLogin = await new GitHub(await signInWithGitHub()).viewer();
    } catch (e) {
      githubError = errorMessage(e);
    } finally {
      githubBusy = false;
    }
  }

  async function connectRedivis() {
    redivisBusy = true;
    redivisError = '';
    try {
      wizard.redivisUser = (await new Redivis(await signInWithRedivis()).me()).name;
    } catch (e) {
      redivisError = errorMessage(e);
    } finally {
      redivisBusy = false;
    }
  }
</script>

<section class="stack">
  <div>
    <h2>Connect your accounts</h2>
    <p class="muted">
      Your data goes to <a href="https://redivis.com" target="_blank" rel="noopener">Redivis</a>, and your site is
      built and hosted on GitHub. The builder works on your behalf in both from this browser tab only -- we don't store your credentials.
    </p>
  </div>

  <div class="grid-2">
    <div class="card stack">
      <h3>GitHub</h3>
      {#if wizard.githubLogin}
        <p>Signed in as <strong>{wizard.githubLogin}</strong>.</p>
        <button class="link" onclick={() => { clearGitHubToken(); wizard.githubLogin = null; }}>Sign out</button>
      {:else}
        <p class="muted">Used to create a public repo for your datapage and publish it with GitHub Pages.</p>
        <button onclick={connectGitHub} disabled={githubBusy}>{githubBusy ? 'Signing in…' : 'Sign in with GitHub'}</button>
      {/if}
      {#if githubError}<div class="notice error">{githubError}</div>{/if}
    </div>

    <div class="card stack">
      <h3>Redivis</h3>
      {#if wizard.redivisUser}
        <p>Signed in as <strong>{wizard.redivisUser}</strong>.</p>
        <button class="link" onclick={() => { clearRedivisToken(); wizard.redivisUser = null; }}>Sign out</button>
      {:else}
        <p class="muted">
          Used to create a public dataset and upload your data.
        </p>
        <button onclick={connectRedivis} disabled={redivisBusy}>{redivisBusy ? 'Signing in…' : 'Sign in with Redivis'}</button>
      {/if}
      {#if redivisError}<div class="notice error">{redivisError}</div>{/if}
    </div>
  </div>

  <button onclick={onnext} disabled={!wizard.githubLogin || !wizard.redivisUser}>Continue</button>
</section>
