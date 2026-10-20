import { getGitHubToken } from './auth/github';
import { getRedivisToken } from './auth/redivis';
import { GitHub } from './github';
import { Redivis } from './redivis';

export function github(): GitHub {
  const token = getGitHubToken();
  if (!token) throw new Error('Your GitHub sign-in has expired. Go back to "Connect accounts" and sign in again.');
  return new GitHub(token);
}

export function redivis(): Redivis {
  const token = getRedivisToken();
  if (!token) throw new Error('Your Redivis sign-in has expired. Go back to "Connect accounts" and sign in again.');
  return new Redivis(token);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
