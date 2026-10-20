import { describe, expect, it } from 'vitest';
import { cslToCitation, normalizeDoi } from '../src/lib/doi';

describe('normalizeDoi', () => {
  it('accepts bare DOIs and doi.org URLs', () => {
    expect(normalizeDoi('10.1371/journal.pone.0090081')).toBe('10.1371/journal.pone.0090081');
    expect(normalizeDoi(' https://doi.org/10.1371/journal.pone.0090081 ')).toBe('10.1371/journal.pone.0090081');
    expect(normalizeDoi('not a doi')).toBeNull();
  });
});

describe('cslToCitation', () => {
  it('maps Crossref CSL-JSON to the fields Quarto uses', () => {
    // trimmed doi.org response for the penguins paper
    const csl = {
      type: 'journal-article',
      title: 'Ecological Sexual Dimorphism and Environmental Variability within a Community of Antarctic Penguins (Genus Pygoscelis)',
      'container-title': 'PLoS ONE',
      issued: { 'date-parts': [[2014, 3, 5]] },
      DOI: '10.1371/journal.pone.0090081',
      volume: '9',
      issue: '3',
      page: 'e90081',
      author: [
        { given: 'Kristen B.', family: 'Gorman', sequence: 'first' },
        { given: 'Tony D.', family: 'Williams', sequence: 'additional' },
        { literal: 'Palmer Station LTER' },
      ],
    };
    expect(cslToCitation(csl)).toEqual({
      type: 'article-journal',
      title: csl.title,
      author: ['Kristen B. Gorman', 'Tony D. Williams', 'Palmer Station LTER'],
      issued: '2014',
      'container-title': 'PLoS ONE',
      volume: '9',
      issue: '3',
      page: 'e90081',
      doi: '10.1371/journal.pone.0090081',
    });
  });
});
