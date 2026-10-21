import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCommit, CUSTOMIZED_FILES, customizeFiles, type Customization } from '../src/lib/customize';
import { datapageProblems, isBuilderReadme, isPlaceholder, readDatapage, usesDatapageFormat } from '../src/lib/datapage';
import { fitPlotConfig } from '../src/lib/variables';

const template = Object.fromEntries(
  CUSTOMIZED_FILES.map((f) => [f, readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')]),
) as Record<(typeof CUSTOMIZED_FILES)[number], string>;
const templateReadme = readFileSync(new URL('./fixtures/README.md', import.meta.url), 'utf8');

const customization: Customization = {
  title: 'Bird Counts',
  subtitle: 'Counts of birds at feeders',
  description: 'Data from the [Feeder Project](https://example.org).\n\nCollected 2020–2024.',
  redivis: { user: 'someone', dataset: 'bird_counts', table: 'counts' },
  plot: { numerical: ['count', 'temperature'], categorical: ['species'], defaults: { x: 'temperature', y: 'count', color: 'species' } },
  repoUrl: 'https://github.com/someone/bird-counts',
  siteUrl: 'https://someone.github.io/bird-counts/',
  datasetUrl: 'https://redivis.com/datasets/abcd-1234',
  links: [{ icon: 'globe', text: 'Project site', href: 'https://example.org' }],
  citation: { type: 'article-journal', title: 'Birds', author: ['A. Person'], issued: '2024', doi: '10.1/xyz' },
  primaryColor: '#123abc',
  images: { highlight: 'images/highlight.jpg', highlightAlt: 'Birds at a feeder', icon: 'images/icon.png' },
};

const repo = { full_name: 'someone/bird-counts', permissions: { push: true }, template_repository: { full_name: 'datapages/datapage' } };

describe('datapageProblems', () => {
  it('accepts a repo made from the template', () => {
    expect(datapageProblems(repo, template)).toEqual([]);
  });

  it('rejects repos not made from the template', () => {
    expect(datapageProblems({ ...repo, template_repository: null }, template)).toEqual([
      "someone/bird-counts wasn't made from the datapages/datapage template.",
    ]);
    expect(datapageProblems({ ...repo, full_name: 'datapages/datapage' }, template)[0]).toMatch(/template itself/);
  });

  it('rejects repos without the datapage format or files', () => {
    const quarto = template['_quarto.yml'].replace('datapage-html:', 'html:');
    expect(datapageProblems(repo, { ...template, '_quarto.yml': quarto })).toEqual([
      "someone/bird-counts's _quarto.yml doesn't use the datapage-html format.",
    ]);
    expect(datapageProblems(repo, { ...template, '_config.yml': null })).toEqual(['someone/bird-counts is missing _config.yml.']);
  });

  it('rejects repos the user can\'t push to', () => {
    expect(datapageProblems({ ...repo, permissions: { push: false } }, template)[0]).toMatch(/permission/);
    expect(datapageProblems({ ...repo, archived: true }, template)[0]).toMatch(/archived/);
  });
});

describe('usesDatapageFormat', () => {
  it('reads the format as a key or a string', () => {
    expect(usesDatapageFormat(template['_quarto.yml'])).toBe(true);
    expect(usesDatapageFormat('format: datapage-html\n')).toBe(true);
    expect(usesDatapageFormat('format:\n  html: default\n')).toBe(false);
    expect(usesDatapageFormat(': bad: yaml: [')).toBe(false);
  });
});

describe('readDatapage', () => {
  it('reads back what the builder wrote', () => {
    const files = customizeFiles(template, customization);
    const s = readDatapage(files, customization.repoUrl);
    expect(s).toEqual({
      redivis: customization.redivis,
      plot: customization.plot,
      title: customization.title,
      subtitle: customization.subtitle,
      description: customization.description,
      primaryColor: '#123abc',
      links: customization.links,
      citation: customization.citation,
      images: customization.images,
    });
    expect(isPlaceholder(s)).toBe(false);
  });

  it('recognizes the template example', () => {
    const s = readDatapage(template, 'https://github.com/someone/new');
    expect(isPlaceholder(s)).toBe(true);
    expect(s.redivis).toEqual({ user: 'datapages', dataset: 'palmerpenguins', table: 'penguins' });
    expect(s.plot?.defaults).toEqual({ x: 'bill_length_mm', y: 'bill_depth_mm', color: 'island' });
  });

  it('normalizes hand-written citations', () => {
    const about = template['about.qmd'].replace(
      /citation:[\s\S]*?\n---/,
      'citation:\n  title: Birds\n  issued:\n    date-parts: [[2021, 3]]\n  author:\n    - given: Ada\n      family: Lovelace\n    - name: B. Person\n---',
    );
    const s = readDatapage({ ...template, 'about.qmd': about }, 'https://github.com/x/y');
    expect(s.citation).toEqual({ title: 'Birds', issued: '2021', author: ['Ada Lovelace', 'B. Person'] });
  });
});

describe('isBuilderReadme', () => {
  const files = customizeFiles(template, customization);
  const settings = readDatapage(files, customization.repoUrl);
  const readme = buildCommit(template, customization, {
    readme: templateReadme,
    template: { readme: templateReadme, about: template['about.qmd'] },
  })['README.md']!;

  it('recognizes an unedited README', () => {
    expect(isBuilderReadme(readme, settings)).toBe(true);
    expect(isBuilderReadme(readme.replace('## Local development', '## Local work'), settings)).toBe(false);
    expect(isBuilderReadme(templateReadme, settings)).toBe(false);
  });
});

describe('fitPlotConfig', () => {
  it('drops variables the table no longer has', () => {
    const fitted = fitPlotConfig(customization.plot, [{ name: 'count' }, { name: 'species' }, { name: 'wind' }]);
    expect(fitted).toEqual({ numerical: ['count'], categorical: ['species'], defaults: { x: '', y: 'count', color: 'species' } });
  });
});
