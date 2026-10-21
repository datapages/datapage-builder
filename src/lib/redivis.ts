// Thin client for the Redivis REST API (https://docs.redivis.com/api/rest-api).
// The API doesn't send Access-Control-Allow-Methods, so browsers only allow
// GET and POST to it. The one PATCH the wizard needs (variable metadata) goes
// through the Worker, which relays it (see worker/src/index.ts).

import { workerUrl } from './config';

const API = 'https://redivis.com/api/v1';
// GCS resumable chunks must be multiples of 256 KiB
const CHUNK_SIZE = 32 * 256 * 1024; // 8 MiB
const enc = encodeURIComponent;

export class RedivisError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export interface Dataset {
  uri: string;
  url: string;
  name: string;
  qualifiedReference: string;
  publicAccessLevel: string;
  currentVersion: { tag: string } | null;
  nextVersion: { tag: string; datasetUri: string } | null;
}

export interface Table {
  uri: string;
  name: string;
  numRows: number | null;
  variableCount: number | null;
}

export interface Upload {
  uri: string;
  name: string;
  status: 'created' | 'queued' | 'running' | 'completed' | 'failed' | string;
  errorMessage: string | null;
  numRows?: number | null;
}

export interface Variable {
  name: string;
  type: string;
  label: string | null;
  description: string | null;
  index: number;
}

export interface DatasetSummary {
  /** display name, which may have spaces */
  name: string;
  /** e.g. `owner.many_babies_4:20k3:v1_0` */
  qualifiedReference: string;
  publicAccessLevel: string;
}

/**
 * The reference name of a dataset or table (e.g. `many_babies_4`) from its
 * qualified reference or URI. Display names can have spaces; references can't.
 */
export function referenceName(qualifiedOrUri: string): string {
  const last = qualifiedOrUri.split('/').pop()!.split('.').pop()!;
  return decodeURIComponent(last.split(':')[0]);
}

/** Fields left out are unchanged; an empty string clears a value (null is rejected). */
export interface VariableUpdate {
  name: string;
  label?: string;
  description?: string;
}

