// Edits the template's files for a new datapage. Uses yaml's Document API so
// comments and formatting in the template's YAML survive the edits.
import { parseDocument, Scalar, type Document } from 'yaml';
import type { PlotConfig } from './variables';

export interface Link {
  icon: string;
  text: string;
  href: string;
}

/** CSL-JSON fields Quarto accepts under `citation`. */
export interface Citation {
  type?: string;
  title?: string;
  author?: string[];
  issued?: string;
  'container-title'?: string;
  volume?: string;
  issue?: string;
  page?: string;
  doi?: string;
  url?: string;
}

export interface Customization {
  title: string;
  subtitle: string;
  description: string;
  redivis: { user: string; dataset: string; table: string };
  plot: PlotConfig;
  repoUrl: string;
  siteUrl: string;
  datasetUrl: string | null;
  /** links besides the GitHub repo link, which is always added first */
  links: Link[];
  citation: Citation | null;
  primaryColor: string;
}

export const CUSTOMIZED_FILES = ['_quarto.yml', '_config.yml', 'index.qmd', 'about.qmd', 'theme.scss'] as const;
export type CustomizedFile = (typeof CUSTOMIZED_FILES)[number];

// the template's penguin images, which nothing references after customizing
export const TEMPLATE_IMAGES = ['images/culmen_depth.png', 'images/logo.png', 'images/lter_penguins.png'];

/**
 * Everything the customization commit changes: edited template files, a new
 * README, and the template's images (null means delete).
 */
export function buildCommit(files: Record<CustomizedFile, string>, c: Customization): Record<string, string | null> {
  const customized = customizeFiles(files, c);
  const changed = Object.fromEntries(Object.entries(customized).filter(([path, text]) => text !== files[path as CustomizedFile]));
  return {
    ...changed,
    'README.md': readme(c),
    ...Object.fromEntries(TEMPLATE_IMAGES.map((path) => [path, null])),
  };
}

export function customizeFiles(files: Record<CustomizedFile, string>, c: Customization): Record<CustomizedFile, string> {
  return {
    '_quarto.yml': customizeQuarto(files['_quarto.yml'], c),
    '_config.yml': customizeConfig(files['_config.yml'], c.plot),
    'index.qmd': customizeIndex(files['index.qmd'], c),
    'about.qmd': customizeAbout(files['about.qmd'], c),
    'theme.scss': customizeTheme(files['theme.scss'], c.primaryColor),
  };
}

export function customizeQuarto(text: string, c: Pick<Customization, 'title' | 'redivis'>): string {
  const doc = parseDocument(text);
  doc.setIn(['project', 'title'], c.title);
  // replace the whole block so a template `workflow:` key doesn't linger
  doc.set('redivis', doc.createNode({ user: c.redivis.user, dataset: c.redivis.dataset, table: c.redivis.table }));
  // the template's logo is the palmerpenguins hex sticker
  doc.deleteIn(['website', 'navbar', 'logo']);
  deleteIfEmpty(doc, ['website', 'navbar']);
  deleteIfEmpty(doc, ['website']);
  return doc.toString();
}

export function customizeConfig(text: string, plot: PlotConfig): string {
  const doc = parseDocument(text);
  doc.set('numerical_vars', doc.createNode(plot.numerical));
  doc.set('categorical_vars', doc.createNode(plot.categorical));
  doc.set('defaults', doc.createNode(plot.defaults));
  return doc.toString();
}

export function customizeIndex(text: string, c: Pick<Customization, 'title' | 'subtitle' | 'description'>): string {
  const edited = editFrontMatter(text, (doc) => {
    doc.set('title', c.title);
    setOptional(doc, 'subtitle', c.subtitle);
    setOptional(doc, 'description', c.description, true);
  });
  // drop the layout block holding the template's penguin images
  return edited.replace(/^::: \{layout-ncol=\d+\}\n(?:!\[.*\]\(images\/.*\)\n|\s*\n)*:::\n+/m, '');
}

