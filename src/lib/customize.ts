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
  /** links besides the GitHub repo link, which is always added first */
  links: Link[];
  citation: Citation | null;
  primaryColor: string;
}

export const CUSTOMIZED_FILES = ['_quarto.yml', '_config.yml', 'index.qmd', 'about.qmd', 'theme.scss'] as const;
export type CustomizedFile = (typeof CUSTOMIZED_FILES)[number];

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
  return editFrontMatter(text, (doc) => {
    doc.set('title', c.title);
    setOptional(doc, 'subtitle', c.subtitle);
    setOptional(doc, 'description', c.description, true);
  });
}

export function customizeAbout(text: string, c: Pick<Customization, 'title' | 'description' | 'repoUrl' | 'links' | 'citation'>): string {
  const edited = editFrontMatter(text, (doc) => {
    const links = [{ icon: 'github', text: 'GitHub', href: c.repoUrl }, ...c.links.filter((l) => l.text && l.href)];
    doc.setIn(['about', 'links'], doc.createNode(links));
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

function stripEmpty(citation: Citation): Citation {
  return Object.fromEntries(
    Object.entries(citation).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '')),
  ) as Citation;
}