export class Redivis {
  constructor(private token: string | null) {}

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(API + path, { method, headers, body: payload });
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      // not JSON
    }
    if (!res.ok) {
      throw new RedivisError(data?.error_description ?? data?.error ?? `HTTP ${res.status}`, res.status, data?.error);
    }
    return data as T;
  }

  private async getOrNull<T>(path: string): Promise<T | null> {
    try {
      return await this.request<T>('GET', path);
    } catch (e) {
      if (e instanceof RedivisError && e.status === 404) return null;
      throw e;
    }
  }

  me(): Promise<{ name: string }> {
    return this.request('GET', '/users/me');
  }

  getDataset(owner: string, name: string): Promise<Dataset | null> {
    return this.getOrNull(`/datasets/${enc(`${owner}.${name}`)}`);
  }

  /** Creates a dataset whose data is public. New datasets start with an unreleased next version. */
  createDataset(owner: string, name: string, { isOrganization = false } = {}): Promise<Dataset> {
    const parent = isOrganization ? 'organizations' : 'users';
    return this.request('POST', `/${parent}/${enc(owner)}/datasets`, { name, publicAccessLevel: 'data' });
  }

  async ensureNextVersion(owner: string, name: string): Promise<void> {
    const dataset = await this.getDataset(owner, name);
    if (!dataset) throw new RedivisError(`Dataset ${owner}.${name} not found`, 404);
    if (!dataset.nextVersion) await this.request('POST', `/datasets/${enc(`${owner}.${name}`)}/versions`);
  }

  getTable(owner: string, dataset: string, table: string, version = 'next'): Promise<Table | null> {
    return this.getOrNull(`/tables/${enc(`${owner}.${dataset}:${version}.${table}`)}`);
  }

  createTable(owner: string, dataset: string, table: string): Promise<Table> {
    return this.request('POST', `/datasets/${enc(`${owner}.${dataset}:next`)}/tables`, {
      name: table,
      uploadMergeStrategy: 'append',
      isFileIndex: false,
    });
  }

  async listUploads(tableUri: string): Promise<Upload[]> {
    const res = await this.request<{ results: Upload[] }>('GET', `${tableUri}/uploads?maxResults=100`);
    return res.results ?? [];
  }

  getUpload(uploadUri: string): Promise<Upload> {
    return this.request('GET', uploadUri);
  }

  /**
   * Sends the file to temporary storage with a resumable upload, then creates
   * the table upload from it. Resolves once Redivis has queued the import.
   */
  async uploadCsv(tableUri: string, file: File, onProgress?: (fraction: number) => void): Promise<Upload> {
    const { results } = await this.request<{ results: { id: string; url: string }[] }>(
      'POST',
      `${tableUri}/tempUploads`,
      { tempUploads: [{ size: file.size, name: file.name, resumable: true }] },
    );
    const tempUpload = results[0];

    const start = await fetch(tempUpload.url, {
      method: 'POST',
      headers: { 'x-upload-content-length': String(file.size), 'x-goog-resumable': 'start' },
    });
    const sessionUrl = start.headers.get('Location');
    if (!start.ok || !sessionUrl) throw new RedivisError(`Couldn't start upload (HTTP ${start.status})`, start.status);

    let offset = 0;
    onProgress?.(0);
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_SIZE, file.size);
      offset = await putChunk(sessionUrl, file, offset, end);
      onProgress?.(offset / file.size);
    }

    return this.request('POST', `${tableUri}/uploads`, {
      name: file.name,
      type: 'delimited',
      hasHeaderRow: true,
      tempUploadId: tempUpload.id,
    });
  }

  /** Polls an upload until Redivis has finished importing it. */
  async waitForUpload(uploadUri: string, { intervalMs = 2000, timeoutMs = 30 * 60 * 1000 } = {}): Promise<Upload> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const upload = await this.getUpload(uploadUri);
      if (upload.status === 'completed' || upload.status === 'failed') return upload;
      await sleep(intervalMs);
    }
    throw new RedivisError('The upload is still importing. Try again in a few minutes.', 408);
  }

  release(owner: string, dataset: string): Promise<unknown> {
    return this.request('POST', `/datasets/${enc(`${owner}.${dataset}`)}/versions/next/release`);
  }

  /** Datasets owned by a user or organization (Redivis uses separate paths for each). */
  async listDatasets(owner: string): Promise<{ datasets: DatasetSummary[]; isOrganization: boolean }> {
    for (const [parent, isOrganization] of [['users', false], ['organizations', true]] as const) {
      try {
        const res = await this.request<{ results: DatasetSummary[] }>('GET', `/${parent}/${enc(owner)}/datasets?maxResults=1000`);
        return { datasets: res.results ?? [], isOrganization };
      } catch (e) {
        if (!(e instanceof RedivisError && e.status === 404)) throw e;
      }
    }
    throw new RedivisError(`No Redivis user or organization named "${owner}".`, 404);
  }

  async listTables(owner: string, dataset: string, version = 'current'): Promise<Table[]> {
    const res = await this.request<{ results: Table[] }>('GET', `/datasets/${enc(`${owner}.${dataset}:${version}`)}/tables?maxResults=1000`);
    return res.results ?? [];
  }

  /** Number of distinct non-null values, from Redivis's (cached) variable statistics. */
  async numDistinct(owner: string, dataset: string, table: string, variable: string, version = 'current'): Promise<number | null> {
    const ref = `${owner}.${dataset}:${version}.${table}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const stats = await this.request<{ status?: string; numDistinct?: number }>(
        'GET',
        `/tables/${enc(ref)}/variables/${enc(variable)}/statistics`,
      );
      // statistics are computed on first request and may still be running
      if (stats.status !== 'running') return stats.numDistinct ?? null;
      await sleep(2000);
    }
    return null;
  }

  /** Sets labels and descriptions, relayed through the Worker since browsers can't PATCH Redivis. */
  async updateVariables(owner: string, dataset: string, table: string, variables: VariableUpdate[], version = 'current'): Promise<void> {
    const ref = `${owner}.${dataset}:${version}.${table}`;
    const res = await fetch(`${workerUrl()}/redivis/tables/${enc(ref)}/variables`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ variables }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new RedivisError(data.error_description ?? data.error ?? `HTTP ${res.status}`, res.status, data.error);
    }
  }

  async listVariables(owner: string, dataset: string, table: string, version = 'next'): Promise<Variable[]> {
    const ref = `${owner}.${dataset}:${version}.${table}`;
    const res = await this.request<{ results: Variable[] }>('GET', `/tables/${enc(ref)}/variables?maxResults=1000`);
    return res.results ?? [];
  }
}

/** PUTs bytes [start, end) and returns the offset the server has received up to. */
async function putChunk(sessionUrl: string, file: File, start: number, end: number): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    if (start >= end) return start;
    try {
      const res = await fetch(sessionUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${start}-${end - 1}/${file.size}` },
        body: file.slice(start, end),
      });
      if (res.ok) return file.size; // 200/201: upload complete
      if (res.status === 308) return receivedOffset(res) ?? end;
      if (res.status < 500 && res.status !== 429) throw new RedivisError(`Upload failed (HTTP ${res.status})`, res.status);
    } catch (e) {
      if (e instanceof RedivisError || attempt >= 5) throw e;
    }
    if (attempt >= 5) throw new RedivisError('Upload failed after several retries', 503);
    await sleep(1000 * 2 ** attempt);
    // ask how much arrived before retrying
    const status = await fetch(sessionUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${file.size}` } });
    if (status.ok) return file.size;
    if (status.status === 308) start = receivedOffset(status) ?? 0;
  }
}

function receivedOffset(res: Response): number | undefined {
  const match = res.headers.get('Range')?.match(/bytes=0-(\d+)/);
  return match ? Number(match[1]) + 1 : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
