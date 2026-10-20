import type { Citation } from './customize';

/** Accepts a bare DOI or a doi.org URL. */
export function normalizeDoi(input: string): string | null {
  const match = input.trim().match(/(10\.\d{4,9}\/\S+)$/);
  return match ? match[1] : null;
}

/** Looks up a DOI via doi.org content negotiation (CSL-JSON). */
export async function fetchCitation(input: string): Promise<Citation> {
  const doi = normalizeDoi(input);
  if (!doi) throw new Error("That doesn't look like a DOI (e.g. 10.1371/journal.pone.0090081).");
  const res = await fetch(`https://doi.org/${doi}`, { headers: { Accept: 'application/vnd.citationstyles.csl+json' } });
  if (!res.ok) throw new Error(res.status === 404 ? `DOI ${doi} wasn't found.` : `Couldn't look up DOI (HTTP ${res.status}).`);
  return cslToCitation(await res.json());
}

export function cslToCitation(csl: any): Citation {
  const year = csl.issued?.['date-parts']?.[0]?.[0];
  const authors = (csl.author ?? [])
    .map((a: any) => a.literal ?? [a.given, a.family].filter(Boolean).join(' '))
    .filter(Boolean);
  const containerTitle = Array.isArray(csl['container-title']) ? csl['container-title'][0] : csl['container-title'];
  return {
    // Quarto uses CSL types, which Crossref mostly shares
    type: csl.type === 'journal-article' ? 'article-journal' : csl.type,
    title: Array.isArray(csl.title) ? csl.title[0] : csl.title,
    author: authors,
    issued: year ? String(year) : undefined,
    'container-title': containerTitle,
    volume: csl.volume,
    issue: csl.issue,
    page: csl.page,
    doi: csl.DOI,
  };
}
