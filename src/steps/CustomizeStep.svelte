<script lang="ts">
  import { errorMessage, github } from '../lib/clients';
  import { CUSTOMIZED_FILES, customizeFiles } from '../lib/customize';
  import { fetchCitation } from '../lib/doi';
  import { wizard } from '../lib/state.svelte';
  import { plotConfigProblems, suggestPlotConfig } from '../lib/variables';

  let { onnext }: { onnext: () => void } = $props();

  // icons from Bootstrap Icons, which Quarto's about pages use
  const LINK_ICONS = ['globe', 'file-text', 'journal-text', 'book', 'github', 'envelope', 'database'];

  const c = wizard.customize;
  if (!c.title) c.title = humanize(wizard.data.dataset);
  if (!c.plot) c.plot = suggestPlotConfig(wizard.data.variables);
  const plot = c.plot!;

  let lookingUp = $state(false);
  let doiError = $state('');
  let committing = $state(false);
  let error = $state('');

  const problems = $derived([...(c.title.trim() ? [] : ['Give your datapage a title.']), ...plotConfigProblems(plot)]);

  function humanize(name: string): string {
    return name.replace(/_+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()).trim();
  }

  function role(name: string): 'numerical' | 'categorical' | 'none' {
    if (plot.numerical.includes(name)) return 'numerical';
    if (plot.categorical.includes(name)) return 'categorical';
    return 'none';
  }

  function setRole(name: string, value: string) {
    plot.numerical = plot.numerical.filter((n) => n !== name);
    plot.categorical = plot.categorical.filter((n) => n !== name);
    if (value === 'numerical') plot.numerical.push(name);
    if (value === 'categorical') plot.categorical.push(name);
    // keep the defaults pointing at variables that can still be used
    const d = plot.defaults;
    if (!plot.numerical.includes(d.x)) d.x = plot.numerical.find((n) => n !== d.y) ?? '';
    if (!plot.numerical.includes(d.y)) d.y = plot.numerical.find((n) => n !== d.x) ?? '';
    if (!plot.categorical.includes(d.color)) d.color = plot.categorical[0] ?? '';
  }

  async function lookUpDoi() {
    lookingUp = true;
    doiError = '';
    try {
      c.citation = await fetchCitation(c.doi);
    } catch (e) {
      doiError = errorMessage(e);
    } finally {
      lookingUp = false;
    }
  }

  async function commit() {
    committing = true;
    error = '';
    try {
      const gh = github();
      const ref = { owner: wizard.repo.owner, repo: wizard.repo.name };
      const files = await gh.readFiles(ref, CUSTOMIZED_FILES);
      const customized = customizeFiles(files, {
        title: c.title.trim(),
        subtitle: c.subtitle,
        description: c.description,
        redivis: { user: wizard.data.owner, dataset: wizard.data.dataset, table: wizard.data.table },
        plot,
        repoUrl: `https://github.com/${ref.owner}/${ref.repo}`,
        links: c.links,
        citation: c.citation,
        primaryColor: c.primaryColor,
      });
      const changed = Object.fromEntries(Object.entries(customized).filter(([path, text]) => text !== files[path as keyof typeof files]));
      c.commitSha = await gh.commitFiles(ref, changed, `Customize datapage for ${wizard.data.owner}.${wizard.data.dataset}`);
      wizard.publish.siteUrl = null;
      onnext();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      committing = false;
    }
  }
</script>