export function customizeAbout(text: string, c: Pick<Customization, 'title' | 'description' | 'repoUrl' | 'links' | 'citation'>): string {
  const edited = editFrontMatter(text, (doc) => {
    const links = [{ icon: 'github', text: 'GitHub', href: c.repoUrl }, ...c.links.filter((l) => l.text && l.href)];
    doc.setIn(['about', 'links'], doc.createNode(links));
    // the template's about image is penguin artwork, and trestles (its
    // side-by-side layout) leaves an empty column without an image
    doc.deleteIn(['about', 'image']);
    doc.deleteIn(['about', 'image-width']);
    doc.setIn(['about', 'template'], 'jolla');
    if (c.citation) doc.set('citation', doc.createNode(stripEmpty(c.citation)));
    else doc.delete('citation');
  });
  // the template's body describes the penguins dataset
  const body = `## ${c.title}\n\n${c.description.trim()}\n`;
  return replaceBody(edited, body);
}

export function customizeTheme(text: string, primaryColor: string): string {
  if (!/^#[0-9a-fA-F]{3,8}$/.test(primaryColor)) return text;
  return text.replace(/^\$primary:\s*[^;]+;/m, `$primary: ${primaryColor};`);
}

export function readme(c: Pick<Customization, 'title' | 'subtitle' | 'redivis' | 'siteUrl' | 'datasetUrl'>): string {
  const ref = `${c.redivis.user}.${c.redivis.dataset}`;
  const dataset = c.datasetUrl ? `[${ref}](${c.datasetUrl})` : `\`${ref}\``;
  return `# ${c.title}
${c.subtitle.trim() ? `\n${c.subtitle.trim()}\n` : ''}
**Site:** ${c.siteUrl}

A [datapage](https://github.com/datapages/datapage) for the Redivis dataset ${dataset} (table \`${c.redivis.table}\`).

## Updating the site

Every push to \`main\` rebuilds the site with GitHub Actions and publishes it to GitHub Pages. The main files to edit:

- \`_quarto.yml\`: the site title, and the Redivis table the site reads (under \`redivis:\`)
- \`_config.yml\`: which variables can be plotted, and the plot defaults
- \`index.qmd\` and \`about.qmd\`: the homepage and About page (put any images in \`images/\`)
- \`theme.scss\`: colors and fonts

The data lives on Redivis. After releasing a new version of the dataset there, rebuild the site by running the "Render and Publish" workflow from the Actions tab.

## Local development

Install [R](https://cloud.r-project.org/) and [Quarto](https://quarto.org/docs/get-started/). Run \`renv::restore()\` in R to install the R packages, then \`quarto preview\` to see the site.

---

Made with [Datapage Builder](https://datapages.github.io/datapage-builder/).
`;
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function editFrontMatter(text: string, edit: (doc: Document) => void): string {
  const match = text.match(FRONT_MATTER);
  const doc = parseDocument(match ? match[1] : '');
  edit(doc);
  const rest = match ? text.slice(match[0].length) : `\n${text}`;
  return `---\n${doc.toString()}---\n${rest}`;
}

function replaceBody(text: string, body: string): string {
  const match = text.match(FRONT_MATTER);
  return match ? `${match[0]}\n${body}` : body;
}

function setOptional(doc: Document, key: string, value: string, block = false) {
  const trimmed = value.trim();
  if (!trimmed) {
    doc.delete(key);
    return;
  }
  const node = new Scalar(trimmed);
  // keep long or multi-line text readable, like the template's description
  if (block && (trimmed.includes('\n') || trimmed.length > 80)) node.type = Scalar.BLOCK_LITERAL;
  doc.set(key, node);
}

function deleteIfEmpty(doc: Document, path: string[]) {
  const node = doc.getIn(path, true) as { items?: unknown[] } | undefined;
  if (node && Array.isArray(node.items) && node.items.length === 0) doc.deleteIn(path);
}

function stripEmpty(citation: Citation): Citation {
  return Object.fromEntries(
    Object.entries(citation).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '')),
  ) as Citation;
}
