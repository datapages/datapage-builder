<script lang="ts">
  import { onDestroy } from 'svelte';
  import { errorMessage, github } from '../lib/clients';
  import { CUSTOMIZED_FILES, IMAGE_TYPES, buildCommit, imagePath } from '../lib/customize';
  import { fetchCitation } from '../lib/doi';
  import type { FileChange } from '../lib/github';
  import { session, wizard } from '../lib/state.svelte';

  let { onnext }: { onnext: () => void } = $props();

  // Bootstrap Icons names, which Quarto's about pages use
  const LINK_ICONS = ['globe', 'link-45deg', 'file-text', 'journal-text', 'book', 'database', 'github', 'envelope', 'youtube', 'mastodon'];
  const MAX_IMAGE_BYTES = 5 * 1024 ** 2;
  const IMAGES = {
    highlight: {
      title: 'Highlight image',
      hint: 'Shown at the top of the homepage and beside the About page text.',
    },
    icon: {
      title: 'Icon',
      hint: 'Shown in the navigation bar and as the browser tab icon. A small square image works best.',
    },
  } as const;
  type ImageKind = keyof typeof IMAGES;

  const c = wizard.customize;
  if (!c.title) c.title = humanize(wizard.data.dataset);

  let lookingUp = $state(false);
  let doiError = $state('');
  let committing = $state(false);
  let error = $state('');
  let imageErrors = $state<Record<ImageKind, string>>({ highlight: '', icon: '' });
  let previews = $state<Record<ImageKind, string | null>>({ highlight: null, icon: null });

  const ref = { owner: wizard.repo.owner, repo: wizard.repo.name };
  const problems = $derived(c.title.trim() ? [] : ['Give your datapage a title.']);
  const files = $derived({ highlight: session.highlightImage, icon: session.icon });

  // files picked on an earlier visit to this step
  if (session.highlightImage) previews.highlight = URL.createObjectURL(session.highlightImage);
  if (session.icon) previews.icon = URL.createObjectURL(session.icon);
  onDestroy(() => Object.values(previews).forEach((url) => url?.startsWith('blob:') && URL.revokeObjectURL(url)));

  function humanize(name: string): string {
    return name.replace(/_+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()).trim();
  }

  // an image already in the repo, shown when nothing new has been picked
  function committedUrl(kind: ImageKind): string | null {
    const path = c.images[kind];
    return path ? `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/HEAD/${path}` : null;
  }

  function setFile(kind: ImageKind, file: File | null) {
    if (kind === 'highlight') session.highlightImage = file;
    else session.icon = file;
    if (previews[kind]) URL.revokeObjectURL(previews[kind]!);
    previews[kind] = file ? URL.createObjectURL(file) : null;
  }

  function pickImage(kind: ImageKind, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    imageErrors[kind] = '';
    if (!file) return;
    if (!IMAGE_TYPES[file.type]) imageErrors[kind] = 'Use a PNG, JPEG, GIF, WebP, or SVG image.';
    else if (file.size > MAX_IMAGE_BYTES) imageErrors[kind] = 'That image is over 5 MB. Try a smaller version.';
    if (imageErrors[kind]) {
      input.value = '';
      return;
    }
    setFile(kind, file);
  }

  function removeImage(kind: ImageKind) {
    setFile(kind, null);
    c.images[kind] = null;
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

  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',', 2)[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function commit() {
    committing = true;
    error = '';
    try {
      const gh = github();
      const templateFiles = await gh.readFiles(ref, CUSTOMIZED_FILES);
      const siteUrl = (await gh.pagesUrl(ref)) ?? `https://${ref.owner.toLowerCase()}.github.io/${ref.repo}/`;

      // new uploads replace what's committed; otherwise keep what's there
      const paths = {
        highlight: files.highlight ? imagePath('highlight', files.highlight.type) : c.images.highlight,
        icon: files.icon ? imagePath('icon', files.icon.type) : c.images.icon,
      };
      const changes: Record<string, FileChange> = buildCommit(templateFiles, {
        title: c.title.trim(),
        subtitle: c.subtitle,
        description: c.description,
        redivis: { user: wizard.data.owner, dataset: wizard.data.dataset, table: wizard.data.table },
        plot: wizard.plots.config!,
        repoUrl: `https://github.com/${ref.owner}/${ref.repo}`,
        siteUrl,
        datasetUrl: wizard.data.datasetUrl,
        links: c.links,
        citation: c.citation,
        primaryColor: c.primaryColor,
        images: { highlight: paths.highlight, highlightAlt: c.imageAlt, icon: paths.icon },
      });
      for (const kind of ['highlight', 'icon'] as const) {
        // remove earlier uploads that aren't used anymore (e.g. a .png replaced by a .jpg)
        for (const ext of Object.values(IMAGE_TYPES)) {
          const path = `images/${kind}.${ext}`;
          if (path !== paths[kind]) changes[path] = null;
        }
        const file = files[kind];
        if (file && paths[kind]) changes[paths[kind]!] = { base64: await toBase64(file) };
      }

      c.commitSha = await gh.commitFiles(ref, changes, `Customize datapage for ${wizard.data.owner}.${wizard.data.dataset}`);
      c.images = paths;
      await gh.setDescription(ref, c.subtitle.trim() || c.title.trim());
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
    <h3>Images</h3>
    <p class="muted">Both optional. PNG, JPEG, GIF, WebP, or SVG, up to 5 MB.</p>
    <div class="grid-2">
      {#each Object.entries(IMAGES) as [kind, info] (kind)}
        {@const k = kind as ImageKind}
        {@const src = previews[k] ?? committedUrl(k)}
        <div class="stack image-field">
          <label>
            {info.title}
            <span class="hint">{info.hint}</span>
            <input type="file" accept={Object.keys(IMAGE_TYPES).join(',')} onchange={(e) => pickImage(k, e)} />
          </label>
          {#if imageErrors[k]}<div class="notice error">{imageErrors[k]}</div>{/if}
          {#if src}
            <div class="row">
              <img class:icon-preview={k === 'icon'} src={src} alt="" />
              <button class="link" onclick={() => removeImage(k)}>Remove</button>
            </div>
          {/if}
          {#if k === 'highlight' && src}
            <label>
              Image description
              <span class="hint">For people using screen readers</span>
              <input type="text" bind:value={c.imageAlt} />
            </label>
          {/if}
        </div>
      {/each}
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
        <div class="link-row stack">
          <div class="icon-picker" role="radiogroup" aria-label="Icon">
            {#each LINK_ICONS as icon (icon)}
              <button
                type="button"
                class="icon-choice"
                class:selected={link.icon === icon}
                role="radio"
                aria-checked={link.icon === icon}
                aria-label={icon}
                title={icon}
                onclick={() => (link.icon = icon)}
              ><i class={`bi bi-${icon}`} aria-hidden="true"></i></button>
            {/each}
          </div>
          <div class="row">
            <input type="text" placeholder="Text" bind:value={link.text} aria-label="Link text" />
            <input type="url" placeholder="https://…" bind:value={link.href} aria-label="Link URL" />
            <button class="link" onclick={() => c.links.splice(i, 1)}>Remove</button>
          </div>
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
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 0.75rem;
  }
  .link-row > * + * {
    margin-top: 0.5rem;
  }
  .link-row input {
    flex: 1 1 10rem;
    width: auto;
    margin-top: 0;
  }
  .icon-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .icon-choice {
    display: grid;
    place-items: center;
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    font-size: 1.05rem;
    font-weight: 400;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
  }
  .icon-choice.selected {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-text);
  }
  .image-field img {
    max-width: 12rem;
    max-height: 8rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    object-fit: contain;
    background: var(--bg);
  }
  .image-field img.icon-preview {
    width: 3rem;
    height: 3rem;
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
