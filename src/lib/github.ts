import { Octokit } from '@octokit/rest';
import { config } from './config';

const { owner: TEMPLATE_OWNER, repo: TEMPLATE_REPO } = config.template;

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface WorkflowRun {
  id: number;
  status: string | null;
  conclusion: string | null;
  htmlUrl: string;
}

export class GitHub {
  octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async viewer(): Promise<string> {
    const { data } = await this.octokit.rest.users.getAuthenticated();
    return data.login;
  }

  /** The user plus the orgs they belong to: the places they can create a repo. */
  async owners(): Promise<string[]> {
    const [login, orgs] = await Promise.all([this.viewer(), this.octokit.paginate(this.octokit.rest.orgs.listForAuthenticatedUser)]);
    return [login, ...orgs.map((o) => o.login)];
  }

  async getRepo({ owner, repo }: RepoRef) {
    try {
      const { data } = await this.octokit.rest.repos.get({ owner, repo });
      return data;
    } catch (e: any) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async createFromTemplate({ owner, repo }: RepoRef, description: string): Promise<void> {
    await this.octokit.rest.repos.createUsingTemplate({
      template_owner: TEMPLATE_OWNER,
      template_repo: TEMPLATE_REPO,
      owner,
      name: repo,
      description,
      include_all_branches: false,
      private: false,
    });
  }

  /** A repo made from a template gets its files a few seconds after it's created. */
  async waitForContents(ref: RepoRef, path = '_quarto.yml', timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await this.octokit.rest.repos.getContent({ ...ref, path });
        return;
      } catch (e: any) {
        if (e.status !== 404 && e.status !== 409) throw e;
      }
      await sleep(2000);
    }
    throw new Error(`The new repo ${ref.owner}/${ref.repo} still has no files. Try again in a minute.`);
  }

  /** Turns on Pages deployed by GitHub Actions, as the template's workflow expects. */
  async enablePages(ref: RepoRef): Promise<void> {
    try {
      const { data } = await this.octokit.rest.repos.getPages({ ...ref });
      if (data.build_type !== 'workflow') await this.octokit.rest.repos.updateInformationAboutPagesSite({ ...ref, build_type: 'workflow' });
    } catch (e: any) {
      if (e.status !== 404) throw e;
      await this.octokit.rest.repos.createPagesSite({ ...ref, build_type: 'workflow' });
    }
  }

  async pagesUrl(ref: RepoRef): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.getPages({ ...ref });
      return data.html_url ?? null;
    } catch (e: any) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async readFiles<P extends string>(ref: RepoRef, paths: readonly P[]): Promise<Record<P, string>> {
    const entries = await Promise.all(
      paths.map(async (path) => {
        const { data } = await this.octokit.rest.repos.getContent({ ...ref, path });
        if (Array.isArray(data) || data.type !== 'file') throw new Error(`${path} is not a file`);
        return [path, decodeBase64(data.content)] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<P, string>;
  }

  /** Commits text files to the default branch in one commit and returns its sha. */
  async commitFiles(ref: RepoRef, files: Record<string, string>, message: string): Promise<string> {
    const repo = await this.getRepo(ref);
    const branch = repo?.default_branch ?? 'main';
    const { data: head } = await this.octokit.rest.git.getRef({ ...ref, ref: `heads/${branch}` });
    const { data: parent } = await this.octokit.rest.git.getCommit({ ...ref, commit_sha: head.object.sha });
    const { data: tree } = await this.octokit.rest.git.createTree({
      ...ref,
      base_tree: parent.tree.sha,
      tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644' as const, type: 'blob' as const, content })),
    });
    const { data: commit } = await this.octokit.rest.git.createCommit({ ...ref, message, tree: tree.sha, parents: [parent.sha] });
    await this.octokit.rest.git.updateRef({ ...ref, ref: `heads/${branch}`, sha: commit.sha });
    return commit.sha;
  }

  /** The workflow run triggered by a commit, once GitHub has created it. */
  async findRun(ref: RepoRef, sha: string): Promise<WorkflowRun | null> {
    const { data } = await this.octokit.rest.actions.listWorkflowRunsForRepo({ ...ref, head_sha: sha, per_page: 5 });
    const run = data.workflow_runs[0];
    return run ? { id: run.id, status: run.status, conclusion: run.conclusion, htmlUrl: run.html_url } : null;
  }

  async setHomepage(ref: RepoRef, homepage: string): Promise<void> {
    await this.octokit.rest.repos.update({ ...ref, homepage });
  }
}

function decodeBase64(content: string): string {
  const bytes = Uint8Array.from(atob(content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
