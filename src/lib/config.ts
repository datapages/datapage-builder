export const config = {
  /** GitHub OAuth App client ID (public). */
  githubClientId: import.meta.env.VITE_GITHUB_CLIENT_ID as string,
  /** Cloudflare Worker that exchanges a GitHub OAuth code for a token. */
  tokenExchangeUrl: import.meta.env.VITE_TOKEN_EXCHANGE_URL as string,
  /** `repo` to create repos and commit; `read:org` to list the user's orgs. */
  githubScope: 'repo read:org',
  redivisScope: 'data.edit',
  template: { owner: 'datapages', repo: 'datapage' },
};

/** Where GitHub redirects after authorization: the callback page next to this one. */
export function githubRedirectUri(): string {
  return new URL('callback/', new URL(import.meta.env.BASE_URL, location.origin)).href;
}
