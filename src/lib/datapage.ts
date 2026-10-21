// Reads an existing datapage's settings back out of its repo files, so the
// builder can edit a datapage it didn't make (or made in an earlier session).
import { parse } from 'yaml';
import { config } from './config';
import { CUSTOMIZED_FILES, LEADING_IMAGE, bodyOf, readFrontMatter, readme, type Citation, type CustomizedFile, type Link } from './customize';
import type { PlotConfig } from './variables';

export interface DatapageSettings {
  redivis: { user: string; dataset: string; table: string } | null;
  plot: PlotConfig | null;
  title: string;
  subtitle: string;
  description: string;
  /** null when theme.scss doesn't set a hex $primary */
  primaryColor: string | null;
  /** links besides the one to the repo itself */
  links: Link[];
  citation: Citation | null;
  images: { highlight: string | null; highlightAlt: string; icon: string | null };
}

/** The parts of a GitHub repo the checks look at. */
export interface RepoInfo {
  full_name: string;
  archived?: boolean;
  permissions?: { push?: boolean; admin?: boolean };
  template_repository?: { full_name: string } | null;
}

const TEMPLATE = `${config.template.owner}/${config.template.repo}`;

/** Reasons a repo can't be edited as a datapage (empty when it can). */
export function datapageProblems(repo: RepoInfo, files: Partial<Record<CustomizedFile, string | null>>): string[] {
  if (repo.full_name.toLowerCase() === TEMPLATE.toLowerCase()) return ["That's the datapage template itself. Choose a datapage made from it."];
  const problems: string[] = [];
  if (repo.template_repository?.full_name.toLowerCase() !== TEMPLATE.toLowerCase()) {
    problems.push(`${repo.full_name} wasn't made from the ${TEMPLATE} template.`);
  }
  const quarto = files['_quarto.yml'];
  if (quarto && !usesDatapageFormat(quarto)) problems.push(`${repo.full_name}'s _quarto.yml doesn't use the datapage-html format.`);
  const missing = CUSTOMIZED_FILES.filter((path) => files[path] == null);
  if (missing.length) problems.push(`${repo.full_name} is missing ${missing.join(', ')}.`);
  if (repo.archived) problems.push(`${repo.full_name} is archived, so it can't be changed.`);
  else if (repo.permissions && !repo.permissions.push) problems.push(`You don't have permission to push to ${repo.full_name}.`);
  return problems;
}

export function usesDatapageFormat(quartoYml: string): boolean {
  try {
    const format = parse(quartoYml)?.format;
    if (typeof format === 'string') return format === 'datapage-html';
    return !!format && typeof format === 'object' && 'datapage-html' in format;
  } catch {
    return false;
  }
}

export function readDatapage(files: Record<CustomizedFile, string>, repoUrl: string): DatapageSettings {
  const quarto = safeParse(files['_quarto.yml']);
  const plotYml = safeParse(files['_config.yml']);
  const index = safeFrontMatter(files['index.qmd']);
  const about = safeFrontMatter(files['about.qmd']);

  const r = quarto.redivis;
  const redivis = r && [r.user, r.dataset, r.table].every((v) => typeof v === 'string' && v)
    ? { user: r.user, dataset: r.dataset, table: r.table }
    : null;

  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  const d = plotYml.defaults ?? {};
  const plot = Array.isArray(plotYml.numerical_vars) || Array.isArray(plotYml.categorical_vars)
    ? {
        numerical: strings(plotYml.numerical_vars),
        categorical: strings(plotYml.categorical_vars),
        defaults: { x: text(d.x), y: text(d.y), color: text(d.color) },
      }
    : null;

  const sameUrl = (a: string, b: string) => a.replace(/\/+$/, '').toLowerCase() === b.replace(/\/+$/, '').toLowerCase();
  const links: Link[] = (Array.isArray(about.about?.links) ? about.about.links : [])
    .filter((l: any) => l && typeof l.href === 'string' && !sameUrl(l.href, repoUrl))
    .map((l: any) => ({ icon: text(l.icon) || 'link-45deg', text: text(l.text), href: l.href }));

  // the highlight image is at the top of the homepage, or beside the About text
  const leading = bodyOf(files['index.qmd']).match(LEADING_IMAGE);
  const highlight = leading?.[2] ?? (typeof about.about?.image === 'string' ? about.about.image : null);
  const highlightAlt = leading?.[3]?.match(/fig-alt="([^"]*)"/)?.[1] || text(about.about?.['image-alt']) || leading?.[1] || '';
  const icon = text(quarto.website?.navbar?.logo) || text(quarto.website?.favicon) || null;

  return {
    redivis,
    plot,
    title: text(index.title) || text(quarto.project?.title),
    subtitle: text(index.subtitle),
    description: text(index.description).trim(),
    primaryColor: files['theme.scss'].match(/^\$primary:\s*(#[0-9a-fA-F]{3,8})\s*;/m)?.[1] ?? null,
    links,
    citation: readCitation(about.citation),
    images: { highlight, highlightAlt, icon },
  };
}

/** The template's own example data, meaning the datapage was never set up. */
export function isPlaceholder(settings: DatapageSettings): boolean {
  return settings.redivis?.user === 'datapages' && settings.redivis.dataset === 'palmerpenguins';
}

/** Whether a README is the one the builder wrote for these settings, unedited. */
export function isBuilderReadme(text: string, s: DatapageSettings): boolean {
  if (!s.redivis) return false;
  const siteUrl = text.match(/^\*\*Site:\*\* (\S+)$/m)?.[1];
  if (!siteUrl) return false;
  const datasetUrl = text.match(/Redivis dataset \[[^\]]*\]\(([^)\s]+)\)/)?.[1] ?? null;
  return text.trim() === readme({ title: s.title, subtitle: s.subtitle, redivis: s.redivis, siteUrl, datasetUrl }).trim();
}

function readCitation(value: unknown): Citation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const c = { ...(value as Record<string, any>) };
  // the builder works with authors as plain names and the year as text
  const authors = Array.isArray(c.author) ? c.author : c.author ? [c.author] : [];
  c.author = authors.map(authorName).filter(Boolean);
  if (typeof c.issued === 'number') c.issued = String(c.issued);
  else if (c.issued?.['date-parts']?.[0]?.[0]) c.issued = String(c.issued['date-parts'][0][0]);
  else if (typeof c.issued !== 'string') delete c.issued;
  for (const key of ['title', 'container-title', 'doi', 'volume', 'issue', 'page', 'url']) {
    if (typeof c[key] === 'number') c[key] = String(c[key]);
  }
  return c as Citation;
}

function authorName(a: any): string {
  if (typeof a === 'string') return a;
  if (!a || typeof a !== 'object') return '';
  return text(a.name) || text(a.literal) || [a.given, a.family].filter((s) => typeof s === 'string').join(' ');
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

function safeParse(yml: string): Record<string, any> {
  try {
    const value = parse(yml);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function safeFrontMatter(page: string): Record<string, any> {
  try {
    return readFrontMatter(page);
  } catch {
    return {};
  }
}
