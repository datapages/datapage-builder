import type { Citation, Link } from './customize';
import type { PlotConfig, VariableInfo } from './variables';

export const STEPS = [
  { id: 'connect', title: 'Connect accounts' },
  { id: 'data', title: 'Upload data' },
  { id: 'repo', title: 'Create repo' },
  { id: 'customize', title: 'Customize' },
  { id: 'publish', title: 'Publish' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

export interface WizardState {
  step: StepId;
  githubLogin: string | null;
  redivisUser: string | null;
  data: {
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
    released: boolean;
    variables: VariableInfo[];
  };
  repo: {
    owner: string;
    name: string;
    /** `owner/name` once created */
    created: string | null;
    pagesEnabled: boolean;
  };
  customize: {
    title: string;
    subtitle: string;
    description: string;
    plot: PlotConfig | null;
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
    },
    repo: { owner: '', name: '', created: null, pagesEnabled: false },
    customize: {
      title: '',
      subtitle: '',
      description: '',
      plot: null,
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

/** The CSV the user picked. Files can't be saved, so this is lost on reload. */
export const session = $state<{ file: File | null }>({ file: null });
