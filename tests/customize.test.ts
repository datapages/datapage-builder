import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CUSTOMIZED_FILES, customizeFiles, customizeTheme, type Customization } from '../src/lib/customize';

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
  links: [{ icon: 'globe', text: 'Project site', href: 'https://example.org' }],
  citation: { type: 'article-journal', title: 'Birds', author: ['A. Person'], issued: '2024', doi: '10.1/xyz' },
  primaryColor: '#123abc',
};

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

  it('removes an empty subtitle and description', () => {
    const fm = frontMatter(customizeFiles(template, { ...customization, subtitle: ' ', description: '' })['index.qmd']);
    expect(fm.subtitle).toBeUndefined();
    expect(fm.description).toBeUndefined();
  });

  it('rewrites the about page links, citation, and body', () => {
    const fm = frontMatter(out['about.qmd']);
    expect(fm.about.template).toBe('trestles');
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
