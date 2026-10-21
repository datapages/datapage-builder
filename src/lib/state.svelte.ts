import type { Citation, Link } from './customize';
import type { PlotConfig, VariableInfo } from './variables';

export const STEPS = [
  { id: 'connect', title: 'Connect accounts' },
  { id: 'repo', title: 'Create repo' },
  { id: 'data', title: 'Choose data' },
  { id: 'variables', title: 'Describe variables' },
  { id: 'plots', title: 'Build plots' },
  { id: 'customize', title: 'Customize' },
  { id: 'publish', title: 'Publish' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

export interface WizardState {
  step: StepId;
  githubLogin: string | null;
  redivisUser: string | null;
  data: {
    /** upload a new CSV, or use a table already on Redivis */
    source: 'upload' | 'existing';
    fileName: string | null;
    rows: number | null;
    columns: { name: string; numDistinct: number }[];
    owner: string;
    isOrganization: boolean;
    dataset: string;
    table: string;
    /** `owner.dataset` once this wizard has created it, so a retry can reuse it */
    createdDataset: string | null;
    datasetUrl: string | null;
    /** the table is released and public, ready for the datapage */
    released: boolean;
    variables: VariableInfo[];
    /** labels and descriptions saved to Redivis, or skipped */
    variablesReviewed: boolean;
  };
  repo: {
    owner: string;
    name: string;
    /** `owner/name` once created */
    created: string | null;
    pagesEnabled: boolean;
  };
  plots: {
    config: PlotConfig | null;
    /** the user has confirmed the plot setup */
    reviewed: boolean;
  };
  customize: {
    title: string;
    subtitle: string;
    description: string;
    /** alt text for the highlight image */
    imageAlt: string;
    /** repo paths of images already committed, kept when nothing new is picked */
    images: { highlight: string | null; icon: string | null };
    links: Link[];
    doi: string;
    citation: Citation | null;
    primaryColor: string;
    commitSha: string | null;
  };
  publish: {
    siteUrl: string | null;
  };
}

const STORAGE_KEY = 'datapage-builder:wizard';

function initialState(): WizardState {
  return {
    step: 'connect',
    githubLogin: null,
    redivisUser: null,
    data: {
      source: 'upload',
      fileName: null,
      rows: null,
      columns: [],
      owner: '',
      isOrganization: false,
      dataset: '',
      table: '',
      createdDataset: null,
      datasetUrl: null,
      released: false,
      variables: [],
      variablesReviewed: false,
    },
    repo: { owner: '', name: '', created: null, pagesEnabled: false },
    plots: { config: null, reviewed: false },
    customize: {
      title: '',
      subtitle: '',
      description: '',
      imageAlt: '',
      images: { highlight: null, icon: null },
      links: [],
      doi: '',
      citation: null,
      primaryColor: '#7f3b97',
      commitSha: null,
    },
    publish: { siteUrl: null },
  };
}

function load(): WizardState {
  const initial = initialState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved) {
      // shallow-merge each section so fields added later get their defaults
      for (const key of Object.keys(initial) as (keyof WizardState)[]) {
        const value = saved[key];
        if (value === undefined) continue;
        (initial as any)[key] =
          typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...(initial as any)[key], ...value } : value;
      }
    }
  } catch {
    // ignore, start fresh
  }
  return initial;
}

export const wizard = $state<WizardState>(load());

$effect.root(() => {
  $effect(() => {
    const json = JSON.stringify(wizard);
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch {
      // ignore, progress just won't survive a reload
    }
  });
});

export function resetWizard(): void {
  Object.assign(wizard, initialState());
}

/** Files the user picked. Files can't be saved, so these are lost on reload. */
export const session = $state<{ file: File | null; highlightImage: File | null; icon: File | null }>({
  file: null,
  highlightImage: null,
  icon: null,
});
