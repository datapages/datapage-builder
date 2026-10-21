import type { Citation, Link, RedivisSource } from './customize';
import { isPlaceholder, type DatapageSettings } from './datapage';
import type { PlotConfig, VariableInfo } from './variables';

export const STEPS = [
  { id: 'connect', title: 'Connect accounts' },
  { id: 'repo', title: 'Set up repo' },
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
    /** whether the table is in a dataset or is a workflow's output */
    kind: 'dataset' | 'workflow';
    /** the dataset's or workflow's reference name */
    dataset: string;
    table: string;
    /** `owner.dataset` once this wizard has created it, so a retry can reuse it */
    createdDataset: string | null;
    /** the dataset's or workflow's page on Redivis */
    datasetUrl: string | null;
    /** the table's page on Redivis */
    tableUrl: string | null;
    /** the table is released and public, ready for the datapage */
    released: boolean;
    variables: VariableInfo[];
    /** labels and descriptions saved to Redivis, or skipped */
    variablesReviewed: boolean;
  };
  repo: {
    /** make a new datapage, or edit one that already exists */
    source: 'new' | 'existing';
    owner: string;
    name: string;
    /** `owner/name` once created, or once an existing datapage is chosen */
    created: string | null;
    pagesEnabled: boolean;
    /** an existing datapage's settings when it was chosen */
    current: DatapageSettings | null;
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

export function initialState(): WizardState {
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
      kind: 'dataset',
      dataset: '',
      table: '',
      createdDataset: null,
      datasetUrl: null,
      tableUrl: null,
      released: false,
      variables: [],
      variablesReviewed: false,
    },
    repo: { source: 'new', owner: '', name: '', created: null, pagesEnabled: false, current: null },
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

/** The chosen table, as the datapage's `redivis` block names it. */
export function redivisSource(): RedivisSource {
  const { owner: user, kind, dataset, table } = wizard.data;
  return kind === 'workflow' ? { user, workflow: dataset, table } : { user, dataset, table };
}

/** The version for table references: dataset tables use the released one, workflow tables have none. */
export function tableVersion(): 'current' | null {
  return wizard.data.kind === 'workflow' ? null : 'current';
}

/**
 * Starts editing an existing datapage: the later steps begin from its
 * settings, unless it still has the template's example content.
 */
export function startFromDatapage(settings: DatapageSettings): void {
  const fresh = initialState();
  Object.assign(wizard, { data: fresh.data, plots: fresh.plots, customize: fresh.customize, publish: fresh.publish });
  Object.assign(session, { file: null, highlightImage: null, icon: null });
  wizard.repo.current = structuredClone(settings);
  if (isPlaceholder(settings)) return;
  const s = structuredClone(settings);
  if (s.redivis) {
    const { user, dataset, workflow, table } = s.redivis;
    Object.assign(wizard.data, { source: 'existing', owner: user, kind: dataset ? 'dataset' : 'workflow', dataset: dataset ?? workflow, table });
  }
  Object.assign(wizard.customize, {
    title: s.title,
    subtitle: s.subtitle,
    description: s.description,
    imageAlt: s.images.highlightAlt,
    images: { highlight: s.images.highlight, icon: s.images.icon },
    links: s.links,
    citation: s.citation,
    doi: s.citation?.doi ?? '',
    primaryColor: s.primaryColor ?? fresh.customize.primaryColor,
  });
}

/** Files the user picked. Files can't be saved, so these are lost on reload. */
export const session = $state<{ file: File | null; highlightImage: File | null; icon: File | null }>({
  file: null,
  highlightImage: null,
  icon: null,
});
