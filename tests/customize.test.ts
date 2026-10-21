import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { buildCommit, CUSTOMIZED_FILES, customizeFiles, customizeTheme, imagePath, TEMPLATE_IMAGES, type Customization } from '../src/lib/customize';

// copies of the datapages/datapage template files
const template = Object.fromEntries(
  CUSTOMIZED_FILES.map((f) => [f, readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')]),
) as Record<(typeof CUSTOMIZED_FILES)[number], string>;

const customization: Customization = {
  title: 'Bird Counts',
  subtitle: 'Counts of birds at feeders',
  description: 'Data from the [Feeder Project](https://example.org).\n\nCollected 2020–2024.',
  redivis: { user: 'someone', dataset: 'bird_counts', table: 'counts' },
  plot: {
    numerical: ['count', 'temperature'],
    categorical: ['species'],
    defaults: { x: 'temperature', y: 'count', color: 'species' },
  },
  repoUrl: 'https://github.com/someone/bird-counts',
  siteUrl: 'https://someone.github.io/bird-counts/',
  datasetUrl: 'https://redivis.com/datasets/abcd-1234',
  links: [{ icon: 'globe', text: 'Project site', href: 'https://example.org' }],
  citation: { type: 'article-journal', title: 'Birds', author: ['A. Person'], issued: '2024', doi: '10.1/xyz' },
  primaryColor: '#123abc',
  images: { highlight: null, highlightAlt: '', icon: null },
};

const templateReadme = readFileSync(new URL('./fixtures/README.md', import.meta.url), 'utf8');
const baseline = { readme: templateReadme, template: { readme: templateReadme, about: template['about.qmd'] } };

const frontMatter = (text: string) => parse(text.match(/^---\n([\s\S]*?)\n---/)![1]);

describe('customizeFiles', () => {
  const out = customizeFiles(template, customization);

  it('sets the project title and replaces the redivis block', () => {
    const quarto = parse(out['_quarto.yml']);
    expect(quarto.project).toEqual({ title: 'Bird Counts', type: 'datapage' });
    expect(quarto.redivis).toEqual({ user: 'someone', dataset: 'bird_counts', table: 'counts' });
    // untouched settings survive
    expect(quarto.format['datapage-html'].theme).toBe('theme.scss');
  });

  it('removes the penguin logo from the navbar', () => {
    expect(parse(out['_quarto.yml']).website).toBeUndefined();
    const withTitle = template['_quarto.yml'].replace('    logo: images/logo.png', '    logo: images/logo.png\n    background: light');
    expect(parse(customizeFiles({ ...template, '_quarto.yml': withTitle }, customization)['_quarto.yml']).website).toEqual({
      navbar: { background: 'light' },
    });
  });

  it('drops a workflow key from the redivis block', () => {
    const withWorkflow = template['_quarto.yml'].replace('  dataset: palmerpenguins', '  workflow: some_workflow');
    const quarto = parse(customizeFiles({ ...template, '_quarto.yml': withWorkflow }, customization)['_quarto.yml']);
    expect(quarto.redivis.workflow).toBeUndefined();
  });

  it('writes the plot config', () => {
    expect(parse(out['_config.yml'])).toEqual({
      numerical_vars: ['count', 'temperature'],
      categorical_vars: ['species'],
      defaults: { x: 'temperature', y: 'count', color: 'species' },
    });
  });

  it('edits the homepage front matter and keeps the body', () => {
    const fm = frontMatter(out['index.qmd']);
    expect(fm.title).toBe('Bird Counts');
    expect(fm.subtitle).toBe('Counts of birds at feeders');
    expect(fm.description).toBe('Data from the [Feeder Project](https://example.org).\n\nCollected 2020–2024.');
    expect(out['index.qmd']).toContain('{{< include _load-data.qmd >}}');
  });

  it('removes the penguin images from the homepage', () => {
    expect(out['index.qmd']).not.toContain('images/');
    expect(out['index.qmd']).not.toContain('layout-ncol');
    expect(out['index.qmd']).toMatch(/---\n\n\{\{< include _load-data.qmd >\}\}/);
  });

  it('removes an empty subtitle and description', () => {
    const fm = frontMatter(customizeFiles(template, { ...customization, subtitle: ' ', description: '' })['index.qmd']);
    expect(fm.subtitle).toBeUndefined();
    expect(fm.description).toBeUndefined();
  });

  it('rewrites the about page links, citation, and body', () => {
    const fm = frontMatter(out['about.qmd']);
    expect(fm.about.template).toBe('jolla');
    expect(fm.about.image).toBeUndefined();
    expect(fm.about['image-width']).toBeUndefined();
    expect(fm.about.links).toEqual([
      { icon: 'github', text: 'GitHub', href: 'https://github.com/someone/bird-counts' },
      { icon: 'globe', text: 'Project site', href: 'https://example.org' },
    ]);
    expect(fm.citation).toEqual(customization.citation);
    expect(out['about.qmd']).not.toContain('palmerpenguins');
    expect(out['about.qmd']).toMatch(/---\n\n## Bird Counts\n\nData from the/);
  });

  it('drops the citation when there is none', () => {
    const fm = frontMatter(customizeFiles(template, { ...customization, citation: null })['about.qmd']);
    expect(fm.citation).toBeUndefined();
  });

  it('sets the primary color', () => {
    expect(out['theme.scss']).toContain('$primary: #123abc;');
    expect(out['theme.scss']).toContain("@import 'https://fonts.googleapis.com");
  });

  it('ignores a color that is not hex', () => {
    expect(customizeTheme(template['theme.scss'], 'red; } body {')).toBe(template['theme.scss']);
  });
});

describe('buildCommit', () => {
  const changes = buildCommit(template, customization, baseline);

  it('includes only files that changed, a README, and image deletions', () => {
    expect(Object.keys(changes).sort()).toEqual(
      [...CUSTOMIZED_FILES, 'README.md', ...TEMPLATE_IMAGES].sort(),
    );
    for (const image of TEMPLATE_IMAGES) expect(changes[image]).toBeNull();
    const unchanged = buildCommit({ ...template, 'theme.scss': '$primary: #123abc;\n' }, customization, baseline);
    expect(unchanged['theme.scss']).toBeUndefined();
  });

  it('writes a short README about this datapage', () => {
    const readme = changes['README.md']!;
    expect(readme).toMatch(/^# Bird Counts\n\nCounts of birds at feeders\n/);
    expect(readme).toContain('**Site:** https://someone.github.io/bird-counts/');
    expect(readme).toContain('[someone.bird_counts](https://redivis.com/datasets/abcd-1234) (table `counts`)');
    expect(readme).not.toMatch(/penguin|Use this template|REDIVIS_API_TOKEN/i);
  });

  it('leaves no penguin-specific content in the edited files', () => {
    for (const [path, text] of Object.entries(changes)) {
      if (text !== null) expect(text, path).not.toMatch(/penguin|palmer|horst|gorman|culmen|bill_length/i);
    }
  });
});

describe('buildCommit on a datapage that was customized before', () => {
  const first = customizeFiles(template, customization);
  const firstReadme = buildCommit(template, customization, baseline)['README.md']!;
  const again = { ...customization, title: 'Bird Tallies', description: 'New text.' };

  it('replaces the README and About text the builder wrote', () => {
    const changes = buildCommit(first, again, { ...baseline, readme: firstReadme });
    expect(changes['README.md']).toMatch(/^# Bird Tallies\n/);
    expect(changes['about.qmd']).toMatch(/---\n\n## Bird Tallies\n\nNew text.\n$/);
  });

  it('keeps a README and About text edited by hand', () => {
    const edited = { ...first, 'about.qmd': first['about.qmd'] + '\nMore about the birds.\n' };
    const changes = buildCommit(edited, { ...again, links: [] }, { ...baseline, readme: firstReadme + '\n## Notes\n' });
    expect(changes['README.md']).toBeUndefined();
    expect(changes['about.qmd']).toContain('## Bird Counts\n\nData from the');
    expect(changes['about.qmd']).toContain('More about the birds.');
    expect(frontMatter(changes['about.qmd']!).about.links).toHaveLength(1);
  });

  it('writes a README when there is none', () => {
    expect(buildCommit(first, again, { ...baseline, readme: null })['README.md']).toMatch(/^# Bird Tallies/);
  });

  it("doesn't delete a template image that's still in use", () => {
    const changes = buildCommit(first, { ...again, images: { highlight: null, highlightAlt: '', icon: 'images/logo.png' } }, baseline);
    expect('images/logo.png' in changes).toBe(false);
    expect(changes['images/lter_penguins.png']).toBeNull();
  });

  it("keeps the user's own image layouts and About template", () => {
    const index = first['index.qmd'].replace('{{< include _load-data.qmd >}}', '::: {layout-ncol=2}\n![](images/a.png)\n\n![](images/b.png)\n:::\n\n{{< include _load-data.qmd >}}');
    const about = first['about.qmd'].replace('template: jolla', 'template: solana');
    const out = customizeFiles({ ...first, 'index.qmd': index, 'about.qmd': about }, { ...again, images: { highlight: 'images/h.png', highlightAlt: '', icon: null } });
    expect(out['index.qmd']).toContain('images/a.png');
    expect(frontMatter(out['about.qmd']).about.template).toBe('solana');
  });
});

describe('user images', () => {
  const withImages: Customization = {
    ...customization,
    images: { highlight: 'images/highlight.jpg', highlightAlt: 'Birds at a "feeder"', icon: 'images/icon.png' },
  };
  const out = customizeFiles(template, withImages);

  it('uses the icon as the navbar logo and favicon', () => {
    expect(parse(out['_quarto.yml']).website).toEqual({ navbar: { logo: 'images/icon.png' }, favicon: 'images/icon.png' });
  });

  it('puts the highlight image first on the homepage, with alt text', () => {
    expect(out['index.qmd']).toMatch(/---\n\n!\[\]\(images\/highlight\.jpg\)\{fig-alt="Birds at a feeder"\}\n\n\{\{< include _load-data.qmd >\}\}/);
    expect(out['index.qmd']).not.toContain('lter_penguins');
  });

  it('shows the highlight image beside the About page text', () => {
    const fm = frontMatter(out['about.qmd']);
    expect(fm.about).toMatchObject({ template: 'trestles', image: 'images/highlight.jpg', 'image-width': '100%', 'image-alt': 'Birds at a "feeder"' });
  });

  it('replaces rather than duplicates images when customizing again', () => {
    const again = customizeFiles(out, { ...withImages, images: { highlight: 'images/highlight.png', highlightAlt: '', icon: null } });
    expect(again['index.qmd'].match(/images\/highlight/g)).toEqual(['images/highlight']);
    expect(again['index.qmd']).toContain('![](images/highlight.png)\n');
    expect(parse(again['_quarto.yml']).website).toBeUndefined();
    const removed = customizeFiles(again, customization);
    expect(removed['index.qmd']).not.toContain('images/');
    expect(frontMatter(removed['about.qmd']).about).toMatchObject({ template: 'jolla' });
    expect(frontMatter(removed['about.qmd']).about.image).toBeUndefined();
  });

  it('names uploads by kind and type', () => {
    expect(imagePath('highlight', 'image/jpeg')).toBe('images/highlight.jpg');
    expect(imagePath('icon', 'image/svg+xml')).toBe('images/icon.svg');
    expect(imagePath('icon', 'image/tiff')).toBeNull();
  });
});