<section class="stack">
  <div>
    <h2>Customize your datapage</h2>
    <p class="muted">
      These go into your repo's files. You can change them, and everything else, by editing the repo later.
    </p>
  </div>

  <div class="card stack">
    <h3>Homepage</h3>
    <label>Title <input type="text" bind:value={c.title} /></label>
    <label>Subtitle <span class="hint">Optional, one line</span><input type="text" bind:value={c.subtitle} /></label>
    <label>
      Description
      <span class="hint">Optional. Shown on the homepage and the About page. Markdown links work: [text](https://…)</span>
      <textarea bind:value={c.description}></textarea>
    </label>
    <label>
      Main color
      <span class="hint">Used for the navigation bar and links</span>
      <input type="color" bind:value={c.primaryColor} />
    </label>
  </div>

  <div class="card stack">
    <h3>Plot variables</h3>
    <p class="muted">
      The homepage scatter plot lets visitors put numerical variables on the axes and color points by a categorical
      variable. These are guessed from your data: numbers with many distinct values are numerical, and anything with
      2–10 values is categorical.
    </p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Variable</th><th>Type</th><th>Distinct values</th><th>Use as</th></tr></thead>
        <tbody>
          {#each wizard.data.variables as v (v.name)}
            <tr>
              <td>{v.name}</td>
              <td>{v.type}</td>
              <td>{v.numDistinct > 1000 ? '1000+' : v.numDistinct}</td>
              <td>
                <select value={role(v.name)} onchange={(e) => setRole(v.name, e.currentTarget.value)} aria-label={`Use ${v.name} as`}>
                  <option value="numerical">Numerical</option>
                  <option value="categorical">Categorical</option>
                  <option value="none">Not in plots</option>
                </select>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="grid-2">
      <label>Default x axis
        <select bind:value={plot.defaults.x}>{#each plot.numerical as n (n)}<option value={n}>{n}</option>{/each}</select>
      </label>
      <label>Default y axis
        <select bind:value={plot.defaults.y}>{#each plot.numerical as n (n)}<option value={n}>{n}</option>{/each}</select>
      </label>
      <label>Default color
        <select bind:value={plot.defaults.color}>{#each plot.categorical as n (n)}<option value={n}>{n}</option>{/each}</select>
      </label>
    </div>
  </div>

  <div class="card stack">
    <h3>About page</h3>
    <label>
      Citation DOI
      <span class="hint">Optional. A paper or dataset people should cite, e.g. 10.1371/journal.pone.0090081</span>
      <span class="row">
        <input type="text" bind:value={c.doi} style="flex: 1" />
        <button class="secondary" onclick={lookUpDoi} disabled={!c.doi.trim() || lookingUp}>{lookingUp ? 'Looking up…' : 'Look up'}</button>
      </span>
    </label>
    {#if doiError}<div class="notice error">{doiError}</div>{/if}
    {#if c.citation}
      <p>
        {c.citation.author?.join(', ')}{c.citation.issued ? ` (${c.citation.issued})` : ''}. <em>{c.citation.title}</em>{c.citation['container-title'] ? `. ${c.citation['container-title']}` : ''}.
        <button class="link" onclick={() => (c.citation = null)}>Remove</button>
      </p>
    {/if}

    <div>
      <strong>Links</strong>
      <p class="muted">A link to your GitHub repo is always included. Add others, like a paper or project site.</p>
      {#each c.links as link, i (i)}
        <div class="row link-row">
          <select bind:value={link.icon} aria-label="Icon">{#each LINK_ICONS as icon (icon)}<option value={icon}>{icon}</option>{/each}</select>
          <input type="text" placeholder="Text" bind:value={link.text} aria-label="Link text" />
          <input type="url" placeholder="https://…" bind:value={link.href} aria-label="Link URL" />
          <button class="link" onclick={() => c.links.splice(i, 1)}>Remove</button>
        </div>
      {/each}
      <button class="secondary" onclick={() => c.links.push({ icon: 'globe', text: '', href: '' })}>Add link</button>
    </div>
  </div>

  {#if problems.length}
    <div class="notice warn"><ul>{#each problems as p (p)}<li>{p}</li>{/each}</ul></div>
  {/if}
  {#if error}<div class="notice error">{error}</div>{/if}
  <div class="row">
    <button onclick={commit} disabled={committing || problems.length > 0}>
      {committing ? 'Saving…' : c.commitSha ? 'Save changes and rebuild' : 'Save and build my datapage'}
    </button>
  </div>
</section>

<style>
  .link-row {
    margin-bottom: 0.5rem;
  }
  .link-row select {
    width: auto;
  }
  .link-row input {
    flex: 1 1 10rem;
    width: auto;
  }
  input[type='color'] {
    display: block;
    margin-top: 0.3rem;
    width: 4rem;
    height: 2.2rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }
</style>
